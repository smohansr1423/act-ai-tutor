/**
 * Property-Based Tests for Sync Conflict Resolution
 * Feature: act-ai-tutor-app, Property 28: Sync Conflict Resolution
 *
 * **Validates: Requirements 10.3**
 *
 * For any conflict between local and server Performance_Records for the same question
 * within the same session, the record with the most recent timestamp SHALL be preserved,
 * and the older record SHALL be discarded.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { SyncService, LocalPerformanceRecord } from '../../services/sync.service';

// ─── Generators ───────────────────────────────────────────────────────────────

/** Generator for a valid UUID-like string */
const uuidArb = fc.uuid();

/** Generator for an answer choice (A, B, C, D) */
const answerChoiceArb = fc.constantFrom('A', 'B', 'C', 'D');

/** Generator for a positive time taken in seconds */
const timeTakenArb = fc.integer({ min: 1, max: 300 });

/** Generator for a timestamp within a reasonable range */
const timestampArb = fc.date({
  min: new Date('2024-01-01T00:00:00Z'),
  max: new Date('2025-12-31T23:59:59Z'),
});

/**
 * Generator for two distinct timestamps (guaranteed different by at least 1ms).
 * Returns { older, newer } — always ordered.
 */
const distinctTimestampPairArb = fc
  .tuple(timestampArb, fc.integer({ min: 1, max: 86400000 }))
  .map(([base, offsetMs]) => ({
    older: new Date(base.getTime()),
    newer: new Date(base.getTime() + offsetMs),
  }));

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Creates a fresh SyncService with mock DB functions for each test iteration.
 * Returns the service and mocks so assertions can be made.
 */
function createServiceWithMocks() {
  const mockQueryOne = vi.fn();
  const mockQueryMany = vi.fn();
  const mockInsertOne = vi.fn().mockResolvedValue({ record_id: 'inserted' });

  const service = new SyncService({
    queryOne: mockQueryOne,
    queryMany: mockQueryMany,
    insertOne: mockInsertOne,
  });

  return { service, mockQueryOne, mockQueryMany, mockInsertOne };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Property 28: Sync Conflict Resolution', () => {
  /**
   * Property: When local timestamp is more recent than server timestamp,
   * the local record SHALL be preserved (server is updated with local data).
   */
  it('local record with more recent timestamp SHALL be preserved over older server record', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        distinctTimestampPairArb,
        answerChoiceArb,
        fc.boolean(),
        timeTakenArb,
        async (userId, sessionId, questionId, timestamps, answer, isCorrect, timeTaken) => {
          const { older: serverTimestamp, newer: localTimestamp } = timestamps;
          const { service, mockQueryOne, mockInsertOne } = createServiceWithMocks();

          // Server has an older record
          mockQueryOne
            .mockResolvedValueOnce({
              record_id: 'server-record-id',
              session_id: sessionId,
              question_id: questionId,
              timestamp: serverTimestamp,
            })
            .mockResolvedValueOnce({ record_id: 'server-record-id' }); // UPDATE result

          const localRecord: LocalPerformanceRecord = {
            record_id: 'local-record-id',
            user_id: userId,
            session_id: sessionId,
            question_id: questionId,
            selected_answer: answer,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken,
            error_classification: null,
            timestamp: localTimestamp,
          };

          const result = await service.syncPerformanceRecords(userId, [localRecord]);

          // Local record (newer) should be synced — last-write-wins
          expect(result.synced).toBe(1);
          expect(result.conflicts).toBe(1);
          expect(result.errors).toBe(0);

          // The UPDATE should have been called (2 queryOne calls: lookup + update)
          expect(mockQueryOne).toHaveBeenCalledTimes(2);
          const updateSql = mockQueryOne.mock.calls[1][0] as string;
          expect(updateSql).toContain('UPDATE performance_records');

          // No insert should have been called (it's an update, not insert)
          expect(mockInsertOne).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When server timestamp is more recent than local timestamp,
   * the server record SHALL be preserved and the local record SHALL be discarded.
   */
  it('server record with more recent timestamp SHALL be preserved, local record discarded', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        distinctTimestampPairArb,
        answerChoiceArb,
        fc.boolean(),
        timeTakenArb,
        async (userId, sessionId, questionId, timestamps, answer, isCorrect, timeTaken) => {
          const { older: localTimestamp, newer: serverTimestamp } = timestamps;
          const { service, mockQueryOne, mockInsertOne } = createServiceWithMocks();

          // Server has a newer record
          mockQueryOne.mockResolvedValueOnce({
            record_id: 'server-record-id',
            session_id: sessionId,
            question_id: questionId,
            timestamp: serverTimestamp,
          });

          const localRecord: LocalPerformanceRecord = {
            record_id: 'local-record-id',
            user_id: userId,
            session_id: sessionId,
            question_id: questionId,
            selected_answer: answer,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken,
            error_classification: null,
            timestamp: localTimestamp,
          };

          const result = await service.syncPerformanceRecords(userId, [localRecord]);

          // Local record (older) should be discarded — server wins
          expect(result.synced).toBe(0);
          expect(result.conflicts).toBe(1);
          expect(result.errors).toBe(0);

          // Only the lookup query should have been called, no UPDATE
          expect(mockQueryOne).toHaveBeenCalledTimes(1);
          // No insert should have been called
          expect(mockInsertOne).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When local and server timestamps are equal, the server record
   * SHALL be preserved (tie goes to server — no update performed).
   */
  it('when timestamps are equal, server record SHALL be preserved (tie-breaking)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        timestampArb,
        answerChoiceArb,
        fc.boolean(),
        timeTakenArb,
        async (userId, sessionId, questionId, sameTimestamp, answer, isCorrect, timeTaken) => {
          const { service, mockQueryOne, mockInsertOne } = createServiceWithMocks();

          // Both local and server have the same timestamp
          mockQueryOne.mockResolvedValueOnce({
            record_id: 'server-record-id',
            session_id: sessionId,
            question_id: questionId,
            timestamp: sameTimestamp,
          });

          const localRecord: LocalPerformanceRecord = {
            record_id: 'local-record-id',
            user_id: userId,
            session_id: sessionId,
            question_id: questionId,
            selected_answer: answer,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken,
            error_classification: null,
            timestamp: sameTimestamp,
          };

          const result = await service.syncPerformanceRecords(userId, [localRecord]);

          // Server wins on tie — local is discarded
          expect(result.synced).toBe(0);
          expect(result.conflicts).toBe(1);
          expect(result.errors).toBe(0);

          // Only lookup query, no UPDATE
          expect(mockQueryOne).toHaveBeenCalledTimes(1);
          expect(mockInsertOne).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any set of multiple conflicting records (same session+question pairs
   * with different timestamps), each conflict SHALL be resolved independently by
   * selecting the record with the most recent timestamp.
   */
  it('multiple conflicts SHALL each be resolved independently by most recent timestamp', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        fc.array(
          fc.tuple(uuidArb, uuidArb, distinctTimestampPairArb, fc.boolean()),
          { minLength: 2, maxLength: 5 }
        ),
        async (userId, conflictScenarios) => {
          const { service, mockQueryOne, mockInsertOne } = createServiceWithMocks();

          let expectedSynced = 0;
          const expectedConflicts = conflictScenarios.length;

          // Set up mock responses for each scenario
          for (const [sessionId, questionId, timestamps, localIsNewer] of conflictScenarios) {
            const serverTs = localIsNewer ? timestamps.older : timestamps.newer;

            mockQueryOne.mockResolvedValueOnce({
              record_id: `server-${questionId}`,
              session_id: sessionId,
              question_id: questionId,
              timestamp: serverTs,
            });

            if (localIsNewer) {
              // When local is newer, the UPDATE call also uses queryOne
              mockQueryOne.mockResolvedValueOnce({ record_id: `server-${questionId}` });
              expectedSynced += 1;
            }
          }

          // Build local records
          const localRecords: LocalPerformanceRecord[] = conflictScenarios.map(
            ([sessionId, questionId, timestamps, localIsNewer]) => ({
              record_id: `local-${questionId}`,
              user_id: userId,
              session_id: sessionId,
              question_id: questionId,
              selected_answer: 'B' as string,
              is_correct: true,
              time_taken_seconds: 20,
              error_classification: null,
              timestamp: localIsNewer ? timestamps.newer : timestamps.older,
            })
          );

          const result = await service.syncPerformanceRecords(userId, localRecords);

          expect(result.conflicts).toBe(expectedConflicts);
          expect(result.synced).toBe(expectedSynced);
          expect(result.errors).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: When no server record exists for the same (session_id, question_id),
   * the local record SHALL always be inserted (no conflict).
   */
  it('when no server record exists, local record SHALL be inserted without conflict', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        uuidArb,
        timestampArb,
        answerChoiceArb,
        fc.boolean(),
        timeTakenArb,
        async (userId, sessionId, questionId, timestamp, answer, isCorrect, timeTaken) => {
          const { service, mockQueryOne, mockInsertOne } = createServiceWithMocks();

          // No existing server record
          mockQueryOne.mockResolvedValueOnce(null);
          mockInsertOne.mockResolvedValueOnce({ record_id: 'new-record' });

          const localRecord: LocalPerformanceRecord = {
            record_id: 'local-record-id',
            user_id: userId,
            session_id: sessionId,
            question_id: questionId,
            selected_answer: answer,
            is_correct: isCorrect,
            time_taken_seconds: timeTaken,
            error_classification: null,
            timestamp: timestamp,
          };

          const result = await service.syncPerformanceRecords(userId, [localRecord]);

          // Should be inserted, no conflict
          expect(result.synced).toBe(1);
          expect(result.conflicts).toBe(0);
          expect(result.errors).toBe(0);

          // Insert should have been called
          expect(mockInsertOne).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
