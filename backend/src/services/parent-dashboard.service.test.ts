/**
 * Parent Dashboard Service Tests
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 * Properties: 25 (Parent Dashboard Aggregation), 26 (Parent Access Control)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkStatus, Role } from '../models/enums';

// Mock the database module
vi.mock('../utils/database', () => ({
  queryOne: vi.fn(),
  queryMany: vi.fn(),
}));

import { queryOne, queryMany } from '../utils/database';
import {
  getParentDashboard,
  computeDashboardMetrics,
  ParentDashboardResult,
} from './parent-dashboard.service';

const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);

describe('Parent Dashboard Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Test Data ────────────────────────────────────────────────────────────────

  const parentId = 'parent-uuid-1';
  const studentId = 'student-uuid-1';

  const mockParent = {
    user_id: parentId,
    role: Role.Parent,
  };

  const mockStudent = {
    user_id: studentId,
    name: 'Jane Student',
    email: 'jane@example.com',
  };

  const mockAcceptedLink = {
    link_id: 'link-uuid-1',
    parent_id: parentId,
    student_id: studentId,
    student_email: 'jane@example.com',
    status: LinkStatus.Accepted,
    created_at: new Date(),
  };

  const mockPerformanceRecords = [
    {
      session_id: 'session-1',
      is_correct: true,
      time_taken_seconds: 30,
      timestamp: new Date('2024-01-15'),
      section: 'math',
    },
    {
      session_id: 'session-1',
      is_correct: false,
      time_taken_seconds: 45,
      timestamp: new Date('2024-01-15'),
      section: 'math',
    },
    {
      session_id: 'session-2',
      is_correct: true,
      time_taken_seconds: 20,
      timestamp: new Date('2024-01-16'),
      section: 'english',
    },
  ];

  // ─── Validation Tests ─────────────────────────────────────────────────────────

  describe('Input validation', () => {
    it('should return error when parentId is empty', async () => {
      const result = await getParentDashboard('');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toBe('Parent ID is required');
      }
    });

    it('should return error when parentId is whitespace only', async () => {
      const result = await getParentDashboard('   ');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toBe('Parent ID is required');
      }
    });

    it('should return error when parent is not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getParentDashboard(parentId);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toBe('Parent not found');
      }
    });

    it('should return error when user is not a parent', async () => {
      mockQueryOne.mockResolvedValueOnce({ user_id: parentId, role: Role.Student });

      const result = await getParentDashboard(parentId);
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toBe('User is not a parent');
      }
    });
  });

  // ─── Access Control Tests (Property 26) ───────────────────────────────────────

  describe('Parent Access Control (Property 26)', () => {
    it('should restrict access to accepted links only', async () => {
      // Parent exists
      mockQueryOne.mockResolvedValueOnce(mockParent);
      // Linked students: returns accepted link
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      // Verify access - no accepted link found for requested student
      mockQueryOne.mockResolvedValueOnce(null);

      const result = await getParentDashboard(parentId, 'other-student-id');
      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.message).toContain('Access denied');
      }
    });

    it('should only query for accepted links (not pending or rejected)', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([]);

      await getParentDashboard(parentId);

      expect(mockQueryMany).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        [parentId, LinkStatus.Accepted]
      );
    });

    it('should grant access when accepted link exists', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]); // Linked students
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' }); // Access check passes
      mockQueryOne.mockResolvedValueOnce(mockStudent); // Student info
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords); // Performance records
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce([]); // Accuracy trend

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
    });
  });

  // ─── Empty States ─────────────────────────────────────────────────────────────

  describe('Empty states', () => {
    it('should return no_linked_students when parent has no accepted links (Req 8.7)', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([]); // No linked students

      const result = await getParentDashboard(parentId);
      expect(result.type).toBe('no_linked_students');
      if (result.type === 'no_linked_students') {
        expect(result.message).toContain('No linked students');
        expect(result.message).toContain('link invitation');
      }
    });

    it('should return no_performance_data when student has no records (Req 8.8)', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]); // Linked students
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' }); // Access check
      mockQueryOne.mockResolvedValueOnce(mockStudent); // Student info
      mockQueryMany.mockResolvedValueOnce([]); // No performance records

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('no_performance_data');
      if (result.type === 'no_performance_data') {
        expect(result.studentId).toBe(studentId);
        expect(result.studentName).toBe('Jane Student');
        expect(result.message).toContain('No study data');
      }
    });
  });

  // ─── Multiple Students (Req 8.2) ─────────────────────────────────────────────

  describe('Multiple linked students (Req 8.2)', () => {
    it('should return student selection when multiple students and no studentId provided', async () => {
      const multipleLinks = [
        { ...mockAcceptedLink, student_id: 'student-1' },
        { ...mockAcceptedLink, link_id: 'link-2', student_id: 'student-2' },
      ];

      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce(multipleLinks); // Multiple linked students
      mockQueryMany.mockResolvedValueOnce([
        { user_id: 'student-1', name: 'Alice', email: 'alice@example.com' },
        { user_id: 'student-2', name: 'Bob', email: 'bob@example.com' },
      ]); // Student details

      const result = await getParentDashboard(parentId);
      expect(result.type).toBe('student_selection');
      if (result.type === 'student_selection') {
        expect(result.linkedStudents).toHaveLength(2);
        expect(result.linkedStudents[0].studentId).toBe('student-1');
        expect(result.linkedStudents[0].name).toBe('Alice');
        expect(result.linkedStudents[1].studentId).toBe('student-2');
        expect(result.linkedStudents[1].name).toBe('Bob');
      }
    });

    it('should auto-select when only one linked student and no studentId', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]); // Single linked student
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' }); // Access check
      mockQueryOne.mockResolvedValueOnce(mockStudent); // Student info
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords); // Performance records
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce([]); // Accuracy trend

      const result = await getParentDashboard(parentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.studentId).toBe(studentId);
      }
    });

    it('should return specific student when studentId provided with multiple students', async () => {
      const multipleLinks = [
        { ...mockAcceptedLink, student_id: 'student-1' },
        { ...mockAcceptedLink, link_id: 'link-2', student_id: 'student-2' },
      ];

      mockQueryOne.mockResolvedValueOnce(mockParent); // Parent exists
      mockQueryMany.mockResolvedValueOnce(multipleLinks); // Multiple linked students
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' }); // Access check passes
      mockQueryOne.mockResolvedValueOnce({ user_id: 'student-1', name: 'Alice', email: 'alice@example.com' }); // Student info
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords); // Performance records
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce([]); // Accuracy trend

      const result = await getParentDashboard(parentId, 'student-1');
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.studentId).toBe('student-1');
      }
    });
  });

  // ─── Dashboard Metrics (Property 25: Parent Dashboard Aggregation) ────────────

  describe('Dashboard metrics (Property 25)', () => {
    it('should compute total time as sum of all time_taken values', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce([]); // Trends

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        // 30 + 45 + 20 = 95
        expect(result.data.totalTimeSeconds).toBe(95);
      }
    });

    it('should compute sessions completed as count of distinct session_ids', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce([]);
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        // session-1 and session-2 = 2 sessions
        expect(result.data.sessionsCompleted).toBe(2);
      }
    });

    it('should compute overall accuracy as correct / total across all sections', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce([]);
      mockQueryMany.mockResolvedValueOnce([]);

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        // 2 correct out of 3 total = 0.666...
        expect(result.data.overallAccuracy).toBeCloseTo(2 / 3);
      }
    });
  });

  // ─── Accuracy Trend (Req 8.3) ─────────────────────────────────────────────────

  describe('Accuracy trend per section (Req 8.3)', () => {
    it('should return accuracy trend data points', async () => {
      const trendData = [
        { day: '2024-01-15', section: 'math', total: '5', correct: '3' },
        { day: '2024-01-15', section: 'english', total: '3', correct: '2' },
        { day: '2024-01-16', section: 'math', total: '4', correct: '4' },
      ];

      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords); // Performance records
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce(trendData); // Trends

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.accuracyTrend).toHaveLength(3);
        expect(result.data.accuracyTrend[0]).toEqual({
          date: '2024-01-15',
          section: 'math',
          accuracy: 3 / 5,
          totalQuestions: 5,
          correctAnswers: 3,
        });
        expect(result.data.accuracyTrend[2]).toEqual({
          date: '2024-01-16',
          section: 'math',
          accuracy: 1.0,
          totalQuestions: 4,
          correctAnswers: 4,
        });
      }
    });

    it('should return empty trend when no recent data', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce([]); // Weak skills
      mockQueryMany.mockResolvedValueOnce([]); // No trend data

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.accuracyTrend).toEqual([]);
      }
    });
  });

  // ─── Weak Skill Tags (Req 8.4) ────────────────────────────────────────────────

  describe('Weak skill tags (Req 8.4)', () => {
    it('should return weak skill tags with accuracy below 60%', async () => {
      const weakSkills = [
        { skill_tag: 'quadratic_equations', section: 'math', accuracy: 0.35, attempt_count: 10 },
        { skill_tag: 'grammar_rules', section: 'english', accuracy: 0.50, attempt_count: 8 },
      ];

      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce(weakSkills); // Weak skills from DB
      mockQueryMany.mockResolvedValueOnce([]); // Trends

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.weakSkillTags).toHaveLength(2);
        expect(result.data.weakSkillTags[0]).toEqual({
          skillTag: 'quadratic_equations',
          section: 'math',
          accuracy: 0.35,
          attemptCount: 10,
        });
        expect(result.data.weakSkillTags[1]).toEqual({
          skillTag: 'grammar_rules',
          section: 'english',
          accuracy: 0.50,
          attemptCount: 8,
        });
      }
    });

    it('should return empty weak skills when student has no weak areas', async () => {
      mockQueryOne.mockResolvedValueOnce(mockParent);
      mockQueryMany.mockResolvedValueOnce([mockAcceptedLink]);
      mockQueryOne.mockResolvedValueOnce({ link_id: 'link-1' });
      mockQueryOne.mockResolvedValueOnce(mockStudent);
      mockQueryMany.mockResolvedValueOnce(mockPerformanceRecords);
      mockQueryMany.mockResolvedValueOnce([]); // No weak skills
      mockQueryMany.mockResolvedValueOnce([]); // Trends

      const result = await getParentDashboard(parentId, studentId);
      expect(result.type).toBe('dashboard');
      if (result.type === 'dashboard') {
        expect(result.data.weakSkillTags).toEqual([]);
      }
    });
  });

  // ─── computeDashboardMetrics unit tests ────────────────────────────────────────

  describe('computeDashboardMetrics', () => {
    it('should compute correct totals for given records', () => {
      const records = [
        { session_id: 's1', is_correct: true, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's1', is_correct: false, time_taken_seconds: 15, timestamp: new Date(), section: 'math' },
        { session_id: 's2', is_correct: true, time_taken_seconds: 20, timestamp: new Date(), section: 'english' },
        { session_id: 's3', is_correct: true, time_taken_seconds: 25, timestamp: new Date(), section: 'reading' },
      ];

      const result = computeDashboardMetrics('student-1', 'Test Student', records);

      expect(result.totalTimeSeconds).toBe(70); // 10 + 15 + 20 + 25
      expect(result.sessionsCompleted).toBe(3); // s1, s2, s3
      expect(result.overallAccuracy).toBe(3 / 4); // 3 correct out of 4
    });

    it('should return zeros for empty records', () => {
      const result = computeDashboardMetrics('student-1', 'Test Student', []);

      expect(result.totalTimeSeconds).toBe(0);
      expect(result.sessionsCompleted).toBe(0);
      expect(result.overallAccuracy).toBe(0);
    });

    it('should handle all-correct records', () => {
      const records = [
        { session_id: 's1', is_correct: true, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's1', is_correct: true, time_taken_seconds: 20, timestamp: new Date(), section: 'math' },
      ];

      const result = computeDashboardMetrics('student-1', 'Test Student', records);
      expect(result.overallAccuracy).toBe(1.0);
    });

    it('should handle all-incorrect records', () => {
      const records = [
        { session_id: 's1', is_correct: false, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's1', is_correct: false, time_taken_seconds: 20, timestamp: new Date(), section: 'math' },
      ];

      const result = computeDashboardMetrics('student-1', 'Test Student', records);
      expect(result.overallAccuracy).toBe(0);
    });

    it('should count distinct sessions correctly', () => {
      const records = [
        { session_id: 's1', is_correct: true, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's1', is_correct: true, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's1', is_correct: false, time_taken_seconds: 10, timestamp: new Date(), section: 'math' },
        { session_id: 's2', is_correct: true, time_taken_seconds: 10, timestamp: new Date(), section: 'english' },
      ];

      const result = computeDashboardMetrics('student-1', 'Test Student', records);
      expect(result.sessionsCompleted).toBe(2); // Only s1 and s2
    });
  });
});
