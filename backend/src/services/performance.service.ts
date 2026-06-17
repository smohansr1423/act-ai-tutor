/**
 * Performance Service
 * Handles answer submission in practice mode and records Performance_Records.
 *
 * Requirements: 3.7, 3.8, 9.3, 9.4, 9.5, 10.1
 *
 * - Records Performance_Record on each answer submission
 * - In practice mode: returns correctness feedback, explanation for incorrect answers,
 *   strategy tip for correct answers
 * - Persists to database within 3 seconds
 */

import { v4 as uuidv4 } from 'uuid';
import { PerformanceRecord, Question } from '../models/interfaces';
import { insertOne, queryOne } from '../utils/database';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Request body for submitting an answer in practice mode */
export interface SubmitAnswerRequest {
  sessionId: string;
  questionId: string;
  selectedAnswer: string;
  timeTaken: number;
}

/** Response returned after submitting an answer in practice mode */
export interface SubmitAnswerResponse {
  isCorrect: boolean;
  explanation?: string;
  strategyTip?: string;
  correctAnswer?: string;
  incorrectReasoning?: string;
}

/** Validation error result */
export interface SubmitAnswerValidationError {
  error: string;
}

export type SubmitAnswerResult = SubmitAnswerResponse | SubmitAnswerValidationError;

/** Helper to check if the result is a validation error */
export function isSubmitAnswerError(result: SubmitAnswerResult): result is SubmitAnswerValidationError {
  return 'error' in result;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_ANSWERS = ['A', 'B', 'C', 'D'];

/**
 * Validates the answer submission request.
 * Returns an error message if invalid, or null if valid.
 */
export function validateSubmitAnswerRequest(request: SubmitAnswerRequest): string | null {
  if (!request.sessionId || typeof request.sessionId !== 'string' || request.sessionId.trim().length === 0) {
    return 'sessionId is required';
  }

  if (!request.questionId || typeof request.questionId !== 'string' || request.questionId.trim().length === 0) {
    return 'questionId is required';
  }

  if (!request.selectedAnswer || typeof request.selectedAnswer !== 'string') {
    return 'selectedAnswer is required';
  }

  if (!VALID_ANSWERS.includes(request.selectedAnswer.toUpperCase())) {
    return 'selectedAnswer must be one of A, B, C, D';
  }

  if (request.timeTaken === undefined || request.timeTaken === null || typeof request.timeTaken !== 'number') {
    return 'timeTaken is required and must be a number';
  }

  if (request.timeTaken <= 0) {
    return 'timeTaken must be greater than 0';
  }

  return null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Database row type for question lookup.
 */
interface QuestionRow {
  question_id: string;
  correct_answer: string;
  explanation: string;
  incorrect_reasoning: string | Record<string, string>;
  strategy_tip: string;
}

/**
 * Database row type for session lookup.
 */
interface SessionRow {
  session_id: string;
  user_id: string;
  session_type: string;
  status: string;
}

/**
 * PerformanceService handles answer submission and performance record creation.
 * Supports dependency injection for testability.
 */
export class PerformanceService {
  private readonly queryOneFn: typeof queryOne;
  private readonly insertOneFn: typeof insertOne;

  constructor(deps?: { queryOne?: typeof queryOne; insertOne?: typeof insertOne }) {
    this.queryOneFn = deps?.queryOne ?? queryOne;
    this.insertOneFn = deps?.insertOne ?? insertOne;
  }

  /**
   * Submit an answer for a practice session question.
   *
   * Flow:
   * 1. Validate the request
   * 2. Fetch the session to get user_id and verify it's an active practice session
   * 3. Fetch the question to get the correct_answer
   * 4. Compare selected_answer against correct_answer
   * 5. Create a Performance_Record
   * 6. Return appropriate feedback based on correctness
   *
   * Requirements:
   * - 3.7: Show explanation after answer submission
   * - 3.8: Record Performance_Record with user_id, question_id, is_correct, time_taken, timestamp
   * - 9.3: Indicate correctness within 1 second
   * - 9.4: Display correct answer + explanation for incorrect answers
   * - 9.5: Display success indicator + strategy tip for correct answers
   * - 10.1: Persist within 3 seconds
   */
  async submitAnswer(request: SubmitAnswerRequest): Promise<SubmitAnswerResult> {
    // Step 1: Validate request
    const validationError = validateSubmitAnswerRequest(request);
    if (validationError) {
      return { error: validationError };
    }

    const normalizedAnswer = request.selectedAnswer.toUpperCase();

    // Step 2: Fetch session to get user_id and validate it's active practice
    const session = await this.queryOneFn<SessionRow>(
      'SELECT session_id, user_id, session_type, status FROM sessions WHERE session_id = $1',
      [request.sessionId]
    );

    if (!session) {
      return { error: 'Session not found' };
    }

    if (session.status !== 'active') {
      return { error: 'Session is not active' };
    }

    if (session.session_type !== 'practice') {
      return { error: 'Answer submission with feedback is only available in practice mode' };
    }

    // Step 3: Fetch the question
    const question = await this.queryOneFn<QuestionRow>(
      'SELECT question_id, correct_answer, explanation, incorrect_reasoning, strategy_tip FROM questions WHERE question_id = $1',
      [request.questionId]
    );

    if (!question) {
      return { error: 'Question not found' };
    }

    // Step 4: Compare answers
    const isCorrect = normalizedAnswer === question.correct_answer.toUpperCase();

    // Step 5: Create Performance_Record (Requirement 3.8, 10.1)
    const recordId = uuidv4();
    const timestamp = new Date();

    await this.insertOneFn(
      `INSERT INTO performance_records (
        record_id, user_id, session_id, question_id, selected_answer,
        is_correct, time_taken_seconds, error_classification, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        recordId,
        session.user_id,
        request.sessionId,
        request.questionId,
        normalizedAnswer,
        isCorrect,
        request.timeTaken,
        null, // error_classification set later by Adaptive Service
        timestamp,
      ]
    );

    // Step 6: Build response based on correctness
    if (isCorrect) {
      // Requirement 9.5: success indicator + strategy tip
      return {
        isCorrect: true,
        strategyTip: question.strategy_tip,
      };
    } else {
      // Requirement 9.4: correct answer + explanation for incorrect answers
      const incorrectReasoning = typeof question.incorrect_reasoning === 'string'
        ? JSON.parse(question.incorrect_reasoning)
        : question.incorrect_reasoning;

      return {
        isCorrect: false,
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
        incorrectReasoning: incorrectReasoning[normalizedAnswer] || undefined,
      };
    }
  }
}
