/**
 * Preservation Property-Based Tests
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * Property 2: Preservation - Valid API Key, Sufficient Questions, and Practice Mode Behavior
 *
 * These tests capture correct baseline behavior on UNFIXED code.
 * They MUST PASS before and after the fix — confirming non-buggy inputs
 * continue to produce identical results.
 *
 * Observation-first methodology:
 * - Observe: DefaultLLMProvider.complete() with valid API key and mocked 200 response
 *   returns LLMCompletionResponse with content from choices[0].message.content
 * - Observe: DefaultLLMProvider.completeVision() with valid API key and mocked 200 response
 *   returns LLMCompletionResponse with vision content
 * - Observe: startFullTest with ≥ questionCount questions returns session with exact count
 * - Observe: Practice sessions work with whatever questions are available
 * - Observe: computeFullTestScore returns correct { correct, total } with per-question details
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

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
  DefaultLLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMVisionRequest,
} from './llm.provider';
import {
  startFullTest,
  isFullTestError,
  FULL_TEST_CONFIG,
  computeFullTestScore,
  SubmittedAnswer,
  QuestionForScoring,
  StartFullTestResponse,
} from './fulltest.service';
import { startPracticeSession } from './session.service';
import { queryMany, insertOne } from '../utils/database';
import { setSessionState } from '../utils/cache';
import { Section, SessionSection, SessionType, SessionStatus } from '../models/enums';

const mockedQueryMany = vi.mocked(queryMany);
const mockedInsertOne = vi.mocked(insertOne);
const mockedSetSessionState = vi.mocked(setSessionState);

// ─── Property 2a: Valid API Key — LLM complete() Preservation ────────────────

describe('Property 2: Preservation - Valid API Key with complete()', () => {
  /**
   * Observation: DefaultLLMProvider.complete() with a valid (non-empty) API key
   * and a mocked 200 response returns LLMCompletionResponse with:
   * - content from choices[0].message.content (non-empty string)
   * - optional usage stats (promptTokens, completionTokens, totalTokens)
   *
   * Property: For all valid API keys (non-empty strings) with mocked successful
   * upstream, complete() returns response with non-empty content and optional usage stats.
   *
   * **Validates: Requirements 3.1, 3.6**
   */

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // Arbitrary for non-empty API keys
  const arbValidApiKey = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0);

  // Arbitrary for response content
  const arbResponseContent = fc.string({ minLength: 1, maxLength: 500 });

  // Arbitrary for usage stats
  const arbUsage = fc.record({
    prompt_tokens: fc.integer({ min: 1, max: 10000 }),
    completion_tokens: fc.integer({ min: 1, max: 10000 }),
    total_tokens: fc.integer({ min: 2, max: 20000 }),
  });

  // Arbitrary for valid LLM completion requests
  const arbCompletionRequest: fc.Arbitrary<LLMCompletionRequest> = fc.record({
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    maxTokens: fc.option(fc.integer({ min: 1, max: 4000 }), { nil: undefined }),
    temperature: fc.option(fc.double({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
    timeoutMs: fc.constant(5000),
  });

  it('For all valid API keys with mocked successful upstream, complete() returns response with non-empty content', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidApiKey,
        arbCompletionRequest,
        arbResponseContent,
        arbUsage,
        async (apiKey, request, content, usage) => {
          // Mock fetch to return a successful 200 response
          globalThis.fetch = vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                choices: [{ message: { content } }],
                usage,
              }),
              { status: 200, statusText: 'OK' }
            )
          ) as any;

          const provider = new DefaultLLMProvider({
            apiKey,
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4',
          });

          const result = await provider.complete(request);

          // Preservation: response has content from choices[0].message.content
          expect(result.content).toBe(content);

          // Preservation: usage stats are mapped correctly when present
          expect(result.usage).toBeDefined();
          expect(result.usage!.promptTokens).toBe(usage.prompt_tokens);
          expect(result.usage!.completionTokens).toBe(usage.completion_tokens);
          expect(result.usage!.totalTokens).toBe(usage.total_tokens);
        }
      ),
      { numRuns: 3 }
    );
  });

  it('For all valid API keys with mocked successful upstream (no usage), complete() returns response without usage', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidApiKey,
        arbCompletionRequest,
        arbResponseContent,
        async (apiKey, request, content) => {
          // Mock fetch with no usage field in response
          globalThis.fetch = vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                choices: [{ message: { content } }],
              }),
              { status: 200, statusText: 'OK' }
            )
          ) as any;

          const provider = new DefaultLLMProvider({
            apiKey,
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4',
          });

          const result = await provider.complete(request);

          expect(result.content).toBe(content);
          expect(result.usage).toBeUndefined();
        }
      ),
      { numRuns: 3 }
    );
  });
});

// ─── Property 2b: Valid API Key — LLM completeVision() Preservation ──────────

describe('Property 2: Preservation - Valid API Key with completeVision()', () => {
  /**
   * Observation: DefaultLLMProvider.completeVision() with a valid API key
   * and a mocked 200 response returns LLMCompletionResponse with vision content.
   *
   * **Validates: Requirements 3.1, 3.6**
   */

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const arbValidApiKey = fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0);
  const arbResponseContent = fc.string({ minLength: 1, maxLength: 500 });

  const arbVisionRequest: fc.Arbitrary<LLMVisionRequest> = fc.record({
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    imageBase64: fc.string({ minLength: 10, maxLength: 100 }),
    mimeType: fc.constantFrom('image/jpeg', 'image/png', 'image/gif'),
    maxTokens: fc.option(fc.integer({ min: 1, max: 4000 }), { nil: undefined }),
    temperature: fc.option(fc.double({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
    timeoutMs: fc.constant(5000),
  });

  it('For all valid API keys with mocked successful upstream, completeVision() returns response with vision content', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidApiKey,
        arbVisionRequest,
        arbResponseContent,
        async (apiKey, request, content) => {
          globalThis.fetch = vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                choices: [{ message: { content } }],
                usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
              }),
              { status: 200, statusText: 'OK' }
            )
          ) as any;

          const provider = new DefaultLLMProvider({
            apiKey,
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4',
          });

          const result = await provider.completeVision(request);

          // Preservation: response has content from choices[0].message.content
          expect(result.content).toBe(content);
          // Preservation: usage stats mapped correctly
          expect(result.usage).toBeDefined();
          expect(result.usage!.promptTokens).toBe(100);
          expect(result.usage!.completionTokens).toBe(50);
          expect(result.usage!.totalTokens).toBe(150);
        }
      ),
      { numRuns: 3 }
    );
  });
});

// ─── Property 2c: Full Test with Sufficient Questions — Preservation ─────────

describe('Property 2: Preservation - startFullTest with sufficient questions', () => {
  /**
   * Observation: startFullTest({ userId, section }) with ≥ questionCount questions
   * in the DB returns StartFullTestResponse with:
   * - sessionId (non-empty string)
   * - exactly questionCount questions
   * - correct timeLimitSeconds from FULL_TEST_CONFIG
   *
   * Property: For all sections where DB has ≥ questionCount questions,
   * startFullTest returns a session with exactly questionCount questions
   * and correct timeLimitSeconds.
   *
   * **Validates: Requirements 3.2, 3.3, 3.5**
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary for sections with their full test configs
  const arbSectionConfig = fc.constantFrom(
    { section: SessionSection.English, questionCount: 75, timeLimit: 2700 },
    { section: SessionSection.Math, questionCount: 60, timeLimit: 3600 },
    { section: SessionSection.Reading, questionCount: 40, timeLimit: 2100 },
    { section: SessionSection.Science, questionCount: 40, timeLimit: 2100 }
  );

  const arbUserId = fc.uuid();

  it('For all sections with sufficient questions, startFullTest returns session with exact questionCount and correct timeLimit', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbSectionConfig, async (userId, { section, questionCount, timeLimit }) => {
        vi.clearAllMocks();

        // Create mock questions with exactly questionCount entries (simulating sufficient DB)
        const mockQuestions = Array.from({ length: questionCount }, (_, i) => ({
          question_id: `q-${section}-${i}`,
          section: section as unknown as Section,
          question_text: `Question ${i} for ${section}`,
          passage: null,
          options: JSON.stringify(['A) opt1', 'B) opt2', 'C) opt3', 'D) opt4']),
          correct_answer: 'A',
          explanation: `Explanation for question ${i}`,
          incorrect_reasoning: JSON.stringify({ B: 'wrong', C: 'wrong', D: 'wrong' }),
          skill_tag: 'test-skill',
          difficulty: 'medium',
          strategy_tip: 'Test tip',
          created_at: new Date(),
        }));

        // Mock DB to return sufficient questions
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);

        // Mock session insert
        const mockSessionId = `session-${section}-${userId.slice(0, 8)}`;
        mockedInsertOne.mockResolvedValueOnce({
          session_id: mockSessionId,
          user_id: userId,
          session_type: SessionType.FullTest,
          section,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: timeLimit,
          time_remaining_seconds: timeLimit,
          expires_at: null,
        });

        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startFullTest({ userId, section });

        // Preservation: result is NOT an error
        expect(isFullTestError(result)).toBe(false);

        const response = result as StartFullTestResponse;

        // Preservation: sessionId is present
        expect(response.sessionId).toBe(mockSessionId);

        // Preservation: exactly questionCount questions are returned
        expect(response.questions.length).toBe(questionCount);

        // Preservation: correct timeLimit from FULL_TEST_CONFIG
        expect(response.timeLimit).toBe(timeLimit);

        // Preservation: session was created in DB
        expect(mockedInsertOne).toHaveBeenCalledTimes(1);

        // Preservation: session state was stored in cache
        expect(mockedSetSessionState).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 5 }
    );
  });
});

// ─── Property 2d: computeFullTestScore Preservation ──────────────────────────

describe('Property 2: Preservation - computeFullTestScore correctness', () => {
  /**
   * Observation: computeFullTestScore(questions, answers) with valid data returns:
   * - score.total equals questions.length
   * - score.correct ≤ score.total
   * - details has one entry per question
   * - correct count matches isCorrect true entries
   *
   * Property: For all computeFullTestScore(questions, answers) calls with valid data,
   * score.total equals questions.length and score.correct ≤ score.total.
   *
   * **Validates: Requirements 3.3**
   */

  // Arbitrary for answer choices
  const arbAnswer = fc.constantFrom('A', 'B', 'C', 'D');

  // Arbitrary for questions array (variable length)
  const arbQuestions = fc.integer({ min: 1, max: 75 }).chain(count =>
    fc.array(
      fc.record({
        question_id: fc.uuid(),
        correct_answer: arbAnswer,
        explanation: fc.string({ minLength: 5, maxLength: 100 }),
      }),
      { minLength: count, maxLength: count }
    )
  );

  // Generate answers for a subset of questions
  const arbQuestionsAndAnswers = arbQuestions.chain(questions => {
    // Generate answers for a random subset of question indices
    const arbAnswers = fc.array(
      fc.record({
        questionIndex: fc.integer({ min: 0, max: questions.length - 1 }),
        selectedAnswer: arbAnswer,
      }),
      { minLength: 0, maxLength: questions.length }
    ).map(answers => {
      // Deduplicate by questionIndex (keep last)
      const seen = new Map<number, SubmittedAnswer>();
      for (const a of answers) {
        seen.set(a.questionIndex, a);
      }
      return Array.from(seen.values());
    });

    return arbAnswers.map(answers => ({ questions, answers }));
  });

  it('For all valid question/answer combos, score.total equals questions.length and score.correct ≤ score.total', () => {
    fc.assert(
      fc.property(arbQuestionsAndAnswers, ({ questions, answers }) => {
        const { score, details } = computeFullTestScore(questions, answers);

        // Preservation: total equals number of questions
        expect(score.total).toBe(questions.length);

        // Preservation: correct cannot exceed total
        expect(score.correct).toBeLessThanOrEqual(score.total);

        // Preservation: correct is non-negative
        expect(score.correct).toBeGreaterThanOrEqual(0);

        // Preservation: details has one entry per question
        expect(details.length).toBe(questions.length);

        // Preservation: correct count matches isCorrect entries
        const correctFromDetails = details.filter(d => d.isCorrect).length;
        expect(correctFromDetails).toBe(score.correct);
      }),
      { numRuns: 5 }
    );
  });

  it('For all questions where all answers are correct, score.correct equals score.total', () => {
    fc.assert(
      fc.property(arbQuestions, (questions) => {
        // Submit correct answers for all questions
        const answers: SubmittedAnswer[] = questions.map((q, i) => ({
          questionIndex: i,
          selectedAnswer: q.correct_answer,
        }));

        const { score } = computeFullTestScore(questions, answers);

        // Preservation: all correct means correct === total
        expect(score.correct).toBe(score.total);
        expect(score.total).toBe(questions.length);
      }),
      { numRuns: 3 }
    );
  });

  it('For all questions with no answers submitted, score.correct equals 0', () => {
    fc.assert(
      fc.property(arbQuestions, (questions) => {
        const { score, details } = computeFullTestScore(questions, []);

        // Preservation: no answers means 0 correct
        expect(score.correct).toBe(0);
        expect(score.total).toBe(questions.length);

        // Preservation: all details show selectedAnswer as null
        for (const detail of details) {
          expect(detail.selectedAnswer).toBeNull();
          expect(detail.isCorrect).toBe(false);
        }
      }),
      { numRuns: 3 }
    );
  });
});

// ─── Property 2e: Practice Sessions — No Minimum Enforcement ─────────────────

describe('Property 2: Preservation - Practice sessions operate without minimum question counts', () => {
  /**
   * Observation: Practice sessions (using PRACTICE_BATCH_SIZE = 20) work with
   * whatever questions are available. They do NOT require full test question counts.
   *
   * Property: Practice sessions operate without requiring full test question counts.
   * Even with fewer than FULL_TEST_CONFIG minimums, practice sessions succeed.
   *
   * **Validates: Requirements 3.4, 3.7**
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary: number of available questions (1 to 20, all below full test minimums)
  const arbAvailableCount = fc.integer({ min: 1, max: 20 });

  const arbSection = fc.constantFrom(
    SessionSection.English,
    SessionSection.Math,
    SessionSection.Reading,
    SessionSection.Science
  );

  const arbUserId = fc.uuid();

  it('For all sections with any number of available questions (even < FULL_TEST_CONFIG), practice sessions succeed', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbSection, arbAvailableCount, async (userId, section, availableCount) => {
        vi.clearAllMocks();

        // Create mock questions - fewer than full test requirements but valid for practice
        const mockQuestions = Array.from({ length: availableCount }, (_, i) => ({
          question_id: `practice-q-${i}`,
          section: section as unknown as Section,
          question_text: `Practice question ${i}`,
          passage: null,
          options: JSON.stringify(['A) opt1', 'B) opt2', 'C) opt3', 'D) opt4']),
          correct_answer: 'B',
          explanation: `Explanation ${i}`,
          incorrect_reasoning: JSON.stringify({ A: 'wrong', C: 'wrong', D: 'wrong' }),
          skill_tag: 'practice-skill',
          difficulty: 'easy',
          strategy_tip: 'Practice tip',
          created_at: new Date(),
        }));

        // Mock DB fetch for practice (PRACTICE_BATCH_SIZE = 20)
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);

        // Mock session insert for practice
        const mockSessionId = `practice-session-${userId.slice(0, 8)}`;
        mockedInsertOne.mockResolvedValueOnce({
          session_id: mockSessionId,
          user_id: userId,
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
          userId,
          section,
          mode: 'practice',
        });

        // Preservation: practice session succeeds regardless of question count
        // (as long as at least 1 question is available)
        expect('message' in result).toBe(false);

        if (!('message' in result)) {
          // Preservation: sessionId is returned
          expect(result.sessionId).toBe(mockSessionId);

          // Preservation: firstQuestion is delivered
          expect(result.firstQuestion).toBeDefined();
          expect(result.firstQuestion.question_id).toBeDefined();
        }
      }),
      { numRuns: 5 }
    );
  });
});
