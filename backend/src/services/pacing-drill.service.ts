/**
 * Pacing Drill Service
 * Generates timed practice sets with progressively shorter time limits
 * to help students improve their pacing on ACT questions.
 *
 * Requirements: 5.7
 * Property 16: Pacing Drill Time Progression
 */

import { Question } from '../models/interfaces';
import { queryMany } from '../utils/database';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Starting time limit in seconds for the first question */
export const BASE_TIME_SECONDS = 120;

/** Time decrease per question in seconds */
export const TIME_DECREMENT_SECONDS = 10;

/** Minimum number of questions in a pacing drill */
export const MIN_DRILL_SIZE = 5;

/** Maximum number of questions in a pacing drill */
export const MAX_DRILL_SIZE = 10;

/** Default drill size when severity is not specified */
export const DEFAULT_DRILL_SIZE = 8;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Input for generating a pacing drill */
export interface PacingDrillRequest {
  userId: string;
  skillTag: string;
}

/** Output of a pacing drill generation */
export interface PacingDrillResult {
  questions: PacingDrillQuestion[];
  timeLimits: number[];
}

/** A question included in the pacing drill (safe delivery - no answers) */
export interface PacingDrillQuestion {
  questionId: string;
  questionText: string;
  passage: string | null;
  options: string[];
  skillTag: string;
  difficulty: string;
}

/** Error result from pacing drill generation */
export interface PacingDrillError {
  error: string;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Generate the time limits array for a pacing drill.
 * Formula: 120 - (i × 10) seconds for question i (0-indexed).
 *
 * For N questions, returns a strictly decreasing sequence:
 * - N=5: [120, 110, 100, 90, 80]
 * - N=8: [120, 110, 100, 90, 80, 70, 60, 50]
 * - N=10: [120, 110, 100, 90, 80, 70, 60, 50, 40, 30]
 *
 * @param drillSize - Number of questions (5-10)
 * @returns Array of time limits in seconds
 */
export function generateTimeLimits(drillSize: number): number[] {
  const clampedSize = Math.max(MIN_DRILL_SIZE, Math.min(MAX_DRILL_SIZE, drillSize));
  const timeLimits: number[] = [];

  for (let i = 0; i < clampedSize; i++) {
    timeLimits.push(BASE_TIME_SECONDS - i * TIME_DECREMENT_SECONDS);
  }

  return timeLimits;
}

/**
 * Determine the drill size based on available data.
 * Defaults to DEFAULT_DRILL_SIZE (8) when no specific severity info is available.
 * Clamps to [MIN_DRILL_SIZE, MAX_DRILL_SIZE] range.
 *
 * @param severity - Optional severity indicator (0.0 to 1.0 scale, higher = worse pacing)
 * @returns Drill size between 5 and 10
 */
export function determineDrillSize(severity?: number): number {
  if (severity === undefined || severity === null) {
    return DEFAULT_DRILL_SIZE;
  }

  // Map severity 0.0-1.0 to drill size 5-10
  // Lower severity = fewer questions, higher severity = more questions
  const size = Math.round(MIN_DRILL_SIZE + severity * (MAX_DRILL_SIZE - MIN_DRILL_SIZE));
  return Math.max(MIN_DRILL_SIZE, Math.min(MAX_DRILL_SIZE, size));
}

/**
 * Format a question for pacing drill delivery.
 * Strips answer-revealing fields for safe delivery to the client.
 *
 * @param question - Full question from the database
 * @returns Safe question for client delivery
 */
export function formatDrillQuestion(question: Question): PacingDrillQuestion {
  return {
    questionId: question.question_id,
    questionText: question.question_text,
    passage: question.passage,
    options: question.options,
    skillTag: question.skill_tag,
    difficulty: question.difficulty,
  };
}

/**
 * Type guard for PacingDrillError.
 */
export function isPacingDrillError(
  result: PacingDrillResult | PacingDrillError
): result is PacingDrillError {
  return 'error' in result;
}

/**
 * Generate a pacing drill for a user with progressively shorter time limits.
 *
 * Steps:
 * 1. Determine drill size (default 8, or based on severity)
 * 2. Fetch questions from Question_Bank filtered by skillTag
 * 3. Generate time limits: 120 - (i × 10) seconds for each question i
 * 4. Return questions and time limits
 *
 * @param request - Contains userId and skillTag
 * @param severity - Optional pacing issue severity (0.0-1.0)
 * @returns Pacing drill with questions and time limits, or error
 */
export async function generatePacingDrill(
  request: PacingDrillRequest,
  severity?: number
): Promise<PacingDrillResult | PacingDrillError> {
  const { userId, skillTag } = request;

  // Validate inputs
  if (!userId || userId.trim() === '') {
    return { error: 'userId is required' };
  }

  if (!skillTag || skillTag.trim() === '') {
    return { error: 'skillTag is required' };
  }

  // Determine drill size
  const drillSize = determineDrillSize(severity);

  // Fetch questions filtered by skillTag
  const questions = await queryMany<Question>(
    `SELECT question_id, section, question_text, passage, options, correct_answer,
            explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
     FROM questions
     WHERE skill_tag = $1
     ORDER BY RANDOM()
     LIMIT $2`,
    [skillTag, drillSize]
  );

  if (questions.length === 0) {
    return { error: `No questions available for skill tag: ${skillTag}` };
  }

  // If we got fewer questions than requested, use what we have (minimum 5)
  const actualSize = questions.length;
  if (actualSize < MIN_DRILL_SIZE) {
    return { error: `Insufficient questions for pacing drill. Found ${actualSize}, need at least ${MIN_DRILL_SIZE}` };
  }

  // Generate time limits for the actual number of questions
  const timeLimits = generateTimeLimits(actualSize);

  // Format questions for safe delivery (no answers)
  const drillQuestions = questions.map(formatDrillQuestion);

  return {
    questions: drillQuestions,
    timeLimits,
  };
}
