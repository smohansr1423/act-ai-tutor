/**
 * Property-Based Tests for Analytics Computations
 * Feature: act-ai-tutor-app
 *
 * - Property 20: Score Trend Computation
 * - Property 21: Weak Skill Tag Ranking
 * - Property 22: Average Time Per Section
 * - Property 23: Accuracy Per Section
 * - Property 24: Insufficient Data Threshold
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeScoreTrendsFromRecords,
  computeWeakSkills,
  computeAvgTimePerSection,
  computeAccuracyPerSection,
  ScoreTrendDataPoint,
  WeakSkillEntry,
} from '../../services/analytics.service';
import { Section } from '../../models/enums';

// ─── Generators ───────────────────────────────────────────────────────────────

const sectionArb: fc.Arbitrary<Section> = fc.constantFrom(
  Section.English,
  Section.Math,
  Section.Reading,
  Section.Science
);

/** Generate a valid ISO date string within the last 30 days */
const recentDateArb: fc.Arbitrary<Date> = fc.date({
  min: new Date('2024-01-01'),
  max: new Date('2024-01-30'),
});

/** Generator for a performance record with section info (for score trend & accuracy tests) */
const recordWithSectionArb = fc.record({
  is_correct: fc.boolean(),
  time_taken_seconds: fc.integer({ min: 1, max: 300 }),
  timestamp: recentDateArb,
  section: sectionArb,
});

/** Generator for a non-empty array of performance records */
const recordsArb = fc.array(recordWithSectionArb, { minLength: 1, maxLength: 100 });

/** Generator for a weakness profile entry */
const weaknessProfileArb = fc.record({
  skill_tag: fc.stringMatching(/^[a-z]{3,12}(-[a-z]{3,8})?$/),
  section: sectionArb,
  accuracy: fc.double({ min: 0, max: 1, noNaN: true }),
  attempt_count: fc.integer({ min: 1, max: 100 }),
});

/** Generator for an array of weakness profiles (0 to 20 profiles) */
const profilesArb = fc.array(weaknessProfileArb, { minLength: 0, maxLength: 20 });

// ─── Property 20: Score Trend Computation ─────────────────────────────────────

describe('Property 20: Score Trend Computation', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any set of Performance_Records over the most recent 30 days,
   * the score trend SHALL plot one accuracy data point per day per section,
   * where each data point equals the number of correct answers divided by total
   * answers for that section on that day.
   */
  it('SHALL produce one data point per unique (date, section) combination', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeScoreTrendsFromRecords(records);

        // Compute expected unique (date, section) keys
        const expectedKeys = new Set<string>();
        records.forEach((r) => {
          const date = new Date(r.timestamp).toISOString().split('T')[0];
          expectedKeys.add(`${date}|${r.section}`);
        });

        // Each result corresponds to a unique (date, section) key
        expect(result.length).toBe(expectedKeys.size);

        // Each data point's key is unique
        const resultKeys = result.map((dp) => `${dp.date}|${dp.section}`);
        expect(new Set(resultKeys).size).toBe(result.length);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL compute accuracy as correct / total for each (date, section)', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeScoreTrendsFromRecords(records);

        // For each data point, manually verify the computation
        for (const dp of result) {
          const matching = records.filter((r) => {
            const date = new Date(r.timestamp).toISOString().split('T')[0];
            return date === dp.date && r.section === dp.section;
          });

          const expectedTotal = matching.length;
          const expectedCorrect = matching.filter((r) => r.is_correct).length;
          const expectedAccuracy = expectedTotal > 0 ? expectedCorrect / expectedTotal : 0;

          expect(dp.totalQuestions).toBe(expectedTotal);
          expect(dp.correct).toBe(expectedCorrect);
          expect(dp.accuracy).toBeCloseTo(expectedAccuracy, 10);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return results sorted by date ascending', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeScoreTrendsFromRecords(records);

        for (let i = 1; i < result.length; i++) {
          expect(result[i].date >= result[i - 1].date).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return accuracy values between 0 and 1 inclusive', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeScoreTrendsFromRecords(records);

        for (const dp of result) {
          expect(dp.accuracy).toBeGreaterThanOrEqual(0);
          expect(dp.accuracy).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 21: Weak Skill Tag Ranking ──────────────────────────────────────

describe('Property 21: Weak Skill Tag Ranking', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any set of Weakness_Profiles, the weak skills list SHALL contain
   * at most 10 Skill_Tags where accuracy < 0.60, ordered from lowest accuracy
   * to highest accuracy.
   */
  it('SHALL contain at most 10 entries', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        const result = computeWeakSkills(profiles);

        if (Array.isArray(result)) {
          expect(result.length).toBeLessThanOrEqual(10);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL only include skill tags with accuracy < 0.60', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        const result = computeWeakSkills(profiles);

        if (Array.isArray(result)) {
          for (const entry of result) {
            expect(entry.accuracy).toBeLessThan(0.60);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL order entries from lowest accuracy to highest', () => {
    fc.assert(
      fc.property(profilesArb, (profiles) => {
        const result = computeWeakSkills(profiles);

        if (Array.isArray(result) && result.length > 1) {
          for (let i = 1; i < result.length; i++) {
            expect(result[i].accuracy).toBeGreaterThanOrEqual(result[i - 1].accuracy);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return "no weak areas" message when no profiles have accuracy < 0.60', () => {
    // Generate profiles where all accuracies are >= 0.60
    const highAccuracyProfilesArb = fc.array(
      fc.record({
        skill_tag: fc.stringMatching(/^[a-z]{3,12}$/),
        section: sectionArb,
        accuracy: fc.double({ min: 0.60, max: 1.0, noNaN: true }),
        attempt_count: fc.integer({ min: 1, max: 100 }),
      }),
      { minLength: 0, maxLength: 15 }
    );

    fc.assert(
      fc.property(highAccuracyProfilesArb, (profiles) => {
        const result = computeWeakSkills(profiles);

        expect(Array.isArray(result)).toBe(false);
        expect((result as { message: string }).message).toContain('No weak areas');
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL select the lowest-accuracy skills when more than 10 are weak', () => {
    // Generate exactly 15 profiles all with accuracy < 0.60
    const manyWeakProfilesArb = fc.array(
      fc.record({
        skill_tag: fc.stringMatching(/^[a-z]{3,10}$/),
        section: sectionArb,
        accuracy: fc.double({ min: 0.01, max: 0.59, noNaN: true }),
        attempt_count: fc.integer({ min: 5, max: 50 }),
      }),
      { minLength: 11, maxLength: 20 }
    );

    fc.assert(
      fc.property(manyWeakProfilesArb, (profiles) => {
        const result = computeWeakSkills(profiles);

        expect(Array.isArray(result)).toBe(true);
        const skills = result as WeakSkillEntry[];
        expect(skills.length).toBe(10);

        // The 10 returned should be the 10 lowest accuracies from the input
        const sortedProfiles = [...profiles].sort((a, b) => a.accuracy - b.accuracy);
        const top10Accuracies = sortedProfiles.slice(0, 10).map((p) => p.accuracy);

        for (const skill of skills) {
          expect(top10Accuracies).toContain(skill.accuracy);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 22: Average Time Per Section ────────────────────────────────────

describe('Property 22: Average Time Per Section', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any set of Performance_Records within the most recent 30 days,
   * the average time per section SHALL equal the sum of time_taken divided by
   * the count of records for that section.
   */
  it('SHALL compute avgTimeSeconds as sum(time_taken) / count for sections with >= 5 records', () => {
    // Generate at least 5 records for a specific section
    const sectionWithEnoughRecords = fc.tuple(sectionArb, fc.array(
      fc.integer({ min: 1, max: 300 }),
      { minLength: 5, maxLength: 50 }
    )).map(([section, times]) =>
      times.map((t) => ({
        is_correct: true,
        time_taken_seconds: t,
        timestamp: new Date('2024-01-15'),
        section,
      }))
    );

    fc.assert(
      fc.property(sectionWithEnoughRecords, (records) => {
        const result = computeAvgTimePerSection(records);
        const section = records[0].section;
        const sectionResult = result.find((r) => r.section === section)!;

        const expectedSum = records.reduce((sum, r) => sum + r.time_taken_seconds, 0);
        const expectedAvg = expectedSum / records.length;

        expect(sectionResult.insufficientData).toBe(false);
        expect(sectionResult.avgTimeSeconds).toBeCloseTo(expectedAvg, 10);
        expect(sectionResult.totalRecords).toBe(records.length);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL produce non-negative average time values', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeAvgTimePerSection(records);

        for (const entry of result) {
          expect(entry.avgTimeSeconds).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return results for all four sections', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeAvgTimePerSection(records);

        expect(result.length).toBe(4);
        const sections = result.map((r) => r.section);
        expect(sections).toContain(Section.English);
        expect(sections).toContain(Section.Math);
        expect(sections).toContain(Section.Reading);
        expect(sections).toContain(Section.Science);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 23: Accuracy Per Section ────────────────────────────────────────

describe('Property 23: Accuracy Per Section', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any set of Performance_Records within the most recent 30 days,
   * the accuracy per section SHALL equal the count of records where is_correct
   * is true divided by the total count of records for that section.
   */
  it('SHALL compute accuracy as correct_count / total_count for sections with >= 5 records', () => {
    // Generate at least 5 records for a specific section
    const sectionWithEnoughRecords = fc.tuple(sectionArb, fc.array(
      fc.boolean(),
      { minLength: 5, maxLength: 50 }
    )).map(([section, correctness]) =>
      correctness.map((isCorrect) => ({
        is_correct: isCorrect,
        time_taken_seconds: 10,
        timestamp: new Date('2024-01-15'),
        section,
      }))
    );

    fc.assert(
      fc.property(sectionWithEnoughRecords, (records) => {
        const result = computeAccuracyPerSection(records);
        const section = records[0].section;
        const sectionResult = result.find((r) => r.section === section)!;

        const correctCount = records.filter((r) => r.is_correct).length;
        const expectedAccuracy = correctCount / records.length;

        expect(sectionResult.insufficientData).toBe(false);
        expect(sectionResult.accuracy).toBeCloseTo(expectedAccuracy, 10);
        expect(sectionResult.correct).toBe(correctCount);
        expect(sectionResult.totalRecords).toBe(records.length);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL produce accuracy values between 0 and 1 inclusive', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeAccuracyPerSection(records);

        for (const entry of result) {
          if (!entry.insufficientData) {
            expect(entry.accuracy).toBeGreaterThanOrEqual(0);
            expect(entry.accuracy).toBeLessThanOrEqual(1);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL return results for all four sections', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeAccuracyPerSection(records);

        expect(result.length).toBe(4);
        const sections = result.map((r) => r.section);
        expect(sections).toContain(Section.English);
        expect(sections).toContain(Section.Math);
        expect(sections).toContain(Section.Reading);
        expect(sections).toContain(Section.Science);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL ensure correct count never exceeds total count', () => {
    fc.assert(
      fc.property(recordsArb, (records) => {
        const result = computeAccuracyPerSection(records);

        for (const entry of result) {
          expect(entry.correct).toBeLessThanOrEqual(entry.totalRecords);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 24: Insufficient Data Threshold ─────────────────────────────────

describe('Property 24: Insufficient Data Threshold', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * For any section where a student has fewer than 5 Performance_Records,
   * the Analytics Dashboard SHALL display an insufficient data message for that
   * section instead of computed metrics.
   */
  it('SHALL flag insufficientData=true for sections with fewer than 5 records (avgTime)', () => {
    // Generate 1-4 records for a specific section
    const fewRecordsArb = fc.tuple(sectionArb, fc.integer({ min: 1, max: 4 })).map(
      ([section, count]) =>
        Array.from({ length: count }, () => ({
          is_correct: true,
          time_taken_seconds: 10,
          timestamp: new Date('2024-01-15'),
          section,
        }))
    );

    fc.assert(
      fc.property(fewRecordsArb, (records) => {
        const result = computeAvgTimePerSection(records);
        const section = records[0].section;
        const sectionResult = result.find((r) => r.section === section)!;

        expect(sectionResult.insufficientData).toBe(true);
        expect(sectionResult.avgTimeSeconds).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL flag insufficientData=true for sections with fewer than 5 records (accuracy)', () => {
    // Generate 1-4 records for a specific section
    const fewRecordsArb = fc.tuple(sectionArb, fc.integer({ min: 1, max: 4 })).map(
      ([section, count]) =>
        Array.from({ length: count }, () => ({
          is_correct: true,
          time_taken_seconds: 10,
          timestamp: new Date('2024-01-15'),
          section,
        }))
    );

    fc.assert(
      fc.property(fewRecordsArb, (records) => {
        const result = computeAccuracyPerSection(records);
        const section = records[0].section;
        const sectionResult = result.find((r) => r.section === section)!;

        expect(sectionResult.insufficientData).toBe(true);
        expect(sectionResult.accuracy).toBe(0);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL NOT flag insufficientData for sections with exactly 5 records', () => {
    const exactlyFiveArb = sectionArb.chain((section) =>
      fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }).map((correctness) =>
        correctness.map((isCorrect) => ({
          is_correct: isCorrect,
          time_taken_seconds: 15,
          timestamp: new Date('2024-01-15'),
          section,
        }))
      )
    );

    fc.assert(
      fc.property(exactlyFiveArb, (records) => {
        const avgResult = computeAvgTimePerSection(records);
        const accResult = computeAccuracyPerSection(records);
        const section = records[0].section;

        const avgSection = avgResult.find((r) => r.section === section)!;
        const accSection = accResult.find((r) => r.section === section)!;

        expect(avgSection.insufficientData).toBe(false);
        expect(accSection.insufficientData).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('SHALL flag insufficientData for sections with 0 records', () => {
    fc.assert(
      fc.property(fc.constant([]), (records: any[]) => {
        const avgResult = computeAvgTimePerSection(records);
        const accResult = computeAccuracyPerSection(records);

        // All sections should have insufficient data when no records exist
        for (const entry of avgResult) {
          expect(entry.insufficientData).toBe(true);
          expect(entry.totalRecords).toBe(0);
        }
        for (const entry of accResult) {
          expect(entry.insufficientData).toBe(true);
          expect(entry.totalRecords).toBe(0);
        }
      }),
      { numRuns: 1 }
    );
  });
});
