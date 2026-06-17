/**
 * Property-Based Tests for Performance Record Completeness
 * Feature: act-ai-tutor-app, Property 8: Performance Record Completeness
 *
 * **Validates: Requirements 3.8**
 *
 * For any answer submission, the resulting Performance_Record SHALL contain a valid
 * user_id, question_id, is_correct (matching whether selected_answer equals the
 * question's correct_answer), time_taken (> 0), and a timestamp.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PerformanceService,
  SubmitAnswerRequest,
  isSubmitAnswerError,
} from '../../services/performance.service';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generator for valid UUID-like strings */
const uuidArb = fc.uuid();

/** Generator for valid answer choices (A, B, C, D) */
const validAnswerArb = fc.constantFrom('A', 'B', 'C', 'D');

/** Generator for positive time taken values (> 0) */
const timeTakenArb = fc.float({ min: Math.fround(0.01), max: Math.fround(7200), noNaN: true }).filter(t => t > 0);

/** Generator for a complete answer submission scenario */
const answerSubmissionArb = fc.record({
  userId: uuidArb,
  sessionId: uuidArb,
  questionId: uuidArb,
  selectedAnswer: validAnswerArb,
  correctAnswer: validAnswerArb,
  timeTaken: timeTakenArb,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 8: Performance Record Completeness', () => {
  /**
   * Property: For any valid answer submission, the PerformanceService SHALL create
   * a Performance_Record containing:
   *   - user_id matching the session's user
   *   - question_id matching the submitted question
   *   - is_correct = true if selected_answer === correct_answer, false otherwise
   *   - time_taken > 0
   *   - a valid timestamp
   */
  it('for any answer submission, the resulting Performance_Record SHALL contain valid user_id, question_id, is_correct, time_taken > 0, and a timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(answerSubmissionArb, async (scenario) => {
        const { userId, sessionId, questionId, selectedAnswer, correctAnswer, timeTaken } = scenario;

        // Track what gets inserted into the database
        let insertedRecord: Record<string, unknown> | null = null;

        // Mock queryOne to return session and question data
        const mockQueryOne = async <T>(sql: string, params: unknown[]): Promise<T | null> => {
          if (sql.includes('FROM sessions')) {
            return {
              session_id: sessionId,
              user_id: userId,
              session_type: 'practice',
              status: 'active',
            } as unknown as T;
          }
          if (sql.includes('FROM questions')) {
            return {
              question_id: questionId,
              correct_answer: correctAnswer,
              explanation: 'Test explanation',
              incorrect_reasoning: JSON.stringify({ A: 'reason A', B: 'reason B', C: 'reason C', D: 'reason D' }),
              strategy_tip: 'Test strategy tip',
            } as unknown as T;
          }
          return null;
        };

        // Mock insertOne to capture the inserted record
        const mockInsertOne = async <T>(_sql: string, params: unknown[]): Promise<T> => {
          insertedRecord = {
            record_id: params[0],
            user_id: params[1],
            session_id: params[2],
            question_id: params[3],
            selected_answer: params[4],
            is_correct: params[5],
            time_taken_seconds: params[6],
            error_classification: params[7],
            timestamp: params[8],
          };
          return insertedRecord as unknown as T;
        };

        // Create service with mocked dependencies
        const service = new PerformanceService({
          queryOne: mockQueryOne as typeof import('../../utils/database').queryOne,
          insertOne: mockInsertOne as typeof import('../../utils/database').insertOne,
        });

        // Execute the submission
        const request: SubmitAnswerRequest = {
          sessionId,
          questionId,
          selectedAnswer,
          timeTaken,
        };

        const result = await service.submitAnswer(request);

        // The submission should succeed (not be a validation error)
        expect(isSubmitAnswerError(result)).toBe(false);

        // A record MUST have been inserted
        expect(insertedRecord).not.toBeNull();

        // Verify Performance_Record completeness:

        // 1. Valid user_id (matches the session's user)
        expect(insertedRecord!.user_id).toBe(userId);
        expect(typeof insertedRecord!.user_id).toBe('string');
        expect((insertedRecord!.user_id as string).length).toBeGreaterThan(0);

        // 2. Valid question_id (matches the submitted question)
        expect(insertedRecord!.question_id).toBe(questionId);
        expect(typeof insertedRecord!.question_id).toBe('string');
        expect((insertedRecord!.question_id as string).length).toBeGreaterThan(0);

        // 3. is_correct matches whether selected_answer equals correct_answer
        const expectedCorrect = selectedAnswer.toUpperCase() === correctAnswer.toUpperCase();
        expect(insertedRecord!.is_correct).toBe(expectedCorrect);

        // 4. time_taken > 0
        expect(insertedRecord!.time_taken_seconds).toBe(timeTaken);
        expect(insertedRecord!.time_taken_seconds as number).toBeGreaterThan(0);

        // 5. A valid timestamp (must be a Date instance)
        expect(insertedRecord!.timestamp).toBeInstanceOf(Date);
        expect((insertedRecord!.timestamp as Date).getTime()).not.toBeNaN();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any answer submission where selected_answer equals the
   * question's correct_answer, is_correct SHALL be true.
   */
  it('when selected_answer equals correct_answer, is_correct SHALL be true', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        validAnswerArb,
        timeTakenArb,
        async (userId, sessionId, questionId, answer, timeTaken) => {
          let insertedRecord: Record<string, unknown> | null = null;

          const mockQueryOne = async <T>(sql: string): Promise<T | null> => {
            if (sql.includes('FROM sessions')) {
              return {
                session_id: sessionId,
                user_id: userId,
                session_type: 'practice',
                status: 'active',
              } as unknown as T;
            }
            if (sql.includes('FROM questions')) {
              return {
                question_id: questionId,
                correct_answer: answer, // Same as selected
                explanation: 'Explanation',
                incorrect_reasoning: '{}',
                strategy_tip: 'Tip',
              } as unknown as T;
            }
            return null;
          };

          const mockInsertOne = async <T>(_sql: string, params: unknown[]): Promise<T> => {
            insertedRecord = {
              record_id: params[0],
              user_id: params[1],
              session_id: params[2],
              question_id: params[3],
              selected_answer: params[4],
              is_correct: params[5],
              time_taken_seconds: params[6],
              error_classification: params[7],
              timestamp: params[8],
            };
            return insertedRecord as unknown as T;
          };

          const service = new PerformanceService({
            queryOne: mockQueryOne as typeof import('../../utils/database').queryOne,
            insertOne: mockInsertOne as typeof import('../../utils/database').insertOne,
          });

          const result = await service.submitAnswer({
            sessionId,
            questionId,
            selectedAnswer: answer,
            timeTaken,
          });

          expect(isSubmitAnswerError(result)).toBe(false);
          expect(insertedRecord).not.toBeNull();
          expect(insertedRecord!.is_correct).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any answer submission where selected_answer does NOT equal
   * the question's correct_answer, is_correct SHALL be false.
   */
  it('when selected_answer does NOT equal correct_answer, is_correct SHALL be false', async () => {
    // Generator that produces a selected answer different from the correct answer
    const differentAnswersArb = fc.tuple(validAnswerArb, validAnswerArb)
      .filter(([selected, correct]) => selected !== correct);

    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        differentAnswersArb,
        timeTakenArb,
        async (userId, sessionId, questionId, [selectedAnswer, correctAnswer], timeTaken) => {
          let insertedRecord: Record<string, unknown> | null = null;

          const mockQueryOne = async <T>(sql: string): Promise<T | null> => {
            if (sql.includes('FROM sessions')) {
              return {
                session_id: sessionId,
                user_id: userId,
                session_type: 'practice',
                status: 'active',
              } as unknown as T;
            }
            if (sql.includes('FROM questions')) {
              return {
                question_id: questionId,
                correct_answer: correctAnswer,
                explanation: 'Explanation',
                incorrect_reasoning: JSON.stringify({
                  A: 'reason A', B: 'reason B', C: 'reason C', D: 'reason D',
                }),
                strategy_tip: 'Tip',
              } as unknown as T;
            }
            return null;
          };

          const mockInsertOne = async <T>(_sql: string, params: unknown[]): Promise<T> => {
            insertedRecord = {
              record_id: params[0],
              user_id: params[1],
              session_id: params[2],
              question_id: params[3],
              selected_answer: params[4],
              is_correct: params[5],
              time_taken_seconds: params[6],
              error_classification: params[7],
              timestamp: params[8],
            };
            return insertedRecord as unknown as T;
          };

          const service = new PerformanceService({
            queryOne: mockQueryOne as typeof import('../../utils/database').queryOne,
            insertOne: mockInsertOne as typeof import('../../utils/database').insertOne,
          });

          const result = await service.submitAnswer({
            sessionId,
            questionId,
            selectedAnswer,
            timeTaken,
          });

          expect(isSubmitAnswerError(result)).toBe(false);
          expect(insertedRecord).not.toBeNull();
          expect(insertedRecord!.is_correct).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
