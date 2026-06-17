/**
 * Unit Tests for Performance Service
 * Tests answer submission and performance recording logic.
 *
 * Requirements: 3.7, 3.8, 9.3, 9.4, 9.5, 10.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PerformanceService,
  SubmitAnswerRequest,
  validateSubmitAnswerRequest,
  isSubmitAnswerError,
} from './performance.service';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const mockSession = {
  session_id: 'session-123',
  user_id: 'user-456',
  session_type: 'practice',
  status: 'active',
};

const mockQuestion = {
  question_id: 'question-789',
  correct_answer: 'B',
  explanation: 'The correct answer is B because of the following reasoning...',
  incorrect_reasoning: JSON.stringify({
    A: 'Option A is wrong because it misidentifies the main idea.',
    C: 'Option C is wrong because it confuses cause and effect.',
    D: 'Option D is wrong because it is too broad.',
  }),
  strategy_tip: 'Look for keywords in the passage that directly relate to the question.',
};

// ─── Validation Tests ─────────────────────────────────────────────────────────

describe('validateSubmitAnswerRequest', () => {
  it('should return null for a valid request', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 15.5,
    };
    expect(validateSubmitAnswerRequest(request)).toBeNull();
  });

  it('should reject missing sessionId', () => {
    const request: SubmitAnswerRequest = {
      sessionId: '',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 15.5,
    };
    expect(validateSubmitAnswerRequest(request)).toBe('sessionId is required');
  });

  it('should reject missing questionId', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: '',
      selectedAnswer: 'A',
      timeTaken: 15.5,
    };
    expect(validateSubmitAnswerRequest(request)).toBe('questionId is required');
  });

  it('should reject invalid selectedAnswer', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'E',
      timeTaken: 15.5,
    };
    expect(validateSubmitAnswerRequest(request)).toBe('selectedAnswer must be one of A, B, C, D');
  });

  it('should accept lowercase selectedAnswer', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'a',
      timeTaken: 15.5,
    };
    expect(validateSubmitAnswerRequest(request)).toBeNull();
  });

  it('should reject timeTaken of 0', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 0,
    };
    expect(validateSubmitAnswerRequest(request)).toBe('timeTaken must be greater than 0');
  });

  it('should reject negative timeTaken', () => {
    const request: SubmitAnswerRequest = {
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: -5,
    };
    expect(validateSubmitAnswerRequest(request)).toBe('timeTaken must be greater than 0');
  });
});

// ─── PerformanceService.submitAnswer Tests ────────────────────────────────────

describe('PerformanceService.submitAnswer', () => {
  let service: PerformanceService;
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockInsertOne: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryOne = vi.fn();
    mockInsertOne = vi.fn().mockResolvedValue({ record_id: 'record-001' });

    service = new PerformanceService({
      queryOne: mockQueryOne,
      insertOne: mockInsertOne,
    });
  });

  // ─── Validation Errors ──────────────────────────────────────────────────────

  it('should return error for invalid request (missing sessionId)', async () => {
    const result = await service.submitAnswer({
      sessionId: '',
      questionId: 'q-1',
      selectedAnswer: 'A',
      timeTaken: 10,
    });

    expect(isSubmitAnswerError(result)).toBe(true);
    if (isSubmitAnswerError(result)) {
      expect(result.error).toBe('sessionId is required');
    }
  });

  // ─── Session Not Found ──────────────────────────────────────────────────────

  it('should return error when session is not found', async () => {
    mockQueryOne.mockResolvedValue(null);

    const result = await service.submitAnswer({
      sessionId: 'nonexistent-session',
      questionId: 'q-1',
      selectedAnswer: 'A',
      timeTaken: 10,
    });

    expect(isSubmitAnswerError(result)).toBe(true);
    if (isSubmitAnswerError(result)) {
      expect(result.error).toBe('Session not found');
    }
  });

  // ─── Session Not Active ─────────────────────────────────────────────────────

  it('should return error when session is not active', async () => {
    mockQueryOne.mockResolvedValue({
      ...mockSession,
      status: 'completed',
    });

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'q-1',
      selectedAnswer: 'A',
      timeTaken: 10,
    });

    expect(isSubmitAnswerError(result)).toBe(true);
    if (isSubmitAnswerError(result)) {
      expect(result.error).toBe('Session is not active');
    }
  });

  // ─── Non-Practice Session ───────────────────────────────────────────────────

  it('should return error when session is not practice mode', async () => {
    mockQueryOne.mockResolvedValue({
      ...mockSession,
      session_type: 'full_test',
    });

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'q-1',
      selectedAnswer: 'A',
      timeTaken: 10,
    });

    expect(isSubmitAnswerError(result)).toBe(true);
    if (isSubmitAnswerError(result)) {
      expect(result.error).toBe('Answer submission with feedback is only available in practice mode');
    }
  });

  // ─── Question Not Found ─────────────────────────────────────────────────────

  it('should return error when question is not found', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)     // session lookup
      .mockResolvedValueOnce(null);            // question lookup

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'nonexistent-question',
      selectedAnswer: 'A',
      timeTaken: 10,
    });

    expect(isSubmitAnswerError(result)).toBe(true);
    if (isSubmitAnswerError(result)) {
      expect(result.error).toBe('Question not found');
    }
  });

  // ─── Correct Answer (Requirement 9.5) ──────────────────────────────────────

  it('should return isCorrect=true with strategy tip for correct answer', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)    // session lookup
      .mockResolvedValueOnce(mockQuestion);  // question lookup (correct_answer is B)

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'B',
      timeTaken: 12.3,
    });

    expect(isSubmitAnswerError(result)).toBe(false);
    if (!isSubmitAnswerError(result)) {
      expect(result.isCorrect).toBe(true);
      expect(result.strategyTip).toBe(mockQuestion.strategy_tip);
      expect(result.explanation).toBeUndefined();
      expect(result.correctAnswer).toBeUndefined();
    }
  });

  // ─── Incorrect Answer (Requirement 9.4) ────────────────────────────────────

  it('should return isCorrect=false with explanation for incorrect answer', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)    // session lookup
      .mockResolvedValueOnce(mockQuestion);  // question lookup (correct_answer is B)

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 20.5,
    });

    expect(isSubmitAnswerError(result)).toBe(false);
    if (!isSubmitAnswerError(result)) {
      expect(result.isCorrect).toBe(false);
      expect(result.correctAnswer).toBe('B');
      expect(result.explanation).toBe(mockQuestion.explanation);
      expect(result.incorrectReasoning).toBe('Option A is wrong because it misidentifies the main idea.');
      expect(result.strategyTip).toBeUndefined();
    }
  });

  // ─── Performance Record Creation (Requirement 3.8) ─────────────────────────

  it('should create a Performance_Record with correct fields on correct answer', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockQuestion);

    await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'B',
      timeTaken: 15.0,
    });

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const [sql, params] = mockInsertOne.mock.calls[0];

    // Verify SQL targets performance_records table
    expect(sql).toContain('INSERT INTO performance_records');

    // Verify params: [record_id, user_id, session_id, question_id, selected_answer, is_correct, time_taken, error_classification, timestamp]
    expect(params[1]).toBe('user-456');       // user_id from session
    expect(params[2]).toBe('session-123');    // session_id
    expect(params[3]).toBe('question-789');   // question_id
    expect(params[4]).toBe('B');             // selected_answer (normalized uppercase)
    expect(params[5]).toBe(true);            // is_correct
    expect(params[6]).toBe(15.0);           // time_taken_seconds
    expect(params[7]).toBeNull();           // error_classification
    expect(params[8]).toBeInstanceOf(Date); // timestamp
  });

  it('should create a Performance_Record with is_correct=false for incorrect answer', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockQuestion);

    await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'C',
      timeTaken: 25.0,
    });

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const [, params] = mockInsertOne.mock.calls[0];

    expect(params[4]).toBe('C');            // selected_answer
    expect(params[5]).toBe(false);          // is_correct
    expect(params[6]).toBe(25.0);          // time_taken_seconds
  });

  // ─── Case Insensitive Answer Comparison ─────────────────────────────────────

  it('should handle lowercase selected answers correctly', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockQuestion);  // correct_answer is B

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'b',
      timeTaken: 10.0,
    });

    expect(isSubmitAnswerError(result)).toBe(false);
    if (!isSubmitAnswerError(result)) {
      expect(result.isCorrect).toBe(true);
    }

    // Verify stored as uppercase
    const [, params] = mockInsertOne.mock.calls[0];
    expect(params[4]).toBe('B');
  });

  // ─── incorrect_reasoning as parsed object ───────────────────────────────────

  it('should handle incorrect_reasoning as already-parsed object', async () => {
    const questionWithParsedReasoning = {
      ...mockQuestion,
      incorrect_reasoning: {
        A: 'Option A is wrong because it misidentifies the main idea.',
        C: 'Option C is wrong because it confuses cause and effect.',
        D: 'Option D is wrong because it is too broad.',
      },
    };

    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(questionWithParsedReasoning);

    const result = await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'D',
      timeTaken: 18.0,
    });

    expect(isSubmitAnswerError(result)).toBe(false);
    if (!isSubmitAnswerError(result)) {
      expect(result.isCorrect).toBe(false);
      expect(result.incorrectReasoning).toBe('Option D is wrong because it is too broad.');
    }
  });

  // ─── Record ID is UUID ──────────────────────────────────────────────────────

  it('should generate a UUID for record_id', async () => {
    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockQuestion);

    await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 5.0,
    });

    const [, params] = mockInsertOne.mock.calls[0];
    const recordId = params[0] as string;

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(recordId).toMatch(uuidRegex);
  });

  // ─── Timestamp is current ───────────────────────────────────────────────────

  it('should use the current timestamp for the performance record', async () => {
    const before = new Date();

    mockQueryOne
      .mockResolvedValueOnce(mockSession)
      .mockResolvedValueOnce(mockQuestion);

    await service.submitAnswer({
      sessionId: 'session-123',
      questionId: 'question-789',
      selectedAnswer: 'A',
      timeTaken: 5.0,
    });

    const after = new Date();
    const [, params] = mockInsertOne.mock.calls[0];
    const timestamp = params[8] as Date;

    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ─── isSubmitAnswerError helper ───────────────────────────────────────────────

describe('isSubmitAnswerError', () => {
  it('should return true for error results', () => {
    expect(isSubmitAnswerError({ error: 'something went wrong' })).toBe(true);
  });

  it('should return false for success results', () => {
    expect(isSubmitAnswerError({ isCorrect: true, strategyTip: 'tip' })).toBe(false);
  });
});
