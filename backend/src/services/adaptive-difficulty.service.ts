/**
 * Adaptive Difficulty Service
 * Selects the appropriate difficulty level based on a student's Weakness Profile.
 *
 * Rules:
 * - attempt_count < 5 → Medium difficulty, no time limit, no explanation
 * - attempt_count >= 5 AND accuracy < 0.60 → Easy + concept explanation
 * - attempt_count >= 5 AND 0.60 <= accuracy <= 0.80 → Medium + 90s time limit
 * - attempt_count >= 5 AND accuracy > 0.80 → Hard + 60s time limit
 *
 * Requirements: 5.4, 5.5, 5.6, 5.9
 */

import { DifficultyLevel } from '../models/enums';
import { getWeaknessProfile } from './adaptive.service';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Result of adaptive difficulty selection */
export interface DifficultySelection {
  difficulty: DifficultyLevel;
  timeLimit: number | null;
  includeExplanation: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum attempts before adaptive rules apply */
const MIN_ATTEMPTS_THRESHOLD = 5;

/** Accuracy threshold below which Easy difficulty is selected */
const LOW_ACCURACY_THRESHOLD = 0.60;

/** Accuracy threshold above which Hard difficulty is selected */
const HIGH_ACCURACY_THRESHOLD = 0.80;

/** Time limit for medium difficulty with sufficient attempts (seconds) */
const MEDIUM_TIME_LIMIT = 90;

/** Time limit for hard difficulty (seconds) */
const HARD_TIME_LIMIT = 60;

// ─── Core Function ────────────────────────────────────────────────────────────

/**
 * Select the appropriate difficulty based on attempt count and accuracy.
 * This is the pure logic function that can be tested without database dependencies.
 *
 * @param attemptCount - Number of attempts the student has made for this skill tag
 * @param accuracy - The student's accuracy (0.0 to 1.0) for this skill tag
 * @returns DifficultySelection with difficulty, timeLimit, and includeExplanation
 */
export function selectDifficultyFromProfile(
  attemptCount: number,
  accuracy: number
): DifficultySelection {
  // Rule 1: Less than 5 attempts → Medium (insufficient data)
  if (attemptCount < MIN_ATTEMPTS_THRESHOLD) {
    return {
      difficulty: DifficultyLevel.Medium,
      timeLimit: null,
      includeExplanation: false,
    };
  }

  // Rule 2: 5+ attempts, accuracy < 60% → Easy + explanation
  if (accuracy < LOW_ACCURACY_THRESHOLD) {
    return {
      difficulty: DifficultyLevel.Easy,
      timeLimit: null,
      includeExplanation: true,
    };
  }

  // Rule 3: 5+ attempts, accuracy 60-80% → Medium + 90s time limit
  if (accuracy <= HIGH_ACCURACY_THRESHOLD) {
    return {
      difficulty: DifficultyLevel.Medium,
      timeLimit: MEDIUM_TIME_LIMIT,
      includeExplanation: false,
    };
  }

  // Rule 4: 5+ attempts, accuracy > 80% → Hard + 60s time limit
  return {
    difficulty: DifficultyLevel.Hard,
    timeLimit: HARD_TIME_LIMIT,
    includeExplanation: false,
  };
}

/**
 * Select difficulty for a user and skill tag by fetching the Weakness Profile from the database.
 *
 * @param userId - The student's user ID
 * @param skillTag - The skill tag to check
 * @returns DifficultySelection based on the student's profile
 */
export async function selectDifficulty(
  userId: string,
  skillTag: string
): Promise<DifficultySelection> {
  // Fetch the weakness profile for this user + skill tag
  const profile = await getWeaknessProfile(userId, skillTag);

  // If no profile exists, treat as < 5 attempts (default to Medium)
  if (!profile) {
    return {
      difficulty: DifficultyLevel.Medium,
      timeLimit: null,
      includeExplanation: false,
    };
  }

  return selectDifficultyFromProfile(profile.attempt_count, profile.accuracy);
}
