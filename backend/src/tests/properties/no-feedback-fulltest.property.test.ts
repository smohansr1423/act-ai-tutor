/**
 * Property-Based Tests for No Feedback During Full Test
 * Feature: act-ai-tutor-app, Property 27: No Feedback During Full Test
 *
 * **Validates: Requirements 9.6**
 *
 * For any answer submission during an active Full_Test_Mode session, the system
 * SHALL NOT return correctness information (is_correct, explanation, or correct_answer)
 * until the session status changes to 'completed'.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  saveFullTestProgress,
  SaveProgressRequest,
  SaveProgressResponse,
  FullTestSessionState,
  isFullTestError,
} from '../../services/fulltest.service';
import { SessionStatus } from '../../models/enums';

// Mock database and cache modules
vi.mock('../../utils/database', () => ({
  queryOne: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../../utils/cache', () => ({
  getSessionState: vi.fn(),
  setSessionState: vi.fn(),
}));

import { queryOne, query } from '../../utils/database';
import { getSessionState, setSessionState } from '../../utils/cache';

const mockQueryOne = vi.mocked(queryOne);
const mockQuery = vi.mocked(query);
const mockGetSessionState = vi.mocked(getSessionState);
const mockSetSessionState = vi.mocked(setSessionState);

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Generator for a valid selected answer (A, B, C, or D).
 */
const selectedAnswerArb = fc.constantFrom('A', 'B', 'C', 'D');

/**
 * Generator for a single submitted answer with a valid question index and answer choice.
 * questionIndex ranges from 0 to 74 (max questions in a full test is 75 for English).
 */
const submittedAnswerArb = fc.record({
  questionIndex: fc.integer({ min: 0, max: 74 }),
  selectedAnswer: selectedAnswerArb,
});

/**
 * Generator for an array of submitted answers (0 to 75 answers, representing
 * partial or full answer submissions during a full test session).
 */
const answersArrayArb = fc.array(submittedAnswerArb, { minLength: 0, maxLength: 75 });

/**
 * Generator for a valid current question index (0 to 74).
 */
const currentIndexArb = fc.integer({ min: 0, max: 74 });

/**
 * Generator for the full test section.
 */
const sectionArb = fc.constantFrom('english', 'math', 'reading', 'science');

/**
 * Generator for a complete SaveProgressRequest with arbitrary valid answers.
 */
const saveProgressRequestArb = fc.record({
  answers: answersArrayArb,
  currentIndex: currentIndexArb,
  section: sectionArb,
});

// ─── Feedback fields that MUST NOT appear in the response ─────────────────────

const FORBIDDEN_FEEDBACK_FIELDS = [
  'is_correct',
  'isCorrect',
  'correct',
  'correctAnswer',
  'correct_answer',
  'explanation',
  'strategy_tip',
  'strategyTip',
  'score',
  'details',
  'incorrect_reasoning',
];

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 27: No Feedback During Full Test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Setup mocks for a valid active full test session so saveFullTestProgress
   * can proceed past validation and return a successful response.
   */
  function setupValidFullTestSession(section: string) {
    const startedAt = new Date(Date.now() - 300000); // 5 minutes ago
    const timeLimitSeconds = section === 'math' ? 3600 : section === 'english' ? 2700 : 2100;

    mockQueryOne.mockResolvedValue({
      session_id: 'session-pbt-001',
      user_id: 'user-pbt-001',
      session_type: 'full_test',
      status: SessionStatus.Active,
      started_at: startedAt,
      time_limit_seconds: timeLimitSeconds,
    } as any);

    const sessionState: FullTestSessionState = {
      sessionId: 'session-pbt-001',
      userId: 'user-pbt-001',
      section,
      questionIds: Array.from({ length: 75 }, (_, i) => `q-${i}`),
      answers: {},
      currentIndex: 0,
      timeLimit: timeLimitSeconds,
      startedAt: startedAt.toISOString(),
    };

    mockGetSessionState.mockResolvedValue(sessionState);
    mockSetSessionState.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);
  }

  it('for any answer submission during a full test, the response SHALL NOT contain correctness feedback fields', async () => {
    await fc.assert(
      fc.asyncProperty(saveProgressRequestArb, async ({ answers, currentIndex, section }) => {
        // Setup mocks for this iteration
        setupValidFullTestSession(section);

        const request: SaveProgressRequest = {
          sessionId: 'session-pbt-001',
          answers,
          currentIndex,
        };

        const result = await saveFullTestProgress(request);

        // The result should be a successful SaveProgressResponse, not an error
        expect(isFullTestError(result)).toBe(false);

        // Verify NO forbidden feedback fields exist in the response
        const responseKeys = Object.keys(result);
        for (const forbiddenField of FORBIDDEN_FEEDBACK_FIELDS) {
          expect(responseKeys).not.toContain(forbiddenField);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for any answer submission during a full test, the response SHALL only contain status, timeRemaining, and currentIndex', async () => {
    await fc.assert(
      fc.asyncProperty(saveProgressRequestArb, async ({ answers, currentIndex, section }) => {
        setupValidFullTestSession(section);

        const request: SaveProgressRequest = {
          sessionId: 'session-pbt-001',
          answers,
          currentIndex,
        };

        const result = await saveFullTestProgress(request);

        // Must be a successful response
        expect(isFullTestError(result)).toBe(false);

        // The response must contain EXACTLY these 3 fields and nothing else
        const responseKeys = Object.keys(result).sort();
        expect(responseKeys).toEqual(['currentIndex', 'status', 'timeRemaining']);
      }),
      { numRuns: 100 }
    );
  });

  it('for any answer submission during a full test, the response SHALL confirm save without revealing if answers are correct', async () => {
    await fc.assert(
      fc.asyncProperty(saveProgressRequestArb, async ({ answers, currentIndex, section }) => {
        setupValidFullTestSession(section);

        const request: SaveProgressRequest = {
          sessionId: 'session-pbt-001',
          answers,
          currentIndex,
        };

        const result = await saveFullTestProgress(request);

        // Must be successful
        expect(isFullTestError(result)).toBe(false);

        const response = result as SaveProgressResponse;

        // status must be 'saved' (not 'correct', 'incorrect', or any feedback value)
        expect(response.status).toBe('saved');

        // timeRemaining must be a non-negative number (time info only, no score)
        expect(response.timeRemaining).toBeGreaterThanOrEqual(0);
        expect(typeof response.timeRemaining).toBe('number');

        // currentIndex must match what was submitted
        expect(response.currentIndex).toBe(currentIndex);

        // Stringify the entire response to double-check no feedback leaks through nested structures
        const responseStr = JSON.stringify(result);
        expect(responseStr).not.toContain('"is_correct"');
        expect(responseStr).not.toContain('"isCorrect"');
        expect(responseStr).not.toContain('"explanation"');
        expect(responseStr).not.toContain('"strategy_tip"');
        expect(responseStr).not.toContain('"correct_answer"');
      }),
      { numRuns: 100 }
    );
  });
});
