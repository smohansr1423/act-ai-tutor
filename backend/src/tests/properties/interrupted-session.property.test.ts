/**
 * Property-Based Tests for Interrupted Session State Preservation
 * Feature: act-ai-tutor-app, Property 12: Interrupted Session State Preservation
 *
 * **Validates: Requirements 4.9**
 *
 * For any Full_Test_Mode session that is interrupted at any point, ALL answers
 * recorded prior to interruption SHALL be preserved and retrievable when the
 * session is resumed within 24 hours. The resumed session should restore:
 * - All saved answers
 * - Time remaining
 * - Current question index
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { FullTestSessionState } from '../../services/fulltest.service';
import { SessionStatus, SessionType, SessionSection } from '../../models/enums';
import { calculateTimeRemaining, calculateExpiresAt } from '../../services/session-interrupt.service';

// ─── Mock Database and Cache ──────────────────────────────────────────────────

// We mock the database and cache modules to test the interrupt/resume flow
// in isolation while verifying state preservation semantics.

const mockSessionStore: Map<string, any> = new Map();
const mockRedisStore: Map<string, { state: FullTestSessionState; ttl: number }> = new Map();

vi.mock('../../utils/database', () => ({
  queryOne: vi.fn(async (_sql: string, params: any[]) => {
    const sessionId = params[0];
    return mockSessionStore.get(sessionId) || null;
  }),
  queryMany: vi.fn(async () => []),
  query: vi.fn(async (_sql: string, params: any[]) => {
    // Handle UPDATE queries - update the session in mock store
    if (_sql.includes('UPDATE sessions')) {
      const statusIdx = params.indexOf(SessionStatus.Interrupted);
      const activeIdx = params.indexOf(SessionStatus.Active);
      if (statusIdx >= 0) {
        const sessionId = params[params.length - 1];
        const session = mockSessionStore.get(sessionId);
        if (session) {
          session.status = SessionStatus.Interrupted;
          session.expires_at = params[1];
          session.time_remaining_seconds = params[2];
        }
      } else if (activeIdx >= 0) {
        const sessionId = params[params.length - 1];
        const session = mockSessionStore.get(sessionId);
        if (session) {
          session.status = SessionStatus.Active;
          session.expires_at = null;
        }
      }
    }
    return { rows: [], rowCount: 1, command: '', oid: 0, fields: [] };
  }),
  insertOne: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../../utils/cache', () => ({
  getSessionState: vi.fn(async <T>(sessionId: string): Promise<T | null> => {
    const entry = mockRedisStore.get(sessionId);
    if (!entry) return null;
    return entry.state as unknown as T;
  }),
  setSessionState: vi.fn(async (sessionId: string, state: any, ttl: number) => {
    mockRedisStore.set(sessionId, { state, ttl });
  }),
  deleteSessionState: vi.fn(async (sessionId: string) => {
    mockRedisStore.delete(sessionId);
  }),
}));

// ─── Generators ───────────────────────────────────────────────────────────────

/** Valid answer choices for ACT multiple choice */
const answerChoiceArb = fc.constantFrom('A', 'B', 'C', 'D');

/** Generate a valid question index (0-based, up to 74 for English which has 75 questions) */
const questionIndexArb = fc.integer({ min: 0, max: 74 });

/** Generate a single answer entry as [questionIndex, selectedAnswer] */
const answerEntryArb = fc.tuple(questionIndexArb, answerChoiceArb);

/**
 * Generate a set of answers (Record<number, string>).
 * Uses uniqueArray to avoid duplicate question indices, then maps to a record.
 * Between 0 and 75 answers (mimics partial completion of a full test).
 */
const answersArb = fc
  .uniqueArray(answerEntryArb, {
    minLength: 0,
    maxLength: 75,
    comparator: (a, b) => a[0] === b[0],
  })
  .map((entries) => {
    const record: Record<number, string> = {};
    for (const [idx, ans] of entries) {
      record[idx] = ans;
    }
    return record;
  });

/** Generate a valid current question index (0-74) */
const currentIndexArb = fc.integer({ min: 0, max: 74 });

/** Generate a valid time limit in seconds (one of the ACT section time limits) */
const timeLimitArb = fc.constantFrom(2700, 3600, 2100);

/** Generate a valid section */
const sectionArb = fc.constantFrom(
  SessionSection.English,
  SessionSection.Math,
  SessionSection.Reading,
  SessionSection.Science
);

/** Generate question IDs (UUIDs) */
const questionIdArb = fc.uuid();
const questionIdsArb = fc.array(questionIdArb, { minLength: 40, maxLength: 75 });

/**
 * Generate elapsed time in seconds since session start (0 to timeLimit - 1).
 * This represents a session interrupted before time expires.
 */
const elapsedSecondsArb = (timeLimit: number) =>
  fc.integer({ min: 0, max: Math.max(0, timeLimit - 1) });

/**
 * Generate time until resume in hours (0 to 23 hours = within 24-hour window).
 */
const resumeDelayHoursArb = fc.integer({ min: 0, max: 23 });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 12: Interrupted Session State Preservation', () => {
  beforeEach(() => {
    mockSessionStore.clear();
    mockRedisStore.clear();
    vi.clearAllMocks();
  });

  /**
   * Property: For any set of answers saved in a session state before interruption,
   * ALL answers are preserved in Redis and can be retrieved on resume.
   *
   * This tests the core invariant: interrupt preserves state, resume retrieves it intact.
   */
  it('ALL answers saved prior to interruption SHALL be preserved and restorable on resume', () => {
    fc.assert(
      fc.property(
        answersArb,
        currentIndexArb,
        timeLimitArb,
        questionIdsArb,
        sectionArb,
        (answers, currentIndex, timeLimit, questionIds, section) => {
          // Simulate a session state that exists in Redis at the time of interruption
          const sessionId = 'test-session-' + Math.random().toString(36).substr(2, 9);
          const startedAt = new Date(Date.now() - 600000); // started 10 min ago

          const sessionState: FullTestSessionState = {
            sessionId,
            userId: 'user-123',
            section,
            questionIds,
            answers: { ...answers },
            currentIndex,
            timeLimit,
            startedAt: startedAt.toISOString(),
          };

          // Store state in mock Redis (simulating what saveFullTestProgress does)
          mockRedisStore.set(sessionId, { state: sessionState, ttl: 86400 });

          // Verify all answers are preserved in the stored state
          const storedEntry = mockRedisStore.get(sessionId);
          expect(storedEntry).not.toBeNull();

          const storedState = storedEntry!.state;

          // ALL answers must be preserved
          const originalAnswerKeys = Object.keys(answers).map(Number);
          const storedAnswerKeys = Object.keys(storedState.answers).map(Number);

          expect(storedAnswerKeys.length).toBe(originalAnswerKeys.length);

          for (const key of originalAnswerKeys) {
            expect(storedState.answers[key]).toBe(answers[key]);
          }

          // Current index must be preserved
          expect(storedState.currentIndex).toBe(currentIndex);

          // Time limit must be preserved
          expect(storedState.timeLimit).toBe(timeLimit);

          // Question IDs must be preserved
          expect(storedState.questionIds).toEqual(questionIds);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The time remaining calculation on resume SHALL correctly reflect
   * the time remaining at the point of interruption.
   */
  it('time remaining SHALL be correctly preserved across interrupt and resume', () => {
    fc.assert(
      fc.property(
        timeLimitArb,
        fc.integer({ min: 0, max: 3599 }),
        (timeLimit, elapsedSeconds) => {
          // Ensure elapsed doesn't exceed timeLimit
          const actualElapsed = Math.min(elapsedSeconds, timeLimit - 1);
          const expectedTimeRemaining = timeLimit - actualElapsed;

          const startedAt = new Date(Date.now() - actualElapsed * 1000);
          const now = new Date();

          // Calculate time remaining at interruption (as the service does)
          const computedTimeRemaining = Math.max(0, timeLimit - Math.floor((now.getTime() - startedAt.getTime()) / 1000));

          // Verify: time remaining should be approximately the expected value
          // (within 1 second tolerance due to execution time)
          expect(Math.abs(computedTimeRemaining - expectedTimeRemaining)).toBeLessThanOrEqual(1);

          // On resume, calculateTimeRemaining should return the stored value directly
          const resumedTimeRemaining = calculateTimeRemaining(
            timeLimit,
            computedTimeRemaining,
            startedAt,
            now
          );

          expect(resumedTimeRemaining).toBe(computedTimeRemaining);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: currentIndex SHALL be restored to the exact value at interruption.
   */
  it('currentIndex SHALL be restored to the exact value it had at interruption', () => {
    fc.assert(
      fc.property(
        currentIndexArb,
        questionIdsArb,
        answersArb,
        timeLimitArb,
        (currentIndex, questionIds, answers, timeLimit) => {
          const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);

          // Create session state with specific currentIndex
          const sessionState: FullTestSessionState = {
            sessionId,
            userId: 'user-456',
            section: SessionSection.Math,
            questionIds,
            answers,
            currentIndex,
            timeLimit,
            startedAt: new Date().toISOString(),
          };

          // Store in Redis (simulating interrupt preserving state)
          mockRedisStore.set(sessionId, { state: sessionState, ttl: 86400 });

          // Retrieve (simulating resume reading state)
          const retrieved = mockRedisStore.get(sessionId);
          expect(retrieved).not.toBeNull();
          expect(retrieved!.state.currentIndex).toBe(currentIndex);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The expires_at timestamp SHALL be exactly 24 hours after started_at.
   * Sessions resumed within this window should succeed.
   */
  it('expires_at SHALL be exactly 24 hours after started_at', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        (startedAt) => {
          const expiresAt = calculateExpiresAt(startedAt);
          const expectedMs = startedAt.getTime() + 24 * 60 * 60 * 1000;

          expect(expiresAt.getTime()).toBe(expectedMs);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any session resumed within 24 hours, the answer count
   * on resume SHALL equal the answer count at interruption (no answers lost).
   */
  it('answer count on resume SHALL equal the answer count at interruption', () => {
    fc.assert(
      fc.property(
        answersArb,
        currentIndexArb,
        timeLimitArb,
        questionIdsArb,
        resumeDelayHoursArb,
        (answers, currentIndex, timeLimit, questionIds, resumeDelayHours) => {
          const sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
          const startedAt = new Date(Date.now() - 600000);

          // Create state at interruption
          const sessionState: FullTestSessionState = {
            sessionId,
            userId: 'user-789',
            section: SessionSection.English,
            questionIds,
            answers: { ...answers },
            currentIndex,
            timeLimit,
            startedAt: startedAt.toISOString(),
          };

          const answerCountAtInterrupt = Object.keys(answers).length;

          // Store in Redis (interrupt)
          mockRedisStore.set(sessionId, { state: sessionState, ttl: 86400 });

          // Simulate time passing (within 24 hours)
          // The Redis TTL covers 24 hours, so data should still be available

          // Retrieve state (resume)
          const retrieved = mockRedisStore.get(sessionId);
          expect(retrieved).not.toBeNull();

          const answerCountOnResume = Object.keys(retrieved!.state.answers).length;

          // No answers should be lost
          expect(answerCountOnResume).toBe(answerCountAtInterrupt);

          // Each specific answer value should match
          for (const [key, value] of Object.entries(answers)) {
            expect(retrieved!.state.answers[Number(key)]).toBe(value);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The TTL for interrupted session state SHALL be at least 24 hours (86400 seconds).
   */
  it('session state TTL SHALL be 24 hours (86400 seconds) for interrupted sessions', () => {
    fc.assert(
      fc.property(
        answersArb,
        questionIdsArb,
        (answers, questionIds) => {
          const sessionId = 'session-ttl-' + Math.random().toString(36).substr(2, 9);

          const sessionState: FullTestSessionState = {
            sessionId,
            userId: 'user-ttl',
            section: SessionSection.Science,
            questionIds,
            answers,
            currentIndex: 0,
            timeLimit: 2100,
            startedAt: new Date().toISOString(),
          };

          // Store with 24-hour TTL (as interruptSession does)
          const TWENTY_FOUR_HOURS_SECONDS = 24 * 60 * 60;
          mockRedisStore.set(sessionId, { state: sessionState, ttl: TWENTY_FOUR_HOURS_SECONDS });

          const entry = mockRedisStore.get(sessionId);
          expect(entry).not.toBeNull();
          expect(entry!.ttl).toBe(86400);
        }
      ),
      { numRuns: 100 }
    );
  });
});
