/**
 * Unit tests for Pacing Drill Service
 * Tests Requirements 5.7
 * Property 16: Pacing Drill Time Progression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryMany: vi.fn(),
}));

import {
  generatePacingDrill,
  generateTimeLimits,
  determineDrillSize,
  formatDrillQuestion,
  isPacingDrillError,
  BASE_TIME_SECONDS,
  TIME_DECREMENT_SECONDS,
  MIN_DRILL_SIZE,
  MAX_DRILL_SIZE,
  DEFAULT_DRILL_SIZE,
  PacingDrillRequest,
} from './pacing-drill.service';
import { queryMany } from '../utils/database';
import { Section, DifficultyLevel } from '../models/enums';
import { Question } from '../models/interfaces';

const mockedQueryMany = vi.mocked(queryMany);

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
    difficulty: DifficultyLevel.Medium,
    strategy_tip: 'Add the numbers',
    created_at: new Date(),
    ...overrides,
  };
}

function createMockQuestions(count: number, skillTag = 'pre_algebra'): Question[] {
  return Array.from({ length: count }, (_, i) =>
    createMockQuestion({
      question_id: `q-${i}`,
      skill_tag: skillTag,
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Pacing Drill Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateTimeLimits', () => {
    it('should generate correct time limits for 5 questions', () => {
      const limits = generateTimeLimits(5);
      expect(limits).toEqual([120, 110, 100, 90, 80]);
    });

    it('should generate correct time limits for 8 questions (default)', () => {
      const limits = generateTimeLimits(8);
      expect(limits).toEqual([120, 110, 100, 90, 80, 70, 60, 50]);
    });

    it('should generate correct time limits for 10 questions', () => {
      const limits = generateTimeLimits(10);
      expect(limits).toEqual([120, 110, 100, 90, 80, 70, 60, 50, 40, 30]);
    });

    it('should produce a strictly decreasing sequence', () => {
      for (let size = MIN_DRILL_SIZE; size <= MAX_DRILL_SIZE; size++) {
        const limits = generateTimeLimits(size);
        for (let i = 1; i < limits.length; i++) {
          expect(limits[i]).toBeLessThan(limits[i - 1]);
        }
      }
    });

    it('should always start at 120 seconds', () => {
      for (let size = MIN_DRILL_SIZE; size <= MAX_DRILL_SIZE; size++) {
        const limits = generateTimeLimits(size);
        expect(limits[0]).toBe(BASE_TIME_SECONDS);
      }
    });

    it('should decrease by exactly 10 seconds per question', () => {
      const limits = generateTimeLimits(10);
      for (let i = 1; i < limits.length; i++) {
        expect(limits[i - 1] - limits[i]).toBe(TIME_DECREMENT_SECONDS);
      }
    });

    it('should clamp drill size below minimum to MIN_DRILL_SIZE', () => {
      const limits = generateTimeLimits(3);
      expect(limits).toHaveLength(MIN_DRILL_SIZE);
    });

    it('should clamp drill size above maximum to MAX_DRILL_SIZE', () => {
      const limits = generateTimeLimits(15);
      expect(limits).toHaveLength(MAX_DRILL_SIZE);
    });

    it('should return correct length for all valid sizes', () => {
      for (let size = MIN_DRILL_SIZE; size <= MAX_DRILL_SIZE; size++) {
        const limits = generateTimeLimits(size);
        expect(limits).toHaveLength(size);
      }
    });

    it('should have all positive time limits', () => {
      const limits = generateTimeLimits(MAX_DRILL_SIZE);
      for (const limit of limits) {
        expect(limit).toBeGreaterThan(0);
      }
    });

    it('should follow formula: 120 - (i × 10) for each index', () => {
      for (let size = MIN_DRILL_SIZE; size <= MAX_DRILL_SIZE; size++) {
        const limits = generateTimeLimits(size);
        for (let i = 0; i < limits.length; i++) {
          expect(limits[i]).toBe(120 - i * 10);
        }
      }
    });
  });

  describe('determineDrillSize', () => {
    it('should return DEFAULT_DRILL_SIZE when no severity provided', () => {
      expect(determineDrillSize()).toBe(DEFAULT_DRILL_SIZE);
    });

    it('should return DEFAULT_DRILL_SIZE when severity is undefined', () => {
      expect(determineDrillSize(undefined)).toBe(DEFAULT_DRILL_SIZE);
    });

    it('should return MIN_DRILL_SIZE for severity 0', () => {
      expect(determineDrillSize(0)).toBe(MIN_DRILL_SIZE);
    });

    it('should return MAX_DRILL_SIZE for severity 1', () => {
      expect(determineDrillSize(1)).toBe(MAX_DRILL_SIZE);
    });

    it('should return a value between MIN and MAX for severity 0.5', () => {
      const size = determineDrillSize(0.5);
      expect(size).toBeGreaterThanOrEqual(MIN_DRILL_SIZE);
      expect(size).toBeLessThanOrEqual(MAX_DRILL_SIZE);
    });

    it('should never return below MIN_DRILL_SIZE', () => {
      expect(determineDrillSize(-0.5)).toBe(MIN_DRILL_SIZE);
    });

    it('should never return above MAX_DRILL_SIZE', () => {
      expect(determineDrillSize(1.5)).toBe(MAX_DRILL_SIZE);
    });
  });

  describe('formatDrillQuestion', () => {
    it('should include safe fields for delivery', () => {
      const question = createMockQuestion({ question_id: 'q-test' });
      const formatted = formatDrillQuestion(question);

      expect(formatted.questionId).toBe('q-test');
      expect(formatted.questionText).toBe(question.question_text);
      expect(formatted.passage).toBe(question.passage);
      expect(formatted.options).toEqual(question.options);
      expect(formatted.skillTag).toBe(question.skill_tag);
      expect(formatted.difficulty).toBe(question.difficulty);
    });

    it('should NOT include answer-revealing fields', () => {
      const question = createMockQuestion();
      const formatted = formatDrillQuestion(question);

      expect(formatted).not.toHaveProperty('correct_answer');
      expect(formatted).not.toHaveProperty('correctAnswer');
      expect(formatted).not.toHaveProperty('explanation');
      expect(formatted).not.toHaveProperty('incorrect_reasoning');
      expect(formatted).not.toHaveProperty('strategy_tip');
    });
  });

  describe('isPacingDrillError', () => {
    it('should return true for error objects', () => {
      expect(isPacingDrillError({ error: 'something went wrong' })).toBe(true);
    });

    it('should return false for valid drill results', () => {
      expect(
        isPacingDrillError({ questions: [], timeLimits: [] })
      ).toBe(false);
    });
  });

  describe('generatePacingDrill', () => {
    describe('Input Validation', () => {
      it('should return error when userId is empty', async () => {
        const result = await generatePacingDrill({ userId: '', skillTag: 'pre_algebra' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('userId is required');
        }
      });

      it('should return error when skillTag is empty', async () => {
        const result = await generatePacingDrill({ userId: 'user-1', skillTag: '' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('skillTag is required');
        }
      });

      it('should return error when userId is whitespace only', async () => {
        const result = await generatePacingDrill({ userId: '   ', skillTag: 'pre_algebra' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('userId is required');
        }
      });

      it('should return error when skillTag is whitespace only', async () => {
        const result = await generatePacingDrill({ userId: 'user-1', skillTag: '   ' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('skillTag is required');
        }
      });
    });

    describe('Question Retrieval', () => {
      it('should return error when no questions are available', async () => {
        mockedQueryMany.mockResolvedValueOnce([]);

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'unknown_skill' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('No questions available');
        }
      });

      it('should return error when fewer than MIN_DRILL_SIZE questions are found', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(3));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' });
        expect(isPacingDrillError(result)).toBe(true);
        if (isPacingDrillError(result)) {
          expect(result.error).toContain('Insufficient questions');
        }
      });

      it('should query questions filtered by skillTag', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(8, 'trigonometry'));

        await generatePacingDrill({ userId: 'user-1', skillTag: 'trigonometry' });

        expect(mockedQueryMany).toHaveBeenCalledWith(
          expect.stringContaining('WHERE skill_tag = $1'),
          ['trigonometry', DEFAULT_DRILL_SIZE]
        );
      });
    });

    describe('Successful Drill Generation', () => {
      it('should return questions and time limits for default size (8)', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(8));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' });

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          expect(result.questions).toHaveLength(8);
          expect(result.timeLimits).toHaveLength(8);
          expect(result.timeLimits).toEqual([120, 110, 100, 90, 80, 70, 60, 50]);
        }
      });

      it('should return questions and time limits for severity-based size', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(10));

        const result = await generatePacingDrill(
          { userId: 'user-1', skillTag: 'pre_algebra' },
          1.0 // max severity → 10 questions
        );

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          expect(result.questions).toHaveLength(10);
          expect(result.timeLimits).toHaveLength(10);
          expect(result.timeLimits[0]).toBe(120);
          expect(result.timeLimits[9]).toBe(30);
        }
      });

      it('should format questions without revealing answers', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(5));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' }, 0);

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          for (const q of result.questions) {
            expect(q).toHaveProperty('questionId');
            expect(q).toHaveProperty('questionText');
            expect(q).toHaveProperty('options');
            expect(q).not.toHaveProperty('correct_answer');
            expect(q).not.toHaveProperty('explanation');
            expect(q).not.toHaveProperty('incorrect_reasoning');
          }
        }
      });

      it('should have matching number of questions and time limits', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(6));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' }, 0.2);

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          expect(result.questions.length).toBe(result.timeLimits.length);
        }
      });

      it('should produce strictly decreasing time limits', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(8));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' });

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          for (let i = 1; i < result.timeLimits.length; i++) {
            expect(result.timeLimits[i]).toBeLessThan(result.timeLimits[i - 1]);
          }
        }
      });

      it('should work with exactly MIN_DRILL_SIZE questions available', async () => {
        mockedQueryMany.mockResolvedValueOnce(createMockQuestions(5));

        const result = await generatePacingDrill({ userId: 'user-1', skillTag: 'pre_algebra' }, 0);

        expect(isPacingDrillError(result)).toBe(false);
        if (!isPacingDrillError(result)) {
          expect(result.questions).toHaveLength(5);
          expect(result.timeLimits).toEqual([120, 110, 100, 90, 80]);
        }
      });
    });
  });
});
