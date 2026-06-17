/**
 * Property-Based Tests for Full Test Timer Expiry and Score Computation
 * Feature: act-ai-tutor-app
 *
 * **Property 10: Timer Expiry Auto-Submit**
 * For any Full_Test_Mode session with a mix of answered and unanswered questions at timer expiry,
 * the system SHALL submit all answered questions with their selected answers and mark all
 * unanswered questions as skipped (selected_answer = NULL, is_correct = false).
 *
 * **Property 11: Full Test Score Computation**
 * For any completed Full_Test_Mode session, the score summary SHALL report the number of correct
 * answers equal to the count of questions where the student's selected_answer matches the
 * correct_answer, out of the total question count for that section.
 *
 * **Validates: Requirements 4.6, 4.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeFullTestScore,
  QuestionForScoring,
  SubmittedAnswer,
} from '../../services/fulltest.service';

// ─── Generators ───────────────────────────────────────────────────────────────

/**
 * Generator for a valid answer choice (A, B, C, or D).
 */
const answerChoiceArb = fc.constantFrom('A', 'B', 'C', 'D');

/**
 * Generator for a single question used in scoring.
 * Produces questions with unique IDs, a correct answer, and an explanation.
 */
const questionForScoringArb = (index: number): fc.Arbitrary<QuestionForScoring> =>
  fc.record({
    question_id: fc.constant(`q-${index}`),
    correct_answer: answerChoiceArb,
    explanation: fc.string({ minLength: 1, maxLength: 100 }),
  });

/**
 * Generator for a list of questions (between 1 and 75, matching ACT max section size).
 */
const questionsArb = fc
  .integer({ min: 1, max: 75 })
  .chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, i) => questionForScoringArb(i))
    )
  )
  .map((tuple) => tuple as QuestionForScoring[]);

/**
 * Generator for a submitted answer at a given question index.
 */
const submittedAnswerArb = (questionIndex: number): fc.Arbitrary<SubmittedAnswer> =>
  fc.record({
    questionIndex: fc.constant(questionIndex),
    selectedAnswer: answerChoiceArb,
  });

/**
 * Generator for a full test scenario: questions + a random subset of answers
 * simulating timer expiry (some questions answered, some unanswered/skipped).
 */
const timerExpiryScenarioArb = fc
  .integer({ min: 1, max: 75 })
  .chain((questionCount) => {
    const questionsGen = fc.tuple(
      ...Array.from({ length: questionCount }, (_, i) => questionForScoringArb(i))
    );

    // Generate a random subset of indices that were answered
    const answeredIndicesGen = fc.subarray(
      Array.from({ length: questionCount }, (_, i) => i),
      { minLength: 0, maxLength: questionCount }
    );

    return fc.tuple(questionsGen, answeredIndicesGen).chain(([questions, answeredIndices]) => {
      // For each answered index, generate an answer
      if (answeredIndices.length === 0) {
        return fc.constant({
          questions: questions as QuestionForScoring[],
          answers: [] as SubmittedAnswer[],
          answeredIndices: [] as number[],
        });
      }

      const answersGen = fc.tuple(
        ...answeredIndices.map((idx) => submittedAnswerArb(idx))
      );

      return answersGen.map((answers) => ({
        questions: questions as QuestionForScoring[],
        answers: answers as SubmittedAnswer[],
        answeredIndices,
      }));
    });
  });

// ─── Property 10: Timer Expiry Auto-Submit ────────────────────────────────────

describe('Property 10: Timer Expiry Auto-Submit', () => {
  /**
   * **Validates: Requirements 4.6**
   *
   * Property: When timer expires, all answered questions SHALL have their
   * selected answers preserved in the results.
   */
  it('answered questions SHALL have their selected answers preserved in the result', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers, answeredIndices }) => {
        const result = computeFullTestScore(questions, answers);

        // Build a lookup of submitted answers
        const answerMap = new Map<number, string>();
        for (const a of answers) {
          answerMap.set(a.questionIndex, a.selectedAnswer.toUpperCase());
        }

        // Every answered question should have its selectedAnswer preserved
        for (const idx of answeredIndices) {
          const detail = result.details[idx];
          expect(detail.selectedAnswer).toBe(answerMap.get(idx));
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * Property: When timer expires, all unanswered questions SHALL be marked as
   * skipped (selectedAnswer = null, isCorrect = false).
   */
  it('unanswered questions SHALL be marked as skipped with selectedAnswer=null and isCorrect=false', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers, answeredIndices }) => {
        const result = computeFullTestScore(questions, answers);

        const answeredSet = new Set(answeredIndices);

        // Every unanswered question should be marked as skipped
        for (let i = 0; i < questions.length; i++) {
          if (!answeredSet.has(i)) {
            const detail = result.details[i];
            expect(detail.selectedAnswer).toBeNull();
            expect(detail.isCorrect).toBe(false);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * Property: The total number of details SHALL equal the total number of questions,
   * ensuring every question (answered or not) is accounted for.
   */
  it('result details SHALL cover every question in the session', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers }) => {
        const result = computeFullTestScore(questions, answers);
        expect(result.details).toHaveLength(questions.length);
        expect(result.score.total).toBe(questions.length);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.6**
   *
   * Property: When all questions are unanswered (empty answers array at timer expiry),
   * all questions SHALL be marked as skipped.
   */
  it('when no answers are submitted at timer expiry, ALL questions SHALL be skipped', () => {
    fc.assert(
      fc.property(questionsArb, (questions) => {
        const result = computeFullTestScore(questions, []);

        expect(result.score.correct).toBe(0);
        expect(result.score.total).toBe(questions.length);

        for (const detail of result.details) {
          expect(detail.selectedAnswer).toBeNull();
          expect(detail.isCorrect).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Full Test Score Computation ─────────────────────────────────

describe('Property 11: Full Test Score Computation', () => {
  /**
   * **Validates: Requirements 4.7**
   *
   * Property: Score correct count SHALL equal the number of questions where
   * selectedAnswer matches correct_answer (case-insensitive).
   */
  it('score.correct SHALL equal the count of questions where selectedAnswer matches correct_answer', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers }) => {
        const result = computeFullTestScore(questions, answers);

        // Independently compute expected correct count
        const answerMap = new Map<number, string>();
        for (const a of answers) {
          answerMap.set(a.questionIndex, a.selectedAnswer.toUpperCase());
        }

        let expectedCorrect = 0;
        for (let i = 0; i < questions.length; i++) {
          const selected = answerMap.get(i);
          if (selected && selected === questions[i].correct_answer.toUpperCase()) {
            expectedCorrect++;
          }
        }

        expect(result.score.correct).toBe(expectedCorrect);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Property: score.total SHALL equal the total number of questions in the section.
   */
  it('score.total SHALL equal the total question count for the section', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers }) => {
        const result = computeFullTestScore(questions, answers);
        expect(result.score.total).toBe(questions.length);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Property: Each detail SHALL include questionId, correctAnswer, and explanation
   * matching the original question data.
   */
  it('per-question details SHALL include questionId, correctAnswer, and explanation from original questions', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers }) => {
        const result = computeFullTestScore(questions, answers);

        for (let i = 0; i < questions.length; i++) {
          const detail = result.details[i];
          expect(detail.questionId).toBe(questions[i].question_id);
          expect(detail.correctAnswer).toBe(questions[i].correct_answer.toUpperCase());
          expect(detail.explanation).toBe(questions[i].explanation);
        }
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Property: correct count SHALL never exceed total question count.
   */
  it('score.correct SHALL never exceed score.total', () => {
    fc.assert(
      fc.property(timerExpiryScenarioArb, ({ questions, answers }) => {
        const result = computeFullTestScore(questions, answers);
        expect(result.score.correct).toBeLessThanOrEqual(result.score.total);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 4.7**
   *
   * Property: When all answers match correct answers, score.correct SHALL equal score.total.
   */
  it('when all answers are correct, score.correct SHALL equal score.total', () => {
    fc.assert(
      fc.property(questionsArb, (questions) => {
        // Create answers that all match the correct answer
        const answers: SubmittedAnswer[] = questions.map((q, i) => ({
          questionIndex: i,
          selectedAnswer: q.correct_answer,
        }));

        const result = computeFullTestScore(questions, answers);
        expect(result.score.correct).toBe(result.score.total);
        expect(result.score.correct).toBe(questions.length);
      }),
      { numRuns: 100 }
    );
  });
});
