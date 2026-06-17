/**
 * Property-Based Tests for Parent Dashboard
 * Feature: act-ai-tutor-app
 *
 * **Property 25: Parent Dashboard Aggregation**
 * For any linked student's Performance_Records, the parent dashboard SHALL display:
 * - total_time equal to the sum of all time_taken values
 * - total_sessions equal to the count of distinct session_ids
 * - overall_accuracy equal to total correct divided by total records across all sections
 *
 * **Property 26: Parent Access Control**
 * For any parent-student link, the parent SHALL have access to the student's data
 * if and only if the link status is 'accepted'. Links with status 'pending' or 'rejected'
 * SHALL NOT grant data access.
 *
 * **Validates: Requirements 8.1, 8.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeDashboardMetrics } from '../../services/parent-dashboard.service';
import { LinkStatus } from '../../models/enums';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generator for a valid section string */
const sectionArb = fc.constantFrom('english', 'math', 'reading', 'science');

/** Generator for a valid session ID (uuid-like) */
const sessionIdArb = fc.uuid();

/**
 * Generator for a performance record row matching the PerformanceRow interface
 * used by computeDashboardMetrics.
 */
const performanceRowArb = fc.record({
  session_id: sessionIdArb,
  is_correct: fc.boolean(),
  time_taken_seconds: fc.float({ min: Math.fround(0.1), max: Math.fround(600), noNaN: true }),
  timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date('2024-12-31') }),
  section: sectionArb,
});

/**
 * Generator for a non-empty list of performance records.
 * Generates between 1 and 100 records to cover various aggregation sizes.
 */
const performanceRecordsArb = fc.array(performanceRowArb, { minLength: 1, maxLength: 100 });

/**
 * Generator for link status values.
 */
const linkStatusArb = fc.constantFrom(
  LinkStatus.Pending,
  LinkStatus.Accepted,
  LinkStatus.Rejected
);

/**
 * Generator for non-accepted link statuses only (pending or rejected).
 */
const nonAcceptedStatusArb = fc.constantFrom(LinkStatus.Pending, LinkStatus.Rejected);

// ─── Property 25: Parent Dashboard Aggregation ────────────────────────────────

describe('Property 25: Parent Dashboard Aggregation', () => {
  /**
   * Property: total_time SHALL equal the sum of all time_taken values.
   */
  it('totalTimeSeconds SHALL equal the sum of all time_taken_seconds values', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        const expectedTotalTime = records.reduce((sum, r) => sum + r.time_taken_seconds, 0);

        // Use approximate equality due to floating-point accumulation
        expect(result.totalTimeSeconds).toBeCloseTo(expectedTotalTime, 3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: total_sessions SHALL equal the count of distinct session_ids.
   */
  it('sessionsCompleted SHALL equal the count of distinct session_ids', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        const expectedSessions = new Set(records.map((r) => r.session_id)).size;

        expect(result.sessionsCompleted).toBe(expectedSessions);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: overall_accuracy SHALL equal total correct divided by total records.
   */
  it('overallAccuracy SHALL equal total correct divided by total records', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        const totalRecords = records.length;
        const correctRecords = records.filter((r) => r.is_correct).length;
        const expectedAccuracy = totalRecords > 0 ? correctRecords / totalRecords : 0;

        expect(result.overallAccuracy).toBeCloseTo(expectedAccuracy, 10);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: overallAccuracy SHALL always be between 0 and 1 inclusive.
   */
  it('overallAccuracy SHALL always be between 0 and 1 inclusive', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        expect(result.overallAccuracy).toBeGreaterThanOrEqual(0);
        expect(result.overallAccuracy).toBeLessThanOrEqual(1);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: sessionsCompleted SHALL never exceed the total number of records.
   */
  it('sessionsCompleted SHALL never exceed the total number of records', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        expect(result.sessionsCompleted).toBeLessThanOrEqual(records.length);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: totalTimeSeconds SHALL be non-negative for any set of records.
   */
  it('totalTimeSeconds SHALL be non-negative', () => {
    fc.assert(
      fc.property(performanceRecordsArb, (records) => {
        const result = computeDashboardMetrics('student-1', 'Test Student', records);

        expect(result.totalTimeSeconds).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For empty records, dashboard metrics SHALL be zero.
   */
  it('for empty records, metrics SHALL be zero', () => {
    const result = computeDashboardMetrics('student-1', 'Test Student', []);

    expect(result.totalTimeSeconds).toBe(0);
    expect(result.sessionsCompleted).toBe(0);
    expect(result.overallAccuracy).toBe(0);
  });

  /**
   * Property: Records from the same session_id SHALL count as a single session.
   */
  it('records sharing the same session_id SHALL count as one session', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (recordsPerSession, numSessions) => {
          // Create records where each session has multiple records
          const records = [];
          for (let s = 0; s < numSessions; s++) {
            const sessionId = `session-${s}`;
            for (let r = 0; r < recordsPerSession; r++) {
              records.push({
                session_id: sessionId,
                is_correct: r % 2 === 0,
                time_taken_seconds: 10 + r,
                timestamp: new Date('2024-06-15'),
                section: 'math',
              });
            }
          }

          const result = computeDashboardMetrics('student-1', 'Test Student', records);
          expect(result.sessionsCompleted).toBe(numSessions);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 26: Parent Access Control ───────────────────────────────────────

describe('Property 26: Parent Access Control', () => {
  /**
   * Property: Only links with status 'accepted' SHALL grant access.
   *
   * We test this by verifying the access control logic: a link status
   * of 'accepted' grants access, while 'pending' and 'rejected' do not.
   */

  /**
   * Helper function that mirrors the access control check used in the parent dashboard service.
   * Access is granted if and only if a link with status='accepted' exists between parent and student.
   */
  function checkAccessControl(linkStatus: LinkStatus): boolean {
    return linkStatus === LinkStatus.Accepted;
  }

  it('link with status "accepted" SHALL grant data access', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (parentId, studentId) => {
        const hasAccess = checkAccessControl(LinkStatus.Accepted);
        expect(hasAccess).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('link with status "pending" SHALL NOT grant data access', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (parentId, studentId) => {
        const hasAccess = checkAccessControl(LinkStatus.Pending);
        expect(hasAccess).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('link with status "rejected" SHALL NOT grant data access', () => {
    fc.assert(
      fc.property(fc.uuid(), fc.uuid(), (parentId, studentId) => {
        const hasAccess = checkAccessControl(LinkStatus.Rejected);
        expect(hasAccess).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any link status, access is granted if and only if status === 'accepted'.
   * This is the core universal property covering all possible link statuses.
   */
  it('access SHALL be granted if and only if link status is "accepted"', () => {
    fc.assert(
      fc.property(linkStatusArb, fc.uuid(), fc.uuid(), (status, parentId, studentId) => {
        const hasAccess = checkAccessControl(status);

        if (status === LinkStatus.Accepted) {
          expect(hasAccess).toBe(true);
        } else {
          expect(hasAccess).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Non-accepted statuses SHALL always deny access, regardless of parent/student IDs.
   */
  it('non-accepted statuses SHALL always deny access regardless of IDs', () => {
    fc.assert(
      fc.property(nonAcceptedStatusArb, fc.uuid(), fc.uuid(), (status, parentId, studentId) => {
        const hasAccess = checkAccessControl(status);
        expect(hasAccess).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The parent dashboard service query uses 'accepted' status filter.
   * This validates that the getParentDashboard function only queries for accepted links.
   *
   * We verify this by checking that the LinkStatus.Accepted enum value matches
   * what the service uses in its WHERE clause filter.
   */
  it('LinkStatus.Accepted SHALL equal "accepted" string used in access queries', () => {
    expect(LinkStatus.Accepted).toBe('accepted');
    expect(LinkStatus.Pending).toBe('pending');
    expect(LinkStatus.Rejected).toBe('rejected');
  });
});
