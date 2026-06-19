/**
 * Bug Condition Exploration Property-Based Tests
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.11**
 * 
 * Property 1: Bug Condition - LLM Silent Failure, Insufficient Question Count, and Seed Data Gaps
 * 
 * CRITICAL: These tests MUST FAIL on unfixed code - failure confirms the bugs exist.
 * DO NOT attempt to fix the test or the code when it fails.
 * 
 * Bug 1: DefaultLLMProvider with empty/missing API key should return "unavailable"/"not configured" error
 * Bug 2: startFullTest with insufficient questions should return FullTestError with "Insufficient"
 * Bug 3: Seed data should have enough questions per section to meet FULL_TEST_CONFIG minimums
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  LLMProviderError,
  LLMCompletionRequest,
} from './llm.provider';
import {
  startFullTest,
  isFullTestError,
  FULL_TEST_CONFIG,
} from './fulltest.service';
import { queryMany, insertOne } from '../utils/database';
import { setSessionState } from '../utils/cache';
import { Section, SessionSection, SessionType, SessionStatus } from '../models/enums';
import { ALL_SEED_QUESTIONS } from '../utils/seed-questions';

const mockedQueryMany = vi.mocked(queryMany);
const mockedInsertOne = vi.mocked(insertOne);
const mockedSetSessionState = vi.mocked(setSessionState);

// ─── Bug 1: LLM API Key Validation ──────────────────────────────────────────

describe('Property 1: Bug Condition - LLM Silent Failure (Bug 1)', () => {
  /**
   * Bug 1 — LLM API Key: Instantiate DefaultLLMProvider with empty/missing API key,
   * call complete(). Assert that the error message contains "unavailable" or "not configured"
   * (unfixed code returns generic "LLM provider returned status 401" instead).
   * Also test that no HTTP request is made when key is known empty.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */

  // Arbitrary for empty/missing API keys
  const arbEmptyApiKey = fc.constantFrom('', undefined);

  // Arbitrary for valid LLM completion requests
  const arbCompletionRequest: fc.Arbitrary<LLMCompletionRequest> = fc.record({
    prompt: fc.string({ minLength: 1, maxLength: 200 }),
    maxTokens: fc.option(fc.integer({ min: 1, max: 4000 }), { nil: undefined }),
    temperature: fc.option(fc.double({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
    timeoutMs: fc.constant(1000), // Short timeout for tests
  });

  it('For any empty/missing API key, complete() SHALL return an error containing "unavailable" or "not configured" — NOT a generic HTTP error', async () => {
    // Save original fetch
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;

    // Mock fetch to track if HTTP request is made
    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, statusText: 'Unauthorized' }));
    }) as any;

    try {
      await fc.assert(
        fc.asyncProperty(arbEmptyApiKey, arbCompletionRequest, async (apiKey, request) => {
          fetchCalled = false;

          const provider = new DefaultLLMProvider({
            apiKey: apiKey as string | undefined,
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4',
          });

          try {
            await provider.complete(request);
            // If it doesn't throw, the test should still fail because we expect an error
            expect.fail('Expected an error to be thrown for empty API key');
          } catch (error: any) {
            // EXPECTED BEHAVIOR (after fix):
            // The error message should contain "unavailable" or "not configured"
            // to clearly indicate the API key is missing.
            const errorMessage = error.message?.toLowerCase() || '';
            const hasDescriptiveError = 
              errorMessage.includes('unavailable') || 
              errorMessage.includes('not configured');

            expect(hasDescriptiveError).toBe(true);

            // EXPECTED BEHAVIOR (after fix):
            // No HTTP request should be made when the key is known to be empty
            expect(fetchCalled).toBe(false);
          }
        }),
        { numRuns: 5 }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('For any empty API key, no HTTP request SHALL be made — the error should be immediate', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, statusText: 'Unauthorized' }));
    }) as any;

    try {
      await fc.assert(
        fc.asyncProperty(arbCompletionRequest, async (request) => {
          fetchCallCount = 0;

          const provider = new DefaultLLMProvider({
            apiKey: '',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-4',
          });

          try {
            await provider.complete(request);
          } catch (error: any) {
            // After the fix, no HTTP request should be made
            expect(fetchCallCount).toBe(0);
          }
        }),
        { numRuns: 5 }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ─── Bug 2: Insufficient Question Count ─────────────────────────────────────

describe('Property 1: Bug Condition - Insufficient Question Count (Bug 2)', () => {
  /**
   * Bug 2 — Question Count: Mock database to return 20 English questions when 75 are required,
   * call startFullTest({ userId, section: 'english' }). Assert that result is a FullTestError
   * with message containing "Insufficient" and "Required: 75" and "Available: 20"
   * (unfixed code silently creates session with 20 questions instead).
   * 
   * **Validates: Requirements 1.5, 1.11**
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary for sections with their expected question counts
  const arbSectionWithDeficit = fc.constantFrom(
    { section: SessionSection.English, required: 75, available: 20 },
    { section: SessionSection.Math, required: 60, available: 25 },
    { section: SessionSection.Reading, required: 40, available: 15 },
    { section: SessionSection.Science, required: 40, available: 20 }
  );

  // Arbitrary for valid user IDs
  const arbUserId = fc.uuid();

  it('For any section where available questions < required, startFullTest SHALL return a FullTestError with "Insufficient" and counts — NOT silently create an incomplete session', async () => {
    await fc.assert(
      fc.asyncProperty(arbUserId, arbSectionWithDeficit, async (userId, { section, required, available }) => {
        vi.clearAllMocks();

        // Create mock questions (fewer than required)
        const mockQuestions = Array.from({ length: available }, (_, i) => ({
          question_id: `q-${i}`,
          section: section as unknown as Section,
          question_text: `Question ${i}`,
          passage: null,
          options: JSON.stringify(['A) opt1', 'B) opt2', 'C) opt3', 'D) opt4']),
          correct_answer: 'A',
          explanation: 'Explanation',
          incorrect_reasoning: JSON.stringify({ B: 'wrong', C: 'wrong', D: 'wrong' }),
          skill_tag: 'grammar',
          difficulty: 'easy',
          strategy_tip: 'Tip',
          created_at: new Date(),
        }));

        // Mock DB to return insufficient questions
        mockedQueryMany.mockResolvedValueOnce(mockQuestions);
        // Mock session insert (should NOT be called if fix is correct)
        mockedInsertOne.mockResolvedValueOnce({
          session_id: 'test-session',
          user_id: userId,
          session_type: SessionType.FullTest,
          section,
          status: SessionStatus.Active,
          started_at: new Date(),
          completed_at: null,
          time_limit_seconds: FULL_TEST_CONFIG[section].timeLimitSeconds,
          time_remaining_seconds: FULL_TEST_CONFIG[section].timeLimitSeconds,
          expires_at: null,
        });
        mockedSetSessionState.mockResolvedValueOnce(undefined);

        const result = await startFullTest({ userId, section });

        // EXPECTED BEHAVIOR (after fix):
        // The result should be a FullTestError indicating insufficient questions
        expect(isFullTestError(result)).toBe(true);

        if (isFullTestError(result)) {
          const errorMsg = result.error;
          // Should contain "Insufficient"
          expect(errorMsg).toContain('Insufficient');
          // Should contain the required count
          expect(errorMsg).toContain(`Required: ${required}`);
          // Should contain the available count
          expect(errorMsg).toContain(`Available: ${available}`);
        }

        // EXPECTED BEHAVIOR (after fix):
        // No session should be created when questions are insufficient
        // (insertOne should NOT have been called)
        expect(mockedInsertOne).not.toHaveBeenCalled();
      }),
      { numRuns: 5 }
    );
  });
});

// ─── Bug 3: Seed Data Sufficiency ────────────────────────────────────────────

describe('Property 1: Bug Condition - Seed Data Gaps (Bug 3)', () => {
  /**
   * Bug 3 — Seed Data: Query question counts per section from seed data.
   * Assert each section meets FULL_TEST_CONFIG minimums:
   * English ≥ 75, Math ≥ 60, Reading ≥ 40, Science ≥ 40
   * (unfixed code has only ~80 total questions: 20 English, 25 Math, 15 Reading, 20 Science).
   * 
   * **Validates: Requirements 1.4, 1.5**
   */

  // Arbitrary for each section that should meet minimums
  const arbSection = fc.constantFrom(
    { section: 'english' as const, minRequired: 75 },
    { section: 'math' as const, minRequired: 60 },
    { section: 'reading' as const, minRequired: 40 },
    { section: 'science' as const, minRequired: 40 }
  );

  it('For any section, seed data SHALL contain at least FULL_TEST_CONFIG[section].questionCount questions', () => {
    fc.assert(
      fc.property(arbSection, ({ section, minRequired }) => {
        // Count questions in seed data for this section
        const sectionQuestions = ALL_SEED_QUESTIONS.filter(q => q.section === section);
        const actualCount = sectionQuestions.length;

        // EXPECTED BEHAVIOR (after fix):
        // Each section should have at least the minimum required questions
        expect(actualCount).toBeGreaterThanOrEqual(minRequired);
      }),
      { numRuns: 5 }
    );
  });

  it('Seed data SHALL contain at least 215 total questions across all sections', () => {
    const totalRequired = 75 + 60 + 40 + 40; // = 215
    const totalAvailable = ALL_SEED_QUESTIONS.length;

    // EXPECTED BEHAVIOR (after fix):
    // Total seed questions should be at least 215
    expect(totalAvailable).toBeGreaterThanOrEqual(totalRequired);
  });
});
