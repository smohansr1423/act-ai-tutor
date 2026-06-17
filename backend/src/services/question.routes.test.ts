/**
 * Unit tests for batch question retrieval endpoint and service method.
 * Validates filtering by section, difficulty, count clamping, and error handling.
 *
 * Requirements: 10.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Section, DifficultyLevel } from '../models/enums';
import {
  QuestionService,
  BatchQuestionRequest,
  SKILL_TAGS,
} from './question.service';

// Mock the database module
vi.mock('../utils/database', () => ({
  insertOne: vi.fn().mockResolvedValue({}),
  queryMany: vi.fn().mockResolvedValue([]),
}));

// ─── Helper: Create mock question rows from database ──────────────────────────

function createMockQuestionRow(section: Section, difficulty: DifficultyLevel, index: number) {
  return {
    question_id: `q-${index}`,
    section,
    question_text: `Question ${index} for ${section}`,
    passage: section === Section.Reading ? 'A sample passage.' : null,
    options: JSON.stringify(['Option A', 'Option B', 'Option C', 'Option D']),
    correct_answer: 'A',
    explanation: `Explanation for question ${index}`,
    incorrect_reasoning: JSON.stringify({ B: 'Wrong B', C: 'Wrong C', D: 'Wrong D' }),
    skill_tag: SKILL_TAGS[section][0],
    difficulty,
    strategy_tip: 'A helpful strategy tip.',
    created_at: new Date().toISOString(),
  };
}

// ─── QuestionService.getQuestionsBatch Tests ──────────────────────────────────

describe('QuestionService.getQuestionsBatch', () => {
  let service: QuestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create the service with a dummy LLM provider (not needed for batch retrieval)
    service = new QuestionService({
      complete: vi.fn().mockResolvedValue({ content: '{}' }),
    });
  });

  it('should return questions filtered by section', async () => {
    const { queryMany } = await import('../utils/database');
    const mockRows = [
      createMockQuestionRow(Section.Math, DifficultyLevel.Medium, 1),
      createMockQuestionRow(Section.Math, DifficultyLevel.Easy, 2),
    ];
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows);

    const request: BatchQuestionRequest = {
      section: Section.Math,
      count: 5,
    };

    const result = await service.getQuestionsBatch(request);

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].section).toBe(Section.Math);
    expect(result.questions[1].section).toBe(Section.Math);
    // Verify query was called without difficulty filter
    expect(queryMany).toHaveBeenCalledWith(
      expect.stringContaining('WHERE section = $1'),
      [Section.Math, 5]
    );
  });

  it('should return questions filtered by section and difficulty', async () => {
    const { queryMany } = await import('../utils/database');
    const mockRows = [
      createMockQuestionRow(Section.English, DifficultyLevel.Hard, 1),
    ];
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows);

    const request: BatchQuestionRequest = {
      section: Section.English,
      count: 3,
      difficultyLevel: DifficultyLevel.Hard,
    };

    const result = await service.getQuestionsBatch(request);

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].difficulty).toBe(DifficultyLevel.Hard);
    // Verify query includes difficulty filter
    expect(queryMany).toHaveBeenCalledWith(
      expect.stringContaining('WHERE section = $1 AND difficulty = $2'),
      [Section.English, DifficultyLevel.Hard, 3]
    );
  });

  it('should clamp count to minimum of 1', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const request: BatchQuestionRequest = {
      section: Section.Science,
      count: -5,
    };

    await service.getQuestionsBatch(request);

    expect(queryMany).toHaveBeenCalledWith(
      expect.any(String),
      [Section.Science, 1]
    );
  });

  it('should clamp count to maximum of 100', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const request: BatchQuestionRequest = {
      section: Section.Reading,
      count: 500,
    };

    await service.getQuestionsBatch(request);

    expect(queryMany).toHaveBeenCalledWith(
      expect.any(String),
      [Section.Reading, 100]
    );
  });

  it('should floor fractional count values', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const request: BatchQuestionRequest = {
      section: Section.Math,
      count: 7.9,
    };

    await service.getQuestionsBatch(request);

    expect(queryMany).toHaveBeenCalledWith(
      expect.any(String),
      [Section.Math, 7]
    );
  });

  it('should return empty array when no questions match', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const request: BatchQuestionRequest = {
      section: Section.Science,
      count: 10,
      difficultyLevel: DifficultyLevel.Hard,
    };

    const result = await service.getQuestionsBatch(request);

    expect(result.questions).toHaveLength(0);
    expect(result.questions).toEqual([]);
  });

  it('should correctly parse JSON options from database rows', async () => {
    const { queryMany } = await import('../utils/database');
    const mockRows = [createMockQuestionRow(Section.Math, DifficultyLevel.Easy, 1)];
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockRows);

    const request: BatchQuestionRequest = {
      section: Section.Math,
      count: 1,
    };

    const result = await service.getQuestionsBatch(request);

    expect(result.questions[0].options).toEqual(['Option A', 'Option B', 'Option C', 'Option D']);
    expect(result.questions[0].incorrect_reasoning).toEqual({ B: 'Wrong B', C: 'Wrong C', D: 'Wrong D' });
  });

  it('should handle pre-parsed options arrays from database', async () => {
    const { queryMany } = await import('../utils/database');
    const row = {
      ...createMockQuestionRow(Section.Math, DifficultyLevel.Easy, 1),
      options: ['Option A', 'Option B', 'Option C', 'Option D'], // Already parsed
      incorrect_reasoning: { B: 'Wrong B', C: 'Wrong C', D: 'Wrong D' }, // Already parsed
    };
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([row]);

    const request: BatchQuestionRequest = {
      section: Section.Math,
      count: 1,
    };

    const result = await service.getQuestionsBatch(request);

    expect(result.questions[0].options).toEqual(['Option A', 'Option B', 'Option C', 'Option D']);
    expect(result.questions[0].incorrect_reasoning).toEqual({ B: 'Wrong B', C: 'Wrong C', D: 'Wrong D' });
  });

  it('should map all question fields correctly', async () => {
    const { queryMany } = await import('../utils/database');
    const mockRow = createMockQuestionRow(Section.Reading, DifficultyLevel.Medium, 42);
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([mockRow]);

    const request: BatchQuestionRequest = {
      section: Section.Reading,
      count: 1,
    };

    const result = await service.getQuestionsBatch(request);
    const q = result.questions[0];

    expect(q.question_id).toBe('q-42');
    expect(q.section).toBe(Section.Reading);
    expect(q.question_text).toBe('Question 42 for reading');
    expect(q.passage).toBe('A sample passage.');
    expect(q.correct_answer).toBe('A');
    expect(q.explanation).toBe('Explanation for question 42');
    expect(q.skill_tag).toBe(SKILL_TAGS[Section.Reading][0]);
    expect(q.difficulty).toBe(DifficultyLevel.Medium);
    expect(q.strategy_tip).toBe('A helpful strategy tip.');
    expect(q.created_at).toBeInstanceOf(Date);
  });

  it('should use ORDER BY RANDOM() for randomized results', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await service.getQuestionsBatch({
      section: Section.Math,
      count: 10,
    });

    expect(queryMany).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY RANDOM()'),
      expect.any(Array)
    );
  });

  it('should use LIMIT to cap results to requested count', async () => {
    const { queryMany } = await import('../utils/database');
    (queryMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await service.getQuestionsBatch({
      section: Section.Math,
      count: 15,
    });

    expect(queryMany).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT'),
      expect.arrayContaining([15])
    );
  });
});

// ─── Route Handler Validation Tests ───────────────────────────────────────────

describe('Question batch route validation', () => {
  // These test the validation logic that lives in the route handler.
  // We import and test the route using supertest-like approach with express.

  // For unit testing the route handler validation logic in isolation,
  // we can test the validation conditions directly.

  it('should recognize valid sections', () => {
    const validSections = Object.values(Section) as string[];
    expect(validSections).toContain('english');
    expect(validSections).toContain('math');
    expect(validSections).toContain('reading');
    expect(validSections).toContain('science');
    expect(validSections).not.toContain('history');
  });

  it('should recognize valid difficulty levels', () => {
    const validDifficulties = Object.values(DifficultyLevel) as string[];
    expect(validDifficulties).toContain('easy');
    expect(validDifficulties).toContain('medium');
    expect(validDifficulties).toContain('hard');
    expect(validDifficulties).not.toContain('super_hard');
  });
});
