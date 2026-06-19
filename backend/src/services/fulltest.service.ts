/**
 * Full Test Service - Session Start, Timer Expiry Auto-Submit, and Score Summary
 *
 * Handles:
 * - Full test session start with section-specific question counts and timers
 * - Auto-submit on timer expiry: submit answered questions, mark unanswered as skipped
 * - Score summary generation: correct count, total count, per-question details
 * - Complete within 2 seconds of timer expiry
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, Question } from '../models/interfaces';
import {
  Section,
  SessionSection,
  SessionType,
  SessionStatus,
} from '../models/enums';
import { queryOne, queryMany, query, insertOne, withTransaction } from '../utils/database';
import { getSessionState, setSessionState, deleteSessionState } from '../utils/cache';
import { formatQuestionDelivery, QuestionDelivery, shuffleArray } from './session.service';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request to start a full test session */
export interface StartFullTestRequest {
  userId: string;
  section: SessionSection;
}

/** Response when starting a full test session */
export interface StartFullTestResponse {
  sessionId: string;
  questions: QuestionDelivery[];
  timeLimit: number;
}

/** An individual answer submitted by the student */
export interface SubmittedAnswer {
  questionIndex: number;
  selectedAnswer: string;
}

/** Request body for full test submission */
export interface FullTestSubmitRequest {
  sessionId: string;
  answers: SubmittedAnswer[];
}

/** Per-question detail in the score summary */
export interface QuestionScoreDetail {
  questionId: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

/** Score summary returned after full test submission */
export interface FullTestScoreSummary {
  correct: number;
  total: number;
}

/** Full response from submitting a full test */
export interface FullTestSubmitResponse {
  score: FullTestScoreSummary;
  details: QuestionScoreDetail[];
}

/** Error result for full test operations */
export interface FullTestError {
  error: string;
}

export type FullTestStartResult = StartFullTestResponse | FullTestError;
export type FullTestSubmitResult = FullTestSubmitResponse | FullTestError;

/** Cached full test session state (stored in Redis) */
export interface FullTestSessionState {
  sessionId: string;
  userId: string;
  section: string;
  questionIds: string[];
  answers: Record<number, string>; // questionIndex -> selectedAnswer
  currentIndex: number;
  timeLimit: number;
  startedAt: string;
}

/** Question data needed for scoring */
export interface QuestionForScoring {
  question_id: string;
  correct_answer: string;
  explanation: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Section-specific configuration for Full Test Mode.
 * Maps each section to its required question count and time limit in seconds.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export const FULL_TEST_CONFIG: Record<string, { questionCount: number; timeLimitSeconds: number }> = {
  [SessionSection.English]: { questionCount: 75, timeLimitSeconds: 2700 },  // 45 minutes
  [SessionSection.Math]: { questionCount: 60, timeLimitSeconds: 3600 },     // 60 minutes
  [SessionSection.Reading]: { questionCount: 40, timeLimitSeconds: 2100 },  // 35 minutes
  [SessionSection.Science]: { questionCount: 40, timeLimitSeconds: 2100 },  // 35 minutes
};

/** TTL for full test session state in Redis (24 hours for interrupted session resume) */
const FULL_TEST_SESSION_TTL = 86400;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Check if a result is a FullTestError.
 */
export function isFullTestError(result: FullTestStartResult | FullTestSubmitResult | SaveProgressResult): result is FullTestError {
  return 'error' in result;
}

/**
 * Maps a SessionSection to a Section filter for database queries.
 */
function getFullTestSectionFilter(section: SessionSection): Section | null {
  switch (section) {
    case SessionSection.English:
      return Section.English;
    case SessionSection.Math:
      return Section.Math;
    case SessionSection.Reading:
      return Section.Reading;
    case SessionSection.Science:
      return Section.Science;
    default:
      return null;
  }
}

// ─── Full Test Start ──────────────────────────────────────────────────────────

/**
 * Start a new full test session.
 *
 * Flow:
 * 1. Validate inputs (userId required, section must be a valid single section)
 * 2. Look up section-specific configuration (question count, time limit)
 * 3. Fetch the required number of questions from the Question_Bank for that section
 * 4. Create a session record in the database with session_type='full_test' and time_limit_seconds
 * 5. Store session state in Redis for fast retrieval during the test
 * 6. Return sessionId, all questions (without correct answers), and timeLimit
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export async function startFullTest(
  request: StartFullTestRequest
): Promise<FullTestStartResult> {
  const { userId, section } = request;

  // Step 1: Validate inputs
  if (!userId || typeof userId !== 'string') {
    return { error: 'userId is required' };
  }

  if (!section || typeof section !== 'string') {
    return { error: 'section is required' };
  }

  // Full test mode only supports specific sections, not 'mixed'
  const validSections = [SessionSection.English, SessionSection.Math, SessionSection.Reading, SessionSection.Science];
  if (!validSections.includes(section)) {
    return { error: 'Invalid section for full test. Must be one of: english, math, reading, science' };
  }

  // Step 2: Look up section-specific configuration
  const config = FULL_TEST_CONFIG[section];
  if (!config) {
    return { error: 'Configuration not found for section' };
  }

  const { questionCount, timeLimitSeconds } = config;

  // Step 3: Fetch the required number of questions for the section
  const sectionFilter = getFullTestSectionFilter(section);
  const questions = await queryMany<Question>(
    `SELECT question_id, section, question_text, passage, options, correct_answer,
            explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
     FROM questions
     WHERE section = $1
     ORDER BY RANDOM()
     LIMIT $2`,
    [sectionFilter, questionCount]
  );

  if (questions.length === 0) {
    return { error: 'No questions available for the selected section. Please try again later.' };
  }

  if (questions.length < questionCount) {
    return { error: `Insufficient questions available for ${section}. Required: ${questionCount}, Available: ${questions.length}` };
  }

  // Shuffle for extra randomness
  const shuffledQuestions = shuffleArray(questions);

  // Step 4: Create session record in database
  const sessionId = uuidv4();
  const now = new Date();

  const session: Session = await insertOne<Session>(
    `INSERT INTO sessions (session_id, user_id, session_type, section, status, started_at, completed_at, time_limit_seconds, time_remaining_seconds, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      sessionId,
      userId,
      SessionType.FullTest,
      section,
      SessionStatus.Active,
      now,
      null,
      timeLimitSeconds,
      timeLimitSeconds, // time_remaining starts at the full limit
      null,
    ]
  );

  // Step 5: Store session state in Redis
  const questionIds = shuffledQuestions.map((q) => q.question_id);
  const sessionState: FullTestSessionState = {
    sessionId,
    userId,
    section,
    questionIds,
    answers: {},
    currentIndex: 0,
    timeLimit: timeLimitSeconds,
    startedAt: now.toISOString(),
  };

  await setSessionState(sessionId, sessionState, FULL_TEST_SESSION_TTL);

  // Step 6: Return sessionId, questions (without correct answers), and timeLimit
  const questionDeliveries: QuestionDelivery[] = shuffledQuestions.map(formatQuestionDelivery);

  return {
    sessionId: session.session_id,
    questions: questionDeliveries,
    timeLimit: timeLimitSeconds,
  };
}

// ─── Pure Scoring Function ────────────────────────────────────────────────────

/**
 * computeFullTestScore - Pure function that computes the full test score summary.
 *
 * Given:
 * - questions: Array of questions with their correct answers and explanations (ordered by index)
 * - answers: Array of submitted answers (questionIndex → selectedAnswer)
 *
 * Returns:
 * - score: { correct, total }
 * - details: per-question breakdown with correctness, selected answer, correct answer, explanation
 *
 * Logic:
 * - For each question in the test:
 *   - If the student answered (present in answers array): compare selectedAnswer to correct_answer
 *   - If the student did NOT answer (not in answers array): mark as skipped (selectedAnswer = null, isCorrect = false)
 *
 * This function is pure (no side effects) and easily testable.
 *
 * Validates: Requirements 4.6, 4.7
 */
export function computeFullTestScore(
  questions: QuestionForScoring[],
  answers: SubmittedAnswer[]
): { score: FullTestScoreSummary; details: QuestionScoreDetail[] } {
  const total = questions.length;

  // Build a lookup from questionIndex to selectedAnswer
  const answerMap = new Map<number, string>();
  for (const answer of answers) {
    answerMap.set(answer.questionIndex, answer.selectedAnswer.toUpperCase());
  }

  let correct = 0;
  const details: QuestionScoreDetail[] = [];

  for (let i = 0; i < total; i++) {
    const question = questions[i];
    const selectedAnswer = answerMap.get(i) ?? null;
    const correctAnswer = question.correct_answer.toUpperCase();
    const isCorrect = selectedAnswer !== null && selectedAnswer === correctAnswer;

    if (isCorrect) {
      correct++;
    }

    details.push({
      questionId: question.question_id,
      selectedAnswer,
      correctAnswer,
      isCorrect,
      explanation: question.explanation,
    });
  }

  return {
    score: { correct, total },
    details,
  };
}

// ─── Save Progress Types ──────────────────────────────────────────────────────

/** Request body for saving full test progress */
export interface SaveProgressRequest {
  sessionId: string;
  answers: SubmittedAnswer[];
  currentIndex: number;
}

/** Response from saving full test progress */
export interface SaveProgressResponse {
  status: 'saved';
  timeRemaining: number;
  currentIndex: number;
}

export type SaveProgressResult = SaveProgressResponse | FullTestError;

// ─── Save Progress Function ───────────────────────────────────────────────────

/**
 * Save full test progress without revealing correctness.
 *
 * This endpoint allows the student to:
 * - Save their current answers in progress
 * - Navigate forward/backward between questions
 * - Track their current position and remaining time
 *
 * Key constraint (Property 27): MUST NOT reveal answer correctness
 * during an active full test session.
 *
 * Flow:
 * 1. Validate inputs
 * 2. Fetch session from DB and verify it's an active full test
 * 3. Fetch session state from Redis
 * 4. Update saved answers and current index in Redis state
 * 5. Compute time remaining from (started_at + time_limit_seconds - now)
 * 6. Update time_remaining_seconds in the DB session record
 * 7. Return status confirmation with time remaining (NO correctness info)
 *
 * Validates: Requirements 4.5, 4.8, 9.6, 9.7
 */
export async function saveFullTestProgress(
  request: SaveProgressRequest
): Promise<SaveProgressResult> {
  // Step 1: Validate inputs
  if (!request.sessionId || typeof request.sessionId !== 'string') {
    return { error: 'sessionId is required' };
  }

  if (!Array.isArray(request.answers)) {
    return { error: 'answers must be an array' };
  }

  if (request.currentIndex === undefined || request.currentIndex === null || typeof request.currentIndex !== 'number') {
    return { error: 'currentIndex is required and must be a number' };
  }

  if (request.currentIndex < 0) {
    return { error: 'currentIndex must be non-negative' };
  }

  // Validate each answer entry
  for (const answer of request.answers) {
    if (answer.questionIndex === undefined || answer.questionIndex === null || typeof answer.questionIndex !== 'number') {
      return { error: 'Each answer must have a valid questionIndex (number)' };
    }
    if (answer.questionIndex < 0) {
      return { error: 'questionIndex must be non-negative' };
    }
    if (!answer.selectedAnswer || typeof answer.selectedAnswer !== 'string') {
      return { error: 'Each answer must have a selectedAnswer (A, B, C, or D)' };
    }
    const normalized = answer.selectedAnswer.toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(normalized)) {
      return { error: 'selectedAnswer must be one of A, B, C, D' };
    }
  }

  // Step 2: Fetch session from DB and verify it's an active full_test
  const session = await queryOne<{
    session_id: string;
    user_id: string;
    session_type: string;
    status: string;
    started_at: Date;
    time_limit_seconds: number | null;
  }>(
    'SELECT session_id, user_id, session_type, status, started_at, time_limit_seconds FROM sessions WHERE session_id = $1',
    [request.sessionId]
  );

  if (!session) {
    return { error: 'Session not found' };
  }

  if (session.session_type !== 'full_test') {
    return { error: 'This endpoint is only for full test sessions' };
  }

  if (session.status !== SessionStatus.Active) {
    return { error: `Session is not active (current status: ${session.status})` };
  }

  // Step 3: Fetch session state from Redis
  const sessionState = await getSessionState<FullTestSessionState>(request.sessionId);

  if (!sessionState) {
    return { error: 'Session state not found. The session may have expired.' };
  }

  // Step 4: Update saved answers and current index in Redis state
  // Build answers map from submitted answers
  const updatedAnswers: Record<number, string> = { ...sessionState.answers };
  for (const answer of request.answers) {
    updatedAnswers[answer.questionIndex] = answer.selectedAnswer.toUpperCase();
  }

  sessionState.answers = updatedAnswers;
  sessionState.currentIndex = request.currentIndex;

  // Save updated state back to Redis
  await setSessionState(request.sessionId, sessionState, FULL_TEST_SESSION_TTL);

  // Step 5: Compute time remaining
  const startedAt = new Date(session.started_at).getTime();
  const timeLimitMs = (session.time_limit_seconds ?? 0) * 1000;
  const now = Date.now();
  const elapsed = now - startedAt;
  const timeRemainingMs = Math.max(0, timeLimitMs - elapsed);
  const timeRemainingSeconds = Math.floor(timeRemainingMs / 1000);

  // Step 6: Update time_remaining_seconds in the DB
  await query(
    'UPDATE sessions SET time_remaining_seconds = $1 WHERE session_id = $2',
    [timeRemainingSeconds, request.sessionId]
  );

  // Step 7: Return status confirmation — NO correctness info (Property 27)
  return {
    status: 'saved',
    timeRemaining: timeRemainingSeconds,
    currentIndex: request.currentIndex,
  };
}

// ─── Main Service Function ────────────────────────────────────────────────────

/**
 * Submit a full test session (triggered by timer expiry or manual submit).
 *
 * Flow:
 * 1. Validate inputs
 * 2. Fetch the session and verify it's active
 * 3. Fetch all questions for the session
 * 4. Compute score using the pure computeFullTestScore function
 * 5. For each question: create a Performance_Record
 *    - Answered questions: record selectedAnswer, compute is_correct
 *    - Unanswered questions: mark as skipped (selected_answer = NULL, is_correct = false)
 * 6. Mark session as 'completed'
 * 7. Return score summary with per-question details
 */
export async function submitFullTest(
  request: FullTestSubmitRequest
): Promise<FullTestSubmitResult> {
  // Step 1: Validate inputs
  if (!request.sessionId || typeof request.sessionId !== 'string') {
    return { error: 'sessionId is required' };
  }

  if (!Array.isArray(request.answers)) {
    return { error: 'answers must be an array' };
  }

  // Validate each answer entry
  for (const answer of request.answers) {
    if (answer.questionIndex === undefined || answer.questionIndex === null || typeof answer.questionIndex !== 'number') {
      return { error: 'Each answer must have a valid questionIndex (number)' };
    }
    if (answer.questionIndex < 0) {
      return { error: 'questionIndex must be non-negative' };
    }
    if (!answer.selectedAnswer || typeof answer.selectedAnswer !== 'string') {
      return { error: 'Each answer must have a selectedAnswer (A, B, C, or D)' };
    }
    const normalized = answer.selectedAnswer.toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(normalized)) {
      return { error: 'selectedAnswer must be one of A, B, C, D' };
    }
  }

  // Step 2: Fetch the session and verify it's active
  const session = await queryOne<{
    session_id: string;
    user_id: string;
    session_type: string;
    status: string;
    section: string;
  }>(
    'SELECT session_id, user_id, session_type, status, section FROM sessions WHERE session_id = $1',
    [request.sessionId]
  );

  if (!session) {
    return { error: 'Session not found' };
  }

  if (session.status !== SessionStatus.Active) {
    return { error: `Session is not active (current status: ${session.status})` };
  }

  if (session.session_type !== 'full_test') {
    return { error: 'This endpoint is only for full test sessions' };
  }

  // Step 3: Fetch session state from Redis to get questionIds
  const sessionState = await getSessionState<FullTestSessionState>(request.sessionId);

  if (!sessionState || !sessionState.questionIds || sessionState.questionIds.length === 0) {
    return { error: 'Session state not found. The session may have expired.' };
  }

  const questionIds = sessionState.questionIds;

  // Fetch all questions for scoring
  const questions = await queryMany<QuestionForScoring>(
    `SELECT question_id, correct_answer, explanation
     FROM questions
     WHERE question_id = ANY($1)`,
    [questionIds]
  );

  if (questions.length === 0) {
    return { error: 'No questions found for this session' };
  }

  // Order questions by their original index in the session
  const questionMap = new Map<string, QuestionForScoring>();
  for (const q of questions) {
    questionMap.set(q.question_id, q);
  }

  const orderedQuestions: QuestionForScoring[] = questionIds
    .map((id) => questionMap.get(id))
    .filter((q): q is QuestionForScoring => q !== undefined);

  // Step 4: Compute score using the pure function
  const { score, details } = computeFullTestScore(orderedQuestions, request.answers);

  // Step 5: Create Performance_Records within a transaction
  const now = new Date();
  const userId = session.user_id;

  await withTransaction(async (txQuery) => {
    for (const detail of details) {
      const recordId = uuidv4();
      await txQuery(
        `INSERT INTO performance_records (
          record_id, user_id, session_id, question_id, selected_answer,
          is_correct, time_taken_seconds, error_classification, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          recordId,
          userId,
          request.sessionId,
          detail.questionId,
          detail.selectedAnswer, // NULL for skipped questions
          detail.isCorrect,
          0, // time_taken_seconds: not tracked per-question in full test mode
          null, // error_classification: set later by Adaptive Service
          now,
        ]
      );
    }

    // Step 6: Mark session as 'completed'
    await txQuery(
      'UPDATE sessions SET status = $1, completed_at = $2 WHERE session_id = $3',
      [SessionStatus.Completed, now, request.sessionId]
    );
  });

  // Clean up Redis session state
  await deleteSessionState(request.sessionId);

  // Step 7: Return score summary
  return { score, details };
}
