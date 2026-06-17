/**
 * Unit Tests for Sync Service
 * Tests offline-to-online sync with last-write-wins conflict resolution.
 *
 * Requirements: 10.2, 10.3, 10.4
 * Design Property 28: Sync Conflict Resolution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SyncService,
  LocalPerformanceRecord,
  LocalWeaknessProfile,
  LocalStudyPlan,
  SyncResult,
  SyncAllResult,
} from './sync.service';

// ─── Mock Data ────────────────────────────────────────────────────────────────

const userId = 'user-001';

function makeLocalRecord(overrides?: Partial<LocalPerformanceRecord>): LocalPerformanceRecord {
  return {
    record_id: 'local-record-001',
    user_id: userId,
    session_id: 'session-100',
    question_id: 'question-200',
    selected_answer: 'A',
    is_correct: true,
    time_taken_seconds: 15.5,
    error_classification: null,
    timestamp: new Date('2024-03-15T10:30:00Z'),
    ...overrides,
  };
}

function makeLocalWeaknessProfile(overrides?: Partial<LocalWeaknessProfile>): LocalWeaknessProfile {
  return {
    profile_id: 'profile-001',
    user_id: userId,
    skill_tag: 'algebra_linear_equations',
    section: 'math',
    accuracy: 0.75,
    attempt_count: 12,
    recent_attempts: [
      { is_correct: true, timestamp: '2024-03-15T10:00:00Z' },
      { is_correct: false, timestamp: '2024-03-15T10:05:00Z' },
    ],
    updated_at: new Date('2024-03-15T10:30:00Z'),
    ...overrides,
  };
}

function makeLocalStudyPlan(overrides?: Partial<LocalStudyPlan>): LocalStudyPlan {
  return {
    plan_id: 'plan-001',
    user_id: userId,
    daily_targets: [{ skill_tag: 'algebra_linear_equations', section: 'math', question_count: 5 }],
    weekly_goals: [{ skill_tag: 'algebra_linear_equations', target_accuracy: 0.8 }],
    projected_score_range: { lower: 24, upper: 28 },
    created_at: new Date('2024-03-15T10:30:00Z'),
    valid_until: new Date('2024-03-22T10:30:00Z'),
    ...overrides,
  };
}

// ─── syncPerformanceRecords Tests ─────────────────────────────────────────────

describe('SyncService.syncPerformanceRecords', () => {
  let service: SyncService;
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockQueryMany: ReturnType<typeof vi.fn>;
  let mockInsertOne: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryOne = vi.fn();
    mockQueryMany = vi.fn();
    mockInsertOne = vi.fn().mockResolvedValue({ record_id: 'inserted-record' });

    service = new SyncService({
      queryOne: mockQueryOne,
      queryMany: mockQueryMany,
      insertOne: mockInsertOne,
    });
  });

  // ─── Empty / No Records ─────────────────────────────────────────────────────

  it('should return zero counts for empty localRecords array', async () => {
    const result = await service.syncPerformanceRecords(userId, []);
    expect(result).toEqual({ synced: 0, conflicts: 0, errors: 0 });
  });

  it('should return zero counts for null/undefined inputs', async () => {
    const result = await service.syncPerformanceRecords('', []);
    expect(result).toEqual({ synced: 0, conflicts: 0, errors: 0 });
  });

  // ─── No Conflict (Insert) ──────────────────────────────────────────────────

  it('should insert record when no server-side record exists for same session_id + question_id', async () => {
    mockQueryOne.mockResolvedValue(null); // No existing record

    const localRecord = makeLocalRecord();
    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(1);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toBe(0);

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const [sql, params] = mockInsertOne.mock.calls[0];
    expect(sql).toContain('INSERT INTO performance_records');
    expect(params[1]).toBe(userId);
    expect(params[2]).toBe('session-100');
    expect(params[3]).toBe('question-200');
    expect(params[4]).toBe('A');
    expect(params[5]).toBe(true);
    expect(params[6]).toBe(15.5);
  });

  // ─── Conflict: Local Newer (Last-Write-Wins) ───────────────────────────────

  it('should update server record when local timestamp is more recent (last-write-wins)', async () => {
    // Server has an older record
    const serverRecord = {
      record_id: 'server-record-001',
      session_id: 'session-100',
      question_id: 'question-200',
      timestamp: new Date('2024-03-15T09:00:00Z'), // older
    };
    mockQueryOne
      .mockResolvedValueOnce(serverRecord)   // existing record lookup
      .mockResolvedValueOnce({ record_id: 'server-record-001' }); // UPDATE result

    const localRecord = makeLocalRecord({
      timestamp: new Date('2024-03-15T10:30:00Z'), // newer
    });

    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(1);
    expect(result.conflicts).toBe(1);
    expect(result.errors).toBe(0);

    // Verify UPDATE was called (via queryOne for the UPDATE ... RETURNING)
    expect(mockQueryOne).toHaveBeenCalledTimes(2);
    const [updateSql, updateParams] = mockQueryOne.mock.calls[1];
    expect(updateSql).toContain('UPDATE performance_records');
    expect(updateParams).toContain('server-record-001');
  });

  // ─── Conflict: Server Newer (Discard Local) ────────────────────────────────

  it('should discard local record when server timestamp is more recent', async () => {
    const serverRecord = {
      record_id: 'server-record-001',
      session_id: 'session-100',
      question_id: 'question-200',
      timestamp: new Date('2024-03-15T12:00:00Z'), // newer
    };
    mockQueryOne.mockResolvedValue(serverRecord);

    const localRecord = makeLocalRecord({
      timestamp: new Date('2024-03-15T10:00:00Z'), // older
    });

    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(result.errors).toBe(0);

    // Should NOT have called insert
    expect(mockInsertOne).not.toHaveBeenCalled();
    // Only one queryOne call (lookup, no update)
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
  });

  // ─── Conflict: Equal Timestamps (Server Wins) ──────────────────────────────

  it('should discard local record when timestamps are equal (server wins on tie)', async () => {
    const timestamp = new Date('2024-03-15T10:00:00Z');
    const serverRecord = {
      record_id: 'server-record-001',
      session_id: 'session-100',
      question_id: 'question-200',
      timestamp,
    };
    mockQueryOne.mockResolvedValue(serverRecord);

    const localRecord = makeLocalRecord({ timestamp });

    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(1);
    expect(result.errors).toBe(0);
  });

  // ─── Multiple Records ──────────────────────────────────────────────────────

  it('should handle multiple records with mixed outcomes', async () => {
    // Record 1: no conflict (insert)
    // Record 2: conflict, local newer (update)
    // Record 3: conflict, server newer (discard)
    mockQueryOne
      .mockResolvedValueOnce(null) // record 1: no existing
      .mockResolvedValueOnce({     // record 2: existing older
        record_id: 'server-002',
        session_id: 'session-200',
        question_id: 'question-300',
        timestamp: new Date('2024-03-14T08:00:00Z'),
      })
      .mockResolvedValueOnce({ record_id: 'server-002' }) // record 2: update result
      .mockResolvedValueOnce({     // record 3: existing newer
        record_id: 'server-003',
        session_id: 'session-300',
        question_id: 'question-400',
        timestamp: new Date('2024-03-16T20:00:00Z'),
      });

    const records: LocalPerformanceRecord[] = [
      makeLocalRecord({ record_id: 'lr-1', session_id: 'session-100', question_id: 'question-100' }),
      makeLocalRecord({
        record_id: 'lr-2',
        session_id: 'session-200',
        question_id: 'question-300',
        timestamp: new Date('2024-03-15T10:00:00Z'),
      }),
      makeLocalRecord({
        record_id: 'lr-3',
        session_id: 'session-300',
        question_id: 'question-400',
        timestamp: new Date('2024-03-15T10:00:00Z'),
      }),
    ];

    const result = await service.syncPerformanceRecords(userId, records);

    expect(result.synced).toBe(2);     // insert + update
    expect(result.conflicts).toBe(2);  // records 2 and 3
    expect(result.errors).toBe(0);
  });

  // ─── Error Handling ─────────────────────────────────────────────────────────

  it('should count errors when database operations fail', async () => {
    mockQueryOne.mockRejectedValue(new Error('Database connection lost'));

    const localRecord = makeLocalRecord();
    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('should continue processing after an error on one record', async () => {
    mockQueryOne
      .mockRejectedValueOnce(new Error('Timeout'))  // record 1 fails
      .mockResolvedValueOnce(null);                  // record 2 succeeds (no existing)

    const records = [
      makeLocalRecord({ record_id: 'lr-1', question_id: 'q-1' }),
      makeLocalRecord({ record_id: 'lr-2', question_id: 'q-2' }),
    ];

    const result = await service.syncPerformanceRecords(userId, records);

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
  });

  // ─── Timestamp as String ────────────────────────────────────────────────────

  it('should handle timestamps provided as ISO strings', async () => {
    const serverRecord = {
      record_id: 'server-001',
      session_id: 'session-100',
      question_id: 'question-200',
      timestamp: '2024-03-15T09:00:00Z', // string
    };
    mockQueryOne
      .mockResolvedValueOnce(serverRecord)
      .mockResolvedValueOnce({ record_id: 'server-001' });

    const localRecord = makeLocalRecord({
      timestamp: '2024-03-15T10:30:00Z' as unknown as Date, // string timestamp
    });

    const result = await service.syncPerformanceRecords(userId, [localRecord]);

    expect(result.synced).toBe(1);
    expect(result.conflicts).toBe(1);
  });
});

// ─── syncAllData Tests ────────────────────────────────────────────────────────

describe('SyncService.syncAllData', () => {
  let service: SyncService;
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockQueryMany: ReturnType<typeof vi.fn>;
  let mockInsertOne: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryOne = vi.fn();
    mockQueryMany = vi.fn();
    mockInsertOne = vi.fn().mockResolvedValue({ id: 'new-id' });

    service = new SyncService({
      queryOne: mockQueryOne,
      queryMany: mockQueryMany,
      insertOne: mockInsertOne,
    });
  });

  it('should return success status when all syncs succeed with no errors', async () => {
    // All lookups return null (no existing records) -> all inserts
    mockQueryOne.mockResolvedValue(null);

    const result = await service.syncAllData(userId, {
      performanceRecords: [makeLocalRecord()],
      weaknessProfiles: [makeLocalWeaknessProfile()],
      studyPlans: [makeLocalStudyPlan()],
    });

    expect(result.status).toBe('success');
    expect(result.performanceRecords.synced).toBe(1);
    expect(result.performanceRecords.errors).toBe(0);
    expect(result.weaknessProfiles.synced).toBe(1);
    expect(result.weaknessProfiles.errors).toBe(0);
    expect(result.studyPlans.synced).toBe(1);
    expect(result.studyPlans.errors).toBe(0);
  });

  it('should return partial status when some syncs fail', async () => {
    // First call (performance record) succeeds with insert
    mockQueryOne
      .mockResolvedValueOnce(null)   // perf record lookup -> no existing
      .mockRejectedValueOnce(new Error('DB error')); // weakness profile lookup fails

    // Study plan lookup also fails
    mockQueryOne.mockRejectedValueOnce(new Error('DB error'));

    const result = await service.syncAllData(userId, {
      performanceRecords: [makeLocalRecord()],
      weaknessProfiles: [makeLocalWeaknessProfile()],
      studyPlans: [makeLocalStudyPlan()],
    });

    expect(result.status).toBe('partial');
    expect(result.performanceRecords.synced).toBe(1);
    expect(result.weaknessProfiles.errors).toBe(1);
    expect(result.studyPlans.errors).toBe(1);
  });

  it('should return failed status when all syncs fail', async () => {
    mockQueryOne.mockRejectedValue(new Error('Total DB failure'));

    const result = await service.syncAllData(userId, {
      performanceRecords: [makeLocalRecord()],
      weaknessProfiles: [makeLocalWeaknessProfile()],
      studyPlans: [makeLocalStudyPlan()],
    });

    expect(result.status).toBe('failed');
    expect(result.performanceRecords.errors).toBe(1);
    expect(result.weaknessProfiles.errors).toBe(1);
    expect(result.studyPlans.errors).toBe(1);
  });

  it('should handle empty data gracefully', async () => {
    const result = await service.syncAllData(userId, {
      performanceRecords: [],
      weaknessProfiles: [],
      studyPlans: [],
    });

    expect(result.status).toBe('success');
    expect(result.performanceRecords).toEqual({ synced: 0, conflicts: 0, errors: 0 });
    expect(result.weaknessProfiles).toEqual({ synced: 0, conflicts: 0, errors: 0 });
    expect(result.studyPlans).toEqual({ synced: 0, conflicts: 0, errors: 0 });
  });

  it('should handle undefined data fields', async () => {
    const result = await service.syncAllData(userId, {});

    expect(result.status).toBe('success');
    expect(result.performanceRecords).toEqual({ synced: 0, conflicts: 0, errors: 0 });
    expect(result.weaknessProfiles).toEqual({ synced: 0, conflicts: 0, errors: 0 });
    expect(result.studyPlans).toEqual({ synced: 0, conflicts: 0, errors: 0 });
  });
});

// ─── Weakness Profile Sync Tests ──────────────────────────────────────────────

describe('SyncService.syncAllData - Weakness Profiles', () => {
  let service: SyncService;
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockQueryMany: ReturnType<typeof vi.fn>;
  let mockInsertOne: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryOne = vi.fn();
    mockQueryMany = vi.fn();
    mockInsertOne = vi.fn().mockResolvedValue({ profile_id: 'new-profile' });

    service = new SyncService({
      queryOne: mockQueryOne,
      queryMany: mockQueryMany,
      insertOne: mockInsertOne,
    });
  });

  it('should insert weakness profile when no server-side profile exists', async () => {
    mockQueryOne.mockResolvedValue(null);

    const result = await service.syncAllData(userId, {
      weaknessProfiles: [makeLocalWeaknessProfile()],
    });

    expect(result.weaknessProfiles.synced).toBe(1);
    expect(result.weaknessProfiles.conflicts).toBe(0);
    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const [sql] = mockInsertOne.mock.calls[0];
    expect(sql).toContain('INSERT INTO weakness_profiles');
  });

  it('should update server profile when local updated_at is more recent', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        profile_id: 'server-profile-001',
        updated_at: new Date('2024-03-14T08:00:00Z'),
      })
      .mockResolvedValueOnce({ profile_id: 'server-profile-001' }); // UPDATE result

    const result = await service.syncAllData(userId, {
      weaknessProfiles: [
        makeLocalWeaknessProfile({ updated_at: new Date('2024-03-15T10:00:00Z') }),
      ],
    });

    expect(result.weaknessProfiles.synced).toBe(1);
    expect(result.weaknessProfiles.conflicts).toBe(1);
  });

  it('should discard local profile when server updated_at is more recent', async () => {
    mockQueryOne.mockResolvedValue({
      profile_id: 'server-profile-001',
      updated_at: new Date('2024-03-16T12:00:00Z'), // newer than local
    });

    const result = await service.syncAllData(userId, {
      weaknessProfiles: [
        makeLocalWeaknessProfile({ updated_at: new Date('2024-03-15T10:00:00Z') }),
      ],
    });

    expect(result.weaknessProfiles.synced).toBe(0);
    expect(result.weaknessProfiles.conflicts).toBe(1);
  });
});

// ─── Study Plan Sync Tests ────────────────────────────────────────────────────

describe('SyncService.syncAllData - Study Plans', () => {
  let service: SyncService;
  let mockQueryOne: ReturnType<typeof vi.fn>;
  let mockQueryMany: ReturnType<typeof vi.fn>;
  let mockInsertOne: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryOne = vi.fn();
    mockQueryMany = vi.fn();
    mockInsertOne = vi.fn().mockResolvedValue({ plan_id: 'new-plan' });

    service = new SyncService({
      queryOne: mockQueryOne,
      queryMany: mockQueryMany,
      insertOne: mockInsertOne,
    });
  });

  it('should insert study plan when no server-side plan exists', async () => {
    mockQueryOne.mockResolvedValue(null);

    const result = await service.syncAllData(userId, {
      studyPlans: [makeLocalStudyPlan()],
    });

    expect(result.studyPlans.synced).toBe(1);
    expect(result.studyPlans.conflicts).toBe(0);
    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const [sql] = mockInsertOne.mock.calls[0];
    expect(sql).toContain('INSERT INTO study_plans');
  });

  it('should update server plan when local created_at is more recent', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        plan_id: 'plan-001',
        created_at: new Date('2024-03-14T08:00:00Z'),
      })
      .mockResolvedValueOnce({ plan_id: 'plan-001' }); // UPDATE result

    const result = await service.syncAllData(userId, {
      studyPlans: [
        makeLocalStudyPlan({ created_at: new Date('2024-03-15T10:00:00Z') }),
      ],
    });

    expect(result.studyPlans.synced).toBe(1);
    expect(result.studyPlans.conflicts).toBe(1);
  });

  it('should discard local plan when server created_at is more recent', async () => {
    mockQueryOne.mockResolvedValue({
      plan_id: 'plan-001',
      created_at: new Date('2024-03-16T12:00:00Z'),
    });

    const result = await service.syncAllData(userId, {
      studyPlans: [
        makeLocalStudyPlan({ created_at: new Date('2024-03-15T10:00:00Z') }),
      ],
    });

    expect(result.studyPlans.synced).toBe(0);
    expect(result.studyPlans.conflicts).toBe(1);
  });
});
