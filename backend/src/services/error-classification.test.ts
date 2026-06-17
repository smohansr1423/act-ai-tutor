/**
 * Unit Tests for Error Classification Logic
 * Tests classifyError and getMedianResponseTime functions.
 *
 * Requirements: 5.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DifficultyLevel, ErrorClassification } from '../models/enums';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  query: vi.fn(),
}));

import { queryOne } from '../utils/database';
import {
  classifyError,
  getMedianResponseTime,
  clearMedianResponseTimeCache,
} from './adaptive.service';

const mockQueryOne = vi.mocked(queryOne);

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  clearMedianResponseTimeCache();
});

// ─── getMedianResponseTime Tests ──────────────────────────────────────────────

describe('getMedianResponseTime', () => {
  it('should return the median response time from the database', async () => {
    mockQueryOne.mockResolvedValueOnce({ median: 30.0 });

    const result = await getMedianResponseTime(DifficultyLevel.Medium);

    expect(result).toBe(30.0);
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('percentile_cont'),
      [DifficultyLevel.Medium]
    );
  });

  it('should return null when no records exist', async () => {
    mockQueryOne.mockResolvedValueOnce({ median: null });

    const result = await getMedianResponseTime(DifficultyLevel.Easy);

    expect(result).toBeNull();
  });

  it('should return null when query returns null', async () => {
    mockQueryOne.mockResolvedValueOnce(null);

    const result = await getMedianResponseTime(DifficultyLevel.Hard);

    expect(result).toBeNull();
  });

  it('should cache the median value and not re-query within TTL', async () => {
    mockQueryOne.mockResolvedValueOnce({ median: 25.0 });

    const first = await getMedianResponseTime(DifficultyLevel.Easy);
    const second = await getMedianResponseTime(DifficultyLevel.Easy);

    expect(first).toBe(25.0);
    expect(second).toBe(25.0);
    // Only called once because second call uses cache
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
  });

  it('should re-query after cache is cleared', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ median: 25.0 })
      .mockResolvedValueOnce({ median: 28.0 });

    const first = await getMedianResponseTime(DifficultyLevel.Easy);
    clearMedianResponseTimeCache();
    const second = await getMedianResponseTime(DifficultyLevel.Easy);

    expect(first).toBe(25.0);
    expect(second).toBe(28.0);
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
  });

  it('should cache per difficulty level independently', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ median: 20.0 })  // Easy
      .mockResolvedValueOnce({ median: 35.0 }); // Hard

    const easy = await getMedianResponseTime(DifficultyLevel.Easy);
    const hard = await getMedianResponseTime(DifficultyLevel.Hard);

    expect(easy).toBe(20.0);
    expect(hard).toBe(35.0);
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
  });
});

// ─── classifyError Tests ──────────────────────────────────────────────────────

describe('classifyError', () => {
  describe('Concept Gap classification', () => {
    it('should classify as concept_gap when incorrect and no profile exists', async () => {
      // First call: getWeaknessProfile → null
      // Second call: getMedianResponseTime → null (no records)
      mockQueryOne
        .mockResolvedValueOnce(null)  // weakness profile lookup
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
    });

    it('should classify as concept_gap when incorrect and accuracy <= 80%', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'algebra',
          accuracy: 0.75,
          attempt_count: 10,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
    });

    it('should classify as concept_gap when incorrect and attempts < 5', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'algebra',
          accuracy: 0.90,
          attempt_count: 3,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
    });

    it('should classify as concept_gap when accuracy is exactly 80%', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'algebra',
          accuracy: 0.80,
          attempt_count: 10,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
    });
  });

  describe('Careless Mistake classification', () => {
    it('should classify as careless_mistake when incorrect, accuracy > 80%, and attempts >= 5', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'algebra',
          accuracy: 0.85,
          attempt_count: 10,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
      expect(result.classifications).not.toContain(ErrorClassification.ConceptGap);
    });

    it('should classify as careless_mistake with exactly 5 attempts and accuracy > 80%', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'geometry',
          accuracy: 0.81,
          attempt_count: 5,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null); // median query

      const result = await classifyError(
        'user-1', 'q-1', false, 15, 'geometry', DifficultyLevel.Easy
      );

      expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
      expect(result.classifications).not.toContain(ErrorClassification.ConceptGap);
    });
  });

  describe('Pacing Issue classification', () => {
    it('should add pacing_issue when timeTaken > 2× median', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)           // weakness profile (no profile)
        .mockResolvedValueOnce({ median: 20.0 }); // median = 20, so threshold = 40

      const result = await classifyError(
        'user-1', 'q-1', false, 45, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.PacingIssue);
      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
    });

    it('should add pacing_issue for correct answers when time exceeds threshold', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ median: 15.0 }); // median = 15, threshold = 30

      const result = await classifyError(
        'user-1', 'q-1', true, 35, 'reading_comprehension', DifficultyLevel.Easy
      );

      expect(result.classifications).toContain(ErrorClassification.PacingIssue);
      expect(result.classifications).not.toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).not.toContain(ErrorClassification.CarelessMistake);
    });

    it('should NOT add pacing_issue when timeTaken equals exactly 2× median', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)           // weakness profile
        .mockResolvedValueOnce({ median: 20.0 }); // median = 20, threshold = 40

      const result = await classifyError(
        'user-1', 'q-1', false, 40, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).not.toContain(ErrorClassification.PacingIssue);
    });

    it('should NOT add pacing_issue when timeTaken < 2× median', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)           // weakness profile
        .mockResolvedValueOnce({ median: 20.0 }); // median = 20, threshold = 40

      const result = await classifyError(
        'user-1', 'q-1', false, 35, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).not.toContain(ErrorClassification.PacingIssue);
    });

    it('should NOT add pacing_issue when median is null (no records)', async () => {
      mockQueryOne
        .mockResolvedValueOnce(null)  // weakness profile
        .mockResolvedValueOnce(null); // median query returns null

      const result = await classifyError(
        'user-1', 'q-1', false, 100, 'algebra', DifficultyLevel.Hard
      );

      expect(result.classifications).not.toContain(ErrorClassification.PacingIssue);
    });
  });

  describe('Combined classifications', () => {
    it('should return both concept_gap and pacing_issue when both conditions are met', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'algebra',
          accuracy: 0.50,
          attempt_count: 8,
          recent_attempts: [],
        })
        .mockResolvedValueOnce({ median: 15.0 }); // median = 15, threshold = 30

      const result = await classifyError(
        'user-1', 'q-1', false, 35, 'algebra', DifficultyLevel.Medium
      );

      expect(result.classifications).toContain(ErrorClassification.ConceptGap);
      expect(result.classifications).toContain(ErrorClassification.PacingIssue);
      expect(result.classifications).toHaveLength(2);
    });

    it('should return both careless_mistake and pacing_issue when both conditions are met', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'geometry',
          accuracy: 0.90,
          attempt_count: 20,
          recent_attempts: [],
        })
        .mockResolvedValueOnce({ median: 10.0 }); // median = 10, threshold = 20

      const result = await classifyError(
        'user-1', 'q-1', false, 25, 'geometry', DifficultyLevel.Easy
      );

      expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
      expect(result.classifications).toContain(ErrorClassification.PacingIssue);
      expect(result.classifications).toHaveLength(2);
    });

    it('should return only pacing_issue for a correct but slow answer', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ median: 20.0 }); // median = 20, threshold = 40

      const result = await classifyError(
        'user-1', 'q-1', true, 50, 'science_interpretation', DifficultyLevel.Hard
      );

      expect(result.classifications).toEqual([ErrorClassification.PacingIssue]);
    });

    it('should return empty classifications for a correct answer within time', async () => {
      mockQueryOne
        .mockResolvedValueOnce({ median: 30.0 }); // median = 30, threshold = 60

      const result = await classifyError(
        'user-1', 'q-1', true, 25, 'reading_comprehension', DifficultyLevel.Medium
      );

      expect(result.classifications).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle accuracy of exactly 0.81 with 5 attempts as careless_mistake', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'trigonometry',
          accuracy: 0.81,
          attempt_count: 5,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null);

      const result = await classifyError(
        'user-1', 'q-1', false, 20, 'trigonometry', DifficultyLevel.Hard
      );

      expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
    });

    it('should handle accuracy of exactly 1.0 (perfect) with many attempts as careless_mistake', async () => {
      mockQueryOne
        .mockResolvedValueOnce({
          profile_id: 'p-1',
          user_id: 'user-1',
          skill_tag: 'grammar',
          accuracy: 1.0,
          attempt_count: 20,
          recent_attempts: [],
        })
        .mockResolvedValueOnce(null);

      const result = await classifyError(
        'user-1', 'q-1', false, 10, 'grammar', DifficultyLevel.Easy
      );

      expect(result.classifications).toContain(ErrorClassification.CarelessMistake);
    });

    it('should use cached median on subsequent calls for same difficulty', async () => {
      // First classifyError call populates median cache
      mockQueryOne
        .mockResolvedValueOnce(null)           // profile for first call
        .mockResolvedValueOnce({ median: 20.0 }) // median for first call
        .mockResolvedValueOnce(null);          // profile for second call
      // Note: no second median query because it should be cached

      await classifyError(
        'user-1', 'q-1', false, 45, 'algebra', DifficultyLevel.Medium
      );
      const result = await classifyError(
        'user-2', 'q-2', false, 45, 'geometry', DifficultyLevel.Medium
      );

      // Should still detect pacing issue from cached median
      expect(result.classifications).toContain(ErrorClassification.PacingIssue);
      // queryOne should only be called 3 times (profile, median, profile) not 4
      expect(mockQueryOne).toHaveBeenCalledTimes(3);
    });
  });
});
