/**
 * Property-Based Tests for Session Summary Accuracy
 * Feature: act-ai-tutor-app, Property 9: Session Summary Accuracy
 *
 * **Validates: Requirements 3.9**
 *
 * For any set of Performance_Records in a practice session, the session summary SHALL report:
 * - total_questions equal to the count of records
 * - number_correct equal to the count where is_correct is true
 * - average_time equal to the mean of all time_taken values
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeSessionSummary } from '../../services/session.service';

/**
 * Generator for a single performance record (the subset relevant to summary computation).
 * Produces records with:
 * - is_correct: random boolean
 * - time_taken_seconds: positive float between 0.1 and 300 seconds
 */
const performanceRecordArb = fc.record({
  is_correct: fc.boolean(),
  time_taken_seconds: fc.float({ min: Math.fround(0.1), max: Math.fround(300), noNaN: true }),
});

/**
 * Generator for a non-empty list of performance records representing a practice session.
 * Generates between 1 and 75 records (matching max section size).
 */
const sessionRecordsArb = fc.array(performanceRecordArb, { minLength: 1, maxLength: 75 });

describe('Property 9: Session Summary Accuracy', () => {
  /**
   * Property: total_questions SHALL equal the count of records.
   */
  it('total_questions SHALL equal the count of Performance_Records in the session', () => {
    fc.assert(
      fc.property(sessionRecordsArb, (records) => {
        const summary = computeSessionSummary(records);
        expect(summary.totalQuestions).toBe(records.length);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: number_correct SHALL equal the count of records where is_correct is true.
   */
  it('correct SHALL equal the count of records where is_correct is true', () => {
    fc.assert(
      fc.property(sessionRecordsArb, (records) => {
        const summary = computeSessionSummary(records);
        const expectedCorrect = records.filter((r) => r.is_correct).length;
        expect(summary.correct).toBe(expectedCorrect);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: average_time SHALL equal the mean of all time_taken_seconds values.
   */
  it('avgTime SHALL equal the mean of all time_taken_seconds values', () => {
    fc.assert(
      fc.property(sessionRecordsArb, (records) => {
        const summary = computeSessionSummary(records);
        const totalTime = records.reduce((sum, r) => sum + r.time_taken_seconds, 0);
        const expectedAvg = totalTime / records.length;

        // Use approximate equality due to floating-point arithmetic
        expect(summary.avgTime).toBeCloseTo(expectedAvg, 5);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For an empty session (no records), summary should report zeros.
   */
  it('for an empty session, summary SHALL report totalQuestions=0, correct=0, avgTime=0', () => {
    const summary = computeSessionSummary([]);
    expect(summary.totalQuestions).toBe(0);
    expect(summary.correct).toBe(0);
    expect(summary.avgTime).toBe(0);
  });

  /**
   * Property: correct count SHALL never exceed totalQuestions.
   */
  it('correct SHALL never exceed totalQuestions', () => {
    fc.assert(
      fc.property(sessionRecordsArb, (records) => {
        const summary = computeSessionSummary(records);
        expect(summary.correct).toBeLessThanOrEqual(summary.totalQuestions);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: avgTime SHALL always be positive for non-empty sessions
   * (since all time_taken_seconds values are positive).
   */
  it('avgTime SHALL be positive for non-empty sessions', () => {
    fc.assert(
      fc.property(sessionRecordsArb, (records) => {
        const summary = computeSessionSummary(records);
        expect(summary.avgTime).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
