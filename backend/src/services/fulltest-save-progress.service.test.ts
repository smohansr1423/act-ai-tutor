/**
 * Unit tests for Full Test Save Progress functionality.
 * Tests the saveFullTestProgress function.
 *
 * Requirements: 4.5, 4.8, 9.6, 9.7
 * Property 27: No Feedback During Full Test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveFullTestProgress, SaveProgressRequest, FullTestSessionState } from './fulltest.service';
import { SessionStatus } from '../models/enums';

// Mock database and cache modules
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  query: vi.fn(),
}));

vi.mock('../utils/cache', () => ({
  getSessionState: vi.fn(),
  setSessionState: vi.fn(),
}));

import { queryOne, query } from '../utils/database';
import { getSessionState, setSessionState } from '../utils/cache';

const mockQueryOne = vi.mocked(queryOne);
const mockQuery = vi.mocked(query);
const mockGetSessionState = vi.mocked(getSessionState);
const mockSetSessionState = vi.mocked(setSessionState);

describe('saveFullTestProgress', () => {
  const validSessionState: FullTestSessionState = {
    sessionId: 'session-123',
    userId: 'user-456',
    section: 'math',
    questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
    answers: {},
    currentIndex: 0,
    timeLimit: 3600,
    startedAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
  };

  const validSession = {
    session_id: 'session-123',
    user_id: 'user-456',
    session_type: 'full_test',
    status: SessionStatus.Active,
    started_at: new Date(Date.now() - 600000), // 10 minutes ago
    time_limit_seconds: 3600, // 60 min
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryOne.mockResolvedValue({ ...validSession } as any);
    mockGetSessionState.mockResolvedValue(JSON.parse(JSON.stringify(validSessionState)));
    mockSetSessionState.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);
  });

  describe('Input validation', () => {
    it('should reject when sessionId is missing', async () => {
      const request: SaveProgressRequest = {
        sessionId: '',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'sessionId is required' });
    });

    it('should reject when answers is not an array', async () => {
      const request = {
        sessionId: 'session-123',
        answers: 'not-an-array' as any,
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request as any);
      expect(result).toEqual({ error: 'answers must be an array' });
    });

    it('should reject when currentIndex is missing', async () => {
      const request = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: undefined as any,
      };

      const result = await saveFullTestProgress(request as any);
      expect(result).toEqual({ error: 'currentIndex is required and must be a number' });
    });

    it('should reject when currentIndex is negative', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: -1,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'currentIndex must be non-negative' });
    });

    it('should reject when answer has invalid questionIndex', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [{ questionIndex: -1, selectedAnswer: 'A' }],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'questionIndex must be non-negative' });
    });

    it('should reject when answer has invalid selectedAnswer', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [{ questionIndex: 0, selectedAnswer: 'E' }],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'selectedAnswer must be one of A, B, C, D' });
    });
  });

  describe('Session validation', () => {
    it('should return error when session not found', async () => {
      mockQueryOne.mockResolvedValue(null);

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'Session not found' });
    });

    it('should return error when session is not a full test', async () => {
      mockQueryOne.mockResolvedValue({ ...validSession, session_type: 'practice' } as any);

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'This endpoint is only for full test sessions' });
    });

    it('should return error when session is not active', async () => {
      mockQueryOne.mockResolvedValue({ ...validSession, status: SessionStatus.Completed } as any);

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'Session is not active (current status: completed)' });
    });

    it('should return error when session state not found in Redis', async () => {
      mockGetSessionState.mockResolvedValue(null);

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      expect(result).toEqual({ error: 'Session state not found. The session may have expired.' });
    });
  });

  describe('Successful progress saving', () => {
    it('should save answers and return status without correctness info', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [
          { questionIndex: 0, selectedAnswer: 'A' },
          { questionIndex: 1, selectedAnswer: 'B' },
        ],
        currentIndex: 2,
      };

      const result = await saveFullTestProgress(request);

      // Property 27: MUST NOT reveal answer correctness
      expect(result).not.toHaveProperty('isCorrect');
      expect(result).not.toHaveProperty('correctAnswer');
      expect(result).not.toHaveProperty('explanation');
      expect(result).not.toHaveProperty('details');

      // Should return status, timeRemaining, and currentIndex
      expect(result).toHaveProperty('status', 'saved');
      expect(result).toHaveProperty('timeRemaining');
      expect(result).toHaveProperty('currentIndex', 2);

      // timeRemaining should be approximately 3000 (60 min - 10 min elapsed = 50 min = 3000s)
      const response = result as { status: string; timeRemaining: number; currentIndex: number };
      expect(response.timeRemaining).toBeGreaterThan(2900);
      expect(response.timeRemaining).toBeLessThanOrEqual(3000);
    });

    it('should update session state in Redis with new answers', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [
          { questionIndex: 0, selectedAnswer: 'A' },
          { questionIndex: 2, selectedAnswer: 'C' },
        ],
        currentIndex: 3,
      };

      await saveFullTestProgress(request);

      expect(mockSetSessionState).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          answers: { 0: 'A', 2: 'C' },
          currentIndex: 3,
        }),
        86400
      );
    });

    it('should merge new answers with existing answers', async () => {
      mockGetSessionState.mockResolvedValue({
        ...validSessionState,
        answers: { 0: 'A', 1: 'B' },
      });

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [
          { questionIndex: 1, selectedAnswer: 'C' }, // update existing
          { questionIndex: 2, selectedAnswer: 'D' }, // add new
        ],
        currentIndex: 3,
      };

      await saveFullTestProgress(request);

      expect(mockSetSessionState).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          answers: { 0: 'A', 1: 'C', 2: 'D' },
          currentIndex: 3,
        }),
        86400
      );
    });

    it('should update time_remaining_seconds in the database', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      await saveFullTestProgress(request);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE sessions SET time_remaining_seconds = $1 WHERE session_id = $2',
        [expect.any(Number), 'session-123']
      );
    });

    it('should return timeRemaining of 0 when time has expired', async () => {
      // Session started 2 hours ago with a 1 hour time limit
      const expiredSession = {
        ...validSession,
        started_at: new Date(Date.now() - 7200000), // 2 hours ago
        time_limit_seconds: 3600, // 1 hour limit
      };
      mockQueryOne.mockResolvedValue(expiredSession as any);

      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 0,
      };

      const result = await saveFullTestProgress(request);
      const response = result as { status: string; timeRemaining: number; currentIndex: number };
      expect(response.timeRemaining).toBe(0);
    });

    it('should normalize selectedAnswer to uppercase', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [
          { questionIndex: 0, selectedAnswer: 'a' },
          { questionIndex: 1, selectedAnswer: 'b' },
        ],
        currentIndex: 1,
      };

      await saveFullTestProgress(request);

      expect(mockSetSessionState).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          answers: { 0: 'A', 1: 'B' },
        }),
        86400
      );
    });

    it('should support empty answers array (navigation only)', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [],
        currentIndex: 4,
      };

      const result = await saveFullTestProgress(request);

      expect(result).toHaveProperty('status', 'saved');
      expect(result).toHaveProperty('currentIndex', 4);

      expect(mockSetSessionState).toHaveBeenCalledWith(
        'session-123',
        expect.objectContaining({
          currentIndex: 4,
        }),
        86400
      );
    });
  });

  describe('Property 27: No Feedback During Full Test', () => {
    it('should never include correctness information in the response', async () => {
      const request: SaveProgressRequest = {
        sessionId: 'session-123',
        answers: [
          { questionIndex: 0, selectedAnswer: 'A' },
          { questionIndex: 1, selectedAnswer: 'B' },
          { questionIndex: 2, selectedAnswer: 'C' },
        ],
        currentIndex: 3,
      };

      const result = await saveFullTestProgress(request);

      // Exhaustive check: the response should ONLY contain status, timeRemaining, currentIndex
      const keys = Object.keys(result);
      expect(keys).toContain('status');
      expect(keys).toContain('timeRemaining');
      expect(keys).toContain('currentIndex');
      expect(keys).toHaveLength(3);

      // Explicitly no correctness-related fields
      expect(result).not.toHaveProperty('isCorrect');
      expect(result).not.toHaveProperty('correct');
      expect(result).not.toHaveProperty('correctAnswer');
      expect(result).not.toHaveProperty('explanation');
      expect(result).not.toHaveProperty('score');
      expect(result).not.toHaveProperty('details');
    });
  });
});
