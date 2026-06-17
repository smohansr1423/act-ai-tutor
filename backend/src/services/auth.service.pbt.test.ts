/**
 * Property-Based Tests for Auth Service - Login Error Opacity and Account Lockout
 * Feature: act-ai-tutor-app, Property 2: Login Error Opacity
 * Feature: act-ai-tutor-app, Property 3: Account Lockout Threshold
 *
 * **Validates: Requirements 1.4, 1.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import bcrypt from 'bcryptjs';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { loginUser, isAuthError, AuthError, LoginResponse } from './auth.service';
import { query, queryOne } from '../utils/database';
import { Role } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);

// Shared test data
const CORRECT_EMAIL = 'registered@example.com';
const CORRECT_PASSWORD = 'CorrectPass1';
let hashedCorrectPassword: string;

// Arbitrary for generating random email strings that are NOT the correct email
const arbWrongEmail = fc.emailAddress().filter(e => e.toLowerCase() !== CORRECT_EMAIL);

// Arbitrary for generating random password strings that are NOT the correct password
const arbWrongPassword = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter(p => p !== CORRECT_PASSWORD);

// Arbitrary for generating invalid login scenarios
const arbInvalidLoginScenario = fc.oneof(
  // Scenario 1: Wrong email (email doesn't exist in DB)
  fc.record({
    type: fc.constant('wrong_email' as const),
    email: arbWrongEmail,
    password: fc.constant(CORRECT_PASSWORD),
  }),
  // Scenario 2: Wrong password (email exists but password is wrong)
  fc.record({
    type: fc.constant('wrong_password' as const),
    email: fc.constant(CORRECT_EMAIL),
    password: arbWrongPassword,
  }),
  // Scenario 3: Both wrong (email doesn't exist, password is also wrong)
  fc.record({
    type: fc.constant('both_wrong' as const),
    email: arbWrongEmail,
    password: arbWrongPassword,
  })
);

describe('Feature: act-ai-tutor-app, Property 2: Login Error Opacity', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const salt = await bcrypt.genSalt(12);
    hashedCorrectPassword = await bcrypt.hash(CORRECT_PASSWORD, salt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockExistingUser = () => ({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    email: CORRECT_EMAIL,
    password_hash: hashedCorrectPassword,
    role: Role.Student,
    failed_login_attempts: 0,
    locked_until: null,
  });

  it('For any invalid login attempt (wrong email, wrong password, or both wrong), the error response SHALL be identical regardless of which field is incorrect', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidLoginScenario, async (scenario) => {
        vi.clearAllMocks();

        // Set up mocks based on scenario
        if (scenario.type === 'wrong_email' || scenario.type === 'both_wrong') {
          // Email not found in DB
          mockedQueryOne.mockResolvedValueOnce(null);
        } else {
          // Email found but password will be wrong
          mockedQueryOne.mockResolvedValueOnce(mockExistingUser());
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
        }

        const result = await loginUser({
          email: scenario.email,
          password: scenario.password,
        });

        // The result MUST be an error
        expect(isAuthError(result)).toBe(true);

        if (isAuthError(result)) {
          const authError = result as AuthError;

          // The error message MUST be generic "Invalid credentials"
          // It must NOT reveal whether the email exists or the password is wrong
          expect(authError.message).toBe('Invalid credentials');

          // The error MUST NOT contain the lockedUntil field (not a lockout scenario)
          expect(authError.lockedUntil).toBeUndefined();

          // The error message must NOT contain any hints about which field is wrong
          expect(authError.message.toLowerCase()).not.toContain('email');
          expect(authError.message.toLowerCase()).not.toContain('password');
          expect(authError.message.toLowerCase()).not.toContain('not found');
          expect(authError.message.toLowerCase()).not.toContain('does not exist');
          expect(authError.message.toLowerCase()).not.toContain('incorrect');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('For any pair of invalid login attempts with different failure reasons, the error responses SHALL be structurally identical', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbInvalidLoginScenario,
        arbInvalidLoginScenario,
        async (scenario1, scenario2) => {
          // Skip if both scenarios are the same type - we want to compare different failure modes
          if (scenario1.type === scenario2.type) return;

          // First attempt
          vi.clearAllMocks();
          if (scenario1.type === 'wrong_email' || scenario1.type === 'both_wrong') {
            mockedQueryOne.mockResolvedValueOnce(null);
          } else {
            mockedQueryOne.mockResolvedValueOnce(mockExistingUser());
            mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
          }

          const result1 = await loginUser({
            email: scenario1.email,
            password: scenario1.password,
          });

          // Second attempt
          vi.clearAllMocks();
          if (scenario2.type === 'wrong_email' || scenario2.type === 'both_wrong') {
            mockedQueryOne.mockResolvedValueOnce(null);
          } else {
            mockedQueryOne.mockResolvedValueOnce(mockExistingUser());
            mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
          }

          const result2 = await loginUser({
            email: scenario2.email,
            password: scenario2.password,
          });

          // Both MUST be auth errors
          expect(isAuthError(result1)).toBe(true);
          expect(isAuthError(result2)).toBe(true);

          if (isAuthError(result1) && isAuthError(result2)) {
            // Error messages MUST be identical
            expect(result1.message).toBe(result2.message);

            // Both must have the same shape (same keys present)
            expect(Object.keys(result1).sort()).toEqual(Object.keys(result2).sort());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: act-ai-tutor-app, Property 3: Account Lockout Threshold', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const salt = await bcrypt.genSalt(12);
    hashedCorrectPassword = await bcrypt.hash(CORRECT_PASSWORD, salt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Arbitrary for number of failed attempts (1 to 10)
  const arbFailedAttemptCount = fc.integer({ min: 1, max: 10 });

  it('For any sequence of N consecutive failed login attempts, the account SHALL be locked if and only if N >= 5', async () => {
    await fc.assert(
      fc.asyncProperty(arbFailedAttemptCount, async (totalAttempts) => {
        vi.clearAllMocks();

        // Simulate the state where the user already has (totalAttempts - 1) failed attempts
        // and we're about to perform the Nth attempt
        const previousFailedAttempts = totalAttempts - 1;

        const mockUser = {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: CORRECT_EMAIL,
          password_hash: hashedCorrectPassword,
          role: Role.Student,
          failed_login_attempts: previousFailedAttempts,
          locked_until: null,
        };

        mockedQueryOne.mockResolvedValueOnce(mockUser);
        mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

        const result = await loginUser({
          email: CORRECT_EMAIL,
          password: 'WrongPasswordX1', // Always wrong
        });

        expect(isAuthError(result)).toBe(true);

        if (isAuthError(result)) {
          if (totalAttempts >= 5) {
            // Account MUST be locked (lockout message returned)
            expect(result.message).toContain('temporarily locked');
            expect(result.lockedUntil).toBeDefined();
          } else {
            // Account MUST NOT be locked (generic error returned)
            expect(result.message).toBe('Invalid credentials');
            expect(result.lockedUntil).toBeUndefined();
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('The lock duration SHALL be exactly 15 minutes from the time of the 5th failure', async () => {
    // Test with N >= 5 to verify lock duration is exactly 15 minutes
    const arbLockTriggeringAttempts = fc.integer({ min: 5, max: 10 });

    await fc.assert(
      fc.asyncProperty(arbLockTriggeringAttempts, async (totalAttempts) => {
        vi.clearAllMocks();

        const previousFailedAttempts = totalAttempts - 1;

        const mockUser = {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: CORRECT_EMAIL,
          password_hash: hashedCorrectPassword,
          role: Role.Student,
          failed_login_attempts: previousFailedAttempts,
          locked_until: null,
        };

        mockedQueryOne.mockResolvedValueOnce(mockUser);
        mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

        const beforeTime = Date.now();
        const result = await loginUser({
          email: CORRECT_EMAIL,
          password: 'WrongPasswordX1',
        });
        const afterTime = Date.now();

        expect(isAuthError(result)).toBe(true);

        if (isAuthError(result)) {
          expect(result.lockedUntil).toBeDefined();

          const lockExpiry = result.lockedUntil!.getTime();
          const expectedMinLock = beforeTime + 15 * 60 * 1000;
          const expectedMaxLock = afterTime + 15 * 60 * 1000;

          // Lock duration must be exactly 15 minutes (within test execution tolerance)
          expect(lockExpiry).toBeGreaterThanOrEqual(expectedMinLock);
          expect(lockExpiry).toBeLessThanOrEqual(expectedMaxLock);

          // Verify it's not 14 minutes or 16 minutes
          const durationFromBefore = lockExpiry - beforeTime;
          const fifteenMinutesMs = 15 * 60 * 1000;
          // Allow 1 second tolerance for test execution time
          expect(durationFromBefore).toBeGreaterThanOrEqual(fifteenMinutesMs - 1000);
          expect(durationFromBefore).toBeLessThanOrEqual(fifteenMinutesMs + 1000);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('For fewer than 5 consecutive failed attempts, the account SHALL NOT be locked', async () => {
    const arbSubThresholdAttempts = fc.integer({ min: 1, max: 4 });

    await fc.assert(
      fc.asyncProperty(arbSubThresholdAttempts, async (totalAttempts) => {
        vi.clearAllMocks();

        const previousFailedAttempts = totalAttempts - 1;

        const mockUser = {
          user_id: '123e4567-e89b-12d3-a456-426614174000',
          email: CORRECT_EMAIL,
          password_hash: hashedCorrectPassword,
          role: Role.Student,
          failed_login_attempts: previousFailedAttempts,
          locked_until: null,
        };

        mockedQueryOne.mockResolvedValueOnce(mockUser);
        mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

        const result = await loginUser({
          email: CORRECT_EMAIL,
          password: 'WrongPasswordX1',
        });

        expect(isAuthError(result)).toBe(true);

        if (isAuthError(result)) {
          // Account MUST NOT be locked
          expect(result.message).toBe('Invalid credentials');
          expect(result.lockedUntil).toBeUndefined();
          expect(result.message).not.toContain('locked');
        }
      }),
      { numRuns: 100 }
    );
  });
});
