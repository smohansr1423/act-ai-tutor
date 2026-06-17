/**
 * Session Interrupt Service - Full Test Mode
 *
 * Handles:
 * - Session interruption: Mark session as 'interrupted', set expires_at = started_at + 24h
 * - Session resume: Verify session is interrupted + not expired, restore state, reactivate
 * - Session expiry: On-access check marks expired sessions as 'expired'
 *
 * Requirements: 4.9, 4.10
 */

import { Session, Question } from '../models/interfaces';
import { SessionStatus, SessionType } from '../models/enums';
import { queryOne, query } from '../utils/database';
import { getSessionState, setSessionState } from '../utils/cache';
import { FullTestSessionState } from './fulltest.service';
import { formatQuestionDelivery, QuestionDelivery } from './session.service';
import { queryMany } from '../utils/database';

// ─── Constants ────────────────────────────────────────────────────────────────

/** 24 hours in milliseconds */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** 24 hours in seconds (TTL for Redis session state) */
const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request to interrupt a session */
export interface InterruptSessionRequest {
  sessionId: string;
}

/** Response from interrupting a session */
export interface InterruptSessionResponse {
  sessionId: string;
  status: string;
  expiresAt: string;
}

/** Request to resume an interrupted session */
export interface ResumeSessionRequest {
  sessionId: string;
}

/** Response from resuming an interrupted session */
export interface ResumeSessionResponse {
  sessionId: string;
  questions: QuestionDelivery[];
  answers: Record<number, string>;
  timeRemaining: number;
  currentIndex: number;
}

/** Error result for session interrupt/resume operations */
export interface SessionInterruptError {
  error: string;
}

export type InterruptResult = InterruptSessionResponse | SessionInterruptError;
export type ResumeResult = ResumeSessionResponse | SessionInterruptError;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Check if result is an error.
 */
export function isSessionInterruptError(
  result: InterruptResult | ResumeResult
): result is SessionInterruptError {
  return 'error' in result;
}

/**
 * Calculate the expires_at timestamp: started_at + 24 hours.
 */
export function calculateExpiresAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TWENTY_FOUR_HOURS_MS);
}

/**
 * Calculate time remaining for a resumed session.
 *
 * The time remaining is based on:
 * - The original time limit (time_limit_seconds)
 * - How much time elapsed before interruption (stored as time_remaining_seconds)
 *
 * If time_remaining_seconds is stored in the session, use it directly.
 * Otherwise, calculate from time_limit_seconds minus elapsed time since started_at.
 */
export function calculateTimeRemaining(
  timeLimitSeconds: number,
  timeRemainingSeconds: number | null,
  startedAt: Date,
  now: Date
): number {
  if (timeRemainingSeconds !== null && timeRemainingSeconds >= 0) {
    return timeRemainingSeconds;
  }
  // Fallback: calculate from time limit minus elapsed
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.max(0, timeLimitSeconds - elapsedSeconds);
}

// ─── Session Interruption ─────────────────────────────────────────────────────

/**
 * Interrupt a full test session.
 *
 * Steps:
 * 1. Validate session exists and is active
 * 2. Calculate expires_at (started_at + 24h)
 * 3. Calculate time_remaining_seconds based on how much time has passed
 * 4. Update session status to 'interrupted', set expires_at and time_remaining_seconds
 * 5. Keep Redis session state alive (answers are preserved)
 *
 * All answers already saved in Redis session state remain intact.
 */
export async function interruptSession(
  request: InterruptSessionRequest
): Promise<InterruptResult> {
  const { sessionId } = request;

  // Validate input
  if (!sessionId || typeof sessionId !== 'string') {
    return { error: 'sessionId is required' };
  }

  // Fetch the session
  const session = await queryOne<Session>(
    `SELECT session_id, user_id, session_type, status, started_at, time_limit_seconds, time_remaining_seconds
     FROM sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (!session) {
    return { error: 'Session not found' };
  }

  if (session.status !== SessionStatus.Active) {
    return { error: `Cannot interrupt session with status '${session.status}'. Only active sessions can be interrupted.` };
  }

  if (session.session_type !== SessionType.FullTest) {
    return { error: 'Only full test sessions can be interrupted' };
  }

  // Calculate expires_at (started_at + 24 hours)
  const startedAt = new Date(session.started_at);
  const expiresAt = calculateExpiresAt(startedAt);

  // Calculate time remaining at point of interruption
  const now = new Date();
  const timeLimitSeconds = session.time_limit_seconds ?? 0;
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const timeRemaining = Math.max(0, timeLimitSeconds - elapsedSeconds);

  // Update session in database
  await query(
    `UPDATE sessions
     SET status = $1, expires_at = $2, time_remaining_seconds = $3
     WHERE session_id = $4`,
    [SessionStatus.Interrupted, expiresAt, timeRemaining, sessionId]
  );

  // Keep Redis session state alive with 24-hour TTL
  const sessionState = await getSessionState<FullTestSessionState>(sessionId);
  if (sessionState) {
    await setSessionState(sessionId, sessionState, TWENTY_FOUR_HOURS_SECONDS);
  }

  return {
    sessionId,
    status: SessionStatus.Interrupted,
    expiresAt: expiresAt.toISOString(),
  };
}

// ─── Session Resume ───────────────────────────────────────────────────────────

/**
 * Resume an interrupted full test session.
 *
 * Steps:
 * 1. Validate session exists and is 'interrupted'
 * 2. Check if session has expired (current time >= expires_at)
 *    - If expired: mark as 'expired' and return error
 * 3. Retrieve saved answers and current index from Redis
 * 4. Fetch all questions for the session
 * 5. Calculate time remaining
 * 6. Update session status back to 'active'
 * 7. Return questions, saved answers, timeRemaining, currentIndex
 */
export async function resumeSession(
  request: ResumeSessionRequest
): Promise<ResumeResult> {
  const { sessionId } = request;

  // Validate input
  if (!sessionId || typeof sessionId !== 'string') {
    return { error: 'sessionId is required' };
  }

  // Fetch the session
  const session = await queryOne<Session>(
    `SELECT session_id, user_id, session_type, status, started_at, time_limit_seconds, time_remaining_seconds, expires_at
     FROM sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (!session) {
    return { error: 'Session not found' };
  }

  // Check if session is interrupted
  if (session.status !== SessionStatus.Interrupted) {
    if (session.status === SessionStatus.Expired) {
      return { error: 'Session has expired and cannot be resumed' };
    }
    return { error: `Cannot resume session with status '${session.status}'. Only interrupted sessions can be resumed.` };
  }

  // Check if session has expired (current time >= expires_at)
  const now = new Date();
  if (session.expires_at && now >= new Date(session.expires_at)) {
    // Mark session as expired in database
    await query(
      'UPDATE sessions SET status = $1 WHERE session_id = $2',
      [SessionStatus.Expired, sessionId]
    );
    return { error: 'Session has expired. Interrupted sessions must be resumed within 24 hours.' };
  }

  // Retrieve session state from Redis
  const sessionState = await getSessionState<FullTestSessionState>(sessionId);

  if (!sessionState || !sessionState.questionIds || sessionState.questionIds.length === 0) {
    return { error: 'Session state not found. The session data may have been lost.' };
  }

  // Fetch all questions for the session
  const questionIds = sessionState.questionIds;
  const questions = await queryMany<Question>(
    `SELECT question_id, section, question_text, passage, options, correct_answer,
            explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
     FROM questions WHERE question_id = ANY($1)`,
    [questionIds]
  );

  // Order questions by their original index in the session
  const questionMap = new Map<string, Question>();
  for (const q of questions) {
    questionMap.set(q.question_id, q);
  }

  const orderedQuestions: QuestionDelivery[] = questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => q !== undefined)
    .map((q) => formatQuestionDelivery(q));

  // Get time remaining (stored during interruption)
  const timeRemaining = calculateTimeRemaining(
    session.time_limit_seconds ?? 0,
    session.time_remaining_seconds,
    new Date(session.started_at),
    now
  );

  // Get saved answers and current index from session state
  const answers = sessionState.answers || {};
  const currentIndex = sessionState.currentIndex || 0;

  // Update session status back to 'active'
  await query(
    'UPDATE sessions SET status = $1, expires_at = NULL WHERE session_id = $2',
    [SessionStatus.Active, sessionId]
  );

  // Refresh Redis session state TTL
  await setSessionState(sessionId, sessionState, TWENTY_FOUR_HOURS_SECONDS);

  return {
    sessionId,
    questions: orderedQuestions,
    answers,
    timeRemaining,
    currentIndex,
  };
}

// ─── Session Expiry Check ─────────────────────────────────────────────────────

/**
 * Check and mark expired sessions.
 *
 * This is an on-access check that can also be used as a background job.
 * It finds all sessions with status 'interrupted' where expires_at has passed,
 * and marks them as 'expired'.
 *
 * Expired sessions do not generate a score summary (Requirement 4.10).
 *
 * @returns Number of sessions marked as expired
 */
export async function markExpiredSessions(): Promise<number> {
  const now = new Date();
  const result = await query(
    `UPDATE sessions SET status = $1
     WHERE status = $2 AND expires_at IS NOT NULL AND expires_at <= $3`,
    [SessionStatus.Expired, SessionStatus.Interrupted, now]
  );
  return result.rowCount ?? 0;
}

/**
 * Check if a specific session has expired (on-access check).
 * If the session is interrupted and past its expiry, mark it as expired.
 *
 * @returns true if the session was expired, false otherwise
 */
export async function checkAndExpireSession(sessionId: string): Promise<boolean> {
  const session = await queryOne<Session>(
    `SELECT session_id, status, expires_at FROM sessions WHERE session_id = $1`,
    [sessionId]
  );

  if (!session) {
    return false;
  }

  if (session.status !== SessionStatus.Interrupted) {
    return false;
  }

  const now = new Date();
  if (session.expires_at && now >= new Date(session.expires_at)) {
    await query(
      'UPDATE sessions SET status = $1 WHERE session_id = $2',
      [SessionStatus.Expired, sessionId]
    );
    return true;
  }

  return false;
}
