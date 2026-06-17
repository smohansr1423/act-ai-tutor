/**
 * Unit tests for Full Test Service - Session Start
 * Tests Requirements 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  insertOne: vi.fn(),
  queryMany: vi.fn(),
  queryOne: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

// Mock the cache module
vi.mock('../utils/cache', () => ({
  setSessionState: vi.fn(),
  getSessionState: vi.fn(),
  deleteSessionState: vi.fn(),
}));

import {
  startFullTest,
  isFullTestError,
  FULL_TEST_CONFIG,
  StartFullTestRequest,
  FullTestSessionState,
} from './fulltest.service';
import { insertOne, queryMany } from '../utils/database';
import { setSessionState } from '../utils/cache';
import { Section, SessionSection, SessionType, SessionStatus } from '../models/enums';
import { Question } from '../models/interfaces';

const mockedInsertOne = vi.mocked(insertOne);
const mockedQueryMany = vi.mocked(queryMany);
const mockedSetSessionState = vi.mocked(setSessionState);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createMockQuestion(overrides?: Partial<Question>): Question {
  return {
    question_id: 'q-' + Math.random().toString(36).substring(7),
    section: Section.Math,
    question_text: 'What is 2 + 2?',
    passage: null,
    options: ['3', '4', '5', '6'],
    correct_answer: 'B',
    explanation: '2 + 2 = 4',
    incorrect_reasoning: { A: 'Too low', C: 'Too high', D: 'Way too high' },
    skill_tag: 'pre_algebra',
    difficulty: 'easy',
    strategy_tip: 'Add the numbers',
    created_at: new Date(),
    ...overrides,
  };
}

function createMockQuestions(count: number, section: Section): Question[] {
  return Array.from({ length: count }, (_, i) =>
    createMockQuestion({
      question_id: `q-${i}`,
      section,
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Full Test Service - startFullTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Section-Specific Configuration', () => {
    it('should have correct config for English: 75 questions, 2700s (45 min)', () => {
      expect(FULL_TEST_CONFIG[SessionSection.English]).toEqual({
        questionCount: 75,
        timeLimitSeconds: 2700,
      });
    });

    it('should have correct config for Math: 60 questions, 3600s (60 min)', () => {
      expect(FULL_TEST_CONFIG[SessionSection.Math]).toEqual({
        questionCount: 60,
        timeLimitSeconds: 3600,
      });
    });

    it('should have correct config for Reading: 40 questions, 2100s (35 min)', () => {
      expect(FULL_TEST_CONFIG[SessionSection.Reading]).toEqual({
        questionCount: 40,
        timeLimitSeconds: 2100,
      });
    });

    it('should have correct config for Science: 40 questions, 2100s (35 min)', () => {
      expect(FULL_TEST_CONFIG[SessionSection.Science]).toEqual({
        questionCount: 40,
        timeLimitSeconds: 2100,
      });
    });
  });

  describe('Input Validation', () => {
    it('should return error when userId is missing', async () => {
      const result = await startFullTest({
        userId: '',
        section: SessionSection.Math,
      });

      expect(isFullTestError(result)).toBe(true);
      if (isFullTestError(result)) {
        expect(result.error).toContain('userId is required');
      }
    });

    it('should return error when section is missing', async () => {
      const result = await startFullTest({
        userId: 'user-1',
        section: '' as SessionSection,
      });

      expect(isFullTestError(result)).toBe(true);
      if (isFullTestError(result)) {
        expect(result.error).toContain('section is required');
      }
    });

    it('should return error when section is mixed (not valid for full test)', async () => {
      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.Mixed,
      });

      expect(isFullTestError(result)).toBe(true);
      if (isFullTestError(result)) {
        expect(result.error).toContain('Invalid section for full test');
      }
    });

    it('should return error for invalid section values', async () => {
      const result = await startFullTest({
        userId: 'user-1',
        section: 'invalid' as SessionSection,
      });

      expect(isFullTestError(result)).toBe(true);
      if (isFullTestError(result)) {
        expect(result.error).toContain('Invalid section for full test');
      }
    });
  });

  describe('Successful Session Start', () => {
    it('should start a full test session for English with 75 questions and 2700s timer', async () => {
      const mockQuestions = createMockQuestions(75, Section.English);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-eng',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.English,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2700,
        time_remaining_seconds: 2700,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.English,
      });

      expect(isFullTestError(result)).toBe(false);
      if (!isFullTestError(result)) {
        expect(result.sessionId).toBe('session-eng');
        expect(result.questions).toHaveLength(75);
        expect(result.timeLimit).toBe(2700);
      }
    });

    it('should start a full test session for Math with 60 questions and 3600s timer', async () => {
      const mockQuestions = createMockQuestions(60, Section.Math);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-math',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Math,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 3600,
        time_remaining_seconds: 3600,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.Math,
      });

      expect(isFullTestError(result)).toBe(false);
      if (!isFullTestError(result)) {
        expect(result.sessionId).toBe('session-math');
        expect(result.questions).toHaveLength(60);
        expect(result.timeLimit).toBe(3600);
      }
    });

    it('should start a full test session for Reading with 40 questions and 2100s timer', async () => {
      const mockQuestions = createMockQuestions(40, Section.Reading);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-read',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Reading,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2100,
        time_remaining_seconds: 2100,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.Reading,
      });

      expect(isFullTestError(result)).toBe(false);
      if (!isFullTestError(result)) {
        expect(result.sessionId).toBe('session-read');
        expect(result.questions).toHaveLength(40);
        expect(result.timeLimit).toBe(2100);
      }
    });

    it('should start a full test session for Science with 40 questions and 2100s timer', async () => {
      const mockQuestions = createMockQuestions(40, Section.Science);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-sci',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Science,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2100,
        time_remaining_seconds: 2100,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.Science,
      });

      expect(isFullTestError(result)).toBe(false);
      if (!isFullTestError(result)) {
        expect(result.sessionId).toBe('session-sci');
        expect(result.questions).toHaveLength(40);
        expect(result.timeLimit).toBe(2100);
      }
    });
  });

  describe('Database and Cache Integration', () => {
    it('should create session record with session_type=full_test and correct time_limit', async () => {
      const mockQuestions = createMockQuestions(60, Section.Math);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-db',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Math,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 3600,
        time_remaining_seconds: 3600,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await startFullTest({
        userId: 'user-1',
        section: SessionSection.Math,
      });

      expect(mockedInsertOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([
          expect.any(String), // sessionId (UUID)
          'user-1',
          SessionType.FullTest,
          SessionSection.Math,
          SessionStatus.Active,
          expect.any(Date),
          null, // completed_at
          3600, // time_limit_seconds
          3600, // time_remaining_seconds
          null, // expires_at
        ])
      );
    });

    it('should store session state in Redis with question IDs', async () => {
      const mockQuestions = createMockQuestions(40, Section.Reading);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-cache',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Reading,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2100,
        time_remaining_seconds: 2100,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await startFullTest({
        userId: 'user-1',
        section: SessionSection.Reading,
      });

      expect(mockedSetSessionState).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          userId: 'user-1',
          section: SessionSection.Reading,
          questionIds: expect.any(Array),
          answers: {},
          currentIndex: 0,
          timeLimit: 2100,
          startedAt: expect.any(String),
        }),
        86400 // TTL: 24 hours
      );

      // Verify all question IDs are stored
      const stateArg = mockedSetSessionState.mock.calls[0][1] as FullTestSessionState;
      expect(stateArg.questionIds).toHaveLength(40);
    });

    it('should query questions filtered by section', async () => {
      const mockQuestions = createMockQuestions(40, Section.Science);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-query',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Science,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2100,
        time_remaining_seconds: 2100,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      await startFullTest({
        userId: 'user-1',
        section: SessionSection.Science,
      });

      expect(mockedQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('WHERE section = $1'),
        [Section.Science, 40]
      );
    });
  });

  describe('Question Delivery', () => {
    it('should not reveal correct answers in the returned questions', async () => {
      const mockQuestions = createMockQuestions(40, Section.Reading);
      mockedQueryMany.mockResolvedValueOnce(mockQuestions);
      mockedInsertOne.mockResolvedValueOnce({
        session_id: 'session-secure',
        user_id: 'user-1',
        session_type: SessionType.FullTest,
        section: SessionSection.Reading,
        status: SessionStatus.Active,
        started_at: new Date(),
        completed_at: null,
        time_limit_seconds: 2100,
        time_remaining_seconds: 2100,
        expires_at: null,
      });
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.Reading,
      });

      expect(isFullTestError(result)).toBe(false);
      if (!isFullTestError(result)) {
        for (const question of result.questions) {
          // Must NOT include answer-revealing fields
          expect(question).not.toHaveProperty('correctAnswer');
          expect(question).not.toHaveProperty('correct_answer');
          expect(question).not.toHaveProperty('explanation');
          expect(question).not.toHaveProperty('incorrect_reasoning');
          expect(question).not.toHaveProperty('strategy_tip');

          // Should include necessary fields
          expect(question).toHaveProperty('questionId');
          expect(question).toHaveProperty('section');
          expect(question).toHaveProperty('questionText');
          expect(question).toHaveProperty('options');
          expect(question).toHaveProperty('skillTag');
          expect(question).toHaveProperty('difficulty');
        }
      }
    });

    it('should return error when no questions are available', async () => {
      mockedQueryMany.mockResolvedValueOnce([]);

      const result = await startFullTest({
        userId: 'user-1',
        section: SessionSection.English,
      });

      expect(isFullTestError(result)).toBe(true);
      if (isFullTestError(result)) {
        expect(result.error).toContain('No questions available');
      }
    });
  });
});
