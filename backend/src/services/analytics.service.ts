/**
 * Analytics Service
 * Computes student dashboard metrics: score trends, weak skills, average time, accuracy per section.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 * Design Properties: 20, 21, 22, 23, 24
 */

import { PerformanceRecord, WeaknessProfile } from '../models/interfaces';
import { Section } from '../models/enums';
import { queryMany } from '../utils/database';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single day's accuracy data point for a section */
export interface ScoreTrendDataPoint {
  date: string; // ISO date string (YYYY-MM-DD)
  section: Section;
  accuracy: number; // 0.0 to 1.0
  totalQuestions: number;
  correct: number;
}

/** A weak skill tag entry */
export interface WeakSkillEntry {
  skillTag: string;
  section: Section;
  accuracy: number; // 0.0 to 1.0
  attemptCount: number;
}

/** Average time per question for a section */
export interface AvgTimePerSection {
  section: Section;
  avgTimeSeconds: number;
  totalRecords: number;
  insufficientData: boolean;
}

/** Accuracy percentage for a section */
export interface AccuracyPerSection {
  section: Section;
  accuracy: number; // 0.0 to 1.0
  totalRecords: number;
  correct: number;
  insufficientData: boolean;
}

/** Full analytics dashboard response */
export interface StudentDashboard {
  scoreTrends: ScoreTrendDataPoint[];
  weakSkills: WeakSkillEntry[] | { message: string };
  avgTimePerSection: AvgTimePerSection[];
  accuracyPerSection: AccuracyPerSection[];
}

/** Error result */
export interface AnalyticsError {
  error: string;
}

export type AnalyticsDashboardResult = StudentDashboard | AnalyticsError;

/** Helper type guard */
export function isAnalyticsError(result: AnalyticsDashboardResult): result is AnalyticsError {
  return 'error' in result;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum number of records per section to display computed metrics */
const INSUFFICIENT_DATA_THRESHOLD = 5;

/** Maximum number of weak skill tags to display */
const MAX_WEAK_SKILLS = 10;

/** Accuracy threshold below which a skill is considered weak */
const WEAK_SKILL_ACCURACY_THRESHOLD = 0.60;

/** Number of days for the analytics window */
const ANALYTICS_WINDOW_DAYS = 30;

// ─── Core Computation Functions (exported for testability) ────────────────────

/**
 * Compute score trends: accuracy per day per section over the last 30 days.
 *
 * Property 20: For any set of Performance_Records over the most recent 30 days,
 * the score trend SHALL plot one accuracy data point per day per section,
 * where each data point equals the number of correct answers divided by total
 * answers for that section on that day.
 */
export function computeScoreTrends(records: Pick<PerformanceRecord, 'is_correct' | 'timestamp'>[], sections: Section[], sectionForRecord: (record: Pick<PerformanceRecord, 'is_correct' | 'timestamp'>, index: number) => Section): ScoreTrendDataPoint[] {
  // Group records by date and section
  const grouped = new Map<string, { correct: number; total: number }>();

  records.forEach((record, index) => {
    const section = sectionForRecord(record, index);
    const date = new Date(record.timestamp).toISOString().split('T')[0];
    const key = `${date}|${section}`;

    if (!grouped.has(key)) {
      grouped.set(key, { correct: 0, total: 0 });
    }

    const entry = grouped.get(key)!;
    entry.total += 1;
    if (record.is_correct) {
      entry.correct += 1;
    }
  });

  // Convert to array of data points
  const dataPoints: ScoreTrendDataPoint[] = [];
  grouped.forEach((value, key) => {
    const [date, section] = key.split('|');
    dataPoints.push({
      date,
      section: section as Section,
      accuracy: value.total > 0 ? value.correct / value.total : 0,
      totalQuestions: value.total,
      correct: value.correct,
    });
  });

  // Sort by date ascending
  dataPoints.sort((a, b) => a.date.localeCompare(b.date));

  return dataPoints;
}

/**
 * Compute score trends from records that already include section info.
 * This is the typical entry point when records come with section data from a JOIN query.
 */
export function computeScoreTrendsFromRecords(
  records: (Pick<PerformanceRecord, 'is_correct' | 'timestamp'> & { section: Section })[]
): ScoreTrendDataPoint[] {
  const grouped = new Map<string, { correct: number; total: number }>();

  records.forEach((record) => {
    const date = new Date(record.timestamp).toISOString().split('T')[0];
    const key = `${date}|${record.section}`;

    if (!grouped.has(key)) {
      grouped.set(key, { correct: 0, total: 0 });
    }

    const entry = grouped.get(key)!;
    entry.total += 1;
    if (record.is_correct) {
      entry.correct += 1;
    }
  });

  const dataPoints: ScoreTrendDataPoint[] = [];
  grouped.forEach((value, key) => {
    const [date, section] = key.split('|');
    dataPoints.push({
      date,
      section: section as Section,
      accuracy: value.total > 0 ? value.correct / value.total : 0,
      totalQuestions: value.total,
      correct: value.correct,
    });
  });

  dataPoints.sort((a, b) => a.date.localeCompare(b.date));
  return dataPoints;
}

/**
 * Compute weak skills: up to 10 skill tags with accuracy < 60%, ranked lowest to highest.
 *
 * Property 21: For any set of Weakness_Profiles, the weak skills list SHALL contain
 * at most 10 Skill_Tags where accuracy < 0.60, ordered from lowest accuracy to highest accuracy.
 */
export function computeWeakSkills(
  profiles: Pick<WeaknessProfile, 'skill_tag' | 'section' | 'accuracy' | 'attempt_count'>[]
): WeakSkillEntry[] | { message: string } {
  // Filter for profiles below the threshold
  const weakProfiles = profiles.filter((p) => p.accuracy < WEAK_SKILL_ACCURACY_THRESHOLD);

  if (weakProfiles.length === 0) {
    return { message: 'No weak areas identified. Keep up the great work!' };
  }

  // Sort by accuracy ascending (lowest first)
  weakProfiles.sort((a, b) => a.accuracy - b.accuracy);

  // Take at most 10
  const topWeak = weakProfiles.slice(0, MAX_WEAK_SKILLS);

  return topWeak.map((p) => ({
    skillTag: p.skill_tag,
    section: p.section,
    accuracy: p.accuracy,
    attemptCount: p.attempt_count,
  }));
}

/**
 * Compute average time per question by section from performance records.
 *
 * Property 22: For any set of Performance_Records within the most recent 30 days,
 * the average time per section SHALL equal the sum of time_taken divided by the count
 * of records for that section.
 *
 * Property 24: For any section where a student has fewer than 5 Performance_Records,
 * the Analytics Dashboard SHALL display an insufficient data message.
 */
export function computeAvgTimePerSection(
  records: (Pick<PerformanceRecord, 'time_taken_seconds'> & { section: Section })[]
): AvgTimePerSection[] {
  const sections = Object.values(Section);
  const results: AvgTimePerSection[] = [];

  for (const section of sections) {
    const sectionRecords = records.filter((r) => r.section === section);
    const totalRecords = sectionRecords.length;

    if (totalRecords < INSUFFICIENT_DATA_THRESHOLD) {
      results.push({
        section,
        avgTimeSeconds: 0,
        totalRecords,
        insufficientData: true,
      });
    } else {
      const totalTime = sectionRecords.reduce((sum, r) => sum + r.time_taken_seconds, 0);
      results.push({
        section,
        avgTimeSeconds: totalTime / totalRecords,
        totalRecords,
        insufficientData: false,
      });
    }
  }

  return results;
}

/**
 * Compute accuracy per section from performance records.
 *
 * Property 23: For any set of Performance_Records within the most recent 30 days,
 * the accuracy per section SHALL equal the count of records where is_correct is true
 * divided by the total count of records for that section.
 *
 * Property 24: For any section where a student has fewer than 5 Performance_Records,
 * the Analytics Dashboard SHALL display an insufficient data message.
 */
export function computeAccuracyPerSection(
  records: (Pick<PerformanceRecord, 'is_correct'> & { section: Section })[]
): AccuracyPerSection[] {
  const sections = Object.values(Section);
  const results: AccuracyPerSection[] = [];

  for (const section of sections) {
    const sectionRecords = records.filter((r) => r.section === section);
    const totalRecords = sectionRecords.length;

    if (totalRecords < INSUFFICIENT_DATA_THRESHOLD) {
      results.push({
        section,
        accuracy: 0,
        totalRecords,
        correct: 0,
        insufficientData: true,
      });
    } else {
      const correct = sectionRecords.filter((r) => r.is_correct).length;
      results.push({
        section,
        accuracy: correct / totalRecords,
        totalRecords,
        correct,
        insufficientData: false,
      });
    }
  }

  return results;
}

// ─── Main Dashboard Function ──────────────────────────────────────────────────

/** Database row for performance records joined with questions (for section info) */
interface PerformanceRecordWithSection {
  record_id: string;
  user_id: string;
  session_id: string;
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean;
  time_taken_seconds: number;
  timestamp: Date;
  section: Section;
}

/** Database row for weakness profiles */
interface WeaknessProfileRow {
  profile_id: string;
  user_id: string;
  skill_tag: string;
  section: Section;
  accuracy: number;
  attempt_count: number;
}

/**
 * Analytics Service class with dependency injection for testability.
 */
export class AnalyticsService {
  private readonly queryManyFn: typeof queryMany;

  constructor(deps?: { queryMany?: typeof queryMany }) {
    this.queryManyFn = deps?.queryMany ?? queryMany;
  }

  /**
   * Get the full student dashboard.
   *
   * Steps:
   * 1. Validate userId
   * 2. Query performance_records for the last 30 days (joined with questions for section)
   * 3. Query weakness_profiles for the student
   * 4. Compute score trends (accuracy per day per section)
   * 5. Compute weak skills (from weakness_profiles, up to 10 with accuracy < 60%)
   * 6. Compute avg time per question per section
   * 7. Compute accuracy per section
   * 8. Return full dashboard payload
   *
   * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
   */
  async getStudentDashboard(userId: string): Promise<AnalyticsDashboardResult> {
    // Step 1: Validate userId
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return { error: 'userId is required' };
    }

    // Step 2: Query performance records for last 30 days with section info
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - ANALYTICS_WINDOW_DAYS);

    const records = await this.queryManyFn<PerformanceRecordWithSection>(
      `SELECT pr.record_id, pr.user_id, pr.session_id, pr.question_id,
              pr.selected_answer, pr.is_correct, pr.time_taken_seconds, pr.timestamp,
              q.section
       FROM performance_records pr
       JOIN questions q ON pr.question_id = q.question_id
       WHERE pr.user_id = $1 AND pr.timestamp >= $2
       ORDER BY pr.timestamp ASC`,
      [userId, thirtyDaysAgo]
    );

    // Step 3: Query weakness profiles
    const profiles = await this.queryManyFn<WeaknessProfileRow>(
      `SELECT profile_id, user_id, skill_tag, section, accuracy, attempt_count
       FROM weakness_profiles
       WHERE user_id = $1`,
      [userId]
    );

    // Step 4: Compute score trends
    const scoreTrends = computeScoreTrendsFromRecords(records);

    // Step 5: Compute weak skills
    const weakSkills = computeWeakSkills(profiles);

    // Step 6: Compute avg time per section
    const avgTimePerSection = computeAvgTimePerSection(records);

    // Step 7: Compute accuracy per section
    const accuracyPerSection = computeAccuracyPerSection(records);

    return {
      scoreTrends,
      weakSkills,
      avgTimePerSection,
      accuracyPerSection,
    };
  }
}
