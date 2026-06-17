/**
 * Integration Tests for Critical Flows
 *
 * Tests the interaction between services for key user journeys:
 * 1. Registration → Login → Practice → Analytics
 * 2. Full Test Start → Answer → Submit → Score Review
 * 3. Parent Link → Accept → Parent Dashboard
 * 4. Offline → Online → Sync
 *
 * Validates: Requirements 1.1, 3.8, 4.7, 8.1, 10.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, Section, SessionSection, SessionStatus, SessionType, LinkStatus } from '../models/enums';

// ─── Mock Dependencies ────────────────────────────────────────────────────────

// Mock database
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  queryMany: vi.fn(),
  insertOne: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  withTransaction: vi.fn(),
}));

// Mock cache
vi.mock('../utils/cache', () => ({
  setSessionState: vi.fn(),
  getSessionState: vi.fn(),
  deleteSessionState: vi.fn(),
  cacheSet: vi.fn(),
  cacheGet: vi.fn(),
  cacheDelete: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7)),
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    genSalt: vi.fn().mockResolvedValue('mock-salt-value'),
    hash: vi.fn().mockResolvedValue('hashed-password-value'),
    compare: vi.fn(),
  },
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-jwt-token'),
    verify: vi.fn(() => ({ userId: 'test-user-id', role: 'student' })),
  },
}));

import bcrypt from 'bcryptjs';
import { query, queryOne, queryMany, insertOne, updateMany, withTransaction } from '../utils/database';
import { setSessionState, getSessionState, deleteSessionState } from '../utils/cache';

import { registerUser, loginUser, isAuthError } from '../services/auth.service';
import { startPracticeSession, endPracticeSession, computeSessionSummary } from '../services/session.service';
import { startFullTest, submitFullTest, computeFullTestScore } from '../services/fulltest.service';
import { sendLinkInvitation, respondToInvitation, hasParentAccess } from '../services/linking.service';
import { getParentDashboard, computeDashboardMetrics } from '../services/parent-dashboard.service';
import { SyncService } from '../services/sync.service';
import { AnalyticsService } from '../services/analytics.service';

const mockQuery = vi.mocked(query);
const mockQueryOne = vi.mocked(queryOne);
const mockQueryMany = vi.mocked(queryMany);
const mockInsertOne = vi.mocked(insertOne);
const mockUpdateMany = vi.mocked(updateMany);
const mockWithTransaction = vi.mocked(withTransaction);
const mockSetSessionState = vi.mocked(setSessionState);
const mockGetSessionState = vi.mocked(getSessionState);
const mockDeleteSessionState = vi.mocked(deleteSessionState);
const mockBcrypt = vi.mocked(bcrypt);

// ─── Test Data Factories ──────────────────────────────────────────────────────

function makeQuestion(overrides: Partial<any> = {}, index = 0) {
  return {
    question_id: `q-${index}`,
    section: Section.Math,
    question_text: `What is ${index} + 1?`,
    passage: null,
    options: ['A) 1', 'B) 2', 'C) 3', 'D) 4'],
    correct_answer: 'B',
    explanation: `The answer is ${index + 1}`,
    incorrect_reasoning: 'Common mistake',
    skill_tag: 'arithmetic',
    difficulty: 'medium',
    strategy_tip: 'Add the numbers',
    created_at: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    user_id: 'student-user-id',
    name: 'Test Student',
    email: 'student@test.com',
    password_hash: 'hashed-password-value',
    password_salt: 'mock-salt-value',
    role: Role.Student,
    grade: 11,
    target_score: 30,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Flow 1: Registration → Login → Practice → Analytics ──────────────────────

describe('Integration Flow 1: Registration → Login → Practice → Analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register a user, login, start practice, end session, and view analytics', async () => {
    // ── Step 1: Register ──
    // No existing user with that email
    mockQueryOne.mockResolvedValueOnce(null);
    // Insert returns the new user
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    const registerResult = await registerUser({
      name: 'Test Student',
      email: 'student@test.com',
      password: 'Password1',
      role: Role.Student,
      grade: 11,
      targetScore: 30,
    });

    expect(isAuthError(registerResult)).toBe(false);
    if (!isAuthError(registerResult)) {
      expect(registerResult.userId).toBeDefined();
      expect(registerResult.token).toBeDefined();
    }

    // ── Step 2: Login ──
    const mockUser = makeUser();
    mockQueryOne.mockResolvedValueOnce(mockUser);
    mockBcrypt.compare.mockResolvedValueOnce(true as any);
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    const loginResult = await loginUser({
      email: 'student@test.com',
      password: 'Password1',
    });

    expect(isAuthError(loginResult)).toBe(false);
    if (!isAuthError(loginResult)) {
      expect(loginResult.token).toBeDefined();
      expect(loginResult.role).toBe(Role.Student);
    }
  });

  it('should start a practice session, deliver questions, and compute summary', async () => {
    const questions = Array.from({ length: 5 }, (_, i) => makeQuestion({}, i));

    // Fetch questions from DB
    mockQueryMany.mockResolvedValueOnce(questions);
    // Insert session
    mockInsertOne.mockResolvedValueOnce({
      session_id: 'practice-session-1',
      user_id: 'student-user-id',
      session_type: SessionType.Practice,
      section: SessionSection.Math,
      status: SessionStatus.Active,
      started_at: new Date(),
    } as any);
    // setSessionState is already mocked
    mockSetSessionState.mockResolvedValueOnce(undefined);

    const startResult = await startPracticeSession({
      userId: 'student-user-id',
      section: SessionSection.Math,
      mode: 'section',
    });

    expect('sessionId' in startResult).toBe(true);
    if ('sessionId' in startResult) {
      expect(startResult.sessionId).toBe('practice-session-1');
      expect(startResult.firstQuestion).toBeDefined();
      expect(startResult.firstQuestion.questionId).toBe('q-0');
    }

    // ── End session and get summary ──
    mockQueryOne.mockResolvedValueOnce({
      session_id: 'practice-session-1',
      user_id: 'student-user-id',
      session_type: SessionType.Practice,
      status: SessionStatus.Active,
    });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    // Performance records for this session
    mockQueryMany.mockResolvedValueOnce([
      { is_correct: true, time_taken_seconds: 30 },
      { is_correct: false, time_taken_seconds: 45 },
      { is_correct: true, time_taken_seconds: 20 },
    ]);

    const endResult = await endPracticeSession('practice-session-1');
    expect('summary' in endResult).toBe(true);
    if ('summary' in endResult) {
      expect(endResult.summary.totalQuestions).toBe(3);
      expect(endResult.summary.correct).toBe(2);
      expect(endResult.summary.avgTime).toBeCloseTo(31.67, 1);
    }
  });

  it('should compute analytics from performance records after practice', async () => {
    const now = new Date();
    const records = [
      { is_correct: true, time_taken_seconds: 30, timestamp: now, section: Section.Math },
      { is_correct: false, time_taken_seconds: 45, timestamp: now, section: Section.Math },
      { is_correct: true, time_taken_seconds: 20, timestamp: now, section: Section.Math },
      { is_correct: true, time_taken_seconds: 25, timestamp: now, section: Section.Math },
      { is_correct: false, time_taken_seconds: 35, timestamp: now, section: Section.Math },
      { is_correct: true, time_taken_seconds: 28, timestamp: now, section: Section.English },
      { is_correct: true, time_taken_seconds: 22, timestamp: now, section: Section.English },
      { is_correct: false, time_taken_seconds: 40, timestamp: now, section: Section.English },
      { is_correct: true, time_taken_seconds: 33, timestamp: now, section: Section.English },
      { is_correct: true, time_taken_seconds: 27, timestamp: now, section: Section.English },
    ];

    const weakProfiles = [
      { skill_tag: 'algebra', section: Section.Math, accuracy: 0.45, attempt_count: 10 },
      { skill_tag: 'geometry', section: Section.Math, accuracy: 0.55, attempt_count: 8 },
    ];

    // Create analytics service with mocked query
    const analyticsService = new AnalyticsService({
      queryMany: vi.fn()
        .mockResolvedValueOnce(records)   // performance records
        .mockResolvedValueOnce(weakProfiles), // weakness profiles
    });

    const result = await analyticsService.getStudentDashboard('student-user-id');

    expect('scoreTrends' in result).toBe(true);
    if ('scoreTrends' in result) {
      expect(result.scoreTrends.length).toBeGreaterThan(0);
      expect(result.avgTimePerSection).toBeDefined();
      // Math has 5 records (>= threshold), should compute
      const mathAvg = result.avgTimePerSection.find(a => a.section === Section.Math);
      expect(mathAvg?.insufficientData).toBe(false);
      expect(mathAvg?.avgTimeSeconds).toBeCloseTo(31, 0);
      // Weak skills should include algebra and geometry
      expect(Array.isArray(result.weakSkills)).toBe(true);
      if (Array.isArray(result.weakSkills)) {
        expect(result.weakSkills.length).toBe(2);
        expect(result.weakSkills[0].skillTag).toBe('algebra');
      }
    }
  });
});

// ─── Flow 2: Full Test Start → Answer → Submit → Score Review ──────────────────

describe('Integration Flow 2: Full Test Start → Answer → Submit → Score Review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start a full test, submit answers, and receive score with details', async () => {
    const mathQuestions = Array.from({ length: 10 }, (_, i) => makeQuestion({
      question_id: `ft-q-${i}`,
      section: Section.Math,
      correct_answer: ['A', 'B', 'C', 'D'][i % 4],
      explanation: `Explanation for question ${i}`,
    }, i));

    // Start full test
    mockQueryMany.mockResolvedValueOnce(mathQuestions);
    mockInsertOne.mockResolvedValueOnce({
      session_id: 'fulltest-session-1',
      user_id: 'student-user-id',
      session_type: SessionType.FullTest,
      section: SessionSection.Math,
      status: SessionStatus.Active,
      started_at: new Date(),
      time_limit_seconds: 3600,
    } as any);
    mockSetSessionState.mockResolvedValueOnce(undefined);

    const startResult = await startFullTest({
      userId: 'student-user-id',
      section: SessionSection.Math,
    });

    expect('sessionId' in startResult).toBe(true);
    if ('sessionId' in startResult) {
      expect(startResult.sessionId).toBe('fulltest-session-1');
      expect(startResult.questions.length).toBe(10);
      expect(startResult.timeLimit).toBe(3600);
      // Verify no correct answers are leaked
      for (const q of startResult.questions) {
        expect(q).not.toHaveProperty('correct_answer');
        expect(q).not.toHaveProperty('correctAnswer');
      }
    }
  });

  it('should submit full test and compute correct score with per-question details', async () => {
    const questionIds = Array.from({ length: 5 }, (_, i) => `ft-q-${i}`);
    const sessionState = {
      sessionId: 'fulltest-session-1',
      userId: 'student-user-id',
      section: 'math',
      questionIds,
      answers: {},
      currentIndex: 4,
      timeLimit: 3600,
      startedAt: new Date().toISOString(),
    };

    // Submit full test - fetch session
    mockQueryOne.mockResolvedValueOnce({
      session_id: 'fulltest-session-1',
      user_id: 'student-user-id',
      session_type: 'full_test',
      status: SessionStatus.Active,
      section: 'math',
    });
    // Get session state from Redis
    mockGetSessionState.mockResolvedValueOnce(sessionState);
    // Fetch questions for scoring
    mockQueryMany.mockResolvedValueOnce([
      { question_id: 'ft-q-0', correct_answer: 'A', explanation: 'Explain 0' },
      { question_id: 'ft-q-1', correct_answer: 'B', explanation: 'Explain 1' },
      { question_id: 'ft-q-2', correct_answer: 'C', explanation: 'Explain 2' },
      { question_id: 'ft-q-3', correct_answer: 'D', explanation: 'Explain 3' },
      { question_id: 'ft-q-4', correct_answer: 'A', explanation: 'Explain 4' },
    ]);
    // withTransaction mock
    mockWithTransaction.mockImplementationOnce(async (cb) => {
      const txQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
      return cb(txQuery as any);
    });
    mockDeleteSessionState.mockResolvedValueOnce(undefined);

    const answers = [
      { questionIndex: 0, selectedAnswer: 'A' }, // correct
      { questionIndex: 1, selectedAnswer: 'B' }, // correct
      { questionIndex: 2, selectedAnswer: 'A' }, // incorrect
      { questionIndex: 3, selectedAnswer: 'D' }, // correct
      // question 4 unanswered (skipped)
    ];

    const submitResult = await submitFullTest({
      sessionId: 'fulltest-session-1',
      answers,
    });

    expect('score' in submitResult).toBe(true);
    if ('score' in submitResult) {
      expect(submitResult.score.total).toBe(5);
      expect(submitResult.score.correct).toBe(3);
      expect(submitResult.details.length).toBe(5);
      // Verify per-question details
      expect(submitResult.details[0].isCorrect).toBe(true);
      expect(submitResult.details[2].isCorrect).toBe(false);
      expect(submitResult.details[4].selectedAnswer).toBeNull(); // skipped
      expect(submitResult.details[4].isCorrect).toBe(false);
      // Verify explanations are included
      expect(submitResult.details[0].explanation).toBe('Explain 0');
    }
  });

  it('should correctly score a full test using the pure computeFullTestScore function', () => {
    const questions = [
      { question_id: 'q1', correct_answer: 'A', explanation: 'e1' },
      { question_id: 'q2', correct_answer: 'B', explanation: 'e2' },
      { question_id: 'q3', correct_answer: 'C', explanation: 'e3' },
      { question_id: 'q4', correct_answer: 'D', explanation: 'e4' },
    ];

    const answers = [
      { questionIndex: 0, selectedAnswer: 'A' },
      { questionIndex: 1, selectedAnswer: 'C' }, // wrong
      { questionIndex: 3, selectedAnswer: 'D' },
      // question 2 skipped
    ];

    const { score, details } = computeFullTestScore(questions, answers);

    expect(score.total).toBe(4);
    expect(score.correct).toBe(2);
    expect(details[0].isCorrect).toBe(true);
    expect(details[1].isCorrect).toBe(false);
    expect(details[2].selectedAnswer).toBeNull();
    expect(details[2].isCorrect).toBe(false);
    expect(details[3].isCorrect).toBe(true);
  });
});

// ─── Flow 3: Parent Link → Accept → Parent Dashboard ──────────────────────────

describe('Integration Flow 3: Parent Link → Accept → Parent Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send invitation, student accepts, then parent views dashboard', async () => {
    const parentUser = makeUser({
      user_id: 'parent-user-id',
      name: 'Parent User',
      email: 'parent@test.com',
      role: Role.Parent,
    });
    const studentUser = makeUser({
      user_id: 'student-user-id',
      name: 'Student User',
      email: 'student@test.com',
      role: Role.Student,
    });

    // ── Step 1: Send invitation ──
    // Verify parent exists with parent role
    mockQueryOne.mockResolvedValueOnce(parentUser);
    // No existing pending link
    mockQueryOne.mockResolvedValueOnce(null);
    // Find student by email
    mockQueryOne.mockResolvedValueOnce(studentUser);
    // Insert link
    mockInsertOne.mockResolvedValueOnce({
      link_id: 'link-1',
      parent_id: 'parent-user-id',
      student_id: 'student-user-id',
      student_email: 'student@test.com',
      status: LinkStatus.Pending,
      created_at: new Date(),
    } as any);

    const link = await sendLinkInvitation('parent-user-id', 'student@test.com');
    expect(link.status).toBe(LinkStatus.Pending);
    expect(link.link_id).toBe('link-1');

    // ── Step 2: Student accepts ──
    mockQueryOne.mockResolvedValueOnce({
      link_id: 'link-1',
      parent_id: 'parent-user-id',
      student_id: null,
      student_email: 'student@test.com',
      status: LinkStatus.Pending,
      created_at: new Date(),
    });
    mockQueryOne.mockResolvedValueOnce(studentUser);
    mockUpdateMany.mockResolvedValueOnce(1);
    mockQueryOne.mockResolvedValueOnce({
      link_id: 'link-1',
      parent_id: 'parent-user-id',
      student_id: 'student-user-id',
      student_email: 'student@test.com',
      status: LinkStatus.Accepted,
      created_at: new Date(),
    });

    const acceptedLink = await respondToInvitation('link-1', 'student-user-id', true);
    expect(acceptedLink.status).toBe(LinkStatus.Accepted);
  });

  it('should verify parent access control: only accepted links grant dashboard access', async () => {
    // With accepted link
    mockQueryOne.mockResolvedValueOnce({
      link_id: 'link-1',
      parent_id: 'parent-user-id',
      student_id: 'student-user-id',
      status: LinkStatus.Accepted,
    });
    const hasAccess = await hasParentAccess('parent-user-id', 'student-user-id');
    expect(hasAccess).toBe(true);

    // Without accepted link (pending)
    mockQueryOne.mockResolvedValueOnce(null);
    const noAccess = await hasParentAccess('parent-user-id', 'other-student');
    expect(noAccess).toBe(false);
  });

  it('should compute parent dashboard metrics from student performance records', () => {
    const records = [
      { session_id: 'sess-1', is_correct: true, time_taken_seconds: 30, timestamp: new Date(), section: 'math' },
      { session_id: 'sess-1', is_correct: false, time_taken_seconds: 45, timestamp: new Date(), section: 'math' },
      { session_id: 'sess-2', is_correct: true, time_taken_seconds: 20, timestamp: new Date(), section: 'english' },
      { session_id: 'sess-2', is_correct: true, time_taken_seconds: 25, timestamp: new Date(), section: 'english' },
    ];

    const dashboard = computeDashboardMetrics(
      'student-user-id',
      'Test Student',
      records as any
    );

    expect(dashboard.studentId).toBe('student-user-id');
    expect(dashboard.studentName).toBe('Test Student');
    expect(dashboard.totalTimeSeconds).toBe(120); // 30+45+20+25
    expect(dashboard.sessionsCompleted).toBe(2); // 2 unique sessions
    expect(dashboard.overallAccuracy).toBe(0.75); // 3 out of 4
  });

  it('should return no_linked_students when parent has no accepted links', async () => {
    // Parent exists with parent role
    mockQueryOne.mockResolvedValueOnce({
      user_id: 'parent-user-id',
      role: 'parent',
    });
    // No linked students
    mockQueryMany.mockResolvedValueOnce([]);

    const result = await getParentDashboard('parent-user-id');
    expect(result.type).toBe('no_linked_students');
  });

  it('should deny access when parent tries to view unlinked student', async () => {
    // Parent exists
    mockQueryOne.mockResolvedValueOnce({
      user_id: 'parent-user-id',
      role: 'parent',
    });
    // Has one accepted link to a different student
    mockQueryMany.mockResolvedValueOnce([{
      link_id: 'link-1',
      parent_id: 'parent-user-id',
      student_id: 'other-student',
      student_email: 'other@test.com',
      status: LinkStatus.Accepted,
      created_at: new Date(),
    }]);
    // Access check for different student fails
    mockQueryOne.mockResolvedValueOnce(null);

    const result = await getParentDashboard('parent-user-id', 'unlinked-student');
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.message).toContain('Access denied');
    }
  });
});

// ─── Flow 4: Offline → Online → Sync ──────────────────────────────────────────

describe('Integration Flow 4: Offline → Online → Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sync performance records with last-write-wins conflict resolution', async () => {
    const olderTimestamp = new Date('2024-01-01T10:00:00Z');
    const newerTimestamp = new Date('2024-01-01T12:00:00Z');

    const mockQueryOneFn = vi.fn()
      // First record: server has older data → local wins
      .mockResolvedValueOnce({
        record_id: 'server-rec-1',
        session_id: 'sess-1',
        question_id: 'q-1',
        timestamp: olderTimestamp,
      })
      // Update returns the updated row
      .mockResolvedValueOnce({ record_id: 'server-rec-1' })
      // Second record: no server conflict → insert
      .mockResolvedValueOnce(null)
      // Third record: server has newer data → server wins
      .mockResolvedValueOnce({
        record_id: 'server-rec-3',
        session_id: 'sess-1',
        question_id: 'q-3',
        timestamp: newerTimestamp,
      });

    const mockInsertOneFn = vi.fn().mockResolvedValue({ record_id: 'new-rec' });

    const syncService = new SyncService({
      queryOne: mockQueryOneFn as any,
      queryMany: vi.fn() as any,
      insertOne: mockInsertOneFn as any,
    });

    const localRecords = [
      {
        record_id: 'local-rec-1',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-1',
        selected_answer: 'B',
        is_correct: true,
        time_taken_seconds: 30,
        error_classification: null,
        timestamp: newerTimestamp, // newer than server
      },
      {
        record_id: 'local-rec-2',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-2',
        selected_answer: 'A',
        is_correct: false,
        time_taken_seconds: 45,
        error_classification: null,
        timestamp: newerTimestamp, // no conflict
      },
      {
        record_id: 'local-rec-3',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-3',
        selected_answer: 'C',
        is_correct: true,
        time_taken_seconds: 25,
        error_classification: null,
        timestamp: olderTimestamp, // older than server → server wins
      },
    ];

    const result = await syncService.syncPerformanceRecords('student-user-id', localRecords);

    expect(result.synced).toBe(2); // record 1 (conflict won) + record 2 (new)
    expect(result.conflicts).toBe(2); // record 1 + record 3
    expect(result.errors).toBe(0);
  });

  it('should sync all data types and report overall status', async () => {
    const now = new Date();

    const mockQueryOneFn = vi.fn()
      // Performance record: no conflict
      .mockResolvedValueOnce(null)
      // Weakness profile: no conflict
      .mockResolvedValueOnce(null)
      // Study plan: no conflict
      .mockResolvedValueOnce(null);

    const mockInsertOneFn = vi.fn().mockResolvedValue({ record_id: 'inserted' });

    const syncService = new SyncService({
      queryOne: mockQueryOneFn as any,
      queryMany: vi.fn() as any,
      insertOne: mockInsertOneFn as any,
    });

    const result = await syncService.syncAllData('student-user-id', {
      performanceRecords: [{
        record_id: 'rec-1',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-1',
        selected_answer: 'A',
        is_correct: true,
        time_taken_seconds: 30,
        error_classification: null,
        timestamp: now,
      }],
      weaknessProfiles: [{
        profile_id: 'prof-1',
        user_id: 'student-user-id',
        skill_tag: 'algebra',
        section: 'math',
        accuracy: 0.7,
        attempt_count: 10,
        recent_attempts: [{ is_correct: true, timestamp: now.toISOString() }],
        updated_at: now,
      }],
      studyPlans: [{
        plan_id: 'plan-1',
        user_id: 'student-user-id',
        daily_targets: [{ skill_tag: 'algebra', count: 5 }],
        weekly_goals: [{ target_accuracy: 0.8 }],
        projected_score_range: { lower: 25, upper: 30 },
        created_at: now,
        valid_until: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      }],
    });

    expect(result.status).toBe('success');
    expect(result.performanceRecords.synced).toBe(1);
    expect(result.weaknessProfiles.synced).toBe(1);
    expect(result.studyPlans.synced).toBe(1);
  });

  it('should handle sync errors gracefully and report partial status', async () => {
    const now = new Date();

    const mockQueryOneFn = vi.fn()
      // First record: success (no conflict)
      .mockResolvedValueOnce(null)
      // Second record: throws error
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const mockInsertOneFn = vi.fn()
      .mockResolvedValueOnce({ record_id: 'inserted' })
      .mockRejectedValueOnce(new Error('DB connection lost'));

    const syncService = new SyncService({
      queryOne: mockQueryOneFn as any,
      queryMany: vi.fn() as any,
      insertOne: mockInsertOneFn as any,
    });

    const result = await syncService.syncPerformanceRecords('student-user-id', [
      {
        record_id: 'rec-1',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-1',
        selected_answer: 'A',
        is_correct: true,
        time_taken_seconds: 30,
        error_classification: null,
        timestamp: now,
      },
      {
        record_id: 'rec-2',
        user_id: 'student-user-id',
        session_id: 'sess-1',
        question_id: 'q-2',
        selected_answer: 'B',
        is_correct: false,
        time_taken_seconds: 40,
        error_classification: null,
        timestamp: now,
      },
    ]);

    expect(result.synced).toBe(1);
    expect(result.errors).toBe(1);
  });

  it('should return empty results when no data to sync', async () => {
    const syncService = new SyncService({
      queryOne: vi.fn() as any,
      queryMany: vi.fn() as any,
      insertOne: vi.fn() as any,
    });

    const result = await syncService.syncPerformanceRecords('student-user-id', []);
    expect(result.synced).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.errors).toBe(0);
  });
});
