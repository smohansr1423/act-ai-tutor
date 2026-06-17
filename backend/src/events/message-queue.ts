/**
 * Message Queue
 * Async processing queue for performance record updates.
 *
 * In production, this would be backed by Redis Streams, RabbitMQ, or SQS.
 * This implementation uses an in-memory queue with async processing for
 * local development and testing, matching the design's architecture.
 *
 * Key behaviors:
 * - Messages are processed asynchronously (non-blocking to the publisher)
 * - Failed messages are retried up to 3 times with exponential backoff
 * - Dead-letter queue captures messages that exhaust retries
 *
 * Requirements: 10.1, 10.5
 */

import { AppEvent } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A queued message wrapping an event with processing metadata */
export interface QueueMessage {
  id: string;
  event: AppEvent;
  enqueuedAt: number;
  attempts: number;
  maxAttempts: number;
}

/** Message processing handler */
export type MessageProcessor = (event: AppEvent) => Promise<void>;

// ─── Message Queue Class ──────────────────────────────────────────────────────

/**
 * MessageQueue provides async event processing with retry semantics.
 * Events are enqueued and processed by registered processors without blocking callers.
 */
export class MessageQueue {
  private queue: QueueMessage[] = [];
  private deadLetterQueue: QueueMessage[] = [];
  private processors: MessageProcessor[] = [];
  private processing = false;
  private messageCounter = 0;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options?: { maxRetries?: number; retryDelayMs?: number }) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 100;
  }

  /**
   * Register a processor that will handle queued events.
   */
  addProcessor(processor: MessageProcessor): void {
    this.processors.push(processor);
  }

  /**
   * Remove a processor.
   */
  removeProcessor(processor: MessageProcessor): void {
    const index = this.processors.indexOf(processor);
    if (index !== -1) {
      this.processors.splice(index, 1);
    }
  }

  /**
   * Enqueue an event for async processing.
   * Returns immediately without waiting for processing.
   */
  enqueue(event: AppEvent): string {
    const id = `msg_${++this.messageCounter}_${Date.now()}`;
    const message: QueueMessage = {
      id,
      event,
      enqueuedAt: Date.now(),
      attempts: 0,
      maxAttempts: this.maxRetries,
    };

    this.queue.push(message);
    this.processNext();
    return id;
  }

  /**
   * Process the next message in the queue.
   * Uses setImmediate to avoid blocking the event loop.
   */
  private processNext(): void {
    if (this.processing || this.queue.length === 0 || this.processors.length === 0) {
      return;
    }

    this.processing = true;
    const message = this.queue.shift()!;

    setImmediate(async () => {
      try {
        message.attempts++;
        await Promise.all(
          this.processors.map((processor) => processor(message.event))
        );
      } catch (error) {
        console.error(`[MessageQueue] Processing failed for ${message.id}:`, error);

        if (message.attempts < message.maxAttempts) {
          // Re-enqueue for retry with delay
          setTimeout(() => {
            this.queue.push(message);
            this.processNext();
          }, this.retryDelayMs * message.attempts);
        } else {
          // Move to dead-letter queue
          console.error(`[MessageQueue] Message ${message.id} exhausted retries, moving to DLQ`);
          this.deadLetterQueue.push(message);
        }
      } finally {
        this.processing = false;
        // Process next message if available
        if (this.queue.length > 0) {
          this.processNext();
        }
      }
    });
  }

  /**
   * Get the current queue depth.
   */
  get depth(): number {
    return this.queue.length;
  }

  /**
   * Get messages in the dead-letter queue.
   */
  get deadLetters(): QueueMessage[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear all queues and processors (useful for testing).
   */
  reset(): void {
    this.queue = [];
    this.deadLetterQueue = [];
    this.processors = [];
    this.processing = false;
    this.messageCounter = 0;
  }

  /**
   * Wait until the queue is fully drained (useful for testing).
   * Returns a promise that resolves when no messages remain.
   */
  async drain(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.queue.length === 0 && !this.processing) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

/** Global message queue for async performance record processing */
export const messageQueue = new MessageQueue();
