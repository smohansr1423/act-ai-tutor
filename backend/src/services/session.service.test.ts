/**
 * Unit tests for Session Service - Practice Mode
 * Tests Requirements 3.1, 3.2, 3.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  insertOne: vi.fn(),
  queryMany: vi.fn(),
  queryOne: vi.fn(),
  query: vi.fn(),
}));

// Mock the cache module
vi.mock('../utils/cache', () => ({
  setSessionState: vi.fn(),
  getSessionState: vi.fn(),
}));

import {
  startPracticeSession,
  getNextQuestion,
  isSessionError,
  formatQuestionDelivery,
  shuffleArray,
  StartPracticeRequest,
  PracticeSessionState,
} from './session.service';
import { insertOne, queryMany, queryOne, query } from '../utils/database';
import { setSessionState, getSessionState } from '../utils/cache';
import { Section, SessionSection, SessionType, SessionStatus } from '../models/enums';
import { Question } from '../models/interfaces';

const mockedInsertOne = vi.mocked(insertOne);
const mockedQueryMany = vi.mocked(queryMany);
const mockedSetSessionState = vi.mocked(setSessionState);
const mockedGetSessionState = vi.mocked(getSessionState);

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

function createMockQuestions(count: number, section?: Section): Question[] {
  return Array.from({ length: count }, (_, i) =>
    createMockQuestion({
      question_id: `q-${i}`,
      section: section ?? Section.Math,
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Session Service - Practice Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('startPracticeSession', () => {
    describe('Input Validation', () => {
      it('should return error when userId is missing', async () => {
        const result = await startPracticeSession({
          userId: '',
          section: SessionSection.Math,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(true);
        if (isSessionError(result)) {
          expect(result.message).toContain('userId');
        }
      });

      it('should return error when section is invalid', async () => {
        const result = await startPracticeSession({
          userId: 'user-1',
          section: 'invalid' as SessionSection,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(true);
        if (isSessionError(result)) {
          expect(result.message).toContain('Invalid section');
        }
      });

      it('should return error when mode is invalid', async () => {
        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Math,
          mode: 'invalid' as any,
        });

        expect(isSessionError(result)).toBe(true);
        if (isSessionError(result)) {
          expect(result.message).toContain('Invalid mode');
        }
      });

      it('should return error when section mode is used with mixed section', async () => {
        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Mixed,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(true);
        if (isSessionError(result)) {
          expect(result.message).toContain('Section mode requires a specific section');
        }
      });
    });

    describe('Section Mode (Req 3.2)', () => {
      it('should start a session and return the first question for a specific section', async () => {
        const mockQuestions = createMockQuestions(5, Section.Math);
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-1',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.Math,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Math,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(false);
        if (!isSessionError(result)) {
          expect(result.sessionId).toBe('session-1');
          expect(result.firstQuestion).toBeDefined();
          expect(result.firstQuestion.questionId).toBe('q-0');
          expect(result.firstQuestion.section).toBe(Section.Math);
          expect(result.firstQuestion.questionText).toBeDefined();
          expect(result.firstQuestion.options).toHaveLength(4);
        }
      });

      it('should filter questions by the selected section', async () => {
        const mockQuestions = createMockQuestions(3, Section.English);
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-2',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.English,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.English,
          mode: 'section',
        });

        // Verify the query was called with the correct section filter
        expect(mockedQueryMany).toHaveBeenCalledWith(
          expect.stringContaining('WHERE section = $1'),
          [Section.English, 20]
        );

        expect(isSessionError(result)).toBe(false);
      });

      it('should accept all valid sections: English, Math, Reading, Science', async () => {
        const sections = [
          SessionSection.English,
          SessionSection.Math,
          SessionSection.Reading,
          SessionSection.Science,
        ];

        for (const section of sections) {
          vi.clearAllMocks();
          const mockQuestions = createMockQuestions(2, section as unknown as Section);
          mockedQueryMany.mockResolvedValueOnce(mockQuestions);
          mockedInsertOne.mockResolvedValueOnce({
            session_id: `session-${section}`,
            user_id: 'user-1',
            session_type: SessionType.Practice,
            section,
            status: SessionStatus.Active,
            started_at: new Date(),
            completed_at: null,
            time_limit_seconds: null,
            time_remaining_seconds: null,
            expires_at: null,
          });
          mockedSetSessionState.mockResolvedValueOnce(undefined);

          const result = await startPracticeSession({
            userId: 'user-1',
            section,
            mode: 'section',
          });

          expect(isSessionError(result)).toBe(false);
        }
      });
    });

    describe('Mixed Mode (Req 3.3)', () => {
      it('should start a session with randomized questions across all sections', async () => {
        const mixedQuestions = [
          createMockQuestion({ question_id: 'q-eng', section: Section.English }),
          createMockQuestion({ question_id: 'q-math', section: Section.Math }),
          createMockQuestion({ question_id: 'q-read', section: Section.Reading }),
          createMockQuestion({ question_id: 'q-sci', section: Section.Science }),
        ];
        mockedQueryMany.mockResolvedValueOnce(mixedQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-mixed',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.Mixed,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Mixed,
          mode: 'mixed',
        });

        // Verify query was called without section filter
        expect(mockedQueryMany).toHaveBeenCalledWith(
          expect.not.stringContaining('WHERE section'),
          [20]
        );

        expect(isSessionError(result)).toBe(false);
        if (!isSessionError(result)) {
          expect(result.sessionId).toBe('session-mixed');
          expect(result.firstQuestion).toBeDefined();
        }
      });
    });

    describe('Session State Management', () => {
      it('should store session state in Redis for fast retrieval', async () => {
        const mockQuestions = createMockQuestions(3, Section.Math);
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-cache',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.Math,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Math,
          mode: 'section',
        });

        // Verify Redis state was set
        expect(mockedSetSessionState).toHaveBeenCalledWith(
          expect.any(String), // sessionId (UUID)
          expect.objectContaining({
            userId: 'user-1',
            section: SessionSection.Math,
            mode: 'section',
            questionIds: ['q-0', 'q-1', 'q-2'],
            currentIndex: 0,
          }),
          86400 // TTL: 24 hours
        );
      });

      it('should create a session record in the database with correct type and status', async () => {
        const mockQuestions = createMockQuestions(2, Section.Science);
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-db',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.Science,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Science,
          mode: 'section',
        });

        expect(mockedInsertOne).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO sessions'),
          expect.arrayContaining([
            expect.any(String), // sessionId (UUID)
            'user-1',
            SessionType.Practice,
            SessionSection.Science,
            SessionStatus.Active,
          ])
        );
      });

      it('should return error when no questions are available', async () => {
        mockedQueryMany.mockResolvedValueOnce([]);

        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Reading,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(true);
        if (isSessionError(result)) {
          expect(result.message).toContain('No questions available');
        }
      });
    });

    describe('Question Delivery', () => {
      it('should not reveal the correct answer in the first question delivery', async () => {
        const mockQuestions = createMockQuestions(1, Section.Math);
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'session-secure',
          user_id: 'user-1',
          session_type: SessionType.Practice,
          section: SessionSection.Math,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: null,
          time_remaining_seconds: null,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startPracticeSession({
          userId: 'user-1',
          section: SessionSection.Math,
          mode: 'section',
        });

        expect(isSessionError(result)).toBe(false);
        if (!isSessionError(result)) {
          const question = result.firstQuestion;
          // Should NOT have correctAnswer, explanation, or incorrect_reasoning
          expect(question).not.toHaveProperty('correctAnswer');
          expect(question).not.toHaveProperty('correct_answer');
          expect(question).not.toHaveProperty('explanation');
          expect(question).not.toHaveProperty('incorrect_reasoning');
        }
      });
    });
  });

  describe('getNextQuestion', () => {
    it('should return the next question and advance the index', async () => {
      const sessionState: PracticeSessionState = {
        sessionId: 'session-1',
        userId: 'user-1',
        section: SessionSection.Math,
        mode: 'section',
        questionIds: ['q-0', 'q-1', 'q-2'],
        currentIndex: 0,
        startedAt: new Date().toISOString(),
      };

      mockedGetSessionState.mockResolvedValueOnce(sessionState);
      const nextQuestion = createMockQuestion({ question_id: 'q-1', section: Section.Math });
      mockedQueryMany.mockResolvedValueOnce([nextQuestion]);
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await getNextQuestion('session-1');

      expect(isSessionError(result)).toBe(false);
      expect(result).not.toBeNull();
      if (result && !isSessionError(result)) {
        expect(result.questionId).toBe('q-1');
      }

      // Verify session state was updated with new index
      expect(mockedSetSessionState).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ currentIndex: 1 }),
        86400
      );
    });

    it('should return null when no more questions are available', async () => {
      const sessionState: PracticeSessionState = {
        sessionId: 'session-1',
        userId: 'user-1',
        section: SessionSection.Math,
        mode: 'section',
        questionIds: ['q-0', 'q-1'],
        currentIndex: 1, // Already at last question
        startedAt: new Date().toISOString(),
      };

      mockedGetSessionState.mockResolvedValueOnce(sessionState);

      const result = await getNextQuestion('session-1');

      expect(result).toBeNull();
    });

    it('should return error when session is not found in cache', async () => {
      mockedGetSessionState.mockResolvedValueOnce(null);

      const result = await getNextQuestion('nonexistent-session');

      expect(isSessionError(result)).toBe(true);
      if (isSessionError(result)) {
        expect(result.message).toContain('Session not found');
      }
    });

    it('should not reveal correct answer in delivered question', async () => {
      const sessionState: PracticeSessionState = {
        sessionId: 'session-1',
        userId: 'user-1',
        section: SessionSection.Math,
        mode: 'section',
        questionIds: ['q-0', 'q-1'],
        currentIndex: 0,
        startedAt: new Date().toISOString(),
      };

      mockedGetSessionState.mockResolvedValueOnce(sessionState);
      const nextQuestion = createMockQuestion({ question_id: 'q-1' });
      mockedQueryMany.mockResolvedValueOnce([nextQuestion]);
      mockedSetSessionState.mockResolvedValueOnce(undefined);

      const result = await getNextQuestion('session-1');

      expect(result).not.toBeNull();
      if (result && !isSessionError(result)) {
        expect(result).not.toHaveProperty('correctAnswer');
        expect(result).not.toHaveProperty('correct_answer');
        expect(result).not.toHaveProperty('explanation');
      }
    });
  });

  describe('formatQuestionDelivery', () => {
    it('should include only safe fields (no answer or explanation)', () => {
      const question = createMockQuestion();
      const delivery = formatQuestionDelivery(question);

      expect(delivery.questionId).toBe(question.question_id);
      expect(delivery.section).toBe(question.section);
      expect(delivery.questionText).toBe(question.question_text);
      expect(delivery.passage).toBe(question.passage);
      expect(delivery.options).toEqual(question.options);
      expect(delivery.skillTag).toBe(question.skill_tag);
      expect(delivery.difficulty).toBe(question.difficulty);

      // Must NOT include answer-revealing fields
      expect(delivery).not.toHaveProperty('correct_answer');
      expect(delivery).not.toHaveProperty('correctAnswer');
      expect(delivery).not.toHaveProperty('explanation');
      expect(delivery).not.toHaveProperty('incorrect_reasoning');
      expect(delivery).not.toHaveProperty('strategy_tip');
    });
  });

  describe('shuffleArray', () => {
    it('should return an array of the same length', () => {
      const input = [1, 2, 3, 4, 5];
      const result = shuffleArray(input);
      expect(result).toHaveLength(input.length);
    });

    it('should contain the same elements', () => {
      const input = [1, 2, 3, 4, 5];
      const result = shuffleArray(input);
      expect(result.sort()).toEqual(input.sort());
    });

    it('should not mutate the original array', () => {
      const input = [1, 2, 3, 4, 5];
      const original = [...input];
      shuffleArray(input);
      expect(input).toEqual(original);
    });

    it('should handle empty arrays', () => {
      const result = shuffleArray([]);
      expect(result).toEqual([]);
    });

    it('should handle single element arrays', () => {
      const result = shuffleArray([42]);
      expect(result).toEqual([42]);
    });
  });

  describe('isSessionError', () => {
    it('should return true for error objects', () => {
      expect(isSessionError({ message: 'error' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isSessionError(null)).toBe(false);
    });

    it('should return false for valid response with sessionId', () => {
      expect(
        isSessionError({
          sessionId: 'id',
          firstQuestion: {} as any,
        })
      ).toBe(false);
    });

    it('should return false for valid question delivery', () => {
      expect(
        isSessionError({
          questionId: 'q-1',
          section: Section.Math,
          questionText: 'test',
          passage: null,
          options: ['a', 'b', 'c', 'd'],
          skillTag: 'pre_algebra',
          difficulty: 'easy',
        })
      ).toBe(false);
    });
  });
});
