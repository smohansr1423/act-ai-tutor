/**
 * Unit tests for Session Service - Practice session end with summary.
 * Tests Requirement 3.9
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import {
  endPracticeSession,
  computeSessionSummary,
  isSessionError,
  EndSessionResponse,
} from './session.service';
import { query, queryOne, queryMany } from '../utils/database';
import { SessionStatus } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);
const mockedQueryMany = vi.mocked(queryMany);

describe('Session Service - End Practice Session (Req 3.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockActiveSession = (overrides?: Partial<any>) => ({
    session_id: 'session-001',
    user_id: 'user-001',
    session_type: 'practice',
    status: SessionStatus.Active,
    ...overrides,
  });

  describe('computeSessionSummary (pure logic)', () => {
    it('should return zeros for an empty records array', () => {
      const result = computeSessionSummary([]);

      expect(result.totalQuestions).toBe(0);
      expect(result.correct).toBe(0);
      expect(result.avgTime).toBe(0);
    });

    it('should compute totalQuestions as count of records', () => {
      const records = [
        { is_correct: true, time_taken_seconds: 10 },
        { is_correct: false, time_taken_seconds: 20 },
        { is_correct: true, time_taken_seconds: 15 },
      ];

      const result = computeSessionSummary(records);

      expect(result.totalQuestions).toBe(3);
    });

    it('should compute correct as count of records where is_correct is true', () => {
      const records = [
        { is_correct: true, time_taken_seconds: 10 },
        { is_correct: false, time_taken_seconds: 20 },
        { is_correct: true, time_taken_seconds: 15 },
        { is_correct: false, time_taken_seconds: 12 },
        { is_correct: true, time_taken_seconds: 8 },
      ];

      const result = computeSessionSummary(records);

      expect(result.correct).toBe(3);
    });

    it('should compute avgTime as mean of time_taken_seconds', () => {
      const records = [
        { is_correct: true, time_taken_seconds: 10 },
        { is_correct: false, time_taken_seconds: 20 },
        { is_correct: true, time_taken_seconds: 30 },
      ];

      const result = computeSessionSummary(records);

      // (10 + 20 + 30) / 3 = 20
      expect(result.avgTime).toBe(20);
    });

    it('should handle a single record correctly', () => {
      const records = [{ is_correct: false, time_taken_seconds: 45.5 }];

      const result = computeSessionSummary(records);

      expect(result.totalQuestions).toBe(1);
      expect(result.correct).toBe(0);
      expect(result.avgTime).toBe(45.5);
    });

    it('should handle all correct answers', () => {
      const records = [
        { is_correct: true, time_taken_seconds: 5 },
        { is_correct: true, time_taken_seconds: 10 },
      ];

      const result = computeSessionSummary(records);

      expect(result.totalQuestions).toBe(2);
      expect(result.correct).toBe(2);
      expect(result.avgTime).toBe(7.5);
    });

    it('should handle all incorrect answers', () => {
      const records = [
        { is_correct: false, time_taken_seconds: 30 },
        { is_correct: false, time_taken_seconds: 40 },
      ];

      const result = computeSessionSummary(records);

      expect(result.totalQuestions).toBe(2);
      expect(result.correct).toBe(0);
      expect(result.avgTime).toBe(35);
    });

    it('should handle fractional time values precisely', () => {
      const records = [
        { is_correct: true, time_taken_seconds: 10.5 },
        { is_correct: false, time_taken_seconds: 20.3 },
        { is_correct: true, time_taken_seconds: 15.2 },
      ];

      const result = computeSessionSummary(records);

      expect(result.totalQuestions).toBe(3);
      expect(result.correct).toBe(2);
      // (10.5 + 20.3 + 15.2) / 3 = 46.0 / 3 ≈ 15.333...
      expect(result.avgTime).toBeCloseTo(15.333, 2);
    });
  });

  describe('endPracticeSession', () => {
    it('should return error if sessionId is empty', async () => {
      const result = await endPracticeSession('');

      expect(isSessionError(result)).toBe(true);
      if (isSessionError(result)) {
        expect(result.message).toBe('Session ID is required');
      }
    });

    it('should return error if session is not found', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await endPracticeSession('nonexistent-session');

      expect(isSessionError(result)).toBe(true);
      if (isSessionError(result)) {
        expect(result.message).toBe('Session not found');
      }
    });

    it('should return error if session is already completed', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockActiveSession({ status: SessionStatus.Completed })
      );

      const result = await endPracticeSession('session-001');

      expect(isSessionError(result)).toBe(true);
      if (isSessionError(result)) {
        expect(result.message).toBe('Session is already completed');
      }
    });

    it('should return error if session is expired', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockActiveSession({ status: SessionStatus.Expired })
      );

      const result = await endPracticeSession('session-001');

      expect(isSessionError(result)).toBe(true);
      if (isSessionError(result)) {
        expect(result.message).toBe('Session is already expired');
      }
    });

    it('should mark session as completed and return summary', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockActiveSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedQueryMany.mockResolvedValueOnce([
        { is_correct: true, time_taken_seconds: 12 },
        { is_correct: false, time_taken_seconds: 25 },
        { is_correct: true, time_taken_seconds: 18 },
      ]);

      const result = await endPracticeSession('session-001');

      expect(isSessionError(result)).toBe(false);
      const response = result as EndSessionResponse;
      expect(response.summary.totalQuestions).toBe(3);
      expect(response.summary.correct).toBe(2);
      expect(response.summary.avgTime).toBeCloseTo(18.333, 2);
    });

    it('should update session status to completed with completed_at timestamp', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockActiveSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedQueryMany.mockResolvedValueOnce([]);

      await endPracticeSession('session-001');

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET status'),
        expect.arrayContaining([SessionStatus.Completed, expect.any(Date), 'session-001'])
      );
    });

    it('should query performance_records for the given session', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockActiveSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedQueryMany.mockResolvedValueOnce([]);

      await endPracticeSession('session-001');

      expect(mockedQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('performance_records'),
        ['session-001']
      );
    });

    it('should return summary with zero values when session has no records', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockActiveSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedQueryMany.mockResolvedValueOnce([]);

      const result = await endPracticeSession('session-001');

      expect(isSessionError(result)).toBe(false);
      const response = result as EndSessionResponse;
      expect(response.summary.totalQuestions).toBe(0);
      expect(response.summary.correct).toBe(0);
      expect(response.summary.avgTime).toBe(0);
    });

    it('should handle a large number of records correctly', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockActiveSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      // Simulate 50 records: 30 correct, 20 incorrect, avg time = 15s
      const records = Array.from({ length: 50 }, (_, i) => ({
        is_correct: i < 30,
        time_taken_seconds: 15,
      }));
      mockedQueryMany.mockResolvedValueOnce(records);

      const result = await endPracticeSession('session-001');

      expect(isSessionError(result)).toBe(false);
      const response = result as EndSessionResponse;
      expect(response.summary.totalQuestions).toBe(50);
      expect(response.summary.correct).toBe(30);
      expect(response.summary.avgTime).toBe(15);
    });
  });

  describe('isSessionError', () => {
    it('should return true for error responses', () => {
      expect(isSessionError({ message: 'Some error' })).toBe(true);
    });

    it('should return false for successful responses', () => {
      const response: EndSessionResponse = {
        summary: { totalQuestions: 5, correct: 3, avgTime: 12 },
      };
      expect(isSessionError(response)).toBe(false);
    });
  });
});
