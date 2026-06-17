/**
 * Unit tests for Adaptive Service - Weakness Profile Management
 * Tests Requirements 5.1, 5.2
 * Validates: Design Property 13 (Weakness Profile Sliding Window)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  query: vi.fn(),
}));

import {
  calculateAccuracy,
  applySlidingWindow,
  updateWeaknessProfile,
  getWeaknessProfile,
  getAllWeaknessProfiles,
  getWeakSkillTags,
} from './adaptive.service';
import { queryOne, queryMany } from '../utils/database';
import { Section } from '../models/enums';
import { RecentAttempt, WeaknessProfile } from '../models/interfaces';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQueryMany = vi.mocked(queryMany);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createAttempt(isCorrect: boolean, timestamp?: string): RecentAttempt {
  return {
    is_correct: isCorrect,
    timestamp: timestamp || new Date().toISOString(),
  };
}

function createAttempts(results: boolean[]): RecentAttempt[] {
  return results.map((isCorrect, i) =>
    createAttempt(isCorrect, new Date(Date.now() + i * 1000).toISOString())
  );
}

function createMockProfile(overrides?: Partial<WeaknessProfile>): WeaknessProfile {
  return {
    profile_id: 'profile-1',
    user_id: 'user-1',
    skill_tag: 'pre_algebra',
    section: Section.Math,
    accuracy: 0.75,
    attempt_count: 10,
    recent_attempts: createAttempts([true, true, true, false]),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Adaptive Service - Weakness Profile Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── calculateAccuracy ────────────────────────────────────────────────────

  describe('calculateAccuracy', () => {
    it('should return 0 for an empty attempts array', () => {
      expect(calculateAccuracy([])).toBe(0);
    });

    it('should return 1.0 when all attempts are correct', () => {
      const attempts = createAttempts([true, true, true, true, true]);
      expect(calculateAccuracy(attempts)).toBe(1.0);
    });

    it('should return 0.0 when all attempts are incorrect', () => {
      const attempts = createAttempts([false, false, false, false]);
      expect(calculateAccuracy(attempts)).toBe(0.0);
    });

    it('should correctly compute ratio of correct to total', () => {
      // 3 correct out of 5 = 0.6
      const attempts = createAttempts([true, false, true, false, true]);
      expect(calculateAccuracy(attempts)).toBe(0.6);
    });

    it('should handle a single correct attempt', () => {
      const attempts = createAttempts([true]);
      expect(calculateAccuracy(attempts)).toBe(1.0);
    });

    it('should handle a single incorrect attempt', () => {
      const attempts = createAttempts([false]);
      expect(calculateAccuracy(attempts)).toBe(0.0);
    });

    it('should compute accuracy for exactly 20 attempts', () => {
      // 15 correct out of 20 = 0.75
      const results = Array(15).fill(true).concat(Array(5).fill(false));
      const attempts = createAttempts(results);
      expect(calculateAccuracy(attempts)).toBe(0.75);
    });
  });

  // ─── applySlidingWindow ───────────────────────────────────────────────────

  describe('applySlidingWindow', () => {
    it('should return all attempts when array has fewer than 20 items', () => {
      const attempts = createAttempts([true, false, true]);
      const result = applySlidingWindow(attempts);
      expect(result).toHaveLength(3);
      expect(result).toEqual(attempts);
    });

    it('should return all attempts when array has exactly 20 items', () => {
      const results = Array(20).fill(true);
      const attempts = createAttempts(results);
      const result = applySlidingWindow(attempts);
      expect(result).toHaveLength(20);
      expect(result).toEqual(attempts);
    });

    it('should trim to the most recent 20 when array exceeds 20 items', () => {
      const results = Array(25).fill(false).map((_, i) => i >= 5); // first 5 false, rest true
      const attempts = createAttempts(results);
      const result = applySlidingWindow(attempts);
      expect(result).toHaveLength(20);
      // Should keep items at indices 5-24 (the most recent 20)
      expect(result).toEqual(attempts.slice(5));
    });

    it('should keep the most recent entries (last items in array)', () => {
      // Create 22 attempts: first 2 are incorrect, last 20 are correct
      const results = [false, false, ...Array(20).fill(true)];
      const attempts = createAttempts(results);
      const result = applySlidingWindow(attempts);
      expect(result).toHaveLength(20);
      // All remaining should be correct (the 2 false ones were trimmed)
      expect(result.every((a) => a.is_correct)).toBe(true);
    });

    it('should handle empty array', () => {
      const result = applySlidingWindow([]);
      expect(result).toHaveLength(0);
      expect(result).toEqual([]);
    });

    it('should handle a single element', () => {
      const attempts = createAttempts([true]);
      const result = applySlidingWindow(attempts);
      expect(result).toHaveLength(1);
    });
  });

  // ─── updateWeaknessProfile ────────────────────────────────────────────────

  describe('updateWeaknessProfile', () => {
    it('should create a new profile when none exists', async () => {
      // No existing profile
      mockedQueryOne.mockResolvedValueOnce(null);

      // Upsert returns the new profile
      const newProfile = createMockProfile({
        accuracy: 1.0,
        attempt_count: 1,
        recent_attempts: [createAttempt(true)],
      });
      mockedQueryOne.mockResolvedValueOnce(newProfile);

      const result = await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true);

      expect(result.isNew).toBe(true);
      expect(result.profile).toBeDefined();
      expect(result.profile.user_id).toBe('user-1');
      expect(result.profile.skill_tag).toBe('pre_algebra');
    });

    it('should update an existing profile by appending a new attempt', async () => {
      const existing = createMockProfile({
        recent_attempts: createAttempts([true, true, false]),
        attempt_count: 3,
        accuracy: 2 / 3,
      });
      mockedQueryOne.mockResolvedValueOnce(existing);

      const updatedProfile = createMockProfile({
        accuracy: 0.75,
        attempt_count: 4,
        recent_attempts: [...existing.recent_attempts, createAttempt(true)],
      });
      mockedQueryOne.mockResolvedValueOnce(updatedProfile);

      const result = await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true);

      expect(result.isNew).toBe(false);
      expect(result.profile.attempt_count).toBe(4);
    });

    it('should trim recent_attempts to 20 when exceeding the window size', async () => {
      // Existing profile with 20 attempts (all correct)
      const existing = createMockProfile({
        recent_attempts: createAttempts(Array(20).fill(true)),
        attempt_count: 20,
        accuracy: 1.0,
      });
      mockedQueryOne.mockResolvedValueOnce(existing);

      // After adding one more, should trim oldest and keep 20
      const updatedProfile = createMockProfile({
        accuracy: 19 / 20, // 19 correct + 1 incorrect in window of 20
        attempt_count: 21,
        recent_attempts: createAttempts([...Array(19).fill(true), false]),
      });
      mockedQueryOne.mockResolvedValueOnce(updatedProfile);

      const result = await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, false);

      // Verify the upsert query was called
      expect(mockedQueryOne).toHaveBeenCalledTimes(2);
      // The second call should be the UPSERT
      const upsertCall = mockedQueryOne.mock.calls[1];
      expect(upsertCall[0]).toContain('INSERT INTO weakness_profiles');
      expect(upsertCall[0]).toContain('ON CONFLICT');

      // The recent_attempts passed to the upsert should be serialized JSON of 20 items
      const recentAttemptsParam = JSON.parse(upsertCall[1]![6] as string);
      expect(recentAttemptsParam).toHaveLength(20);
    });

    it('should recalculate accuracy after adding a correct attempt', async () => {
      // 2 correct out of 4 = 0.5 accuracy
      const existing = createMockProfile({
        recent_attempts: createAttempts([true, false, true, false]),
        attempt_count: 4,
        accuracy: 0.5,
      });
      mockedQueryOne.mockResolvedValueOnce(existing);

      const updatedProfile = createMockProfile({ accuracy: 0.6 });
      mockedQueryOne.mockResolvedValueOnce(updatedProfile);

      await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true);

      // After adding true: 3 correct out of 5 = 0.6
      const upsertCall = mockedQueryOne.mock.calls[1];
      const accuracyParam = upsertCall[1]![4] as number;
      expect(accuracyParam).toBe(0.6);
    });

    it('should recalculate accuracy after adding an incorrect attempt', async () => {
      // 3 correct out of 3 = 1.0 accuracy
      const existing = createMockProfile({
        recent_attempts: createAttempts([true, true, true]),
        attempt_count: 3,
        accuracy: 1.0,
      });
      mockedQueryOne.mockResolvedValueOnce(existing);

      const updatedProfile = createMockProfile({ accuracy: 0.75 });
      mockedQueryOne.mockResolvedValueOnce(updatedProfile);

      await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, false);

      // After adding false: 3 correct out of 4 = 0.75
      const upsertCall = mockedQueryOne.mock.calls[1];
      const accuracyParam = upsertCall[1]![4] as number;
      expect(accuracyParam).toBe(0.75);
    });

    it('should increment attempt_count even beyond window size', async () => {
      const existing = createMockProfile({
        recent_attempts: createAttempts(Array(20).fill(true)),
        attempt_count: 50,
        accuracy: 1.0,
      });
      mockedQueryOne.mockResolvedValueOnce(existing);

      const updatedProfile = createMockProfile({ attempt_count: 51 });
      mockedQueryOne.mockResolvedValueOnce(updatedProfile);

      await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true);

      const upsertCall = mockedQueryOne.mock.calls[1];
      const attemptCountParam = upsertCall[1]![5] as number;
      expect(attemptCountParam).toBe(51);
    });

    it('should use UPSERT with ON CONFLICT for atomicity', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);
      const newProfile = createMockProfile();
      mockedQueryOne.mockResolvedValueOnce(newProfile);

      await updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true);

      const upsertCall = mockedQueryOne.mock.calls[1];
      expect(upsertCall[0]).toContain('ON CONFLICT (user_id, skill_tag)');
      expect(upsertCall[0]).toContain('DO UPDATE SET');
      expect(upsertCall[0]).toContain('RETURNING *');
    });

    it('should throw an error if the upsert returns no result', async () => {
      mockedQueryOne.mockResolvedValueOnce(null); // No existing profile
      mockedQueryOne.mockResolvedValueOnce(null); // Upsert fails

      await expect(
        updateWeaknessProfile('user-1', 'pre_algebra', Section.Math, true)
      ).rejects.toThrow('Failed to upsert weakness profile');
    });

    it('should store the new attempt with is_correct and timestamp', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);
      const newProfile = createMockProfile();
      mockedQueryOne.mockResolvedValueOnce(newProfile);

      await updateWeaknessProfile('user-1', 'geometry', Section.Math, false);

      const upsertCall = mockedQueryOne.mock.calls[1];
      const recentAttemptsParam = JSON.parse(upsertCall[1]![6] as string);
      expect(recentAttemptsParam).toHaveLength(1);
      expect(recentAttemptsParam[0].is_correct).toBe(false);
      expect(recentAttemptsParam[0].timestamp).toBeDefined();
    });
  });

  // ─── getWeaknessProfile (single) ─────────────────────────────────────────

  describe('getWeaknessProfile (single skill tag)', () => {
    it('should return the profile for a specific user and skill tag', async () => {
      const profile = createMockProfile();
      mockedQueryOne.mockResolvedValueOnce(profile);

      const result = await getWeaknessProfile('user-1', 'pre_algebra');

      expect(result).toEqual(profile);
      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND skill_tag = $2'),
        ['user-1', 'pre_algebra']
      );
    });

    it('should return null when no profile exists', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await getWeaknessProfile('user-1', 'nonexistent_skill');

      expect(result).toBeNull();
    });
  });

  // ─── getAllWeaknessProfiles ────────────────────────────────────────────────

  describe('getAllWeaknessProfiles', () => {
    it('should return all profiles for a user sorted by accuracy ascending', async () => {
      const profiles = [
        createMockProfile({ skill_tag: 'grammar', accuracy: 0.3 }),
        createMockProfile({ skill_tag: 'pre_algebra', accuracy: 0.5 }),
        createMockProfile({ skill_tag: 'reading_comp', accuracy: 0.8 }),
      ];
      mockedQueryMany.mockResolvedValueOnce(profiles);

      const result = await getAllWeaknessProfiles('user-1');

      expect(result).toHaveLength(3);
      expect(result[0].accuracy).toBe(0.3);
      expect(result[1].accuracy).toBe(0.5);
      expect(result[2].accuracy).toBe(0.8);
      expect(mockedQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY accuracy ASC'),
        ['user-1']
      );
    });

    it('should return an empty array when user has no profiles', async () => {
      mockedQueryMany.mockResolvedValueOnce([]);

      const result = await getAllWeaknessProfiles('user-new');

      expect(result).toEqual([]);
    });
  });

  // ─── getWeakSkillTags ─────────────────────────────────────────────────────

  describe('getWeakSkillTags', () => {
    it('should return profiles with accuracy below the threshold', async () => {
      const weakProfiles = [
        createMockProfile({ skill_tag: 'grammar', accuracy: 0.2 }),
        createMockProfile({ skill_tag: 'pre_algebra', accuracy: 0.5 }),
      ];
      mockedQueryMany.mockResolvedValueOnce(weakProfiles);

      const result = await getWeakSkillTags('user-1', 0.6);

      expect(result).toHaveLength(2);
      expect(result.every((p) => p.accuracy < 0.6)).toBe(true);
      expect(mockedQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND accuracy < $2'),
        ['user-1', 0.6]
      );
    });

    it('should return empty array when all profiles are above threshold', async () => {
      mockedQueryMany.mockResolvedValueOnce([]);

      const result = await getWeakSkillTags('user-1', 0.6);

      expect(result).toEqual([]);
    });

    it('should order results by accuracy ascending (weakest first)', async () => {
      const weakProfiles = [
        createMockProfile({ skill_tag: 'grammar', accuracy: 0.1 }),
        createMockProfile({ skill_tag: 'pre_algebra', accuracy: 0.4 }),
      ];
      mockedQueryMany.mockResolvedValueOnce(weakProfiles);

      const result = await getWeakSkillTags('user-1', 0.6);

      expect(result[0].accuracy).toBeLessThanOrEqual(result[1].accuracy);
      expect(mockedQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY accuracy ASC'),
        ['user-1', 0.6]
      );
    });
  });
});
