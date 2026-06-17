/**
 * Unit tests for Session Interrupt Service
 * Tests Requirements 4.9, 4.10 - Session interruption, resume, and expiry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

// Mock the cache module
vi.mock('../utils/cache', () => ({
  getSessionState: vi.fn(),
  setSessionState: vi.fn(),
}));

import {
  interruptSession,
  resumeSession,
  markExpiredSessions,
  checkAndExpireSession,
  calculateExpiresAt,
  calculateTimeRemaining,
  isSessionInterruptError,
} from './session-interrupt.service';
import { query, queryOne, queryMany } from '../utils/database';
import { getSessionState, setSessionState } from '../utils/cache';
import { SessionStatus, SessionType, SessionSection } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);
const mockedQueryMany = vi.mocked(queryMany);
const mockedGetSessionState = vi.mocked(getSessionState);
const mockedSetSessionState = vi.mocked(setSessionState);

describe('Session Interrupt Service (Req 4.9, 4.10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Helper Factories ─────────────────────────────────────────────────────

  const mockSession = (overrides?: Partial<any>) => ({
    session_id: 'session-001',
    user_id: 'user-001',
    session_type: SessionType.FullTest,
    section: SessionSection.Math,
    status: SessionStatus.Active,
    started_at: new Date('2024-01-15T10:00:00Z'),
    completed_at: null,
    time_limit_seconds: 3600,
    time_remaining_seconds: null,
    expires_at: null,
    ...overrides,
  });

  const mockSessionState = (overrides?: Partial<any>) => ({
    sessionId: 'session-001',
    userId: 'user-001',
    section: 'math',
    questionIds: ['q-1', 'q-2', 'q-3'],
    answers: { 0: 'A', 1: 'B' },
    currentIndex: 1,
    timeLimit: 3600,
    startedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  });

  const mockQuestion = (id: string, overrides?: Partial<any>) => ({
    question_id: id,
    section: 'math',
    question_text: `Question ${id}`,
    passage: null,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correct_answer: 'A',
    explanation: `Explanation for ${id}`,
    incorrect_reasoning: {},
    skill_tag: 'algebra',
    difficulty: 'medium',
    strategy_tip: 'A strategy tip',
    created_at: new Date(),
    ...overrides,
  });

  // ─── Pure Function Tests ──────────────────────────────────────────────────

  describe('calculateExpiresAt', () => {
    it('should return a date 24 hours after the input', () => {
      const startedAt = new Date('2024-01-15T10:00:00Z');
      const result = calculateExpiresAt(startedAt);

      expect(result.toISOString()).toBe('2024-01-16T10:00:00.000Z');
    });

    it('should handle midnight correctly', () => {
      const startedAt = new Date('2024-01-15T00:00:00Z');
      const result = calculateExpiresAt(startedAt);

      expect(result.toISOString()).toBe('2024-01-16T00:00:00.000Z');
    });
  });

  describe('calculateTimeRemaining', () => {
    it('should return time_remaining_seconds directly when stored', () => {
      const result = calculateTimeRemaining(
        3600,
        1500,
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-01-15T11:00:00Z')
      );

      expect(result).toBe(1500);
    });

    it('should calculate from time limit minus elapsed when time_remaining is null', () => {
      const startedAt = new Date('2024-01-15T10:00:00Z');
      const now = new Date('2024-01-15T10:10:00Z'); // 10 minutes later

      const result = calculateTimeRemaining(3600, null, startedAt, now);

      // 3600 - 600 = 3000
      expect(result).toBe(3000);
    });

    it('should return 0 when time has fully elapsed', () => {
      const startedAt = new Date('2024-01-15T10:00:00Z');
      const now = new Date('2024-01-15T12:00:00Z'); // 2 hours later

      const result = calculateTimeRemaining(3600, null, startedAt, now);

      expect(result).toBe(0);
    });

    it('should return 0 when stored time_remaining is 0', () => {
      const result = calculateTimeRemaining(
        3600,
        0,
        new Date('2024-01-15T10:00:00Z'),
        new Date()
      );

      expect(result).toBe(0);
    });
  });

  describe('isSessionInterruptError', () => {
    it('should return true for error objects', () => {
      expect(isSessionInterruptError({ error: 'Something went wrong' })).toBe(true);
    });

    it('should return false for successful interrupt responses', () => {
      expect(
        isSessionInterruptError({
          sessionId: 'session-001',
          status: 'interrupted',
          expiresAt: '2024-01-16T10:00:00Z',
        })
      ).toBe(false);
    });

    it('should return false for successful resume responses', () => {
      expect(
        isSessionInterruptError({
          sessionId: 'session-001',
          questions: [],
          answers: {},
          timeRemaining: 1500,
          currentIndex: 3,
        })
      ).toBe(false);
    });
  });

  // ─── interruptSession Tests ───────────────────────────────────────────────

  describe('interruptSession', () => {
    it('should return error when sessionId is empty', async () => {
      const result = await interruptSession({ sessionId: '' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toBe('sessionId is required');
      }
    });

    it('should return error when session is not found', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await interruptSession({ sessionId: 'nonexistent' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should return error when session is not active', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ status: SessionStatus.Completed })
      );

      const result = await interruptSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toContain('Cannot interrupt session');
      }
    });

    it('should return error for practice sessions', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ session_type: SessionType.Practice })
      );

      const result = await interruptSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toBe('Only full test sessions can be interrupted');
      }
    });

    it('should interrupt an active full test session successfully', async () => {
      const startedAt = new Date('2024-01-15T10:00:00Z');
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ started_at: startedAt })
      );
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedGetSessionState.mockResolvedValueOnce(mockSessionState());
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await interruptSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(false);
      if (!isSessionInterruptError(result)) {
        expect(result.sessionId).toBe('session-001');
        expect(result.status).toBe(SessionStatus.Interrupted);
        expect(result.expiresAt).toBe('2024-01-16T10:00:00.000Z');
      }
    });

    it('should update database with interrupted status and expires_at', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedGetSessionState.mockResolvedValueOnce(mockSessionState());
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await interruptSession({ sessionId: 'session-001' });

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions'),
        expect.arrayContaining([
          SessionStatus.Interrupted,
          expect.any(Date), // expires_at
          expect.any(Number), // time_remaining_seconds
          'session-001',
        ])
      );
    });

    it('should refresh Redis session state with 24-hour TTL', async () => {
      const sessionState = mockSessionState();
      mockedQueryOne.mockResolvedValueOnce(mockSession());
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedGetSessionState.mockResolvedValueOnce(sessionState);
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await interruptSession({ sessionId: 'session-001' });

      expect(mockedSetSessionState).toHaveBeenCalledWith(
        'session-001',
        sessionState,
        86400 // 24 hours in seconds
      );
    });
  });

  // ─── resumeSession Tests ──────────────────────────────────────────────────

  describe('resumeSession', () => {
    it('should return error when sessionId is empty', async () => {
      const result = await resumeSession({ sessionId: '' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toBe('sessionId is required');
      }
    });

    it('should return error when session is not found', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await resumeSession({ sessionId: 'nonexistent' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toBe('Session not found');
      }
    });

    it('should return error when session is not interrupted', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ status: SessionStatus.Active })
      );

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toContain('Cannot resume session');
      }
    });

    it('should return error when session is already expired', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ status: SessionStatus.Expired })
      );

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toContain('expired');
      }
    });

    it('should mark as expired and return error when expires_at has passed', async () => {
      const pastExpiry = new Date('2024-01-14T10:00:00Z'); // In the past
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: pastExpiry,
        })
      );
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toContain('expired');
      }
      // Verify it was marked as expired in DB
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET status'),
        expect.arrayContaining([SessionStatus.Expired, 'session-001'])
      );
    });

    it('should return error when Redis session state is missing', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: futureExpiry,
        })
      );
      mockedGetSessionState.mockResolvedValueOnce(null);

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(true);
      if (isSessionInterruptError(result)) {
        expect(result.error).toContain('Session state not found');
      }
    });

    it('should successfully resume an interrupted session within 24 hours', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: futureExpiry,
          time_remaining_seconds: 2400,
        })
      );
      mockedGetSessionState.mockResolvedValueOnce(mockSessionState());
      mockedQueryMany.mockResolvedValueOnce([
        mockQuestion('q-1'),
        mockQuestion('q-2'),
        mockQuestion('q-3'),
      ]);
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(false);
      if (!isSessionInterruptError(result)) {
        expect(result.sessionId).toBe('session-001');
        expect(result.questions).toHaveLength(3);
        expect(result.answers).toEqual({ 0: 'A', 1: 'B' });
        expect(result.timeRemaining).toBe(2400);
        expect(result.currentIndex).toBe(1);
      }
    });

    it('should restore questions in original order', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: futureExpiry,
          time_remaining_seconds: 2400,
        })
      );
      mockedGetSessionState.mockResolvedValueOnce(
        mockSessionState({ questionIds: ['q-3', 'q-1', 'q-2'] })
      );
      // Return questions in a different order from DB
      mockedQueryMany.mockResolvedValueOnce([
        mockQuestion('q-1'),
        mockQuestion('q-2'),
        mockQuestion('q-3'),
      ]);
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await resumeSession({ sessionId: 'session-001' });

      expect(isSessionInterruptError(result)).toBe(false);
      if (!isSessionInterruptError(result)) {
        // Questions should be in the order specified by questionIds
        expect(result.questions[0].questionId).toBe('q-3');
        expect(result.questions[1].questionId).toBe('q-1');
        expect(result.questions[2].questionId).toBe('q-2');
      }
    });

    it('should update session status back to active', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: futureExpiry,
          time_remaining_seconds: 2400,
        })
      );
      mockedGetSessionState.mockResolvedValueOnce(mockSessionState());
      mockedQueryMany.mockResolvedValueOnce([
        mockQuestion('q-1'),
        mockQuestion('q-2'),
        mockQuestion('q-3'),
      ]);
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await resumeSession({ sessionId: 'session-001' });

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET status'),
        expect.arrayContaining([SessionStatus.Active, 'session-001'])
      );
    });
  });

  // ─── markExpiredSessions Tests ────────────────────────────────────────────

  describe('markExpiredSessions', () => {
    it('should return number of sessions marked as expired', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 5, command: '', oid: 0, fields: [] });

      const result = await markExpiredSessions();

      expect(result).toBe(5);
    });

    it('should return 0 when no sessions are expired', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      const result = await markExpiredSessions();

      expect(result).toBe(0);
    });

    it('should query for interrupted sessions past their expiry', async () => {
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });

      await markExpiredSessions();

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET status'),
        expect.arrayContaining([SessionStatus.Expired, SessionStatus.Interrupted, expect.any(Date)])
      );
    });
  });

  // ─── checkAndExpireSession Tests ──────────────────────────────────────────

  describe('checkAndExpireSession', () => {
    it('should return false when session is not found', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await checkAndExpireSession('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false when session is not interrupted', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({ status: SessionStatus.Active })
      );

      const result = await checkAndExpireSession('session-001');

      expect(result).toBe(false);
    });

    it('should return false when session has not yet expired', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: futureExpiry,
        })
      );

      const result = await checkAndExpireSession('session-001');

      expect(result).toBe(false);
    });

    it('should mark session as expired and return true when past expiry', async () => {
      const pastExpiry = new Date('2024-01-14T10:00:00Z');
      mockedQueryOne.mockResolvedValueOnce(
        mockSession({
          status: SessionStatus.Interrupted,
          expires_at: pastExpiry,
        })
      );
      mockedQuery.mockResolvedValueOnce({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await checkAndExpireSession('session-001');

      expect(result).toBe(true);
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET status'),
        expect.arrayContaining([SessionStatus.Expired, 'session-001'])
      );
    });
  });
});
