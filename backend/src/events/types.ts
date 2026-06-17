/**
 * Event Type Definitions
 * Defines the shape of all events flowing through the message queue.
 *
 * Requirements: 10.1, 10.5
 */

import { Section } from '../models/enums';

// ─── Event Type Enum ──────────────────────────────────────────────────────────

export enum EventType {
  /** Fired when a student submits an answer (practice or full test) */
  AnswerSubmitted = 'answer.submitted',

  /** Fired when a session is completed (practice end or full test submit) */
  SessionCompleted = 'session.completed',

  /** Fired when a sync conflict is resolved */
  SyncConflictResolved = 'sync.conflict_resolved',
}

// ─── Event Payloads ───────────────────────────────────────────────────────────

/**
 * Event emitted when a student submits an answer.
 * Triggers:
 *   - Analytics service to update dashboard metrics
 *   - Adaptive service to update weakness profile and classify error
 */
export interface AnswerSubmittedEvent {
  type: EventType.AnswerSubmitted;
  payload: {
    userId: string;
    sessionId: string;
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
    timeTaken: number;
    section: Section;
    skillTag: string;
    difficulty: string;
    timestamp: string;
  };
}

/**
 * Event emitted when a session completes.
 * Triggers:
 *   - Analytics service to refresh dashboard (Requirement 7.5: within 10 seconds)
 */
export interface SessionCompletedEvent {
  type: EventType.SessionCompleted;
  payload: {
    userId: string;
    sessionId: string;
    sessionType: 'practice' | 'full_test';
    section: string;
    totalQuestions: number;
    correctAnswers: number;
    completedAt: string;
  };
}

/**
 * Event emitted when a sync conflict is resolved.
 */
export interface SyncConflictResolvedEvent {
  type: EventType.SyncConflictResolved;
  payload: {
    userId: string;
    questionId: string;
    sessionId: string;
    resolvedTimestamp: string;
  };
}

/** Union type of all events */
export type AppEvent = AnswerSubmittedEvent | SessionCompletedEvent | SyncConflictResolvedEvent;
