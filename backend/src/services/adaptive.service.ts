/**
 * Adaptive Service - Weakness Profile Management & Error Classification
 * Maintains per-student per-skill_tag accuracy over a sliding window of the most recent 20 attempts.
 * Classifies errors as Concept_Gap, Careless_Mistake, or Pacing_Issue.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import { v4 as uuidv4 } from 'uuid';
import { WeaknessProfile, RecentAttempt } from '../models/interfaces';
import { Section, DifficultyLevel, ErrorClassification } from '../models/enums';
import { queryOne, queryMany, query } from '../utils/database';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of recent attempts to keep in the sliding window */
const SLIDING_WINDOW_SIZE = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of updating a weakness profile */
export interface UpdateProfileResult {
  profile: WeaknessProfile;
  isNew: boolean;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Calculate accuracy from an array of recent attempts.
 * Returns the ratio of correct attempts to total attempts.
 * Returns 0 if no attempts exist.
 */
export function calculateAccuracy(recentAttempts: RecentAttempt[]): number {
  if (recentAttempts.length === 0) {
    return 0;
  }
  const correctCount = recentAttempts.filter((a) => a.is_correct).length;
  return correctCount / recentAttempts.length;
}

/**
 * Apply the sliding window to recent attempts.
 * Keeps only the most recent SLIDING_WINDOW_SIZE entries.
 * Assumes attempts are ordered oldest-first (push to end).
 */
export function applySlidingWindow(attempts: RecentAttempt[]): RecentAttempt[] {
  if (attempts.length <= SLIDING_WINDOW_SIZE) {
    return attempts;
  }
  return attempts.slice(attempts.length - SLIDING_WINDOW_SIZE);
}

/**
 * Update the Weakness Profile for a user's skill_tag.
 *
 * Steps:
 * 1. Get or create the weakness profile for user + skill_tag
 * 2. Add the new attempt to recent_attempts (push to end)
 * 3. If recent_attempts > 20 entries, trim to last 20 (sliding window)
 * 4. Recalculate accuracy = correct / total in window
 * 5. Update attempt_count, accuracy, and updated_at
 * 6. Uses UPSERT (INSERT ON CONFLICT UPDATE) for atomicity
 *
 * @param userId - The student's user ID
 * @param skillTag - The skill tag being tracked
 * @param section - The ACT section this skill belongs to
 * @param isCorrect - Whether the current attempt was correct
 * @returns The updated weakness profile and whether it was newly created
 */
export async function updateWeaknessProfile(
  userId: string,
  skillTag: string,
  section: Section,
  isCorrect: boolean
): Promise<UpdateProfileResult> {
  const now = new Date();
  const newAttempt: RecentAttempt = {
    is_correct: isCorrect,
    timestamp: now.toISOString(),
  };

  // Fetch existing profile if it exists
  const existing = await queryOne<WeaknessProfile>(
    `SELECT profile_id, user_id, skill_tag, section, accuracy, attempt_count, recent_attempts, updated_at
     FROM weakness_profiles
     WHERE user_id = $1 AND skill_tag = $2`,
    [userId, skillTag]
  );

  let recentAttempts: RecentAttempt[];
  let attemptCount: number;
  let isNew: boolean;
  let profileId: string;

  if (existing) {
    // Existing profile: append new attempt and apply sliding window
    recentAttempts = [...(existing.recent_attempts || []), newAttempt];
    recentAttempts = applySlidingWindow(recentAttempts);
    attemptCount = existing.attempt_count + 1;
    isNew = false;
    profileId = existing.profile_id;
  } else {
    // New profile: start with just this attempt
    recentAttempts = [newAttempt];
    attemptCount = 1;
    isNew = true;
    profileId = uuidv4();
  }

  // Recalculate accuracy over the sliding window
  const accuracy = calculateAccuracy(recentAttempts);

  // UPSERT: Insert or update on conflict (user_id, skill_tag)
  const result = await queryOne<WeaknessProfile>(
    `INSERT INTO weakness_profiles (profile_id, user_id, skill_tag, section, accuracy, attempt_count, recent_attempts, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, skill_tag)
     DO UPDATE SET
       accuracy = EXCLUDED.accuracy,
       attempt_count = EXCLUDED.attempt_count,
       recent_attempts = EXCLUDED.recent_attempts,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [profileId, userId, skillTag, section, accuracy, attemptCount, JSON.stringify(recentAttempts), now]
  );

  if (!result) {
    throw new Error('Failed to upsert weakness profile');
  }

  return {
    profile: result,
    isNew,
  };
}

/**
 * Get a single weakness profile for a user and skill_tag.
 *
 * @param userId - The student's user ID
 * @param skillTag - The skill tag to look up
 * @returns The weakness profile or null if not found
 */
export async function getWeaknessProfile(
  userId: string,
  skillTag: string
): Promise<WeaknessProfile | null> {
  return queryOne<WeaknessProfile>(
    `SELECT profile_id, user_id, skill_tag, section, accuracy, attempt_count, recent_attempts, updated_at
     FROM weakness_profiles
     WHERE user_id = $1 AND skill_tag = $2`,
    [userId, skillTag]
  );
}

/**
 * Get all weakness profiles for a user.
 *
 * @param userId - The student's user ID
 * @returns Array of all weakness profiles for this user
 */
export async function getAllWeaknessProfiles(
  userId: string
): Promise<WeaknessProfile[]> {
  return queryMany<WeaknessProfile>(
    `SELECT profile_id, user_id, skill_tag, section, accuracy, attempt_count, recent_attempts, updated_at
     FROM weakness_profiles
     WHERE user_id = $1
     ORDER BY accuracy ASC`,
    [userId]
  );
}

/**
 * Get skill tags where the user's accuracy is below a given threshold.
 * Useful for identifying weak areas that need more practice.
 *
 * @param userId - The student's user ID
 * @param threshold - Accuracy threshold (e.g., 0.6 for 60%)
 * @returns Array of weakness profiles where accuracy < threshold, ordered by lowest accuracy first
 */
export async function getWeakSkillTags(
  userId: string,
  threshold: number
): Promise<WeaknessProfile[]> {
  return queryMany<WeaknessProfile>(
    `SELECT profile_id, user_id, skill_tag, section, accuracy, attempt_count, recent_attempts, updated_at
     FROM weakness_profiles
     WHERE user_id = $1 AND accuracy < $2
     ORDER BY accuracy ASC`,
    [userId, threshold]
  );
}


// ─── Error Classification ─────────────────────────────────────────────────────

/** Result of error classification - can have multiple classifications */
export interface ErrorClassificationResult {
  classifications: ErrorClassification[];
}

/** Cache for median response times per difficulty level */
const medianResponseTimeCache: Map<DifficultyLevel, { value: number; timestamp: number }> = new Map();

/** Cache TTL in milliseconds (5 minutes) */
const MEDIAN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Compute the median response time for a given difficulty level.
 * Queries Performance_Records to find the median time_taken for all records
 * at the specified difficulty. Uses an in-memory cache to avoid recomputing on every call.
 *
 * @param difficulty - The difficulty level to compute median for
 * @returns The median response time in seconds, or null if no records exist
 */
export async function getMedianResponseTime(
  difficulty: DifficultyLevel
): Promise<number | null> {
  // Check cache
  const cached = medianResponseTimeCache.get(difficulty);
  const now = Date.now();
  if (cached && now - cached.timestamp < MEDIAN_CACHE_TTL_MS) {
    return cached.value;
  }

  // Query the median using PostgreSQL's percentile_cont
  const result = await queryOne<{ median: number | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pr.time_taken_seconds) AS median
     FROM performance_records pr
     JOIN questions q ON pr.question_id = q.question_id
     WHERE q.difficulty = $1`,
    [difficulty]
  );

  if (!result || result.median === null || result.median === undefined) {
    return null;
  }

  const median = Number(result.median);

  // Update cache
  medianResponseTimeCache.set(difficulty, { value: median, timestamp: now });

  return median;
}

/**
 * Clear the median response time cache.
 * Useful for testing or when a bulk update occurs.
 */
export function clearMedianResponseTimeCache(): void {
  medianResponseTimeCache.clear();
}

/**
 * Classify a student's error based on their performance profile and response timing.
 *
 * Classification rules (from Requirement 5.3):
 * - Concept_Gap: incorrect + (accuracy <= 80% OR < 5 attempts on skill_tag)
 * - Careless_Mistake: incorrect + (accuracy > 80% AND 5+ attempts on skill_tag)
 * - Pacing_Issue: response time > 2× median for that difficulty level
 *
 * A response can be both a concept_gap/careless_mistake AND a pacing_issue.
 *
 * @param userId - The student's user ID
 * @param questionId - The question that was answered (used to determine difficulty)
 * @param isCorrect - Whether the answer was correct
 * @param timeTaken - Response time in seconds
 * @param skillTag - The skill tag of the question
 * @param difficulty - The difficulty level of the question
 * @returns Classification result with one or more error types
 */
export async function classifyError(
  userId: string,
  questionId: string,
  isCorrect: boolean,
  timeTaken: number,
  skillTag: string,
  difficulty: DifficultyLevel
): Promise<ErrorClassificationResult> {
  const classifications: ErrorClassification[] = [];

  // Classify based on correctness and profile
  if (!isCorrect) {
    const profile = await getWeaknessProfile(userId, skillTag);

    if (profile && profile.accuracy > 0.80 && profile.attempt_count >= 5) {
      classifications.push(ErrorClassification.CarelessMistake);
    } else {
      // No profile, accuracy <= 80%, or fewer than 5 attempts → concept_gap
      classifications.push(ErrorClassification.ConceptGap);
    }
  }

  // Check for pacing issue (applies to both correct and incorrect answers)
  const median = await getMedianResponseTime(difficulty);
  if (median !== null && timeTaken > 2 * median) {
    classifications.push(ErrorClassification.PacingIssue);
  }

  return { classifications };
}
