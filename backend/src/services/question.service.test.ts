/**
 * Unit tests for Question Generation Service
 * Tests prompt building, validation, LLM integration, error handling,
 * and database storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Section, DifficultyLevel } from '../models/enums';
import {
  QuestionService,
  validateLLMOutput,
  buildPrompt,
  SKILL_TAGS,
  RawLLMQuestionOutput,
  GenerateQuestionResponse,
  GenerateQuestionError,
} from './question.service';
import {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMTimeoutError,
  LLMProviderError,
} from './llm.provider';

// Mock the database module
vi.mock('../utils/database', () => ({
  insertOne: vi.fn().mockResolvedValue({}),
}));

// ─── Helper: Create a valid question output ───────────────────────────────────

function createValidOutput(section: Section, overrides?: Partial<RawLLMQuestionOutput>): RawLLMQuestionOutput {
  return {
    question_text: 'What is the value of x in the equation 2x + 4 = 10?',
    passage: null,
    options: ['x = 2', 'x = 3', 'x = 4', 'x = 5'],
    correct_answer: 'B',
    explanation: 'Subtract 4 from both sides: 2x = 6. Divide by 2: x = 3.',
    incorrect_reasoning: {
      A: 'Incorrectly subtracted 2 instead of 4.',
      C: 'Forgot to divide by 2 after subtracting.',
      D: 'Added 4 instead of subtracting.',
    },
    skill_tag: SKILL_TAGS[section][0],
    difficulty: DifficultyLevel.Medium,
    strategy_tip: 'Isolate the variable by performing inverse operations step by step.',
    ...overrides,
  };
}

// ─── Helper: Mock LLM Provider ────────────────────────────────────────────────

function createMockProvider(response?: string | Error): ILLMProvider {
  return {
    complete: vi.fn().mockImplementation(async (_request: LLMCompletionRequest): Promise<LLMCompletionResponse> => {
      if (response instanceof Error) {
        throw response;
      }
      return { content: response || '' };
    }),
  };
}

// ─── Validation Tests ─────────────────────────────────────────────────────────

describe('validateLLMOutput', () => {
  it('should accept a valid math question output', () => {
    const output = createValidOutput(Section.Math);
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toHaveLength(0);
  });

  it('should accept a valid english question output', () => {
    const output = createValidOutput(Section.English, {
      question_text: 'Which of the following alternatives to the bracketed portion would be most acceptable?',
      passage: 'The cat [sat on] the mat quietly. It was a peaceful afternoon.',
      skill_tag: 'punctuation',
      options: ['sat on', 'sat upon', 'was sitting on', 'had sat on'],
    });
    const errors = validateLLMOutput(output, Section.English);
    expect(errors).toHaveLength(0);
  });

  it('should accept a valid reading question output', () => {
    const passage = 'A'.repeat(200); // Simulating a 200+ char passage
    const output = createValidOutput(Section.Reading, {
      passage,
      skill_tag: 'main_idea',
    });
    const errors = validateLLMOutput(output, Section.Reading);
    expect(errors).toHaveLength(0);
  });

  it('should accept a valid science question output', () => {
    const output = createValidOutput(Section.Science, {
      passage: 'Table 1 shows the temperature readings at different altitudes...',
      question_text: 'Based on Table 1, what is the relationship between altitude and temperature?',
      skill_tag: 'data_representation',
    });
    const errors = validateLLMOutput(output, Section.Science);
    expect(errors).toHaveLength(0);
  });

  it('should reject null output', () => {
    const errors = validateLLMOutput(null, Section.Math);
    expect(errors).toContain('Output is not a valid object');
  });

  it('should reject non-object output', () => {
    const errors = validateLLMOutput('string', Section.Math);
    expect(errors).toContain('Output is not a valid object');
  });

  it('should reject empty question_text', () => {
    const output = createValidOutput(Section.Math, { question_text: '' });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('question_text must be a non-empty string');
  });

  it('should reject options that are not an array', () => {
    const output = { ...createValidOutput(Section.Math), options: 'not an array' };
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('options must be an array');
  });

  it('should reject options with wrong count', () => {
    const output = createValidOutput(Section.Math, { options: ['a', 'b', 'c'] });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('options must contain exactly 4 choices');
  });

  it('should reject options with empty strings', () => {
    const output = createValidOutput(Section.Math, { options: ['a', '', 'c', 'd'] });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('options[1] must be a non-empty string');
  });

  it('should reject invalid correct_answer', () => {
    const output = createValidOutput(Section.Math, { correct_answer: 'E' });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('correct_answer must be one of A, B, C, D');
  });

  it('should reject empty explanation', () => {
    const output = createValidOutput(Section.Math, { explanation: '' });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('explanation must be a non-empty string');
  });

  it('should reject missing incorrect_reasoning for wrong options', () => {
    const output = createValidOutput(Section.Math, {
      correct_answer: 'A',
      incorrect_reasoning: { B: 'wrong' }, // missing C and D
    });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors.some(e => e.includes('incorrect_reasoning must have a non-empty explanation for option C'))).toBe(true);
    expect(errors.some(e => e.includes('incorrect_reasoning must have a non-empty explanation for option D'))).toBe(true);
  });

  it('should reject skill_tag not in the section set', () => {
    const output = createValidOutput(Section.Math, { skill_tag: 'punctuation' }); // English tag in Math section
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors.some(e => e.includes('skill_tag "punctuation" is not valid for section "math"'))).toBe(true);
  });

  it('should reject invalid difficulty', () => {
    const output = createValidOutput(Section.Math, { difficulty: 'super_hard' });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors.some(e => e.includes('difficulty must be one of'))).toBe(true);
  });

  it('should reject empty strategy_tip', () => {
    const output = createValidOutput(Section.Math, { strategy_tip: '' });
    const errors = validateLLMOutput(output, Section.Math);
    expect(errors).toContain('strategy_tip must be a non-empty string');
  });
});

// ─── Prompt Building Tests ────────────────────────────────────────────────────

describe('buildPrompt', () => {
  it('should include section name in prompt', () => {
    const prompt = buildPrompt(Section.English, DifficultyLevel.Easy);
    expect(prompt).toContain('english');
    expect(prompt).toContain('Easy');
  });

  it('should include English-specific instructions', () => {
    const prompt = buildPrompt(Section.English, DifficultyLevel.Medium);
    expect(prompt).toContain('2-4 sentences');
    expect(prompt).toContain('underlined portion');
    expect(prompt).toContain('grammatical or stylistic alternatives');
  });

  it('should include Math-specific instructions', () => {
    const prompt = buildPrompt(Section.Math, DifficultyLevel.Hard);
    expect(prompt).toContain('math problem statement');
    expect(prompt).toContain('numerical or expression-based');
  });

  it('should include Reading-specific instructions', () => {
    const prompt = buildPrompt(Section.Reading, DifficultyLevel.Medium);
    expect(prompt).toContain('200-400 words');
    expect(prompt).toContain('reading comprehension');
  });

  it('should include Science-specific instructions', () => {
    const prompt = buildPrompt(Section.Science, DifficultyLevel.Easy);
    expect(prompt).toContain('data representation');
    expect(prompt).toContain('interpretation');
  });

  it('should include requested skill_tag when valid', () => {
    const prompt = buildPrompt(Section.Math, DifficultyLevel.Medium, 'trigonometry');
    expect(prompt).toContain('trigonometry');
  });

  it('should list all valid skill tags when no specific tag is requested', () => {
    const prompt = buildPrompt(Section.Math, DifficultyLevel.Medium);
    expect(prompt).toContain('pre_algebra');
    expect(prompt).toContain('trigonometry');
  });

  it('should list valid skill tags when an invalid tag is provided', () => {
    const prompt = buildPrompt(Section.Math, DifficultyLevel.Medium, 'invalid_tag');
    expect(prompt).toContain('pre_algebra');
  });

  it('should instruct JSON-only response', () => {
    const prompt = buildPrompt(Section.Math, DifficultyLevel.Easy);
    expect(prompt).toContain('valid JSON');
  });

  it('should include originality instruction', () => {
    const prompt = buildPrompt(Section.English, DifficultyLevel.Medium);
    expect(prompt).toContain('original content');
    expect(prompt).toContain('NOT reproduce');
  });
});

// ─── QuestionService Integration Tests (with mocked LLM) ─────────────────────

describe('QuestionService', () => {
  let service: QuestionService;
  let mockProvider: ILLMProvider;

  describe('generateQuestion - success', () => {
    beforeEach(() => {
      const validOutput = createValidOutput(Section.Math, {
        skill_tag: 'pre_algebra',
      });
      mockProvider = createMockProvider(JSON.stringify(validOutput));
      service = new QuestionService(mockProvider);
    });

    it('should generate and return a valid question', async () => {
      const result = await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(result.success).toBe(true);
      const response = result as GenerateQuestionResponse;
      expect(response.question.question_id).toBeDefined();
      expect(response.question.section).toBe(Section.Math);
      expect(response.question.options).toHaveLength(4);
      expect(response.question.correct_answer).toBe('B');
      expect(response.question.skill_tag).toBe('pre_algebra');
      expect(response.question.difficulty).toBe(DifficultyLevel.Medium);
    });

    it('should call LLM with 8-second timeout', async () => {
      await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 8000 })
      );
    });

    it('should store question in database', async () => {
      const { insertOne } = await import('../utils/database');
      await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(insertOne).toHaveBeenCalled();
    });
  });

  describe('generateQuestion - timeout error', () => {
    beforeEach(() => {
      mockProvider = createMockProvider(new LLMTimeoutError(8000));
      service = new QuestionService(mockProvider);
    });

    it('should return timeout error with retry and change-section options', async () => {
      const result = await service.generateQuestion({
        section: Section.Reading,
        difficultyLevel: DifficultyLevel.Hard,
      });

      expect(result.success).toBe(false);
      const error = result as GenerateQuestionError;
      expect(error.errorType).toBe('timeout');
      expect(error.canRetry).toBe(true);
      expect(error.suggestChangeSection).toBe(true);
      expect(error.error).toContain('timed out');
    });
  });

  describe('generateQuestion - provider error', () => {
    beforeEach(() => {
      mockProvider = createMockProvider(new LLMProviderError('Service unavailable', 503));
      service = new QuestionService(mockProvider);
    });

    it('should return provider error with retry option', async () => {
      const result = await service.generateQuestion({
        section: Section.Science,
        difficultyLevel: DifficultyLevel.Easy,
      });

      expect(result.success).toBe(false);
      const error = result as GenerateQuestionError;
      expect(error.errorType).toBe('provider');
      expect(error.canRetry).toBe(true);
      expect(error.suggestChangeSection).toBe(true);
    });
  });

  describe('generateQuestion - invalid JSON response', () => {
    beforeEach(() => {
      mockProvider = createMockProvider('This is not valid JSON at all');
      service = new QuestionService(mockProvider);
    });

    it('should return validation error for unparseable output', async () => {
      const result = await service.generateQuestion({
        section: Section.English,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(result.success).toBe(false);
      const error = result as GenerateQuestionError;
      expect(error.errorType).toBe('validation');
      expect(error.canRetry).toBe(true);
      expect(error.suggestChangeSection).toBe(false);
    });
  });

  describe('generateQuestion - invalid structure from LLM', () => {
    beforeEach(() => {
      const invalidOutput = {
        question_text: 'What is 2+2?',
        options: ['3', '4'], // only 2 options - invalid
        correct_answer: 'B',
        explanation: 'Basic addition.',
        incorrect_reasoning: { A: 'Wrong.' },
        skill_tag: 'pre_algebra',
        difficulty: 'medium',
        strategy_tip: 'Count carefully.',
      };
      mockProvider = createMockProvider(JSON.stringify(invalidOutput));
      service = new QuestionService(mockProvider);
    });

    it('should return validation error for structurally invalid output', async () => {
      const result = await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(result.success).toBe(false);
      const error = result as GenerateQuestionError;
      expect(error.errorType).toBe('validation');
      expect(error.error).toContain('options must contain exactly 4 choices');
    });
  });

  describe('generateQuestion - handles markdown code fences', () => {
    beforeEach(() => {
      const validOutput = createValidOutput(Section.Math, { skill_tag: 'pre_algebra' });
      const wrappedResponse = '```json\n' + JSON.stringify(validOutput) + '\n```';
      mockProvider = createMockProvider(wrappedResponse);
      service = new QuestionService(mockProvider);
    });

    it('should strip markdown code fences and parse successfully', async () => {
      const result = await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Medium,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('generateQuestion - with specific skill tag', () => {
    beforeEach(() => {
      const validOutput = createValidOutput(Section.Math, { skill_tag: 'trigonometry' });
      mockProvider = createMockProvider(JSON.stringify(validOutput));
      service = new QuestionService(mockProvider);
    });

    it('should pass skill tag to prompt', async () => {
      await service.generateQuestion({
        section: Section.Math,
        difficultyLevel: DifficultyLevel.Hard,
        skillTag: 'trigonometry',
      });

      const callArgs = (mockProvider.complete as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.prompt).toContain('trigonometry');
    });
  });
});

// ─── Skill Tags Tests ─────────────────────────────────────────────────────────

describe('SKILL_TAGS', () => {
  it('should have tags for all four sections', () => {
    expect(SKILL_TAGS[Section.English]).toBeDefined();
    expect(SKILL_TAGS[Section.Math]).toBeDefined();
    expect(SKILL_TAGS[Section.Reading]).toBeDefined();
    expect(SKILL_TAGS[Section.Science]).toBeDefined();
  });

  it('should have at least 5 tags per section', () => {
    for (const section of Object.values(Section)) {
      expect(SKILL_TAGS[section].length).toBeGreaterThanOrEqual(5);
    }
  });

  it('should have no duplicate tags within a section', () => {
    for (const section of Object.values(Section)) {
      const tags = SKILL_TAGS[section];
      const uniqueTags = new Set(tags);
      expect(uniqueTags.size).toBe(tags.length);
    }
  });

  it('should have no overlapping tags between sections', () => {
    const allSections = Object.values(Section);
    for (let i = 0; i < allSections.length; i++) {
      for (let j = i + 1; j < allSections.length; j++) {
        const tagsA = SKILL_TAGS[allSections[i]];
        const tagsB = SKILL_TAGS[allSections[j]];
        const overlap = tagsA.filter(t => tagsB.includes(t));
        expect(overlap).toHaveLength(0);
      }
    }
  });
});
