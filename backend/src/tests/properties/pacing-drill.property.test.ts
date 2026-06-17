/**
 * Property-Based Tests for Pacing Drill Time Progression
 * Feature: act-ai-tutor-app, Property 16: Pacing Drill Time Progression
 *
 * **Validates: Requirements 5.7**
 *
 * For any pacing drill with N questions (5 <= N <= 10), the time limit for question i
 * (0-indexed) SHALL equal 120 - (i × 10) seconds, forming a strictly decreasing sequence.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  generateTimeLimits,
  determineDrillSize,
  BASE_TIME_SECONDS,
  TIME_DECREMENT_SECONDS,
  MIN_DRILL_SIZE,
  MAX_DRILL_SIZE,
} from '../../services/pacing-drill.service';

/**
 * Generator for valid drill sizes (5 to 10 inclusive).
 */
const validDrillSizeArb = fc.integer({ min: MIN_DRILL_SIZE, max: MAX_DRILL_SIZE });

/**
 * Generator for severity values (0.0 to 1.0) used in determineDrillSize.
 */
const severityArb = fc.double({ min: 0, max: 1, noNaN: true });

describe('Property 16: Pacing Drill Time Progression', () => {
  /**
   * Property: For any drill size N (5 <= N <= 10), the time limit for question i (0-indexed)
   * SHALL equal 120 - (i × 10) seconds.
   */
  it('for any drill size N (5-10), time limit for question i SHALL equal 120 - (i × 10) seconds', () => {
    fc.assert(
      fc.property(validDrillSizeArb, (drillSize) => {
        const timeLimits = generateTimeLimits(drillSize);

        // Must have exactly N time limits
        expect(timeLimits).toHaveLength(drillSize);

        // Each time limit must follow the formula: 120 - (i × 10)
        for (let i = 0; i < drillSize; i++) {
          const expectedTime = BASE_TIME_SECONDS - i * TIME_DECREMENT_SECONDS;
          expect(timeLimits[i]).toBe(expectedTime);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any drill size N (5 <= N <= 10), the time limits SHALL form
   * a strictly decreasing sequence.
   */
  it('for any drill size N (5-10), time limits SHALL form a strictly decreasing sequence', () => {
    fc.assert(
      fc.property(validDrillSizeArb, (drillSize) => {
        const timeLimits = generateTimeLimits(drillSize);

        // Each time limit must be strictly less than the previous one
        for (let i = 1; i < timeLimits.length; i++) {
          expect(timeLimits[i]).toBeLessThan(timeLimits[i - 1]);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any drill size N (5 <= N <= 10), the first time limit SHALL be 120 seconds
   * and the last SHALL be 120 - ((N-1) × 10) seconds.
   */
  it('for any drill size N (5-10), first time limit SHALL be 120s and last SHALL be 120 - ((N-1) × 10)s', () => {
    fc.assert(
      fc.property(validDrillSizeArb, (drillSize) => {
        const timeLimits = generateTimeLimits(drillSize);

        // First question always starts at 120 seconds
        expect(timeLimits[0]).toBe(BASE_TIME_SECONDS);

        // Last question time limit follows formula
        const expectedLast = BASE_TIME_SECONDS - (drillSize - 1) * TIME_DECREMENT_SECONDS;
        expect(timeLimits[timeLimits.length - 1]).toBe(expectedLast);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any severity value (0.0 to 1.0), determineDrillSize SHALL return
   * a value between MIN_DRILL_SIZE (5) and MAX_DRILL_SIZE (10), and the resulting
   * time limits SHALL still satisfy the progression formula.
   */
  it('for any severity value, drill size SHALL be between 5 and 10 with valid time progression', () => {
    fc.assert(
      fc.property(severityArb, (severity) => {
        const drillSize = determineDrillSize(severity);

        // Drill size must be within valid range
        expect(drillSize).toBeGreaterThanOrEqual(MIN_DRILL_SIZE);
        expect(drillSize).toBeLessThanOrEqual(MAX_DRILL_SIZE);

        // Time limits for the determined size must follow formula
        const timeLimits = generateTimeLimits(drillSize);
        expect(timeLimits).toHaveLength(drillSize);

        for (let i = 0; i < drillSize; i++) {
          expect(timeLimits[i]).toBe(BASE_TIME_SECONDS - i * TIME_DECREMENT_SECONDS);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any drill size N (5 <= N <= 10), all time limits SHALL be positive.
   */
  it('for any drill size N (5-10), all time limits SHALL be positive', () => {
    fc.assert(
      fc.property(validDrillSizeArb, (drillSize) => {
        const timeLimits = generateTimeLimits(drillSize);

        // All time limits must be positive (> 0)
        for (const limit of timeLimits) {
          expect(limit).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any drill size N (5 <= N <= 10), the decrement between consecutive
   * time limits SHALL always be exactly 10 seconds.
   */
  it('for any drill size N (5-10), decrement between consecutive limits SHALL be exactly 10 seconds', () => {
    fc.assert(
      fc.property(validDrillSizeArb, (drillSize) => {
        const timeLimits = generateTimeLimits(drillSize);

        // Each consecutive pair must differ by exactly TIME_DECREMENT_SECONDS
        for (let i = 1; i < timeLimits.length; i++) {
          const decrement = timeLimits[i - 1] - timeLimits[i];
          expect(decrement).toBe(TIME_DECREMENT_SECONDS);
        }
      }),
      { numRuns: 100 }
    );
  });
});
