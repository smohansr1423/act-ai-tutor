/**
 * Property-Based Tests for Weakness Profile Sliding Window
 * Feature: act-ai-tutor-app, Property 13: Weakness Profile Sliding Window
 *
 * **Validates: Requirements 5.1, 5.2**
 *
 * For any sequence of attempts for a given Skill_Tag, the Weakness_Profile accuracy
 * SHALL equal the number of correct attempts divided by total attempts in the most
 * recent 20 attempts (or all attempts if fewer than 20 exist), and each new attempt
 * SHALL cause this recalculation.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateAccuracy, applySlidingWindow } from '../../services/adaptive.service';
import { RecentAttempt } from '../../models/interfaces';

const SLIDING_WINDOW_SIZE = 20;

/**
 * Generator for a single RecentAttempt with a random correctness and timestamp.
 */
const recentAttemptArb: fc.Arbitrary<RecentAttempt> = fc.record({
  is_correct: fc.boolean(),
  timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2025-12-31') })
    .map((d) => d.toISOString()),
});

/**
 * Generator for a non-empty sequence of attempts (1 to 50 attempts),
 * representing a realistic history of attempts for a skill tag.
 */
const attemptSequenceArb = fc.array(recentAttemptArb, { minLength: 1, maxLength: 50 });

describe('Property 13: Weakness Profile Sliding Window', () => {
  /**
   * Property: For any sequence of attempts, the sliding window SHALL retain
   * at most the 20 most recent attempts. If fewer than 20 exist, all are retained.
   */
  it('applySlidingWindow SHALL retain at most 20 attempts, keeping the most recent ones', () => {
    fc.assert(
      fc.property(attemptSequenceArb, (attempts) => {
        const windowed = applySlidingWindow(attempts);

        // Window size is at most SLIDING_WINDOW_SIZE
        expect(windowed.length).toBeLessThanOrEqual(SLIDING_WINDOW_SIZE);

        // If fewer than or equal to 20, all are retained
        if (attempts.length <= SLIDING_WINDOW_SIZE) {
          expect(windowed.length).toBe(attempts.length);
          expect(windowed).toEqual(attempts);
        } else {
          // If more than 20, only the last 20 are kept
          expect(windowed.length).toBe(SLIDING_WINDOW_SIZE);
          const expectedSlice = attempts.slice(attempts.length - SLIDING_WINDOW_SIZE);
          expect(windowed).toEqual(expectedSlice);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any sequence of attempts within the sliding window,
   * accuracy SHALL equal correct_count / total_count.
   */
  it('calculateAccuracy SHALL equal correct attempts divided by total attempts in the window', () => {
    fc.assert(
      fc.property(attemptSequenceArb, (attempts) => {
        const windowed = applySlidingWindow(attempts);
        const accuracy = calculateAccuracy(windowed);

        const correctCount = windowed.filter((a) => a.is_correct).length;
        const expectedAccuracy = correctCount / windowed.length;

        expect(accuracy).toBeCloseTo(expectedAccuracy, 10);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Each new attempt SHALL cause a recalculation of accuracy.
   * Adding a new attempt to any existing sequence must produce an accuracy
   * that reflects the updated sliding window.
   */
  it('each new attempt SHALL cause recalculation over the updated sliding window', () => {
    fc.assert(
      fc.property(
        fc.array(recentAttemptArb, { minLength: 0, maxLength: 49 }),
        recentAttemptArb,
        (existingAttempts, newAttempt) => {
          // Simulate adding a new attempt to the sequence
          const updatedAttempts = [...existingAttempts, newAttempt];
          const windowed = applySlidingWindow(updatedAttempts);

          // Recalculate accuracy on the windowed result
          const accuracy = calculateAccuracy(windowed);

          // Manually compute expected accuracy
          const correctCount = windowed.filter((a) => a.is_correct).length;
          const expectedAccuracy = windowed.length > 0 ? correctCount / windowed.length : 0;

          expect(accuracy).toBeCloseTo(expectedAccuracy, 10);

          // The new attempt must be included in the window (it's the last one added)
          expect(windowed[windowed.length - 1]).toEqual(newAttempt);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Accuracy SHALL always be between 0 and 1 (inclusive) for any non-empty window.
   */
  it('accuracy SHALL always be in [0, 1] for any non-empty attempt sequence', () => {
    fc.assert(
      fc.property(attemptSequenceArb, (attempts) => {
        const windowed = applySlidingWindow(attempts);
        const accuracy = calculateAccuracy(windowed);

        expect(accuracy).toBeGreaterThanOrEqual(0);
        expect(accuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When all attempts in the window are correct, accuracy SHALL be 1.
   * When all attempts are incorrect, accuracy SHALL be 0.
   */
  it('accuracy SHALL be 1 when all attempts are correct, 0 when all are incorrect', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.boolean(),
        (count, allCorrect) => {
          const attempts: RecentAttempt[] = Array.from({ length: count }, (_, i) => ({
            is_correct: allCorrect,
            timestamp: new Date(2024, 0, 1, 0, 0, i).toISOString(),
          }));

          const windowed = applySlidingWindow(attempts);
          const accuracy = calculateAccuracy(windowed);

          if (allCorrect) {
            expect(accuracy).toBe(1);
          } else {
            expect(accuracy).toBe(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The sliding window only considers the most recent 20 attempts,
   * so old attempts beyond the window SHALL NOT affect the accuracy calculation.
   */
  it('attempts older than the 20 most recent SHALL NOT affect accuracy', () => {
    fc.assert(
      fc.property(
        fc.array(recentAttemptArb, { minLength: 21, maxLength: 50 }),
        (attempts) => {
          const windowed = applySlidingWindow(attempts);
          const accuracy = calculateAccuracy(windowed);

          // Only the last 20 should matter
          const last20 = attempts.slice(attempts.length - SLIDING_WINDOW_SIZE);
          const correctInLast20 = last20.filter((a) => a.is_correct).length;
          const expectedAccuracy = correctInLast20 / SLIDING_WINDOW_SIZE;

          expect(accuracy).toBeCloseTo(expectedAccuracy, 10);

          // Verify old attempts are not in the window
          const oldAttempts = attempts.slice(0, attempts.length - SLIDING_WINDOW_SIZE);
          for (const old of oldAttempts) {
            expect(windowed).not.toContain(old);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
