/**
 * Parent Dashboard Service
 *
 * Provides analytics data for parents viewing their linked student's performance.
 * Displays total time spent, sessions completed, overall accuracy, accuracy trends
 * per section (30 days), and weak skill tags.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 * Properties: 25 (Parent Dashboard Aggregation), 26 (Parent Access Control)
 */

import { queryMany, queryOne } from '../utils/database';
import { LinkStatus } from '../models/enums';
import { ParentStudentLink, User } from '../models/interfaces';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A linked student summary returned when parent has multiple students */
export interface LinkedStudentSummary {
  studentId: string;
  name: string;
  email: string;
}

/** Accuracy trend data point per section per day */
export interface AccuracyTrendPoint {
  date: string;
  section: string;
  accuracy: number;
  totalQuestions: number;
  correctAnswers: number;
}

/** Weak skill tag entry */
export interface WeakSkillTag {
  skillTag: string;
  section: string;
  accuracy: number;
  attemptCount: number;
}

/** Dashboard data for a single student */
export interface ParentDashboardData {
  studentId: string;
  studentName: string;
  totalTimeSeconds: number;
  sessionsCompleted: number;
  overallAccuracy: number;
  accuracyTrend: AccuracyTrendPoint[];
  weakSkillTags: WeakSkillTag[];
}

/** Response when parent has multiple students and none selected */
export interface StudentSelectionResponse {
  type: 'student_selection';
  linkedStudents: LinkedStudentSummary[];
}

/** Response with dashboard data */
export interface DashboardResponse {
  type: 'dashboard';
  data: ParentDashboardData;
}

/** Empty state: no linked students */
export interface NoLinkedStudentsResponse {
  type: 'no_linked_students';
  message: string;
}

/** Empty state: no performance data */
export interface NoPerformanceDataResponse {
  type: 'no_performance_data';
  studentId: string;
  studentName: string;
  message: string;
}

/** Error response */
export interface ParentDashboardError {
  type: 'error';
  message: string;
}

export type ParentDashboardResult =
  | StudentSelectionResponse
  | DashboardResponse
  | NoLinkedStudentsResponse
  | NoPerformanceDataResponse
  | ParentDashboardError;

// ─── Helper Types ─────────────────────────────────────────────────────────────

interface PerformanceRow {
  session_id: string;
  is_correct: boolean;
  time_taken_seconds: number;
  timestamp: Date;
  section: string;
}

interface TrendRow {
  day: string;
  section: string;
  total: string;
  correct: string;
}

interface WeakProfileRow {
  skill_tag: string;
  section: string;
  accuracy: number;
  attempt_count: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Get the parent dashboard data for a given parent, optionally for a specific student.
 *
 * Flow:
 * 1. Validate parent exists and has 'parent' role
 * 2. Get linked students (accepted status only - Req 8.5)
 * 3. If no linked students → return prompt to invite (Req 8.7)
 * 4. If no studentId provided and multiple students → return student list (Req 8.2)
 * 5. Verify access to specific student (Property 26)
 * 6. Fetch performance data for student
 * 7. If no performance data → return empty state message (Req 8.8)
 * 8. Compute metrics: total time, sessions, accuracy, trends, weak skills
 */
export async function getParentDashboard(
  parentId: string,
  studentId?: string
): Promise<ParentDashboardResult> {
  // Validate parentId
  if (!parentId || parentId.trim() === '') {
    return { type: 'error', message: 'Parent ID is required' };
  }

  // Verify parent exists and has parent role
  const parent = await queryOne<User>(
    'SELECT user_id, role FROM users WHERE user_id = $1',
    [parentId]
  );

  if (!parent) {
    return { type: 'error', message: 'Parent not found' };
  }

  if (parent.role !== 'parent') {
    return { type: 'error', message: 'User is not a parent' };
  }

  // Get linked students with accepted status only (Req 8.5, Property 26)
  const linkedStudents = await queryMany<ParentStudentLink>(
    `SELECT link_id, parent_id, student_id, student_email, status, created_at
     FROM parent_student_links
     WHERE parent_id = $1 AND status = $2`,
    [parentId, LinkStatus.Accepted]
  );

  // Empty state: no linked students (Req 8.7)
  if (linkedStudents.length === 0) {
    return {
      type: 'no_linked_students',
      message: 'No linked students are available. Send a link invitation to connect with a student.',
    };
  }

  // If no studentId provided and multiple linked students → return list (Req 8.2)
  if (!studentId && linkedStudents.length > 1) {
    const studentIds = linkedStudents
      .map((l) => l.student_id)
      .filter((id): id is string => id !== null);

    const students = await queryMany<User>(
      `SELECT user_id, name, email FROM users WHERE user_id = ANY($1)`,
      [studentIds]
    );

    const summaries: LinkedStudentSummary[] = students.map((s) => ({
      studentId: s.user_id,
      name: s.name,
      email: s.email,
    }));

    return {
      type: 'student_selection',
      linkedStudents: summaries,
    };
  }

  // Determine which student to show
  const targetStudentId = studentId || linkedStudents[0].student_id;

  if (!targetStudentId) {
    return { type: 'error', message: 'No valid student ID found in links' };
  }

  // Verify the parent has access to this specific student (Property 26)
  const hasAccess = await queryOne<ParentStudentLink>(
    `SELECT link_id FROM parent_student_links
     WHERE parent_id = $1 AND student_id = $2 AND status = $3`,
    [parentId, targetStudentId, LinkStatus.Accepted]
  );

  if (!hasAccess) {
    return { type: 'error', message: 'Access denied. No accepted link exists for this student.' };
  }

  // Fetch student info
  const student = await queryOne<User>(
    'SELECT user_id, name, email FROM users WHERE user_id = $1',
    [targetStudentId]
  );

  if (!student) {
    return { type: 'error', message: 'Student not found' };
  }

  // Fetch all performance records for the student
  const allRecords = await queryMany<PerformanceRow>(
    `SELECT pr.session_id, pr.is_correct, pr.time_taken_seconds, pr.timestamp, q.section
     FROM performance_records pr
     JOIN questions q ON pr.question_id = q.question_id
     WHERE pr.user_id = $1`,
    [targetStudentId]
  );

  // Empty state: no performance data (Req 8.8)
  if (allRecords.length === 0) {
    return {
      type: 'no_performance_data',
      studentId: targetStudentId,
      studentName: student.name,
      message: 'No study data is available yet for this student.',
    };
  }

  // Compute dashboard metrics (Property 25)
  const dashboardData = computeDashboardMetrics(
    targetStudentId,
    student.name,
    allRecords
  );

  // Fetch weak skill tags (Req 8.4, Property 21)
  const weakSkills = await getWeakSkillTags(targetStudentId);
  dashboardData.weakSkillTags = weakSkills;

  // Fetch accuracy trend per section over 30 days (Req 8.3)
  const trends = await getAccuracyTrend(targetStudentId);
  dashboardData.accuracyTrend = trends;

  return {
    type: 'dashboard',
    data: dashboardData,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Compute the dashboard metrics from performance records.
 *
 * Property 25:
 * - total_time = sum of all time_taken values
 * - total_sessions = count of distinct session_ids
 * - overall_accuracy = total correct / total records across all sections
 */
export function computeDashboardMetrics(
  studentId: string,
  studentName: string,
  records: PerformanceRow[]
): ParentDashboardData {
  const totalTimeSeconds = records.reduce((sum, r) => sum + r.time_taken_seconds, 0);

  const uniqueSessions = new Set(records.map((r) => r.session_id));
  const sessionsCompleted = uniqueSessions.size;

  const totalRecords = records.length;
  const correctRecords = records.filter((r) => r.is_correct).length;
  const overallAccuracy = totalRecords > 0 ? correctRecords / totalRecords : 0;

  return {
    studentId,
    studentName,
    totalTimeSeconds,
    sessionsCompleted,
    overallAccuracy,
    accuracyTrend: [],
    weakSkillTags: [],
  };
}

/**
 * Get accuracy trend per section over the last 30 days (Req 8.3).
 * Returns one data point per day per section where sessions occurred.
 */
async function getAccuracyTrend(studentId: string): Promise<AccuracyTrendPoint[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const rows = await queryMany<TrendRow>(
    `SELECT
       DATE(pr.timestamp) as day,
       q.section,
       COUNT(*)::text as total,
       SUM(CASE WHEN pr.is_correct THEN 1 ELSE 0 END)::text as correct
     FROM performance_records pr
     JOIN questions q ON pr.question_id = q.question_id
     WHERE pr.user_id = $1 AND pr.timestamp >= $2
     GROUP BY DATE(pr.timestamp), q.section
     ORDER BY day ASC, q.section`,
    [studentId, thirtyDaysAgo]
  );

  return rows.map((row) => {
    const total = parseInt(row.total, 10);
    const correct = parseInt(row.correct, 10);
    return {
      date: row.day,
      section: row.section,
      accuracy: total > 0 ? correct / total : 0,
      totalQuestions: total,
      correctAnswers: correct,
    };
  });
}

/**
 * Get weak skill tags for a student (Req 8.4, Property 21).
 * Returns up to 10 skill tags with accuracy < 60%, ranked lowest to highest.
 */
async function getWeakSkillTags(studentId: string): Promise<WeakSkillTag[]> {
  const rows = await queryMany<WeakProfileRow>(
    `SELECT skill_tag, section, accuracy, attempt_count
     FROM weakness_profiles
     WHERE user_id = $1 AND accuracy < 0.60
     ORDER BY accuracy ASC
     LIMIT 10`,
    [studentId]
  );

  return rows.map((row) => ({
    skillTag: row.skill_tag,
    section: row.section,
    accuracy: row.accuracy,
    attemptCount: row.attempt_count,
  }));
}
