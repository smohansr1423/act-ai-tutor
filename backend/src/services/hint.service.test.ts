/**
 * Unit tests for Hint Service
 * Tests hint generation, LLM integration, timeout fallback, and error handling.
 *
 * Requirements: 3.5, 3.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Section, DifficultyLevel } from '../models/enums';
import {
  HintService,
  HintRequest,
  HintResponse,
  HintError,
  HINT_TIMEOUT_MS,
  STATIC_HINTS,
  buildHintPrompt,
} from './hint.service';
import {
  ILLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMTimeoutError,
  LLMProviderError,
} from './llm.provider';
import { Question } from '../models/interfaces';

// ─── Mock database module ─────────────────────────────────────────────────────

const mockQueryOne = vi.fn();
vi.mock('../utils/database', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockQuestion(overrides?: Partial<Question>): Question {
  return {
    question_id: 'q-123',
    section: Section.Math,
    question_text: 'What is the value of x in 3x + 6 = 15?',
    passage: null,
    options: ['x = 2', 'x = 3', 'x = 4', 'x = 5'],
    correct_answer: 'B',
    explanation: 'Subtract 6 from both sides: 3x = 9. Divide by 3: x = 3.',
    incorrect_reasoning: {
      A: 'Incorrectly divided 6 by 3 instead of 15-6.',
      C: 'Forgot to subtract 6 first.',
      D: 'Added 6 instead of subtracting.',
    },
    skill_tag: 'pre_algebra',
    difficulty: DifficultyLevel.Medium,
    strategy_tip: 'Isolate the variable step by step.',
    created_at: new Date(),
    ...overrides,
  };
}

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

function createDbRow(question: Question) {
  return {
    ...question,
    options: JSON.stringify(question.options),
    incorrect_reasoning: JSON.stringify(question.incorrect_reasoning),
  };
}

// ─── buildHintPrompt Tests ────────────────────────────────────────────────────

describe('buildHintPrompt', () => {
  it('should include the question text', () => {
    const question = createMockQuestion();
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain(question.question_text);
  });

  it('should include the options', () => {
    const question = createMockQuestion();
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('A. x = 2');
    expect(prompt).toContain('B. x = 3');
    expect(prompt).toContain('C. x = 4');
    expect(prompt).toContain('D. x = 5');
  });

  it('should include the skill tag', () => {
    const question = createMockQuestion({ skill_tag: 'trigonometry' });
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('trigonometry');
  });

  it('should include the difficulty level', () => {
    const question = createMockQuestion({ difficulty: DifficultyLevel.Hard });
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('hard');
  });

  it('should include passage when present', () => {
    const question = createMockQuestion({ passage: 'A long passage about science experiments.' });
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('A long passage about science experiments.');
    expect(prompt).toContain('PASSAGE:');
  });

  it('should not include passage section when passage is null', () => {
    const question = createMockQuestion({ passage: null });
    const prompt = buildHintPrompt(question);
    expect(prompt).not.toContain('PASSAGE:');
  });

  it('should instruct not to reveal the correct answer', () => {
    const question = createMockQuestion({ correct_answer: 'C' });
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('Do NOT state the correct answer letter (C)');
  });

  it('should request plain text response', () => {
    const question = createMockQuestion();
    const prompt = buildHintPrompt(question);
    expect(prompt).toContain('plain text');
  });
});

// ─── HintService Tests ────────────────────────────────────────────────────────

describe('HintService', () => {
  let service: HintService;
  let mockProvider: ILLMProvider;
  const mockQuestion = createMockQuestion();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHint - success', () => {
    const hintText = 'Think about what operation undoes addition. Try working backwards from the equation.';

    beforeEach(() => {
      mockQueryOne.mockResolvedValue(createDbRow(mockQuestion));
      mockProvider = createMockProvider(hintText);
      service = new HintService(mockProvider);
    });

    it('should return a hint from the LLM', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(hintText);
    });

    it('should call LLM with 5-second timeout', async () => {
      await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: HINT_TIMEOUT_MS })
      );
    });

    it('should call LLM with max 200 tokens', async () => {
      await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect(mockProvider.complete).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 200 })
      );
    });

    it('should look up the question by ID from the database', async () => {
      await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect(mockQueryOne).toHaveBeenCalledWith(
        'SELECT * FROM questions WHERE question_id = $1',
        ['q-123']
      );
    });
  });

  describe('getHint - question not found', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue(null);
      mockProvider = createMockProvider('Some hint');
      service = new HintService(mockProvider);
    });

    it('should return not_found error when question does not exist', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'nonexistent' });

      expect('error' in result).toBe(true);
      const error = result as HintError;
      expect(error.errorType).toBe('not_found');
      expect(error.error).toContain('nonexistent');
    });

    it('should not call the LLM when question is not found', async () => {
      await service.getHint({ sessionId: 's-1', questionId: 'nonexistent' });

      expect(mockProvider.complete).not.toHaveBeenCalled();
    });
  });

  describe('getHint - LLM timeout with static fallback', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue(createDbRow(mockQuestion));
      mockProvider = createMockProvider(new LLMTimeoutError(HINT_TIMEOUT_MS));
      service = new HintService(mockProvider);
    });

    it('should return a static hint when LLM times out', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      const response = result as HintResponse;
      expect(response.hint).toBe(STATIC_HINTS['pre_algebra']);
    });

    it('should use the correct static hint for the skill tag', async () => {
      const scienceQuestion = createMockQuestion({
        section: Section.Science,
        skill_tag: 'data_representation',
      });
      mockQueryOne.mockResolvedValue(createDbRow(scienceQuestion));

      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(STATIC_HINTS['data_representation']);
    });

    it('should use default fallback when skill tag has no static hint', async () => {
      const unknownTagQuestion = createMockQuestion({ skill_tag: 'unknown_tag' });
      mockQueryOne.mockResolvedValue(createDbRow(unknownTagQuestion));

      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toContain('re-read the question carefully');
    });
  });

  describe('getHint - LLM provider error', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue(createDbRow(mockQuestion));
      mockProvider = createMockProvider(new LLMProviderError('Service unavailable', 503));
      service = new HintService(mockProvider);
    });

    it('should return provider error when LLM fails with non-timeout error', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('error' in result).toBe(true);
      const error = result as HintError;
      expect(error.errorType).toBe('provider');
      expect(error.error).toContain('Service unavailable');
    });
  });

  describe('getHint - empty LLM response', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue(createDbRow(mockQuestion));
      mockProvider = createMockProvider('');
      service = new HintService(mockProvider);
    });

    it('should return static hint when LLM returns empty content', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(STATIC_HINTS['pre_algebra']);
    });
  });

  describe('getHint - whitespace-only LLM response', () => {
    beforeEach(() => {
      mockQueryOne.mockResolvedValue(createDbRow(mockQuestion));
      mockProvider = createMockProvider('   \n  ');
      service = new HintService(mockProvider);
    });

    it('should return static hint when LLM returns only whitespace', async () => {
      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(STATIC_HINTS['pre_algebra']);
    });
  });

  describe('getHint - various sections', () => {
    beforeEach(() => {
      mockProvider = createMockProvider(new LLMTimeoutError(HINT_TIMEOUT_MS));
      service = new HintService(mockProvider);
    });

    it('should provide English static hint for English questions on timeout', async () => {
      const question = createMockQuestion({
        section: Section.English,
        skill_tag: 'punctuation',
      });
      mockQueryOne.mockResolvedValue(createDbRow(question));

      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(STATIC_HINTS['punctuation']);
    });

    it('should provide Reading static hint for Reading questions on timeout', async () => {
      const question = createMockQuestion({
        section: Section.Reading,
        skill_tag: 'inference',
      });
      mockQueryOne.mockResolvedValue(createDbRow(question));

      const result = await service.getHint({ sessionId: 's-1', questionId: 'q-123' });

      expect('hint' in result).toBe(true);
      expect((result as HintResponse).hint).toBe(STATIC_HINTS['inference']);
    });
  });
});

// ─── STATIC_HINTS Coverage ────────────────────────────────────────────────────

describe('STATIC_HINTS', () => {
  it('should have hints for all English skill tags', () => {
    const englishTags = ['punctuation', 'grammar_usage', 'sentence_structure', 'style', 'organization', 'word_choice', 'verb_tense', 'pronoun_agreement', 'modifier_placement', 'parallelism'];
    for (const tag of englishTags) {
      expect(STATIC_HINTS[tag]).toBeDefined();
      expect(STATIC_HINTS[tag].length).toBeGreaterThan(0);
    }
  });

  it('should have hints for all Math skill tags', () => {
    const mathTags = ['pre_algebra', 'elementary_algebra', 'intermediate_algebra', 'coordinate_geometry', 'plane_geometry', 'trigonometry', 'number_properties', 'ratios_proportions', 'functions', 'statistics_probability'];
    for (const tag of mathTags) {
      expect(STATIC_HINTS[tag]).toBeDefined();
      expect(STATIC_HINTS[tag].length).toBeGreaterThan(0);
    }
  });

  it('should have hints for all Reading skill tags', () => {
    const readingTags = ['main_idea', 'detail_identification', 'inference', 'vocabulary_in_context', 'author_purpose', 'tone_attitude', 'cause_effect', 'comparison_contrast', 'sequence_events', 'generalization'];
    for (const tag of readingTags) {
      expect(STATIC_HINTS[tag]).toBeDefined();
      expect(STATIC_HINTS[tag].length).toBeGreaterThan(0);
    }
  });

  it('should have hints for all Science skill tags', () => {
    const scienceTags = ['data_representation', 'research_summaries', 'conflicting_viewpoints', 'interpreting_graphs', 'experimental_design', 'variable_relationships', 'hypothesis_evaluation', 'data_trends', 'scientific_reasoning', 'units_measurements'];
    for (const tag of scienceTags) {
      expect(STATIC_HINTS[tag]).toBeDefined();
      expect(STATIC_HINTS[tag].length).toBeGreaterThan(0);
    }
  });

  it('should not reveal answers in static hints', () => {
    for (const [_tag, hint] of Object.entries(STATIC_HINTS)) {
      // Static hints should not contain answer letters in isolation
      expect(hint).not.toMatch(/\bthe answer is [A-D]\b/i);
      expect(hint).not.toMatch(/\bcorrect answer\b/i);
      expect(hint).not.toMatch(/\bchoose [A-D]\b/i);
    }
  });
});
