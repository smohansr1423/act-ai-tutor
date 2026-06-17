/**
 * Event Handlers
 * Registers handlers for the async event pipeline.
 *
 * Pipeline:
 *   Answer Submission → eventBus.emit(AnswerSubmitted)
 *     → MessageQueue enqueues for async processing
 *       → Analytics service: updates dashboard metrics
 *       → Adaptive service: updates weakness profile + classifies error
 *
 *   Session Completed → eventBus.emit(SessionCompleted)
 *     → MessageQueue enqueues for async processing
 *       → Analytics service: refreshes dashboard within 10 seconds (Req 7.5)
 *
 * Requirements: 10.1, 10.5
 */

import { eventBus } from './event-bus';
import { messageQueue } from './message-queue';
import { AppEvent, EventType, AnswerSubmittedEvent, SessionCompletedEvent } from './types';
import { updateWeaknessProfile, classifyError } from '../services/adaptive.service';
import { Section, DifficultyLevel } from '../models/enums';

// ─── Handler Functions ────────────────────────────────────────────────────────

/**
 * Handle answer submitted events:
 * 1. Update the student's weakness profile for the relevant skill_tag
 * 2. Classify the error (concept_gap, careless_mistake, pacing_issue)
 */
async function handleAnswerSubmitted(event: AnswerSubmittedEvent): Promise<void> {
  const { userId, questionId, isCorrect, timeTaken, section, skillTag } = event.payload;

  try {
    // Update weakness profile (sliding window recalculation)
    await updateWeaknessProfile(
      userId,
      skillTag,
      section as Section,
      isCorrect
    );

    // Classify the error for the performance record
    await classifyError(
      userId,
      questionId,
      isCorrect,
      timeTaken,
      skillTag,
      event.payload.difficulty as DifficultyLevel
    );
  } catch (error) {
    console.error('[EventHandler] Failed to process answer submission:', error);
    throw error; // Re-throw so message queue retries
  }
}

/**
 * Handle session completed events:
 * Analytics dashboard refresh is triggered.
 * In a production system, this would invoke a cache invalidation
 * or precompute updated dashboard metrics.
 */
async function handleSessionCompleted(event: SessionCompletedEvent): Promise<void> {
  const { userId, sessionId, sessionType } = event.payload;

  try {
    // Log the session completion for observability
    console.log(
      `[EventHandler] Session completed: user=${userId}, session=${sessionId}, type=${sessionType}`
    );

    // In production: trigger analytics cache refresh or precomputation
    // The analytics service queries fresh data on each dashboard request,
    // so no explicit refresh is needed for correctness. This handler
    // is here for future cache-warming optimization.
  } catch (error) {
    console.error('[EventHandler] Failed to process session completion:', error);
    throw error;
  }
}

// ─── Message Queue Processor ──────────────────────────────────────────────────

/**
 * The unified message processor routes events to appropriate handlers.
 */
async function processEvent(event: AppEvent): Promise<void> {
  switch (event.type) {
    case EventType.AnswerSubmitted:
      await handleAnswerSubmitted(event as AnswerSubmittedEvent);
      break;

    case EventType.SessionCompleted:
      await handleSessionCompleted(event as SessionCompletedEvent);
      break;

    default:
      console.warn(`[MessageQueue] Unknown event type: ${(event as AppEvent).type}`);
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Register all event handlers.
 * Called once at application startup from app.ts.
 *
 * Wiring:
 * - EventBus listeners forward events to the MessageQueue for async processing
 * - MessageQueue processor dispatches to service handlers with retry logic
 */
export function registerEventHandlers(): void {
  // Register the processor with the message queue
  messageQueue.addProcessor(processEvent);

  // Subscribe to events on the bus and forward to queue
  eventBus.on<AnswerSubmittedEvent>(EventType.AnswerSubmitted, (event) => {
    messageQueue.enqueue(event);
  });

  eventBus.on<SessionCompletedEvent>(EventType.SessionCompleted, (event) => {
    messageQueue.enqueue(event);
  });

  console.log('[Events] Event handlers registered: AnswerSubmitted, SessionCompleted');
}
