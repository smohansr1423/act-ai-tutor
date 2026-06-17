/**
 * Unit tests for Adaptive Difficulty Service
 * Tests Requirements 5.4, 5.5, 5.6, 5.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  query: vi.fn(),
}));

import {
  selectDifficultyFromProfile,
  selectDifficulty,
  DifficultySelection,
} from './adaptive-difficulty.service';
import { queryOne } from '../utils/database';
import { DifficultyLevel } from '../models/enums';
import { WeaknessProfile } from '../models/interfaces';

const mockedQueryOne = vi.mocked(queryOne);

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createMockProfile(overrides?: Partial<WeaknessProfile>): WeaknessProfile {
  return {
    profile_id: 'profile-1',
    user_id: 'user-1',
    skill_tag: 'pre_algebra',
    section: 'math' as any,
    accuracy: 0.5,
    attempt_count: 10,
    recent_attempts: [],
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Adaptive Difficulty Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('selectDifficultyFromProfile (pure logic)', () => {
    describe('Rule 1: Less than 5 attempts → Medium (Req 5.9)', () => {
      it('should return Medium with no time limit for 0 attempts', () => {
        const result = selectDifficultyFromProfile(0, 0);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: null,
          includeExplanation: false,
        });
      });

      it('should return Medium with no time limit for 1 attempt', () => {
        const result = selectDifficultyFromProfile(1, 1.0);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: null,
          includeExplanation: false,
        });
      });

      it('should return Medium with no time limit for 4 attempts', () => {
        const result = selectDifficultyFromProfile(4, 0.25);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: null,
          includeExplanation: false,
        });
      });

      it('should return Medium regardless of accuracy when under 5 attempts', () => {
        // Even with 0% accuracy, default to medium if not enough data
        const resultLow = selectDifficultyFromProfile(3, 0.0);
        expect(resultLow.difficulty).toBe(DifficultyLevel.Medium);

        // Even with 100% accuracy, default to medium
        const resultHigh = selectDifficultyFromProfile(2, 1.0);
        expect(resultHigh.difficulty).toBe(DifficultyLevel.Medium);
      });
    });

    describe('Rule 2: 5+ attempts, accuracy < 60% → Easy + explanation (Req 5.4)', () => {
      it('should return Easy with explanation for accuracy = 0%', () => {
        const result = selectDifficultyFromProfile(5, 0.0);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Easy,
          timeLimit: null,
          includeExplanation: true,
        });
      });

      it('should return Easy with explanation for accuracy = 50%', () => {
        const result = selectDifficultyFromProfile(10, 0.5);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Easy,
          timeLimit: null,
          includeExplanation: true,
        });
      });

      it('should return Easy with explanation for accuracy = 59.9%', () => {
        const result = selectDifficultyFromProfile(20, 0.599);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Easy,
          timeLimit: null,
          includeExplanation: true,
        });
      });

      it('should return Easy with no time limit', () => {
        const result = selectDifficultyFromProfile(7, 0.4);
        expect(result.timeLimit).toBeNull();
      });
    });

    describe('Rule 3: 5+ attempts, accuracy 60-80% → Medium + 90s (Req 5.5)', () => {
      it('should return Medium with 90s time limit for accuracy = 60%', () => {
        const result = selectDifficultyFromProfile(5, 0.60);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: 90,
          includeExplanation: false,
        });
      });

      it('should return Medium with 90s time limit for accuracy = 70%', () => {
        const result = selectDifficultyFromProfile(15, 0.70);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: 90,
          includeExplanation: false,
        });
      });

      it('should return Medium with 90s time limit for accuracy = 80%', () => {
        const result = selectDifficultyFromProfile(10, 0.80);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Medium,
          timeLimit: 90,
          includeExplanation: false,
        });
      });

      it('should not include explanation', () => {
        const result = selectDifficultyFromProfile(8, 0.65);
        expect(result.includeExplanation).toBe(false);
      });
    });

    describe('Rule 4: 5+ attempts, accuracy > 80% → Hard + 60s (Req 5.6)', () => {
      it('should return Hard with 60s time limit for accuracy = 81%', () => {
        const result = selectDifficultyFromProfile(5, 0.81);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Hard,
          timeLimit: 60,
          includeExplanation: false,
        });
      });

      it('should return Hard with 60s time limit for accuracy = 90%', () => {
        const result = selectDifficultyFromProfile(20, 0.90);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Hard,
          timeLimit: 60,
          includeExplanation: false,
        });
      });

      it('should return Hard with 60s time limit for accuracy = 100%', () => {
        const result = selectDifficultyFromProfile(10, 1.0);

        expect(result).toEqual({
          difficulty: DifficultyLevel.Hard,
          timeLimit: 60,
          includeExplanation: false,
        });
      });

      it('should not include explanation', () => {
        const result = selectDifficultyFromProfile(12, 0.95);
        expect(result.includeExplanation).toBe(false);
      });
    });

    describe('Boundary conditions', () => {
      it('should treat exactly 5 attempts as sufficient data', () => {
        // 5 attempts with low accuracy → Easy (not default Medium)
        const result = selectDifficultyFromProfile(5, 0.4);
        expect(result.difficulty).toBe(DifficultyLevel.Easy);
      });

      it('should treat accuracy = 0.60 as the 60-80% range boundary', () => {
        const result = selectDifficultyFromProfile(5, 0.60);
        expect(result.difficulty).toBe(DifficultyLevel.Medium);
        expect(result.timeLimit).toBe(90);
      });

      it('should treat accuracy = 0.80 as the 60-80% range boundary', () => {
        const result = selectDifficultyFromProfile(5, 0.80);
        expect(result.difficulty).toBe(DifficultyLevel.Medium);
        expect(result.timeLimit).toBe(90);
      });

      it('should treat accuracy just above 0.80 as Hard', () => {
        const result = selectDifficultyFromProfile(5, 0.801);
        expect(result.difficulty).toBe(DifficultyLevel.Hard);
        expect(result.timeLimit).toBe(60);
      });
    });
  });

  describe('selectDifficulty (with database)', () => {
    it('should return Medium when no profile exists', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await selectDifficulty('user-1', 'pre_algebra');

      expect(result).toEqual({
        difficulty: DifficultyLevel.Medium,
        timeLimit: null,
        includeExplanation: false,
      });
    });

    it('should query database for the user and skill tag', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        createMockProfile({ attempt_count: 10, accuracy: 0.7 })
      );

      await selectDifficulty('user-123', 'geometry');

      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND skill_tag = $2'),
        ['user-123', 'geometry']
      );
    });

    it('should return Easy for low accuracy profile', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        createMockProfile({ attempt_count: 8, accuracy: 0.3 })
      );

      const result = await selectDifficulty('user-1', 'trigonometry');

      expect(result).toEqual({
        difficulty: DifficultyLevel.Easy,
        timeLimit: null,
        includeExplanation: true,
      });
    });

    it('should return Medium with time limit for mid accuracy profile', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        createMockProfile({ attempt_count: 12, accuracy: 0.72 })
      );

      const result = await selectDifficulty('user-1', 'algebra');

      expect(result).toEqual({
        difficulty: DifficultyLevel.Medium,
        timeLimit: 90,
        includeExplanation: false,
      });
    });

    it('should return Hard for high accuracy profile', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        createMockProfile({ attempt_count: 20, accuracy: 0.95 })
      );

      const result = await selectDifficulty('user-1', 'reading_comprehension');

      expect(result).toEqual({
        difficulty: DifficultyLevel.Hard,
        timeLimit: 60,
        includeExplanation: false,
      });
    });

    it('should return Medium for new user with few attempts', async () => {
      mockedQueryOne.mockResolvedValueOnce(
        createMockProfile({ attempt_count: 3, accuracy: 0.33 })
      );

      const result = await selectDifficulty('user-1', 'grammar');

      expect(result).toEqual({
        difficulty: DifficultyLevel.Medium,
        timeLimit: null,
        includeExplanation: false,
      });
    });
  });
});
