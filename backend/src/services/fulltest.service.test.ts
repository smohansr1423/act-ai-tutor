/**
 * Unit tests for Full Test Service - Timer Expiry Auto-Submit and Score Summary.
 * Tests Requirements 4.6, 4.7
 *
 * Property 10: Timer Expiry Auto-Submit
 * Property 11: Full Test Score Computation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  insertOne: vi.fn(),
  withTransaction: vi.fn(),
}));

// Mock the cache module
vi.mock('../utils/cache', () => ({
  getSessionState: vi.fn(),
  deleteSessionState: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-001'),
}));

import {
  computeFullTestScore,
  submitFullTest,
  isFullTestError,
  FullTestSubmitRequest,
  FullTestSubmitResponse,
  QuestionForScoring,
  SubmittedAnswer,
} from './fulltest.service';
import { queryOne, queryMany, withTransaction } from '../utils/database';
import { getSessionState, deleteSessionState } from '../utils/cache';
import { SessionStatus } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQueryMany = vi.mocked(queryMany);
const mockedWithTransaction = vi.mocked(withTransaction);
const mockedGetSessionState = vi.mocked(getSessionState);
const mockedDeleteSessionState = vi.mocked(deleteSessionState);

describe('Full Test Service - Submit and Score (Req 4.6, 4.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Test Data Helpers ──────────────────────────────────────────────────────

  function makeQuestions(count: number): QuestionForScoring[] {
    return Array.from({ length: count }, (_, i) => ({
      question_id: `q-${i}`,
      correct_answer: ['A', 'B', 'C', 'D'][i % 4],
      explanation: `Explanation for question ${i}`,
    }));
  }

  function makeAnswers(questionIndices: number[], answers: string[]): SubmittedAnswer[] {
    return questionIndices.map((idx, i) => ({
      questionIndex: idx,
      selectedAnswer: answers[i],
    }));
  }

  function mockActiveFullTestSession(overrides?: Partial<any>) {
    return {
      session_id: 'session-ft-001',
      user_id: 'user-001',
      session_type: 'full_test',
      status: SessionStatus.Active,
      section: 'math',
      ...overrides,
    };
  }

  function mockSessionState(questionCount: number = 5) {
    return {
      sessionId: 'session-ft-001',
      userId: 'user-001',
      section: 'math',
      questionIds: Array.from({ length: questionCount }, (_, i) => `q-${i}`),
      answers: {},
      currentIndex: 0,
      timeLimit: 3600,
      startedAt: new Date().toISOString(),
    };
  }

  // ─── computeFullTestScore (pure function) tests ─────────────────────────────

  describe('computeFullTestScore (pure logic)', () => {
    it('should return correct=0, total=0 for empty questions array', () => {
      const result = computeFullTestScore([], []);

      expect(result.score.correct).toBe(0);
      expect(result.score.total).toBe(0);
      expect(result.details).toHaveLength(0);
    });

    it('should mark all questions as skipped when no answers are provided', () => {
      const questions = makeQuestions(5);
      const answers: SubmittedAnswer[] = [];

      const result = computeFullTestScore(questions, answers);

      expect(result.score.correct).toBe(0);
      expect(result.score.total).toBe(5);
      expect(result.details).toHaveLength(5);

      for (const detail of result.details) {
        expect(detail.selectedAnswer).toBeNull();
        expect(detail.isCorrect).toBe(false);
      }
    });

    it('should correctly score all answered questions', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
        { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
        { question_id: 'q-2', correct_answer: 'C', explanation: 'Exp 2' },
      ];
      const answers = makeAnswers([0, 1, 2], ['A', 'B', 'C']);

      const result = computeFullTestScore(questions, answers);

      expect(result.score.correct).toBe(3);
      expect(result.score.total).toBe(3);
      expect(result.details[0].isCorrect).toBe(true);
      expect(result.details[1].isCorrect).toBe(true);
      expect(result.details[2].isCorrect).toBe(true);
    });

    it('should correctly mark incorrect answers', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
        { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
        { question_id: 'q-2', correct_answer: 'C', explanation: 'Exp 2' },
      ];
      const answers = makeAnswers([0, 1, 2], ['B', 'A', 'D']);

      const result = computeFullTestScore(questions, answers);

      expect(result.score.correct).toBe(0);
      expect(result.score.total).toBe(3);
      expect(result.details[0].isCorrect).toBe(false);
      expect(result.details[1].isCorrect).toBe(false);
      expect(result.details[2].isCorrect).toBe(false);
    });

    it('should handle a mix of answered, correct, incorrect, and skipped questions', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
        { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
        { question_id: 'q-2', correct_answer: 'C', explanation: 'Exp 2' },
        { question_id: 'q-3', correct_answer: 'D', explanation: 'Exp 3' },
        { question_id: 'q-4', correct_answer: 'A', explanation: 'Exp 4' },
      ];
      // Answer questions 0 (correct), 2 (incorrect), 4 (correct); skip 1 and 3
      const answers = makeAnswers([0, 2, 4], ['A', 'B', 'A']);

      const result = computeFullTestScore(questions, answers);

      expect(result.score.correct).toBe(2);
      expect(result.score.total).toBe(5);

      // q-0: answered A, correct A → correct
      expect(result.details[0].selectedAnswer).toBe('A');
      expect(result.details[0].isCorrect).toBe(true);

      // q-1: skipped → null, incorrect
      expect(result.details[1].selectedAnswer).toBeNull();
      expect(result.details[1].isCorrect).toBe(false);

      // q-2: answered B, correct C → incorrect
      expect(result.details[2].selectedAnswer).toBe('B');
      expect(result.details[2].isCorrect).toBe(false);

      // q-3: skipped → null, incorrect
      expect(result.details[3].selectedAnswer).toBeNull();
      expect(result.details[3].isCorrect).toBe(false);

      // q-4: answered A, correct A → correct
      expect(result.details[4].selectedAnswer).toBe('A');
      expect(result.details[4].isCorrect).toBe(true);
    });

    it('should handle case-insensitive answer comparison', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'a', explanation: 'Exp 0' },
        { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
      ];
      const answers = makeAnswers([0, 1], ['A', 'b']);

      const result = computeFullTestScore(questions, answers);

      expect(result.score.correct).toBe(2);
      expect(result.details[0].isCorrect).toBe(true);
      expect(result.details[1].isCorrect).toBe(true);
    });

    it('should include correct explanation for each question in details', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'A', explanation: 'First explanation' },
        { question_id: 'q-1', correct_answer: 'B', explanation: 'Second explanation' },
      ];
      const answers = makeAnswers([0], ['A']);

      const result = computeFullTestScore(questions, answers);

      expect(result.details[0].explanation).toBe('First explanation');
      expect(result.details[1].explanation).toBe('Second explanation');
    });

    it('should include the correct answer in details for all questions', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'C', explanation: 'Exp' },
        { question_id: 'q-1', correct_answer: 'D', explanation: 'Exp' },
      ];

      const result = computeFullTestScore(questions, []);

      expect(result.details[0].correctAnswer).toBe('C');
      expect(result.details[1].correctAnswer).toBe('D');
    });

    it('should handle large test with 75 questions (English section)', () => {
      const questions = makeQuestions(75);
      // Answer 50 questions correctly, skip 25
      const answers: SubmittedAnswer[] = [];
      for (let i = 0; i < 50; i++) {
        answers.push({
          questionIndex: i,
          selectedAnswer: questions[i].correct_answer,
        });
      }

      const result = computeFullTestScore(questions, answers);

      expect(result.score.total).toBe(75);
      expect(result.score.correct).toBe(50);
      expect(result.details).toHaveLength(75);

      // First 50 should be correct
      for (let i = 0; i < 50; i++) {
        expect(result.details[i].isCorrect).toBe(true);
      }
      // Last 25 should be skipped
      for (let i = 50; i < 75; i++) {
        expect(result.details[i].selectedAnswer).toBeNull();
        expect(result.details[i].isCorrect).toBe(false);
      }
    });

    it('should handle duplicate questionIndex in answers (last one wins)', () => {
      const questions: QuestionForScoring[] = [
        { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp' },
      ];
      // Submit two answers for the same question - last one in array wins via Map
      const answers: SubmittedAnswer[] = [
        { questionIndex: 0, selectedAnswer: 'B' },
        { questionIndex: 0, selectedAnswer: 'A' },
      ];

      const result = computeFullTestScore(questions, answers);

      // The Map will keep the last value set for key 0
      expect(result.details[0].selectedAnswer).toBe('A');
      expect(result.details[0].isCorrect).toBe(true);
    });
  });

  // ─── submitFullTest (integration with mocks) tests ──────────────────────────

  describe('submitFullTest', () => {
    describe('input validation', () => {
      it('should return error when sessionId is empty', async () => {
        const result = await submitFullTest({ sessionId: '', answers: [] });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toBe('sessionId is required');
        }
      });

      it('should return error when answers is not an array', async () => {
        const result = await submitFullTest({
          sessionId: 'session-001',
          answers: 'not-array' as any,
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toBe('answers must be an array');
        }
      });

      it('should return error when answer has invalid questionIndex', async () => {
        const result = await submitFullTest({
          sessionId: 'session-001',
          answers: [{ questionIndex: -1, selectedAnswer: 'A' }],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toBe('questionIndex must be non-negative');
        }
      });

      it('should return error when answer has invalid selectedAnswer', async () => {
        const result = await submitFullTest({
          sessionId: 'session-001',
          answers: [{ questionIndex: 0, selectedAnswer: 'E' }],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toBe('selectedAnswer must be one of A, B, C, D');
        }
      });

      it('should return error when selectedAnswer is empty string', async () => {
        const result = await submitFullTest({
          sessionId: 'session-001',
          answers: [{ questionIndex: 0, selectedAnswer: '' }],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toContain('selectedAnswer');
        }
      });
    });

    describe('session validation', () => {
      it('should return error when session is not found', async () => {
        mockedQueryOne.mockResolvedValueOnce(null);

        const result = await submitFullTest({
          sessionId: 'nonexistent',
          answers: [],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toBe('Session not found');
        }
      });

      it('should return error when session is not active', async () => {
        mockedQueryOne.mockResolvedValueOnce(
          mockActiveFullTestSession({ status: SessionStatus.Completed })
        );

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toContain('not active');
        }
      });

      it('should return error when session is not a full_test type', async () => {
        mockedQueryOne.mockResolvedValueOnce(
          mockActiveFullTestSession({ session_type: 'practice' })
        );

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toContain('only for full test sessions');
        }
      });

      it('should return error when session state is not in Redis', async () => {
        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce(null);

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [],
        });

        expect(isFullTestError(result)).toBe(true);
        if (isFullTestError(result)) {
          expect(result.error).toContain('Session state not found');
        }
      });
    });

    describe('successful submission', () => {
      it('should compute score and return response for fully answered test', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
          { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
          { question_id: 'q-2', correct_answer: 'C', explanation: 'Exp 2' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(3),
          questionIds: ['q-0', 'q-1', 'q-2'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [
            { questionIndex: 0, selectedAnswer: 'A' },
            { questionIndex: 1, selectedAnswer: 'B' },
            { questionIndex: 2, selectedAnswer: 'C' },
          ],
        });

        expect(isFullTestError(result)).toBe(false);
        const response = result as FullTestSubmitResponse;
        expect(response.score.correct).toBe(3);
        expect(response.score.total).toBe(3);
        expect(response.details).toHaveLength(3);
      });

      it('should handle timer expiry auto-submit with unanswered questions marked as skipped', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
          { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
          { question_id: 'q-2', correct_answer: 'C', explanation: 'Exp 2' },
          { question_id: 'q-3', correct_answer: 'D', explanation: 'Exp 3' },
          { question_id: 'q-4', correct_answer: 'A', explanation: 'Exp 4' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(5),
          questionIds: ['q-0', 'q-1', 'q-2', 'q-3', 'q-4'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        // Only answered 2 out of 5 questions (simulating timer expiry)
        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [
            { questionIndex: 0, selectedAnswer: 'A' },
            { questionIndex: 2, selectedAnswer: 'C' },
          ],
        });

        expect(isFullTestError(result)).toBe(false);
        const response = result as FullTestSubmitResponse;

        // 2 correct out of 5 total
        expect(response.score.correct).toBe(2);
        expect(response.score.total).toBe(5);

        // q-0: answered correctly
        expect(response.details[0].selectedAnswer).toBe('A');
        expect(response.details[0].isCorrect).toBe(true);

        // q-1: skipped
        expect(response.details[1].selectedAnswer).toBeNull();
        expect(response.details[1].isCorrect).toBe(false);

        // q-2: answered correctly
        expect(response.details[2].selectedAnswer).toBe('C');
        expect(response.details[2].isCorrect).toBe(true);

        // q-3: skipped
        expect(response.details[3].selectedAnswer).toBeNull();
        expect(response.details[3].isCorrect).toBe(false);

        // q-4: skipped
        expect(response.details[4].selectedAnswer).toBeNull();
        expect(response.details[4].isCorrect).toBe(false);
      });

      it('should submit with empty answers array (all skipped on timer expiry)', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
          { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(2),
          questionIds: ['q-0', 'q-1'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [],
        });

        expect(isFullTestError(result)).toBe(false);
        const response = result as FullTestSubmitResponse;
        expect(response.score.correct).toBe(0);
        expect(response.score.total).toBe(2);

        // Both marked as skipped
        expect(response.details[0].selectedAnswer).toBeNull();
        expect(response.details[0].isCorrect).toBe(false);
        expect(response.details[1].selectedAnswer).toBeNull();
        expect(response.details[1].isCorrect).toBe(false);
      });

      it('should create performance records within a transaction', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(1),
          questionIds: ['q-0'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);

        const txQueryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(txQueryMock as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [{ questionIndex: 0, selectedAnswer: 'A' }],
        });

        // Should have called txQuery for INSERT performance_record + UPDATE session
        expect(txQueryMock).toHaveBeenCalledTimes(2);

        // First call: INSERT performance_record
        const insertCall = txQueryMock.mock.calls[0];
        expect(insertCall[0]).toContain('INSERT INTO performance_records');
        expect(insertCall[1]).toContain('user-001'); // userId
        expect(insertCall[1]).toContain('session-ft-001'); // sessionId
        expect(insertCall[1]).toContain('q-0'); // questionId
        expect(insertCall[1]).toContain('A'); // selectedAnswer

        // Second call: UPDATE session status
        const updateCall = txQueryMock.mock.calls[1];
        expect(updateCall[0]).toContain('UPDATE sessions SET status');
        expect(updateCall[1]).toContain(SessionStatus.Completed);
      });

      it('should mark skipped questions with selected_answer=NULL in performance records', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
          { question_id: 'q-1', correct_answer: 'B', explanation: 'Exp 1' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(2),
          questionIds: ['q-0', 'q-1'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);

        const txQueryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(txQueryMock as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        // Only answer q-0, skip q-1
        await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [{ questionIndex: 0, selectedAnswer: 'A' }],
        });

        // 2 INSERT calls (one per question) + 1 UPDATE call
        expect(txQueryMock).toHaveBeenCalledTimes(3);

        // First INSERT: answered question (selected_answer = 'A')
        const firstInsert = txQueryMock.mock.calls[0][1];
        expect(firstInsert[4]).toBe('A'); // selected_answer

        // Second INSERT: skipped question (selected_answer = null)
        const secondInsert = txQueryMock.mock.calls[1][1];
        expect(secondInsert[4]).toBeNull(); // selected_answer
        expect(secondInsert[5]).toBe(false); // is_correct
      });

      it('should delete Redis session state after successful submission', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'A', explanation: 'Exp 0' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(1),
          questionIds: ['q-0'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [{ questionIndex: 0, selectedAnswer: 'A' }],
        });

        expect(mockedDeleteSessionState).toHaveBeenCalledWith('session-ft-001');
      });

      it('should return per-question details with questionId, correctAnswer, and explanation', async () => {
        const questions: QuestionForScoring[] = [
          { question_id: 'q-0', correct_answer: 'B', explanation: 'Because B is correct' },
          { question_id: 'q-1', correct_answer: 'D', explanation: 'Because D is correct' },
        ];

        mockedQueryOne.mockResolvedValueOnce(mockActiveFullTestSession());
        mockedGetSessionState.mockResolvedValueOnce({
          ...mockSessionState(2),
          questionIds: ['q-0', 'q-1'],
        });
        mockedQueryMany.mockResolvedValueOnce(questions);
        mockedWithTransaction.mockImplementationOnce(async (cb) => {
          await cb(vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }) as any);
        });
        mockedDeleteSessionState.mockResolvedValueOnce(undefined);

        const result = await submitFullTest({
          sessionId: 'session-ft-001',
          answers: [{ questionIndex: 0, selectedAnswer: 'A' }],
        });

        expect(isFullTestError(result)).toBe(false);
        const response = result as FullTestSubmitResponse;

        expect(response.details[0].questionId).toBe('q-0');
        expect(response.details[0].correctAnswer).toBe('B');
        expect(response.details[0].explanation).toBe('Because B is correct');
        expect(response.details[0].selectedAnswer).toBe('A');
        expect(response.details[0].isCorrect).toBe(false);

        expect(response.details[1].questionId).toBe('q-1');
        expect(response.details[1].correctAnswer).toBe('D');
        expect(response.details[1].explanation).toBe('Because D is correct');
        expect(response.details[1].selectedAnswer).toBeNull();
        expect(response.details[1].isCorrect).toBe(false);
      });
    });
  });

  // ─── isFullTestError helper ─────────────────────────────────────────────────

  describe('isFullTestError', () => {
    it('should return true for error objects', () => {
      expect(isFullTestError({ error: 'Something went wrong' })).toBe(true);
    });

    it('should return false for success responses', () => {
      const response: FullTestSubmitResponse = {
        score: { correct: 3, total: 5 },
        details: [],
      };
      expect(isFullTestError(response)).toBe(false);
    });
  });
});
