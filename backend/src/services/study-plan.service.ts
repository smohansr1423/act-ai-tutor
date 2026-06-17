/**
 * Study Plan Service - Personalized Study Plan Generation
 * Generates daily practice targets, weekly goals, and projected score ranges
 * based on a student's weakness profile.
 *
 * Requirements: 5.8
 */

import { v4 as uuidv4 } from 'uuid';
import { StudyPlan, DailyTarget, WeeklyGoal, ScoreRange, WeaknessProfile } from '../models/interfaces';
import { getWeakSkillTags } from './adaptive.service';
import { insertOne } from '../utils/database';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Accuracy threshold for identifying weak skill tags */
const WEAK_SKILL_THRESHOLD = 0.6;

/** Study plan validity period in days */
const PLAN_VALIDITY_DAYS = 14;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of generating a study plan */
export interface StudyPlanResult {
  dailyTargets: DailyTarget[];
  weeklyGoals: WeeklyGoal[];
  projectedScoreRange: ScoreRange;
}

/** Error returned when study plan generation fails */
export interface StudyPlanError {
  error: string;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Determine the number of daily practice targets for a skill based on its accuracy.
 *
 * Rules:
 * - accuracy < 30% → 10 targets
 * - accuracy 30-45% → 7 targets
 * - accuracy 45-60% → 4 targets
 *
 * Ensures the result is always between 3 and 10 (inclusive).
 *
 * @param accuracy - The skill's current accuracy (0.0 - 1.0)
 * @returns Number of daily practice targets (3-10)
 */
export function calculateDailyTargetCount(accuracy: number): number {
  if (accuracy < 0.30) {
    return 10;
  } else if (accuracy < 0.45) {
    return 7;
  } else {
    // accuracy >= 0.45 and < 0.60 (since we only process weak skills)
    return 4;
  }
}

/**
 * Generate daily practice targets for a set of weak skill profiles.
 * Each weak skill tag gets between 3 and 10 daily practice targets.
 *
 * @param weakProfiles - Array of weakness profiles with accuracy < 60%
 * @returns Array of daily targets
 */
export function generateDailyTargets(weakProfiles: WeaknessProfile[]): DailyTarget[] {
  return weakProfiles.map((profile) => ({
    skill_tag: profile.skill_tag,
    section: profile.section,
    question_count: calculateDailyTargetCount(profile.accuracy),
  }));
}

/**
 * Generate weekly goals for weak skills.
 * Each weak skill gets a target of reaching 60% accuracy within 1-2 weeks.
 *
 * @param weakProfiles - Array of weakness profiles with accuracy < 60%
 * @returns Array of weekly goals with measurable accuracy thresholds
 */
export function generateWeeklyGoals(weakProfiles: WeaknessProfile[]): WeeklyGoal[] {
  return weakProfiles.map((profile) => ({
    skill_tag: profile.skill_tag,
    target_accuracy: 0.60,
  }));
}

/**
 * Compute projected score range based on current performance.
 * Lower bound: average of current weak skill accuracies (worst case, no improvement)
 * Upper bound: projected accuracy if weak skills reach 60% target
 *
 * The range is expressed as a percentage (0-100).
 *
 * @param weakProfiles - Array of weakness profiles with accuracy < 60%
 * @returns Projected score range with lower and upper bounds
 */
export function computeProjectedScoreRange(weakProfiles: WeaknessProfile[]): ScoreRange {
  if (weakProfiles.length === 0) {
    return { lower: 0, upper: 0 };
  }

  // Lower bound: average of current weak skill accuracies scaled to percentage
  const avgCurrentAccuracy =
    weakProfiles.reduce((sum, p) => sum + p.accuracy, 0) / weakProfiles.length;
  const lower = Math.round(avgCurrentAccuracy * 100);

  // Upper bound: projected accuracy if all weak skills improve to threshold
  const upper = Math.round(WEAK_SKILL_THRESHOLD * 100);

  return { lower, upper };
}

/**
 * Generate a personalized study plan for a user.
 *
 * Steps:
 * 1. Fetch all Weakness_Profiles where accuracy < 60%
 * 2. For each weak Skill_Tag, generate daily practice targets (3-10 based on severity)
 * 3. Generate weekly goals (target each weak skill to 60%+ within 1-2 weeks)
 * 4. Compute projected score range
 * 5. Store in Study_Plans table and return
 *
 * @param userId - The student's user ID
 * @returns Study plan result or error
 */
export async function generateStudyPlan(
  userId: string
): Promise<StudyPlanResult | StudyPlanError> {
  // Validate input
  if (!userId || userId.trim() === '') {
    return { error: 'userId is required' };
  }

  // Step 1: Fetch weak skill tags (accuracy < 60%)
  const weakProfiles = await getWeakSkillTags(userId, WEAK_SKILL_THRESHOLD);

  if (weakProfiles.length === 0) {
    return { error: 'No weak skill tags found. Student has no skills below 60% accuracy.' };
  }

  // Step 2: Generate daily practice targets
  const dailyTargets = generateDailyTargets(weakProfiles);

  // Step 3: Generate weekly goals
  const weeklyGoals = generateWeeklyGoals(weakProfiles);

  // Step 4: Compute projected score range
  const projectedScoreRange = computeProjectedScoreRange(weakProfiles);

  // Step 5: Store in Study_Plans table
  const planId = uuidv4();
  const now = new Date();
  const validUntil = new Date(now.getTime() + PLAN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  await insertOne<StudyPlan>(
    `INSERT INTO study_plans (plan_id, user_id, daily_targets, weekly_goals, projected_score_range, created_at, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      planId,
      userId,
      JSON.stringify(dailyTargets),
      JSON.stringify(weeklyGoals),
      JSON.stringify(projectedScoreRange),
      now,
      validUntil,
    ]
  );

  return {
    dailyTargets,
    weeklyGoals,
    projectedScoreRange,
  };
}

/**
 * Type guard to check if a result is a StudyPlanError.
 */
export function isStudyPlanError(result: StudyPlanResult | StudyPlanError): result is StudyPlanError {
  return 'error' in result;
}
