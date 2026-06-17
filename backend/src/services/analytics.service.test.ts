/**
 * Unit Tests for Analytics Service
 * Tests dashboard computation logic: score trends, weak skills, avg time, accuracy per section.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 * Design Properties: 20, 21, 22, 23, 24
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AnalyticsService,
  isAnalyticsError,
  computeScoreTrendsFromRecords,
  computeWeakSkills,
  computeAvgTimePerSection,
  computeAccuracyPerSection,
  ScoreTrendDataPoint,
  WeakSkillEntry,
} from './analytics.service';
import { Section } from '../models/enums';

// ─── Helper to create records with section ────────────────────────────────────

function makeRecord(
  section: Section,
  isCorrect: boolean,
  timeTaken: number,
  date: string
) {
  return {
    is_correct: isCorrect,
    time_taken_seconds: timeTaken,
    timestamp: new Date(`${date}T12:00:00.000Z`),
    section,
  };
}

function makeProfile(
  skillTag: string,
  section: Section,
  accuracy: number,
  attemptCount: number
) {
  return {
    profile_id: `profile-${skillTag}`,
    user_id: 'user-1',
    skill_tag: skillTag,
    section,
    accuracy,
    attempt_count: attemptCount,
  };
}

// ─── computeScoreTrendsFromRecords (Property 20) ─────────────────────────────

describe('computeScoreTrendsFromRecords', () => {
  it('should compute one accuracy data point per day per section', () => {
    const records = [
      makeRecord(Section.Math, true, 10, '2024-01-15'),
      makeRecord(Section.Math, false, 12, '2024-01-15'),
      makeRecord(Section.Math, true, 8, '2024-01-15'),
      makeRecord(Section.English, true, 20, '2024-01-15'),
    ];

    const result = computeScoreTrendsFromRecords(records);

    // Math on 2024-01-15: 2 correct / 3 total = 0.6667
    const mathPoint = result.find(
      (p) => p.section === Section.Math && p.date === '2024-01-15'
    );
    expect(mathPoint).toBeDefined();
    expect(mathPoint!.accuracy).toBeCloseTo(2 / 3);
    expect(mathPoint!.totalQuestions).toBe(3);
    expect(mathPoint!.correct).toBe(2);

    // English on 2024-01-15: 1 correct / 1 total = 1.0
    const engPoint = result.find(
      (p) => p.section === Section.English && p.date === '2024-01-15'
    );
    expect(engPoint).toBeDefined();
    expect(engPoint!.accuracy).toBe(1.0);
    expect(engPoint!.totalQuestions).toBe(1);
    expect(engPoint!.correct).toBe(1);
  });

  it('should return separate data points for different days', () => {
    const records = [
      makeRecord(Section.Science, true, 15, '2024-01-10'),
      makeRecord(Section.Science, false, 20, '2024-01-10'),
      makeRecord(Section.Science, true, 10, '2024-01-11'),
      makeRecord(Section.Science, true, 12, '2024-01-11'),
    ];

    const result = computeScoreTrendsFromRecords(records);

    const day10 = result.find(
      (p) => p.section === Section.Science && p.date === '2024-01-10'
    );
    expect(day10!.accuracy).toBe(0.5); // 1/2

    const day11 = result.find(
      (p) => p.section === Section.Science && p.date === '2024-01-11'
    );
    expect(day11!.accuracy).toBe(1.0); // 2/2
  });

  it('should return empty array for no records', () => {
    const result = computeScoreTrendsFromRecords([]);
    expect(result).toEqual([]);
  });

  it('should sort results by date ascending', () => {
    const records = [
      makeRecord(Section.Math, true, 10, '2024-01-20'),
      makeRecord(Section.Math, false, 10, '2024-01-10'),
      makeRecord(Section.Math, true, 10, '2024-01-15'),
    ];

    const result = computeScoreTrendsFromRecords(records);
    const dates = result.map((p) => p.date);
    expect(dates).toEqual(['2024-01-10', '2024-01-15', '2024-01-20']);
  });

  it('should handle all answers incorrect for a day', () => {
    const records = [
      makeRecord(Section.Reading, false, 30, '2024-01-05'),
      makeRecord(Section.Reading, false, 25, '2024-01-05'),
    ];

    const result = computeScoreTrendsFromRecords(records);
    expect(result[0].accuracy).toBe(0);
    expect(result[0].correct).toBe(0);
    expect(result[0].totalQuestions).toBe(2);
  });
});

// ─── computeWeakSkills (Property 21) ─────────────────────────────────────────

describe('computeWeakSkills', () => {
  it('should return skills with accuracy below 60%, ranked lowest first', () => {
    const profiles = [
      makeProfile('algebra', Section.Math, 0.45, 20),
      makeProfile('grammar', Section.English, 0.55, 15),
      makeProfile('data-interp', Section.Science, 0.30, 10),
      makeProfile('reading-comp', Section.Reading, 0.75, 25),
    ];

    const result = computeWeakSkills(profiles);
    expect(Array.isArray(result)).toBe(true);

    const skills = result as WeakSkillEntry[];
    expect(skills).toHaveLength(3);
    // Sorted lowest to highest
    expect(skills[0].skillTag).toBe('data-interp');
    expect(skills[0].accuracy).toBe(0.30);
    expect(skills[1].skillTag).toBe('algebra');
    expect(skills[1].accuracy).toBe(0.45);
    expect(skills[2].skillTag).toBe('grammar');
    expect(skills[2].accuracy).toBe(0.55);
  });

  it('should return at most 10 weak skills', () => {
    const profiles = Array.from({ length: 15 }, (_, i) =>
      makeProfile(`skill-${i}`, Section.Math, 0.1 + i * 0.03, 20)
    );

    const result = computeWeakSkills(profiles);
    expect(Array.isArray(result)).toBe(true);
    expect((result as WeakSkillEntry[]).length).toBeLessThanOrEqual(10);
  });

  it('should return "no weak areas" message when all skills >= 60%', () => {
    const profiles = [
      makeProfile('algebra', Section.Math, 0.80, 20),
      makeProfile('grammar', Section.English, 0.60, 15),
      makeProfile('reading-comp', Section.Reading, 0.90, 25),
    ];

    const result = computeWeakSkills(profiles);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { message: string }).message).toContain('No weak areas');
  });

  it('should return "no weak areas" message for empty profiles', () => {
    const result = computeWeakSkills([]);
    expect(Array.isArray(result)).toBe(false);
    expect((result as { message: string }).message).toContain('No weak areas');
  });

  it('should exclude skills with exactly 60% accuracy (boundary)', () => {
    const profiles = [
      makeProfile('boundary-skill', Section.Math, 0.60, 20),
      makeProfile('weak-skill', Section.Math, 0.59, 20),
    ];

    const result = computeWeakSkills(profiles);
    expect(Array.isArray(result)).toBe(true);

    const skills = result as WeakSkillEntry[];
    expect(skills).toHaveLength(1);
    expect(skills[0].skillTag).toBe('weak-skill');
  });
});

// ─── computeAvgTimePerSection (Property 22, 24) ──────────────────────────────

describe('computeAvgTimePerSection', () => {
  it('should compute average time for sections with >= 5 records', () => {
    const records = [
      makeRecord(Section.Math, true, 10, '2024-01-01'),
      makeRecord(Section.Math, false, 20, '2024-01-01'),
      makeRecord(Section.Math, true, 30, '2024-01-02'),
      makeRecord(Section.Math, true, 15, '2024-01-02'),
      makeRecord(Section.Math, false, 25, '2024-01-03'),
    ];

    const result = computeAvgTimePerSection(records);
    const math = result.find((r) => r.section === Section.Math)!;

    expect(math.insufficientData).toBe(false);
    expect(math.avgTimeSeconds).toBe((10 + 20 + 30 + 15 + 25) / 5);
    expect(math.totalRecords).toBe(5);
  });

  it('should flag insufficientData for sections with < 5 records', () => {
    const records = [
      makeRecord(Section.English, true, 10, '2024-01-01'),
      makeRecord(Section.English, false, 20, '2024-01-01'),
    ];

    const result = computeAvgTimePerSection(records);
    const eng = result.find((r) => r.section === Section.English)!;

    expect(eng.insufficientData).toBe(true);
    expect(eng.avgTimeSeconds).toBe(0);
    expect(eng.totalRecords).toBe(2);
  });

  it('should return all four sections even with no records', () => {
    const result = computeAvgTimePerSection([]);

    expect(result).toHaveLength(4);
    result.forEach((entry) => {
      expect(entry.insufficientData).toBe(true);
      expect(entry.totalRecords).toBe(0);
    });
  });

  it('should handle exactly 5 records (boundary) as sufficient data', () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord(Section.Science, true, 10 + i, '2024-01-01')
    );

    const result = computeAvgTimePerSection(records);
    const sci = result.find((r) => r.section === Section.Science)!;

    expect(sci.insufficientData).toBe(false);
    expect(sci.avgTimeSeconds).toBe((10 + 11 + 12 + 13 + 14) / 5);
  });
});

// ─── computeAccuracyPerSection (Property 23, 24) ─────────────────────────────

describe('computeAccuracyPerSection', () => {
  it('should compute accuracy as correct / total for sections with >= 5 records', () => {
    const records = [
      makeRecord(Section.Reading, true, 10, '2024-01-01'),
      makeRecord(Section.Reading, true, 12, '2024-01-01'),
      makeRecord(Section.Reading, false, 15, '2024-01-02'),
      makeRecord(Section.Reading, true, 10, '2024-01-02'),
      makeRecord(Section.Reading, false, 20, '2024-01-03'),
    ];

    const result = computeAccuracyPerSection(records);
    const reading = result.find((r) => r.section === Section.Reading)!;

    expect(reading.insufficientData).toBe(false);
    expect(reading.accuracy).toBe(3 / 5);
    expect(reading.totalRecords).toBe(5);
    expect(reading.correct).toBe(3);
  });

  it('should flag insufficientData for sections with < 5 records', () => {
    const records = [
      makeRecord(Section.Science, true, 10, '2024-01-01'),
      makeRecord(Section.Science, true, 12, '2024-01-01'),
      makeRecord(Section.Science, false, 15, '2024-01-02'),
    ];

    const result = computeAccuracyPerSection(records);
    const sci = result.find((r) => r.section === Section.Science)!;

    expect(sci.insufficientData).toBe(true);
    expect(sci.accuracy).toBe(0);
    expect(sci.totalRecords).toBe(3);
  });

  it('should handle 100% accuracy', () => {
    const records = Array.from({ length: 6 }, () =>
      makeRecord(Section.Math, true, 10, '2024-01-01')
    );

    const result = computeAccuracyPerSection(records);
    const math = result.find((r) => r.section === Section.Math)!;

    expect(math.accuracy).toBe(1.0);
    expect(math.correct).toBe(6);
  });

  it('should handle 0% accuracy', () => {
    const records = Array.from({ length: 5 }, () =>
      makeRecord(Section.English, false, 10, '2024-01-01')
    );

    const result = computeAccuracyPerSection(records);
    const eng = result.find((r) => r.section === Section.English)!;

    expect(eng.accuracy).toBe(0);
    expect(eng.correct).toBe(0);
    expect(eng.totalRecords).toBe(5);
    expect(eng.insufficientData).toBe(false);
  });

  it('should return all four sections', () => {
    const result = computeAccuracyPerSection([]);
    expect(result).toHaveLength(4);
    const sections = result.map((r) => r.section);
    expect(sections).toContain(Section.English);
    expect(sections).toContain(Section.Math);
    expect(sections).toContain(Section.Reading);
    expect(sections).toContain(Section.Science);
  });
});

// ─── AnalyticsService.getStudentDashboard ────────────────────────────────────

describe('AnalyticsService.getStudentDashboard', () => {
  let service: AnalyticsService;
  let mockQueryMany: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockQueryMany = vi.fn();
    service = new AnalyticsService({ queryMany: mockQueryMany });
  });

  it('should return error for empty userId', async () => {
    const result = await service.getStudentDashboard('');
    expect(isAnalyticsError(result)).toBe(true);
    if (isAnalyticsError(result)) {
      expect(result.error).toBe('userId is required');
    }
  });

  it('should return error for whitespace-only userId', async () => {
    const result = await service.getStudentDashboard('   ');
    expect(isAnalyticsError(result)).toBe(true);
    if (isAnalyticsError(result)) {
      expect(result.error).toBe('userId is required');
    }
  });

  it('should return full dashboard with computed metrics', async () => {
    // Mock performance records query (first call)
    const records = [
      { record_id: 'r1', user_id: 'user-1', session_id: 's1', question_id: 'q1', selected_answer: 'A', is_correct: true, time_taken_seconds: 10, timestamp: new Date('2024-01-15T12:00:00Z'), section: 'math' },
      { record_id: 'r2', user_id: 'user-1', session_id: 's1', question_id: 'q2', selected_answer: 'B', is_correct: false, time_taken_seconds: 20, timestamp: new Date('2024-01-15T13:00:00Z'), section: 'math' },
      { record_id: 'r3', user_id: 'user-1', session_id: 's1', question_id: 'q3', selected_answer: 'A', is_correct: true, time_taken_seconds: 15, timestamp: new Date('2024-01-15T14:00:00Z'), section: 'math' },
      { record_id: 'r4', user_id: 'user-1', session_id: 's1', question_id: 'q4', selected_answer: 'C', is_correct: true, time_taken_seconds: 12, timestamp: new Date('2024-01-15T15:00:00Z'), section: 'math' },
      { record_id: 'r5', user_id: 'user-1', session_id: 's1', question_id: 'q5', selected_answer: 'D', is_correct: true, time_taken_seconds: 8, timestamp: new Date('2024-01-15T16:00:00Z'), section: 'math' },
    ];

    // Mock weakness profiles query (second call)
    const profiles = [
      { profile_id: 'p1', user_id: 'user-1', skill_tag: 'algebra', section: 'math', accuracy: 0.45, attempt_count: 20 },
      { profile_id: 'p2', user_id: 'user-1', skill_tag: 'geometry', section: 'math', accuracy: 0.80, attempt_count: 15 },
    ];

    mockQueryMany
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce(profiles);

    const result = await service.getStudentDashboard('user-1');

    expect(isAnalyticsError(result)).toBe(false);
    if (!isAnalyticsError(result)) {
      // Score trends
      expect(result.scoreTrends).toHaveLength(1);
      expect(result.scoreTrends[0].section).toBe('math');
      expect(result.scoreTrends[0].accuracy).toBe(4 / 5);

      // Weak skills
      expect(Array.isArray(result.weakSkills)).toBe(true);
      const weak = result.weakSkills as WeakSkillEntry[];
      expect(weak).toHaveLength(1);
      expect(weak[0].skillTag).toBe('algebra');

      // Avg time per section
      const mathTime = result.avgTimePerSection.find((r) => r.section === 'math')!;
      expect(mathTime.insufficientData).toBe(false);
      expect(mathTime.avgTimeSeconds).toBe((10 + 20 + 15 + 12 + 8) / 5);

      // Accuracy per section
      const mathAccuracy = result.accuracyPerSection.find((r) => r.section === 'math')!;
      expect(mathAccuracy.insufficientData).toBe(false);
      expect(mathAccuracy.accuracy).toBe(4 / 5);
    }
  });

  it('should return insufficient data for sections with < 5 records', async () => {
    const records = [
      { record_id: 'r1', user_id: 'user-1', session_id: 's1', question_id: 'q1', selected_answer: 'A', is_correct: true, time_taken_seconds: 10, timestamp: new Date('2024-01-15T12:00:00Z'), section: 'english' },
      { record_id: 'r2', user_id: 'user-1', session_id: 's1', question_id: 'q2', selected_answer: 'B', is_correct: false, time_taken_seconds: 20, timestamp: new Date('2024-01-15T13:00:00Z'), section: 'english' },
    ];

    mockQueryMany
      .mockResolvedValueOnce(records)
      .mockResolvedValueOnce([]);

    const result = await service.getStudentDashboard('user-1');

    expect(isAnalyticsError(result)).toBe(false);
    if (!isAnalyticsError(result)) {
      const engTime = result.avgTimePerSection.find((r) => r.section === 'english')!;
      expect(engTime.insufficientData).toBe(true);

      const engAccuracy = result.accuracyPerSection.find((r) => r.section === 'english')!;
      expect(engAccuracy.insufficientData).toBe(true);
    }
  });

  it('should return "no weak areas" when no profiles below 60%', async () => {
    mockQueryMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { profile_id: 'p1', user_id: 'user-1', skill_tag: 'algebra', section: 'math', accuracy: 0.85, attempt_count: 20 },
      ]);

    const result = await service.getStudentDashboard('user-1');

    expect(isAnalyticsError(result)).toBe(false);
    if (!isAnalyticsError(result)) {
      expect(Array.isArray(result.weakSkills)).toBe(false);
      expect((result.weakSkills as { message: string }).message).toContain('No weak areas');
    }
  });

  it('should query performance records with 30-day window', async () => {
    mockQueryMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getStudentDashboard('user-1');

    // First call is for performance records
    expect(mockQueryMany).toHaveBeenCalledTimes(2);
    const [sql, params] = mockQueryMany.mock.calls[0];
    expect(sql).toContain('performance_records');
    expect(sql).toContain('timestamp >= $2');
    expect(params[0]).toBe('user-1');

    // Verify the date is approximately 30 days ago
    const thirtyDaysAgo = params[1] as Date;
    const now = new Date();
    const diffDays = (now.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(30, 0);
  });

  it('should query weakness profiles for the given userId', async () => {
    mockQueryMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.getStudentDashboard('user-42');

    // Second call is for weakness profiles
    const [sql, params] = mockQueryMany.mock.calls[1];
    expect(sql).toContain('weakness_profiles');
    expect(params[0]).toBe('user-42');
  });
});

// ─── isAnalyticsError helper ─────────────────────────────────────────────────

describe('isAnalyticsError', () => {
  it('should return true for error results', () => {
    expect(isAnalyticsError({ error: 'something went wrong' })).toBe(true);
  });

  it('should return false for dashboard results', () => {
    expect(
      isAnalyticsError({
        scoreTrends: [],
        weakSkills: { message: 'No weak areas' },
        avgTimePerSection: [],
        accuracyPerSection: [],
      })
    ).toBe(false);
  });
});
