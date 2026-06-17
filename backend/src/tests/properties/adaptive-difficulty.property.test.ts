/**
 * Property-Based Tests for Adaptive Difficulty Selection
 * Feature: act-ai-tutor-app, Property 15: Adaptive Difficulty Selection
 *
 * **Validates: Requirements 5.4, 5.5, 5.6, 5.9**
 *
 * For any Skill_Tag and student profile:
 * - IF attempt_count < 5 THEN difficulty SHALL be Medium
 * - IF attempt_count >= 5 AND accuracy < 0.60 THEN difficulty SHALL be Easy
 * - IF attempt_count >= 5 AND 0.60 <= accuracy <= 0.80 THEN difficulty SHALL be Medium with 90-second time limit
 * - IF attempt_count >= 5 AND accuracy > 0.80 THEN difficulty SHALL be Hard with 60-second time limit
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { DifficultyLevel } from '../../models/enums';
import { selectDifficultyFromProfile } from '../../services/adaptive-difficulty.service';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generates attempt counts less than 5 (insufficient data) */
const lowAttemptCountArb = fc.integer({ min: 0, max: 4 });

/** Generates attempt counts of 5 or more (sufficient data) */
const highAttemptCountArb = fc.integer({ min: 5, max: 1000 });

/** Generates accuracy values in [0, 1] */
const accuracyArb = fc.double({ min: 0, max: 1, noNaN: true });

/** Generates accuracy values strictly below 0.60 */
const lowAccuracyArb = fc.double({ min: 0, max: 0.5999999, noNaN: true });

/** Generates accuracy values in [0.60, 0.80] */
const mediumAccuracyArb = fc.double({ min: 0.60, max: 0.80, noNaN: true });

/** Generates accuracy values strictly above 0.80 */
const highAccuracyArb = fc.double({ min: 0.8000001, max: 1.0, noNaN: true });

// ─── Property Tests ───────────────────────────────────────────────────────────

describe('Property 15: Adaptive Difficulty Selection', () => {
  /**
   * Property: IF attempt_count < 5 THEN difficulty SHALL be Medium with no time limit
   * and no concept explanation (insufficient data to determine appropriate difficulty).
   *
   * Validates: Requirement 5.9
   */
  it('for any student with fewer than 5 attempts, difficulty SHALL be Medium regardless of accuracy', () => {
    fc.assert(
      fc.property(lowAttemptCountArb, accuracyArb, (attemptCount, accuracy) => {
        const result = selectDifficultyFromProfile(attemptCount, accuracy);

        expect(result.difficulty).toBe(DifficultyLevel.Medium);
        expect(result.timeLimit).toBeNull();
        expect(result.includeExplanation).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: IF attempt_count >= 5 AND accuracy < 0.60 THEN difficulty SHALL be Easy
   * with a concept explanation before each question.
   *
   * Validates: Requirement 5.4
   */
  it('for any student with 5+ attempts and accuracy below 60%, difficulty SHALL be Easy with explanation', () => {
    fc.assert(
      fc.property(highAttemptCountArb, lowAccuracyArb, (attemptCount, accuracy) => {
        const result = selectDifficultyFromProfile(attemptCount, accuracy);

        expect(result.difficulty).toBe(DifficultyLevel.Easy);
        expect(result.timeLimit).toBeNull();
        expect(result.includeExplanation).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: IF attempt_count >= 5 AND 0.60 <= accuracy <= 0.80 THEN difficulty SHALL be Medium
   * with a 90-second time limit for timed drills.
   *
   * Validates: Requirement 5.5
   */
  it('for any student with 5+ attempts and accuracy between 60%-80%, difficulty SHALL be Medium with 90s time limit', () => {
    fc.assert(
      fc.property(highAttemptCountArb, mediumAccuracyArb, (attemptCount, accuracy) => {
        const result = selectDifficultyFromProfile(attemptCount, accuracy);

        expect(result.difficulty).toBe(DifficultyLevel.Medium);
        expect(result.timeLimit).toBe(90);
        expect(result.includeExplanation).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: IF attempt_count >= 5 AND accuracy > 0.80 THEN difficulty SHALL be Hard
   * with a reduced 60-second time limit per question.
   *
   * Validates: Requirement 5.6
   */
  it('for any student with 5+ attempts and accuracy above 80%, difficulty SHALL be Hard with 60s time limit', () => {
    fc.assert(
      fc.property(highAttemptCountArb, highAccuracyArb, (attemptCount, accuracy) => {
        const result = selectDifficultyFromProfile(attemptCount, accuracy);

        expect(result.difficulty).toBe(DifficultyLevel.Hard);
        expect(result.timeLimit).toBe(60);
        expect(result.includeExplanation).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The difficulty selection is deterministic — for any given (attemptCount, accuracy) pair,
   * the function always returns the same result.
   */
  it('for any profile inputs, difficulty selection SHALL be deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (attemptCount, accuracy) => {
          const result1 = selectDifficultyFromProfile(attemptCount, accuracy);
          const result2 = selectDifficultyFromProfile(attemptCount, accuracy);

          expect(result1.difficulty).toBe(result2.difficulty);
          expect(result1.timeLimit).toBe(result2.timeLimit);
          expect(result1.includeExplanation).toBe(result2.includeExplanation);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The output difficulty is always one of the three valid DifficultyLevel values,
   * and the output always covers exactly one of the four rules.
   */
  it('for any valid inputs, the result SHALL always contain a valid DifficultyLevel', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (attemptCount, accuracy) => {
          const result = selectDifficultyFromProfile(attemptCount, accuracy);

          const validDifficulties = [DifficultyLevel.Easy, DifficultyLevel.Medium, DifficultyLevel.Hard];
          expect(validDifficulties).toContain(result.difficulty);

          // Time limit must be null, 60, or 90
          expect([null, 60, 90]).toContain(result.timeLimit);

          // includeExplanation must be a boolean
          expect(typeof result.includeExplanation).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });
});
