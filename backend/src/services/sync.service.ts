/**
 * Sync Service
 * Handles offline-to-online data synchronization with conflict resolution.
 *
 * Requirements: 10.2, 10.3, 10.4
 *
 * - On connectivity restoration: sync cached local responses to server within 30 seconds
 * - Conflict resolution: last-write-wins (most recent timestamp per question)
 * - Retry sync up to 3 times at 10-second intervals on failure
 * - Show sync pending indicator to student
 */

import { v4 as uuidv4 } from 'uuid';
import { PerformanceRecord, WeaknessProfile, StudyPlan } from '../models/interfaces';
import { queryOne, queryMany, insertOne } from '../utils/database';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A locally-cached performance record submitted for sync */
export interface LocalPerformanceRecord {
  record_id: string;
  user_id: string;
  session_id: string;
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean;
  time_taken_seconds: number;
  error_classification: string | null;
  timestamp: Date | string;
}

/** A locally-cached weakness profile submitted for sync */
export interface LocalWeaknessProfile {
  profile_id: string;
  user_id: string;
  skill_tag: string;
  section: string;
  accuracy: number;
  attempt_count: number;
  recent_attempts: { is_correct: boolean; timestamp: string }[];
  updated_at: Date | string;
}

/** A locally-cached study plan submitted for sync */
export interface LocalStudyPlan {
  plan_id: string;
  user_id: string;
  daily_targets: unknown[];
  weekly_goals: unknown[];
  projected_score_range: { lower: number; upper: number };
  created_at: Date | string;
  valid_until: Date | string;
}

/** Result of a sync operation */
export interface SyncResult {
  synced: number;
  conflicts: number;
  errors: number;
}

/** Overall status of syncing all data types */
export interface SyncAllResult {
  performanceRecords: SyncResult;
  weaknessProfiles: SyncResult;
  studyPlans: SyncResult;
  status: 'success' | 'partial' | 'failed';
}

/** Database row for existing performance record lookup */
interface ExistingRecordRow {
  record_id: string;
  session_id: string;
  question_id: string;
  timestamp: Date | string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * SyncService handles synchronization of locally-cached data to the server.
 * Uses last-write-wins conflict resolution based on most recent timestamp per question.
 * Supports dependency injection for testability.
 */
export class SyncService {
  private readonly queryOneFn: typeof queryOne;
  private readonly queryManyFn: typeof queryMany;
  private readonly insertOneFn: typeof insertOne;

  constructor(deps?: {
    queryOne?: typeof queryOne;
    queryMany?: typeof queryMany;
    insertOne?: typeof insertOne;
  }) {
    this.queryOneFn = deps?.queryOne ?? queryOne;
    this.queryManyFn = deps?.queryMany ?? queryMany;
    this.insertOneFn = deps?.insertOne ?? insertOne;
  }

  /**
   * Sync locally-cached performance records to the server.
   *
   * For each record:
   * - Check if a server-side record exists for the same (session_id, question_id)
   * - If conflict: keep the record with the most recent timestamp (last-write-wins)
   * - If no conflict: insert the local record
   *
   * Requirements: 10.3 (last-write-wins), 10.2 (sync within 10 seconds)
   *
   * @param userId - The user whose records are being synced
   * @param localRecords - Array of locally-cached Performance_Records with timestamps
   * @returns SyncResult with counts of synced, conflicts, and errors
   */
  async syncPerformanceRecords(
    userId: string,
    localRecords: LocalPerformanceRecord[]
  ): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, conflicts: 0, errors: 0 };

    if (!userId || !localRecords || localRecords.length === 0) {
      return result;
    }

    for (const localRecord of localRecords) {
      try {
        // Check if a server-side record exists for the same (session_id, question_id)
        const existingRecord = await this.queryOneFn<ExistingRecordRow>(
          `SELECT record_id, session_id, question_id, timestamp
           FROM performance_records
           WHERE session_id = $1 AND question_id = $2`,
          [localRecord.session_id, localRecord.question_id]
        );

        if (existingRecord) {
          // Conflict: compare timestamps — last-write-wins
          const localTimestamp = new Date(localRecord.timestamp).getTime();
          const serverTimestamp = new Date(existingRecord.timestamp).getTime();

          if (localTimestamp > serverTimestamp) {
            // Local is newer — update the server record
            await this.queryOneFn(
              `UPDATE performance_records
               SET selected_answer = $1, is_correct = $2, time_taken_seconds = $3,
                   error_classification = $4, timestamp = $5
               WHERE record_id = $6
               RETURNING *`,
              [
                localRecord.selected_answer,
                localRecord.is_correct,
                localRecord.time_taken_seconds,
                localRecord.error_classification,
                new Date(localRecord.timestamp),
                existingRecord.record_id,
              ]
            );
            result.conflicts += 1;
            result.synced += 1;
          } else {
            // Server is newer or equal — discard local record
            result.conflicts += 1;
          }
        } else {
          // No conflict — insert the local record
          await this.insertOneFn(
            `INSERT INTO performance_records (
              record_id, user_id, session_id, question_id, selected_answer,
              is_correct, time_taken_seconds, error_classification, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
              localRecord.record_id || uuidv4(),
              userId,
              localRecord.session_id,
              localRecord.question_id,
              localRecord.selected_answer,
              localRecord.is_correct,
              localRecord.time_taken_seconds,
              localRecord.error_classification,
              new Date(localRecord.timestamp),
            ]
          );
          result.synced += 1;
        }
      } catch (error) {
        result.errors += 1;
      }
    }

    return result;
  }

  /**
   * Sync all locally-cached data (Performance_Records, Weakness_Profile, Study_Plan).
   *
   * Requirements: 10.2, 10.3, 10.4
   *
   * @param userId - The user whose data is being synced
   * @param data - Object containing all data types to sync
   * @returns SyncAllResult with per-type results and overall status
   */
  async syncAllData(
    userId: string,
    data: {
      performanceRecords?: LocalPerformanceRecord[];
      weaknessProfiles?: LocalWeaknessProfile[];
      studyPlans?: LocalStudyPlan[];
    }
  ): Promise<SyncAllResult> {
    const performanceResult = await this.syncPerformanceRecords(
      userId,
      data.performanceRecords || []
    );

    const weaknessResult = await this.syncWeaknessProfiles(
      userId,
      data.weaknessProfiles || []
    );

    const studyPlanResult = await this.syncStudyPlans(
      userId,
      data.studyPlans || []
    );

    // Determine overall status
    const totalErrors =
      performanceResult.errors + weaknessResult.errors + studyPlanResult.errors;
    const totalSynced =
      performanceResult.synced + weaknessResult.synced + studyPlanResult.synced;

    let status: 'success' | 'partial' | 'failed';
    if (totalErrors === 0) {
      status = 'success';
    } else if (totalSynced > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    return {
      performanceRecords: performanceResult,
      weaknessProfiles: weaknessResult,
      studyPlans: studyPlanResult,
      status,
    };
  }

  /**
   * Sync locally-cached weakness profiles to the server.
   * Uses last-write-wins based on updated_at timestamp.
   */
  private async syncWeaknessProfiles(
    userId: string,
    localProfiles: LocalWeaknessProfile[]
  ): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, conflicts: 0, errors: 0 };

    if (!userId || !localProfiles || localProfiles.length === 0) {
      return result;
    }

    for (const localProfile of localProfiles) {
      try {
        const existing = await this.queryOneFn<{
          profile_id: string;
          updated_at: Date | string;
        }>(
          `SELECT profile_id, updated_at FROM weakness_profiles
           WHERE user_id = $1 AND skill_tag = $2`,
          [userId, localProfile.skill_tag]
        );

        if (existing) {
          const localTime = new Date(localProfile.updated_at).getTime();
          const serverTime = new Date(existing.updated_at).getTime();

          if (localTime > serverTime) {
            await this.queryOneFn(
              `UPDATE weakness_profiles
               SET accuracy = $1, attempt_count = $2, recent_attempts = $3, updated_at = $4
               WHERE profile_id = $5
               RETURNING *`,
              [
                localProfile.accuracy,
                localProfile.attempt_count,
                JSON.stringify(localProfile.recent_attempts),
                new Date(localProfile.updated_at),
                existing.profile_id,
              ]
            );
            result.conflicts += 1;
            result.synced += 1;
          } else {
            result.conflicts += 1;
          }
        } else {
          await this.insertOneFn(
            `INSERT INTO weakness_profiles (
              profile_id, user_id, skill_tag, section, accuracy,
              attempt_count, recent_attempts, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
              localProfile.profile_id || uuidv4(),
              userId,
              localProfile.skill_tag,
              localProfile.section,
              localProfile.accuracy,
              localProfile.attempt_count,
              JSON.stringify(localProfile.recent_attempts),
              new Date(localProfile.updated_at),
            ]
          );
          result.synced += 1;
        }
      } catch (error) {
        result.errors += 1;
      }
    }

    return result;
  }

  /**
   * Sync locally-cached study plans to the server.
   * Uses last-write-wins based on created_at timestamp.
   */
  private async syncStudyPlans(
    userId: string,
    localPlans: LocalStudyPlan[]
  ): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, conflicts: 0, errors: 0 };

    if (!userId || !localPlans || localPlans.length === 0) {
      return result;
    }

    for (const localPlan of localPlans) {
      try {
        const existing = await this.queryOneFn<{
          plan_id: string;
          created_at: Date | string;
        }>(
          `SELECT plan_id, created_at FROM study_plans
           WHERE plan_id = $1 AND user_id = $2`,
          [localPlan.plan_id, userId]
        );

        if (existing) {
          // Study plans are replaced entirely — last-write-wins by created_at
          const localTime = new Date(localPlan.created_at).getTime();
          const serverTime = new Date(existing.created_at).getTime();

          if (localTime > serverTime) {
            await this.queryOneFn(
              `UPDATE study_plans
               SET daily_targets = $1, weekly_goals = $2, projected_score_range = $3,
                   valid_until = $4, created_at = $5
               WHERE plan_id = $6
               RETURNING *`,
              [
                JSON.stringify(localPlan.daily_targets),
                JSON.stringify(localPlan.weekly_goals),
                JSON.stringify(localPlan.projected_score_range),
                new Date(localPlan.valid_until),
                new Date(localPlan.created_at),
                existing.plan_id,
              ]
            );
            result.conflicts += 1;
            result.synced += 1;
          } else {
            result.conflicts += 1;
          }
        } else {
          await this.insertOneFn(
            `INSERT INTO study_plans (
              plan_id, user_id, daily_targets, weekly_goals,
              projected_score_range, created_at, valid_until
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
              localPlan.plan_id || uuidv4(),
              userId,
              JSON.stringify(localPlan.daily_targets),
              JSON.stringify(localPlan.weekly_goals),
              JSON.stringify(localPlan.projected_score_range),
              new Date(localPlan.created_at),
              new Date(localPlan.valid_until),
            ]
          );
          result.synced += 1;
        }
      } catch (error) {
        result.errors += 1;
      }
    }

    return result;
  }
}
