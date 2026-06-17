/**
 * Property-Based Tests for Error Classification Logic
 * Feature: act-ai-tutor-app, Property 14: Error Classification Logic
 *
 * **Validates: Requirements 5.3**
 *
 * For any incorrect answer where the student has demonstrated prior competence
 * (accuracy > 80% on that Skill_Tag with 5+ attempts), the classification SHALL be
 * Careless_Mistake. For any incorrect answer where the student has accuracy <= 80%
 * or fewer than 5 prior attempts, the classification SHALL be Concept_Gap. For any
 * answer where response time exceeds 2× the median for that difficulty level, the
 * classification SHALL include Pacing_Issue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DifficultyLevel, ErrorClassification } from '../../models/enums';

// Mock the database module before importing the service
vi.mock('../../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  query: vi.fn(),
}));

import { queryOne } from '../../utils/database';
import {
  classifyError,
  clearMedianResponseTimeCache,
} from '../../services/adaptive.service';

const mockQueryOne = vi.mocked(queryOne);

// ─── Arbitraries (Generators) ─────────────────────────────────────────────────

/** Generator for difficulty levels */
const difficultyArb = fc.constantFrom(
  DifficultyLevel.Easy,
  DifficultyLevel.Medium,
  DifficultyLevel.Hard
);

/** Generator for valid skill tags */
const skillTagArb = fc.constantFrom(
  'algebra', 'geometry', 'trigonometry', 'pre_algebra',
  'grammar', 'punctuation', 'sentence_structure',
  'reading_comprehension', 'inference', 'main_idea',
  'data_interpretation', 'experimental_design', 'scientific_reasoning'
);

/** Generator for positive response times (in seconds) */
const timeTakenArb = fc.float({ min: Math.fround(0.1), max: Math.fround(300), noNaN: true });

/** Generator for positive median values */
const medianArb = fc.float({ min: Math.fround(1), max: Math.fround(120), noNaN: true });

/** Generator for accuracy values representing prior competence (> 0.80, with 5+ attempts) */
const competentProfileArb = fc.record({
  accuracy: fc.double({ min: 0.801, max: 1.0, noNaN: true }),
  attempt_count: fc.integer({ min: 5, max: 100 }),
});

/** Generator for accuracy values indicating concept gap (accuracy <= 0.80 with 5+ attempts) */
const lowAccuracyProfileArb = fc.record({
  accuracy: fc.double({ min: 0, max: 0.80, noNaN: true }),
  attempt_count: fc.integer({ min: 5, max: 100 }),
});

/** Generator for profiles with fewer than 5 attempts (any accuracy) */
const fewAttemptsProfileArb = fc.record({
  accuracy: fc.double({ min: 0, max: 1.0, noNaN: true }),
  attempt_count: fc.integer({ min: 0, max: 4 }),
});

// ─── Test Setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearMedianResponseTimeCache();
});

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 14: Error Classification Logic', () => {
  /**
   * Property: For any incorrect answer where accuracy > 80% and attempts >= 5,
   * the classification SHALL be Careless_Mistake.
   */
  it('incorrect answer with prior competence (accuracy > 80%, 5+ attempts) SHALL be classified as Careless_Mistake', async () => {
    await fc.assert(
      fc.asyncProperty(
        competentProfileArb,
        skillTagArb,
        difficultyArb,
        timeTakenArb,
        async (profile, skillTag, difficulty, timeTaken) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Mock weakness profile: high accuracy, sufficient attempts
          mockQueryOne
            .mockResolvedValueOnce({
              profile_id: 'p-1',
              user_id: 'user-1',
              skill_tag: skillTag,
              accuracy: profile.accuracy,
              attempt_count: profile.attempt_count,
              recent_attempts: [],
            })
            .mockResolvedValueOnce(null); // No median (avoid pacing issue interference)

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
          expect(result.classifications).not.toContain(ErrorClassification.ConceptGap);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any incorrect answer where accuracy <= 80% with 5+ attempts,
   * the classification SHALL be Concept_Gap.
   */
  it('incorrect answer with low accuracy (<= 80%) and 5+ attempts SHALL be classified as Concept_Gap', async () => {
    await fc.assert(
      fc.asyncProperty(
        lowAccuracyProfileArb,
        skillTagArb,
        difficultyArb,
        timeTakenArb,
        async (profile, skillTag, difficulty, timeTaken) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Mock weakness profile: low accuracy, sufficient attempts
          mockQueryOne
            .mockResolvedValueOnce({
              profile_id: 'p-1',
              user_id: 'user-1',
              skill_tag: skillTag,
              accuracy: profile.accuracy,
              attempt_count: profile.attempt_count,
              recent_attempts: [],
            })
            .mockResolvedValueOnce(null); // No median

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.ConceptGap);
          expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any incorrect answer where the student has fewer than 5 attempts
   * (regardless of accuracy), the classification SHALL be Concept_Gap.
   */
  it('incorrect answer with fewer than 5 attempts SHALL be classified as Concept_Gap regardless of accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        fewAttemptsProfileArb,
        skillTagArb,
        difficultyArb,
        timeTakenArb,
        async (profile, skillTag, difficulty, timeTaken) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Mock weakness profile: any accuracy but < 5 attempts
          mockQueryOne
            .mockResolvedValueOnce({
              profile_id: 'p-1',
              user_id: 'user-1',
              skill_tag: skillTag,
              accuracy: profile.accuracy,
              attempt_count: profile.attempt_count,
              recent_attempts: [],
            })
            .mockResolvedValueOnce(null); // No median

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.ConceptGap);
          expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any incorrect answer where no profile exists for the skill tag,
   * the classification SHALL be Concept_Gap.
   */
  it('incorrect answer with no existing profile SHALL be classified as Concept_Gap', async () => {
    await fc.assert(
      fc.asyncProperty(
        skillTagArb,
        difficultyArb,
        timeTakenArb,
        async (skillTag, difficulty, timeTaken) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Mock: no weakness profile exists
          mockQueryOne
            .mockResolvedValueOnce(null) // No profile
            .mockResolvedValueOnce(null); // No median

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.ConceptGap);
          expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any answer (correct or incorrect) where response time exceeds
   * 2× the median for that difficulty level, the classification SHALL include Pacing_Issue.
   */
  it('any answer with response time > 2× median SHALL include Pacing_Issue', async () => {
    await fc.assert(
      fc.asyncProperty(
        medianArb,
        fc.boolean(),
        skillTagArb,
        difficultyArb,
        async (median, isCorrect, skillTag, difficulty) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Generate timeTaken that is strictly greater than 2× median
          const timeTaken = 2 * median + 0.01;

          if (isCorrect) {
            // For correct answers, only the median query is made
            mockQueryOne.mockResolvedValueOnce({ median });
          } else {
            // For incorrect answers, profile query + median query
            mockQueryOne
              .mockResolvedValueOnce(null) // No profile
              .mockResolvedValueOnce({ median });
          }

          const result = await classifyError(
            'user-1', 'q-1', isCorrect, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.PacingIssue);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any answer where response time is <= 2× the median,
   * the classification SHALL NOT include Pacing_Issue.
   */
  it('any answer with response time <= 2× median SHALL NOT include Pacing_Issue', async () => {
    await fc.assert(
      fc.asyncProperty(
        medianArb,
        fc.boolean(),
        skillTagArb,
        difficultyArb,
        async (median, isCorrect, skillTag, difficulty) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Generate timeTaken that is at most 2× median
          const timeTaken = 2 * median;

          if (isCorrect) {
            mockQueryOne.mockResolvedValueOnce({ median });
          } else {
            mockQueryOne
              .mockResolvedValueOnce(null) // No profile
              .mockResolvedValueOnce({ median });
          }

          const result = await classifyError(
            'user-1', 'q-1', isCorrect, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).not.toContain(ErrorClassification.PacingIssue);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any correct answer within time limits (no pacing issue),
   * the classification SHALL be empty (no error type assigned).
   */
  it('correct answer within time limits SHALL have empty classifications', async () => {
    await fc.assert(
      fc.asyncProperty(
        medianArb,
        skillTagArb,
        difficultyArb,
        async (median, skillTag, difficulty) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          // Time within 2× median
          const timeTaken = median * 0.5;

          mockQueryOne.mockResolvedValueOnce({ median });

          const result = await classifyError(
            'user-1', 'q-1', true, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any incorrect answer with prior competence AND response time > 2× median,
   * the classification SHALL include BOTH Careless_Mistake AND Pacing_Issue.
   */
  it('incorrect answer with competence and slow response SHALL include both Careless_Mistake and Pacing_Issue', async () => {
    await fc.assert(
      fc.asyncProperty(
        competentProfileArb,
        medianArb,
        skillTagArb,
        difficultyArb,
        async (profile, median, skillTag, difficulty) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          const timeTaken = 2 * median + 0.01;

          mockQueryOne
            .mockResolvedValueOnce({
              profile_id: 'p-1',
              user_id: 'user-1',
              skill_tag: skillTag,
              accuracy: profile.accuracy,
              attempt_count: profile.attempt_count,
              recent_attempts: [],
            })
            .mockResolvedValueOnce({ median });

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
          expect(result.classifications).toContain(ErrorClassification.PacingIssue);
          expect(result.classifications).not.toContain(ErrorClassification.ConceptGap);
          expect(result.classifications).toHaveLength(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any incorrect answer with low accuracy/few attempts AND response time > 2× median,
   * the classification SHALL include BOTH Concept_Gap AND Pacing_Issue.
   */
  it('incorrect answer with concept gap and slow response SHALL include both Concept_Gap and Pacing_Issue', async () => {
    await fc.assert(
      fc.asyncProperty(
        lowAccuracyProfileArb,
        medianArb,
        skillTagArb,
        difficultyArb,
        async (profile, median, skillTag, difficulty) => {
          clearMedianResponseTimeCache();
          vi.clearAllMocks();

          const timeTaken = 2 * median + 0.01;

          mockQueryOne
            .mockResolvedValueOnce({
              profile_id: 'p-1',
              user_id: 'user-1',
              skill_tag: skillTag,
              accuracy: profile.accuracy,
              attempt_count: profile.attempt_count,
              recent_attempts: [],
            })
            .mockResolvedValueOnce({ median });

          const result = await classifyError(
            'user-1', 'q-1', false, timeTaken, skillTag, difficulty
          );

          expect(result.classifications).toContain(ErrorClassification.ConceptGap);
          expect(result.classifications).toContain(ErrorClassification.PacingIssue);
          expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
          expect(result.classifications).toHaveLength(2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
