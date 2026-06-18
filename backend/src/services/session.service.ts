/**
 * Session Service - Practice Mode
 * Manages practice session lifecycle: start, question delivery, and session state.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.9
 */

import { v4 as uuidv4 } from 'uuid';
import { Session, Question, PerformanceRecord } from '../models/interfaces';
import {
  Section,
  SessionSection,
  SessionType,
  SessionStatus,
} from '../models/enums';
import { insertOne, queryMany, queryOne, query } from '../utils/database';
import { setSessionState, getSessionState } from '../utils/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request to start a practice session */
export interface StartPracticeRequest {
  userId: string;
  section: SessionSection;
  mode: 'section' | 'mixed' | 'practice';
}

/** Cached session state stored in Redis for fast retrieval */
export interface PracticeSessionState {
  sessionId: string;
  userId: string;
  section: SessionSection;
  mode: 'section' | 'mixed';
  questionIds: string[];
  currentIndex: number;
  startedAt: string;
}

/** Response when starting a practice session */
export interface StartPracticeResponse {
  sessionId: string;
  firstQuestion: QuestionDelivery;
}

/** A question delivered to the student (without correct answer) */
export interface QuestionDelivery {
  question_id: string;
  section: Section;
  question_text: string;
  passage: string | null;
  options: string[];
  skill_tag: string;
  difficulty: string;
}

/** Summary returned when a practice session ends */
export interface SessionSummary {
  totalQuestions: number;
  correct: number;
  avgTime: number;
}

/** Response from ending a practice session */
export interface EndSessionResponse {
  summary: SessionSummary;
}

/** Error response for session operations */
export interface SessionError {
  message: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Number of questions to pre-fetch for a practice session */
const PRACTICE_BATCH_SIZE = 20;

/** TTL for session state in Redis (24 hours for interrupted session resume) */
const SESSION_STATE_TTL = 86400;

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Maps a SessionSection to a Section filter for database queries.
 * Returns null for 'mixed' mode (no section filter).
 */
function getSectionFilter(section: SessionSection): Section | null {
  switch (section) {
    case SessionSection.English:
      return Section.English;
    case SessionSection.Math:
      return Section.Math;
    case SessionSection.Reading:
      return Section.Reading;
    case SessionSection.Science:
      return Section.Science;
    case SessionSection.Mixed:
      return null;
    default:
      return null;
  }
}

/**
 * Formats a Question record into a QuestionDelivery object (without revealing the answer).
 * Uses snake_case keys to match the mobile client's expected format.
 */
export function formatQuestionDelivery(question: Question): QuestionDelivery {
  // Ensure options is always an array of strings for the mobile client
  let optionsList: string[];
  if (Array.isArray(question.options)) {
    optionsList = question.options;
  } else if (typeof question.options === 'object' && question.options !== null) {
    // Convert object format {"A": "text", "B": "text"} to array ["A) text", "B) text"]
    optionsList = Object.entries(question.options).map(([key, value]) => `${key}) ${value}`);
  } else {
    optionsList = [];
  }

  return {
    question_id: question.question_id,
    section: question.section,
    question_text: question.question_text,
    passage: question.passage,
    options: optionsList,
    skill_tag: question.skill_tag,
    difficulty: question.difficulty,
  };
}

/**
 * Shuffle an array using Fisher-Yates algorithm.
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Check if a response is a SessionError.
 */
export function isSessionError(
  response: StartPracticeResponse | QuestionDelivery | EndSessionResponse | SessionError | null
): response is SessionError {
  return (
    response !== null &&
    typeof response === 'object' &&
    'message' in response &&
    !('sessionId' in response) &&
    !('questionId' in response) &&
    !('summary' in response)
  );
}

// ─── Session Start & Question Delivery ────────────────────────────────────────

/**
 * Start a new practice session.
 *
 * - Creates a session record in the Sessions table
 * - Fetches a batch of questions from the Question_Bank
 * - For section mode: filters by the selected section
 * - For mixed mode: randomizes questions across all sections
 * - Stores session state in Redis for fast retrieval
 * - Delivers the first question
 */
export async function startPracticeSession(
  request: StartPracticeRequest
): Promise<StartPracticeResponse | SessionError> {
  const { userId, section, mode } = request;

  // Validate inputs
  if (!userId || typeof userId !== 'string') {
    return { message: 'userId is required' };
  }

  if (!section || !Object.values(SessionSection).includes(section)) {
    return { message: 'Invalid section. Must be one of: english, math, reading, science, mixed' };
  }

  if (!mode || !['section', 'mixed', 'practice'].includes(mode)) {
    return { message: 'Invalid mode. Must be "section" or "mixed"' };
  }

  // Normalize 'practice' mode to 'section'
  const normalizedMode: 'section' | 'mixed' = mode === 'mixed' ? 'mixed' : 'section';

  // For section mode with a specific section, ensure it's not 'mixed'
  if (normalizedMode === 'section' && section === SessionSection.Mixed) {
    return { message: 'Section mode requires a specific section (english, math, reading, or science)' };
  }

  // Fetch questions from Question_Bank
  const questions = await fetchQuestions(section, normalizedMode);

  if (questions.length === 0) {
    return { message: 'No questions available for the selected section. Please try again later.' };
  }

  // Create session record in database
  const sessionId = uuidv4();
  const now = new Date();

  const session: Session = await insertOne<Session>(
    `INSERT INTO sessions (session_id, user_id, session_type, section, status, started_at, completed_at, time_limit_seconds, time_remaining_seconds, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      sessionId,
      userId,
      SessionType.Practice,
      section,
      SessionStatus.Active,
      now,
      null,
      null, // No time limit for practice mode
      null,
      null,
    ]
  );

  // Build session state for Redis
  const questionIds = questions.map((q) => q.question_id);
  const sessionState: PracticeSessionState = {
    sessionId,
    userId,
    section,
    mode: normalizedMode,
    questionIds,
    currentIndex: 0,
    startedAt: now.toISOString(),
  };

  // Store session state in Redis
  await setSessionState(sessionId, sessionState, SESSION_STATE_TTL);

  // Deliver the first question
  const firstQuestion = formatQuestionDelivery(questions[0]);

  return {
    sessionId: session.session_id,
    firstQuestion,
  };
}

/**
 * Get the next question in a practice session.
 * Advances the session's currentIndex and returns the next question.
 *
 * Returns null if there are no more pre-fetched questions.
 */
export async function getNextQuestion(
  sessionId: string
): Promise<QuestionDelivery | SessionError | null> {
  // Retrieve session state from Redis
  const sessionState = await getSessionState<PracticeSessionState>(sessionId);

  if (!sessionState) {
    return { message: 'Session not found or expired' };
  }

  // Advance to the next question
  const nextIndex = sessionState.currentIndex + 1;

  if (nextIndex >= sessionState.questionIds.length) {
    // No more pre-fetched questions available
    return null;
  }

  // Fetch the question from the database
  const questionId = sessionState.questionIds[nextIndex];
  const questions = await queryMany<Question>(
    `SELECT question_id, section, question_text, passage, options, correct_answer,
            explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
     FROM questions WHERE question_id = $1`,
    [questionId]
  );

  if (questions.length === 0) {
    return { message: 'Question not found in database' };
  }

  // Update session state in Redis
  sessionState.currentIndex = nextIndex;
  await setSessionState(sessionId, sessionState, SESSION_STATE_TTL);

  return formatQuestionDelivery(questions[0]);
}

// ─── Session End & Summary ────────────────────────────────────────────────────

/**
 * Compute a session summary from performance records.
 *
 * - totalQuestions: count of records
 * - correct: count where is_correct = true
 * - avgTime: mean of time_taken_seconds (0 if no records)
 */
export function computeSessionSummary(records: Pick<PerformanceRecord, 'is_correct' | 'time_taken_seconds'>[]): SessionSummary {
  const totalQuestions = records.length;

  if (totalQuestions === 0) {
    return { totalQuestions: 0, correct: 0, avgTime: 0 };
  }

  const correct = records.filter((r) => r.is_correct).length;
  const totalTime = records.reduce((sum, r) => sum + r.time_taken_seconds, 0);
  const avgTime = totalTime / totalQuestions;

  return { totalQuestions, correct, avgTime };
}

/**
 * End a practice session and return a summary.
 *
 * Steps:
 * 1. Validate the session exists and is active
 * 2. Mark the session as 'completed' with a completed_at timestamp
 * 3. Query all Performance_Records for this session
 * 4. Compute summary: totalQuestions, correct, avgTime
 * 5. Return the summary
 */
export async function endPracticeSession(sessionId: string): Promise<EndSessionResponse | SessionError> {
  if (!sessionId) {
    return { message: 'Session ID is required' };
  }

  // 1. Validate the session exists
  const session = await queryOne<Session>(
    'SELECT session_id, user_id, session_type, status FROM sessions WHERE session_id = $1',
    [sessionId]
  );

  if (!session) {
    return { message: 'Session not found' };
  }

  if (session.status !== SessionStatus.Active) {
    return { message: `Session is already ${session.status}` };
  }

  // 2. Mark the session as completed
  const completedAt = new Date();
  await query(
    'UPDATE sessions SET status = $1, completed_at = $2 WHERE session_id = $3',
    [SessionStatus.Completed, completedAt, sessionId]
  );

  // 3. Query all Performance_Records for this session
  const records = await queryMany<Pick<PerformanceRecord, 'is_correct' | 'time_taken_seconds'>>(
    'SELECT is_correct, time_taken_seconds FROM performance_records WHERE session_id = $1',
    [sessionId]
  );

  // 4. Compute summary
  const summary = computeSessionSummary(records);

  // 5. Return the summary
  return { summary };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Fetch a batch of questions from the Question_Bank.
 *
 * - For section mode: fetches questions filtered by section
 * - For mixed mode: fetches questions from all sections and randomizes
 */
async function fetchQuestions(
  section: SessionSection,
  mode: 'section' | 'mixed'
): Promise<Question[]> {
  let questions: Question[];

  if (mode === 'mixed' || section === SessionSection.Mixed) {
    // Mixed mode: fetch from all sections and randomize
    questions = await queryMany<Question>(
      `SELECT question_id, section, question_text, passage, options, correct_answer,
              explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
       FROM questions
       ORDER BY RANDOM()
       LIMIT $1`,
      [PRACTICE_BATCH_SIZE]
    );
    // Additional shuffle for extra randomness
    questions = shuffleArray(questions);
  } else {
    // Section mode: filter by selected section
    const sectionFilter = getSectionFilter(section);
    questions = await queryMany<Question>(
      `SELECT question_id, section, question_text, passage, options, correct_answer,
              explanation, incorrect_reasoning, skill_tag, difficulty, strategy_tip, created_at
       FROM questions
       WHERE section = $1
       ORDER BY RANDOM()
       LIMIT $2`,
      [sectionFilter, PRACTICE_BATCH_SIZE]
    );
  }

  return questions;
}
