/**
 * Unit tests for Study Plan Service
 * Tests Requirements: 5.8
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database module
vi.mock('../utils/database', () => ({
  insertOne: vi.fn(),
  queryMany: vi.fn(),
  queryOne: vi.fn(),
  query: vi.fn(),
}));

import {
  generateStudyPlan,
  isStudyPlanError,
  calculateDailyTargetCount,
  generateDailyTargets,
  generateWeeklyGoals,
  computeProjectedScoreRange,
} from './study-plan.service';
import { getWeakSkillTags } from './adaptive.service';
import { insertOne } from '../utils/database';
import { Section } from '../models/enums';
import { WeaknessProfile } from '../models/interfaces';

// Mock the adaptive service
vi.mock('./adaptive.service', () => ({
  getWeakSkillTags: vi.fn(),
}));

const mockedGetWeakSkillTags = vi.mocked(getWeakSkillTags);
const mockedInsertOne = vi.mocked(insertOne);

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createMockWeaknessProfile(overrides?: Partial<WeaknessProfile>): WeaknessProfile {
  return {
    profile_id: 'profile-' + Math.random().toString(36).substring(7),
    user_id: 'user-1',
    skill_tag: 'pre_algebra',
    section: Section.Math,
    accuracy: 0.4,
    attempt_count: 10,
    recent_attempts: [
      { is_correct: true, timestamp: new Date().toISOString() },
      { is_correct: false, timestamp: new Date().toISOString() },
    ],
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Study Plan Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('calculateDailyTargetCount', () => {
    it('should return 10 targets for accuracy < 30%', () => {
      expect(calculateDailyTargetCount(0.0)).toBe(10);
      expect(calculateDailyTargetCount(0.15)).toBe(10);
      expect(calculateDailyTargetCount(0.29)).toBe(10);
    });

    it('should return 7 targets for accuracy 30-45%', () => {
      expect(calculateDailyTargetCount(0.30)).toBe(7);
      expect(calculateDailyTargetCount(0.37)).toBe(7);
      expect(calculateDailyTargetCount(0.44)).toBe(7);
    });

    it('should return 4 targets for accuracy 45-60%', () => {
      expect(calculateDailyTargetCount(0.45)).toBe(4);
      expect(calculateDailyTargetCount(0.50)).toBe(4);
      expect(calculateDailyTargetCount(0.59)).toBe(4);
    });
  });

  describe('generateDailyTargets', () => {
    it('should generate daily targets for each weak profile', () => {
      const profiles = [
        createMockWeaknessProfile({ skill_tag: 'algebra', section: Section.Math, accuracy: 0.20 }),
        createMockWeaknessProfile({ skill_tag: 'grammar', section: Section.English, accuracy: 0.40 }),
        createMockWeaknessProfile({ skill_tag: 'inference', section: Section.Reading, accuracy: 0.55 }),
      ];

      const targets = generateDailyTargets(profiles);

      expect(targets).toHaveLength(3);
      expect(targets[0]).toEqual({ skill_tag: 'algebra', section: Section.Math, question_count: 10 });
      expect(targets[1]).toEqual({ skill_tag: 'grammar', section: Section.English, question_count: 7 });
      expect(targets[2]).toEqual({ skill_tag: 'inference', section: Section.Reading, question_count: 4 });
    });

    it('should return empty array for no profiles', () => {
      const targets = generateDailyTargets([]);
      expect(targets).toEqual([]);
    });

    it('should always generate between 3 and 10 targets per skill', () => {
      const profiles = [
        createMockWeaknessProfile({ accuracy: 0.0 }),
        createMockWeaknessProfile({ accuracy: 0.29 }),
        createMockWeaknessProfile({ accuracy: 0.30 }),
        createMockWeaknessProfile({ accuracy: 0.44 }),
        createMockWeaknessProfile({ accuracy: 0.45 }),
        createMockWeaknessProfile({ accuracy: 0.59 }),
      ];

      const targets = generateDailyTargets(profiles);

      for (const target of targets) {
        expect(target.question_count).toBeGreaterThanOrEqual(3);
        expect(target.question_count).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('generateWeeklyGoals', () => {
    it('should set target accuracy to 60% for each weak skill', () => {
      const profiles = [
        createMockWeaknessProfile({ skill_tag: 'algebra', accuracy: 0.20 }),
        createMockWeaknessProfile({ skill_tag: 'grammar', accuracy: 0.50 }),
      ];

      const goals = generateWeeklyGoals(profiles);

      expect(goals).toHaveLength(2);
      expect(goals[0]).toEqual({ skill_tag: 'algebra', target_accuracy: 0.60 });
      expect(goals[1]).toEqual({ skill_tag: 'grammar', target_accuracy: 0.60 });
    });

    it('should return empty array for no profiles', () => {
      const goals = generateWeeklyGoals([]);
      expect(goals).toEqual([]);
    });
  });

  describe('computeProjectedScoreRange', () => {
    it('should compute lower bound from average current accuracy', () => {
      const profiles = [
        createMockWeaknessProfile({ accuracy: 0.20 }),
        createMockWeaknessProfile({ accuracy: 0.40 }),
      ];

      const range = computeProjectedScoreRange(profiles);

      // Average = (0.20 + 0.40) / 2 = 0.30 → 30
      expect(range.lower).toBe(30);
    });

    it('should set upper bound to 60 (the target threshold)', () => {
      const profiles = [
        createMockWeaknessProfile({ accuracy: 0.20 }),
        createMockWeaknessProfile({ accuracy: 0.40 }),
      ];

      const range = computeProjectedScoreRange(profiles);

      expect(range.upper).toBe(60);
    });

    it('should return { lower: 0, upper: 0 } for no profiles', () => {
      const range = computeProjectedScoreRange([]);
      expect(range).toEqual({ lower: 0, upper: 0 });
    });

    it('should have lower bound less than or equal to upper bound', () => {
      const profiles = [
        createMockWeaknessProfile({ accuracy: 0.55 }),
      ];

      const range = computeProjectedScoreRange(profiles);

      expect(range.lower).toBeLessThanOrEqual(range.upper);
    });
  });

  describe('generateStudyPlan', () => {
    it('should return error when userId is empty', async () => {
      const result = await generateStudyPlan('');

      expect(isStudyPlanError(result)).toBe(true);
      if (isStudyPlanError(result)) {
        expect(result.error).toContain('userId is required');
      }
    });

    it('should return error when no weak skill tags are found', async () => {
      mockedGetWeakSkillTags.mockResolvedValueOnce([]);

      const result = await generateStudyPlan('user-1');

      expect(isStudyPlanError(result)).toBe(true);
      if (isStudyPlanError(result)) {
        expect(result.error).toContain('No weak skill tags found');
      }
    });

    it('should generate a valid study plan with daily targets, weekly goals, and score range', async () => {
      const weakProfiles = [
        createMockWeaknessProfile({ skill_tag: 'algebra', section: Section.Math, accuracy: 0.25 }),
        createMockWeaknessProfile({ skill_tag: 'grammar', section: Section.English, accuracy: 0.50 }),
      ];

      mockedGetWeakSkillTags.mockResolvedValueOnce(weakProfiles);
      mockedInsertOne.mockResolvedValueOnce({} as any);

      const result = await generateStudyPlan('user-1');

      expect(isStudyPlanError(result)).toBe(false);
      if (!isStudyPlanError(result)) {
        // Daily targets
        expect(result.dailyTargets).toHaveLength(2);
        expect(result.dailyTargets[0].skill_tag).toBe('algebra');
        expect(result.dailyTargets[0].question_count).toBe(10); // accuracy < 30%
        expect(result.dailyTargets[1].skill_tag).toBe('grammar');
        expect(result.dailyTargets[1].question_count).toBe(4); // accuracy 45-60%

        // Weekly goals
        expect(result.weeklyGoals).toHaveLength(2);
        expect(result.weeklyGoals[0].target_accuracy).toBe(0.60);
        expect(result.weeklyGoals[1].target_accuracy).toBe(0.60);

        // Projected score range
        expect(result.projectedScoreRange.lower).toBeGreaterThanOrEqual(0);
        expect(result.projectedScoreRange.upper).toBeGreaterThanOrEqual(result.projectedScoreRange.lower);
      }
    });

    it('should call getWeakSkillTags with threshold 0.6', async () => {
      mockedGetWeakSkillTags.mockResolvedValueOnce([]);

      await generateStudyPlan('user-1');

      expect(mockedGetWeakSkillTags).toHaveBeenCalledWith('user-1', 0.6);
    });

    it('should store the plan in the database', async () => {
      const weakProfiles = [
        createMockWeaknessProfile({ skill_tag: 'algebra', section: Section.Math, accuracy: 0.35 }),
      ];

      mockedGetWeakSkillTags.mockResolvedValueOnce(weakProfiles);
      mockedInsertOne.mockResolvedValueOnce({} as any);

      await generateStudyPlan('user-1');

      expect(mockedInsertOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO study_plans'),
        expect.arrayContaining([
          expect.any(String), // planId (UUID)
          'user-1',
          expect.any(String), // daily_targets JSON
          expect.any(String), // weekly_goals JSON
          expect.any(String), // projected_score_range JSON
          expect.any(Date),   // created_at
          expect.any(Date),   // valid_until
        ])
      );
    });

    it('should generate targets between 3 and 10 for each weak skill', async () => {
      const weakProfiles = [
        createMockWeaknessProfile({ skill_tag: 'skill_a', accuracy: 0.10 }),
        createMockWeaknessProfile({ skill_tag: 'skill_b', accuracy: 0.35 }),
        createMockWeaknessProfile({ skill_tag: 'skill_c', accuracy: 0.55 }),
      ];

      mockedGetWeakSkillTags.mockResolvedValueOnce(weakProfiles);
      mockedInsertOne.mockResolvedValueOnce({} as any);

      const result = await generateStudyPlan('user-1');

      expect(isStudyPlanError(result)).toBe(false);
      if (!isStudyPlanError(result)) {
        for (const target of result.dailyTargets) {
          expect(target.question_count).toBeGreaterThanOrEqual(3);
          expect(target.question_count).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe('isStudyPlanError', () => {
    it('should return true for error objects', () => {
      expect(isStudyPlanError({ error: 'some error' })).toBe(true);
    });

    it('should return false for valid study plan results', () => {
      expect(
        isStudyPlanError({
          dailyTargets: [],
          weeklyGoals: [],
          projectedScoreRange: { lower: 30, upper: 60 },
        })
      ).toBe(false);
    });
  });
});
