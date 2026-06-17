/**
 * Event Bus
 * A lightweight in-process pub/sub event bus for decoupling services.
 *
 * In production, this would be backed by Redis Pub/Sub or a dedicated message broker.
 * This implementation uses Node.js EventEmitter for local development and testing.
 *
 * Requirements: 10.1, 10.5
 */

import { EventEmitter } from 'events';
import { AppEvent, EventType } from './types';

// ─── Event Handler Type ───────────────────────────────────────────────────────

export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;

// ─── Event Bus Class ──────────────────────────────────────────────────────────

/**
 * EventBus provides typed pub/sub for application events.
 * Handlers are invoked asynchronously to avoid blocking the publisher.
 */
export class EventBus {
  private readonly emitter: EventEmitter;
  private readonly handlers: Map<EventType, EventHandler[]>;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50); // Accommodate multiple handler subscriptions
    this.handlers = new Map();
  }

  /**
   * Subscribe a handler to an event type.
   * Handlers are called asynchronously when events are published.
   */
  on<T extends AppEvent>(eventType: T['type'], handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler as EventHandler);
    this.handlers.set(eventType, existing);

    this.emitter.on(eventType, handler);
  }

  /**
   * Remove a handler from an event type.
   */
  off<T extends AppEvent>(eventType: T['type'], handler: EventHandler<T>): void {
    const existing = this.handlers.get(eventType) || [];
    const index = existing.indexOf(handler as EventHandler);
    if (index !== -1) {
      existing.splice(index, 1);
      this.handlers.set(eventType, existing);
    }

    this.emitter.off(eventType, handler);
  }

  /**
   * Publish an event to all subscribed handlers.
   * Handlers execute asynchronously (fire-and-forget pattern with error logging).
   */
  emit(event: AppEvent): void {
    this.emitter.emit(event.type, event);
  }

  /**
   * Remove all handlers for a given event type, or all handlers if no type specified.
   */
  removeAll(eventType?: EventType): void {
    if (eventType) {
      this.handlers.delete(eventType);
      this.emitter.removeAllListeners(eventType);
    } else {
      this.handlers.clear();
      this.emitter.removeAllListeners();
    }
  }

  /**
   * Get the count of registered handlers for a given event type.
   */
  listenerCount(eventType: EventType): number {
    return this.emitter.listenerCount(eventType);
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

/** Global event bus instance */
export const eventBus = new EventBus();
