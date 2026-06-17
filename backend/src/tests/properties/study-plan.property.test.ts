/**
 * Property-Based Tests for Study Plan Structure
 * Feature: act-ai-tutor-app, Property 17: Study Plan Structure
 *
 * **Validates: Requirements 5.8**
 *
 * For any generated Study_Plan, it SHALL contain between 3 and 10 daily practice targets
 * for each Skill_Tag with accuracy below 60%, weekly goals with measurable accuracy thresholds,
 * and a projected score range consisting of a lower and upper bound.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Section } from '../../models/enums';
import { WeaknessProfile } from '../../models/interfaces';
import {
  calculateDailyTargetCount,
  generateDailyTargets,
  generateWeeklyGoals,
  computeProjectedScoreRange,
} from '../../services/study-plan.service';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generator for a valid Section value */
const sectionArb = fc.constantFrom(
  Section.English,
  Section.Math,
  Section.Reading,
  Section.Science
);

/** Generator for valid skill tag strings */
const skillTagArb = fc.constantFrom(
  'algebra', 'geometry', 'trigonometry', 'grammar',
  'punctuation', 'reading-comprehension', 'data-interpretation',
  'scientific-reasoning', 'pre-algebra', 'rhetoric'
);

/**
 * Generator for a WeaknessProfile with accuracy below 60%.
 * These are the weak profiles that the study plan is built from.
 */
const weakProfileArb = fc.record({
  profile_id: fc.uuid(),
  user_id: fc.uuid(),
  skill_tag: skillTagArb,
  section: sectionArb,
  accuracy: fc.double({ min: 0.0, max: 0.59, noNaN: true }),
  attempt_count: fc.integer({ min: 5, max: 100 }),
  recent_attempts: fc.array(
    fc.record({
      is_correct: fc.boolean(),
      timestamp: fc.date().map((d) => d.toISOString()),
    }),
    { minLength: 5, maxLength: 20 }
  ),
  updated_at: fc.date(),
}) as fc.Arbitrary<WeaknessProfile>;

/**
 * Generator for an array of 1-10 unique weak profiles.
 * Uses unique skill tags to simulate distinct weak areas.
 */
const weakProfilesArb = fc
  .uniqueArray(weakProfileArb, {
    minLength: 1,
    maxLength: 10,
    selector: (p) => p.skill_tag,
  });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 17: Study Plan Structure', () => {
  /**
   * Property: For any weak skill accuracy below 60%, calculateDailyTargetCount
   * SHALL return a value between 3 and 10 (inclusive).
   */
  it('daily target count SHALL be between 3 and 10 for any accuracy below 60%', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0, max: 0.59, noNaN: true }),
        (accuracy) => {
          const count = calculateDailyTargetCount(accuracy);
          expect(count).toBeGreaterThanOrEqual(3);
          expect(count).toBeLessThanOrEqual(10);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any set of weak profiles, generateDailyTargets SHALL produce
   * exactly one daily target per weak Skill_Tag, each with question_count between 3 and 10.
   */
  it('daily targets SHALL contain between 3 and 10 practice targets for each weak Skill_Tag', () => {
    fc.assert(
      fc.property(weakProfilesArb, (profiles) => {
        const dailyTargets = generateDailyTargets(profiles);

        // One target per weak profile
        expect(dailyTargets).toHaveLength(profiles.length);

        for (const target of dailyTargets) {
          // Each target has between 3 and 10 questions
          expect(target.question_count).toBeGreaterThanOrEqual(3);
          expect(target.question_count).toBeLessThanOrEqual(10);

          // Each target has a valid skill_tag and section
          expect(target.skill_tag).toBeTruthy();
          expect(Object.values(Section)).toContain(target.section);
        }

        // Each weak skill tag is represented in the daily targets
        for (const profile of profiles) {
          const matching = dailyTargets.find((t) => t.skill_tag === profile.skill_tag);
          expect(matching).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any set of weak profiles, generateWeeklyGoals SHALL produce
   * one goal per weak Skill_Tag with a measurable accuracy threshold (numeric target).
   */
  it('weekly goals SHALL have measurable accuracy thresholds for each weak Skill_Tag', () => {
    fc.assert(
      fc.property(weakProfilesArb, (profiles) => {
        const weeklyGoals = generateWeeklyGoals(profiles);

        // One goal per weak profile
        expect(weeklyGoals).toHaveLength(profiles.length);

        for (const goal of weeklyGoals) {
          // Each goal has a valid skill_tag
          expect(goal.skill_tag).toBeTruthy();

          // Each goal has a measurable accuracy threshold (numeric between 0 and 1)
          expect(typeof goal.target_accuracy).toBe('number');
          expect(goal.target_accuracy).toBeGreaterThan(0);
          expect(goal.target_accuracy).toBeLessThanOrEqual(1);
        }

        // Each weak skill tag is represented in the weekly goals
        for (const profile of profiles) {
          const matching = weeklyGoals.find((g) => g.skill_tag === profile.skill_tag);
          expect(matching).toBeDefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any set of weak profiles, computeProjectedScoreRange SHALL produce
   * a score range with a numeric lower bound and upper bound where lower <= upper.
   */
  it('projected score range SHALL consist of a lower and upper bound with lower <= upper', () => {
    fc.assert(
      fc.property(weakProfilesArb, (profiles) => {
        const scoreRange = computeProjectedScoreRange(profiles);

        // Must have lower and upper bounds as numbers
        expect(typeof scoreRange.lower).toBe('number');
        expect(typeof scoreRange.upper).toBe('number');

        // Lower bound must not exceed upper bound
        expect(scoreRange.lower).toBeLessThanOrEqual(scoreRange.upper);

        // Bounds should be non-negative (percentage-based)
        expect(scoreRange.lower).toBeGreaterThanOrEqual(0);
        expect(scoreRange.upper).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The complete study plan structure for any set of weak profiles SHALL
   * contain all three required components: dailyTargets, weeklyGoals, and projectedScoreRange.
   */
  it('study plan SHALL contain dailyTargets, weeklyGoals, and projectedScoreRange', () => {
    fc.assert(
      fc.property(weakProfilesArb, (profiles) => {
        const dailyTargets = generateDailyTargets(profiles);
        const weeklyGoals = generateWeeklyGoals(profiles);
        const projectedScoreRange = computeProjectedScoreRange(profiles);

        // All three components must be present and non-empty arrays / objects
        expect(dailyTargets.length).toBeGreaterThanOrEqual(1);
        expect(weeklyGoals.length).toBeGreaterThanOrEqual(1);
        expect(projectedScoreRange).toHaveProperty('lower');
        expect(projectedScoreRange).toHaveProperty('upper');

        // The number of daily targets and weekly goals must match the number of weak skills
        expect(dailyTargets.length).toBe(profiles.length);
        expect(weeklyGoals.length).toBe(profiles.length);
      }),
      { numRuns: 100 }
    );
  });
});
