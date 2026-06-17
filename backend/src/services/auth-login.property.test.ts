/**
 * Property-Based Tests for Auth Service - Login Error Opacity and Account Lockout
 *
 * Property 2: Login Error Opacity
 * For any invalid login attempt (wrong email, wrong password, or both wrong),
 * the error response SHALL be identical regardless of which field is incorrect —
 * never revealing whether the email exists or the password is wrong.
 *
 * Property 3: Account Lockout Threshold
 * For any sequence of N consecutive failed login attempts for the same account,
 * the account SHALL be locked if and only if N >= 5, and the lock duration SHALL
 * be exactly 15 minutes.
 *
 * Validates: Requirements 1.4, 1.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { loginUser, isAuthError, AuthError } from './auth.service';
import { query, queryOne } from '../utils/database';
import { Role } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);

// Pre-compute a hashed password for use in tests
const KNOWN_PASSWORD = 'TestPass1';
let knownPasswordHash: string;
let knownSalt: string;

beforeEach(async () => {
  vi.clearAllMocks();
  knownSalt = await bcrypt.genSalt(12);
  knownPasswordHash = await bcrypt.hash(KNOWN_PASSWORD, knownSalt);
});

/**
 * Arbitrary for generating valid email strings that differ from the known user email.
 */
const wrongEmailArb = fc.emailAddress().filter(email => email.toLowerCase() !== 'known@example.com');

/**
 * Arbitrary for generating passwords that differ from the known password.
 */
const wrongPasswordArb = fc.string({ minLength: 1, maxLength: 50 })
  .filter(pw => pw !== KNOWN_PASSWORD);

/**
 * Arbitrary for generating the type of invalid login scenario.
 */
const invalidLoginScenarioArb = fc.constantFrom(
  'wrong_email' as const,
  'wrong_password' as const,
  'both_wrong' as const
);

describe('Property 2: Login Error Opacity', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any invalid login attempt (wrong email, wrong password, or both wrong),
   * the error response SHALL be identical regardless of which field is incorrect.
   */
  it('should return identical error response for any type of invalid login attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        wrongEmailArb,
        wrongPasswordArb,
        async (wrongEmail, wrongPassword) => {
          vi.clearAllMocks();

          // Scenario 1: Wrong email (user not found)
          mockedQueryOne.mockResolvedValueOnce(null);
          const wrongEmailResult = await loginUser({
            email: wrongEmail,
            password: KNOWN_PASSWORD,
          });

          // Scenario 2: Wrong password (user found but password doesn't match)
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: 0,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
          const wrongPwResult = await loginUser({
            email: 'known@example.com',
            password: wrongPassword,
          });

          // Scenario 3: Both wrong (email doesn't exist, password also wrong)
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce(null);
          const bothWrongResult = await loginUser({
            email: wrongEmail,
            password: wrongPassword,
          });

          // All three must be auth errors
          expect(isAuthError(wrongEmailResult)).toBe(true);
          expect(isAuthError(wrongPwResult)).toBe(true);
          expect(isAuthError(bothWrongResult)).toBe(true);

          // All three must have the same error message
          const error1 = wrongEmailResult as AuthError;
          const error2 = wrongPwResult as AuthError;
          const error3 = bothWrongResult as AuthError;

          expect(error1.message).toBe(error2.message);
          expect(error2.message).toBe(error3.message);

          // None should have a lockedUntil field (unlocked account)
          expect(error1.lockedUntil).toBeUndefined();
          expect(error2.lockedUntil).toBeUndefined();
          expect(error3.lockedUntil).toBeUndefined();

          // The error message should NOT contain hints about which field is wrong
          const msg = error1.message.toLowerCase();
          expect(msg).not.toContain('email');
          expect(msg).not.toContain('password');
          expect(msg).not.toContain('not found');
          expect(msg).not.toContain('does not exist');
          expect(msg).not.toContain('incorrect password');
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * For any number of failed attempts below the lockout threshold,
   * the error message should remain identical and opaque.
   */
  it('should maintain error opacity across varying failed attempt counts below threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        wrongPasswordArb,
        async (failedAttempts, wrongPassword) => {
          vi.clearAllMocks();

          // Wrong email scenario
          mockedQueryOne.mockResolvedValueOnce(null);
          const wrongEmailResult = await loginUser({
            email: 'nonexistent@example.com',
            password: wrongPassword,
          });

          vi.clearAllMocks();

          // Wrong password scenario with various failed attempt counts
          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: failedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
          const wrongPwResult = await loginUser({
            email: 'known@example.com',
            password: wrongPassword,
          });

          // Both must return identical error messages
          expect(isAuthError(wrongEmailResult)).toBe(true);
          expect(isAuthError(wrongPwResult)).toBe(true);

          const error1 = wrongEmailResult as AuthError;
          const error2 = wrongPwResult as AuthError;
          expect(error1.message).toBe(error2.message);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('Property 3: Account Lockout Threshold', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any sequence of N consecutive failed login attempts for the same account,
   * the account SHALL be locked if and only if N >= 5.
   */
  it('should lock account if and only if consecutive failed attempts >= 5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        wrongPasswordArb,
        async (currentFailedAttempts, wrongPassword) => {
          vi.clearAllMocks();

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: currentFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'known@example.com',
            password: wrongPassword,
          });

          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;

          // After this attempt, total failed attempts = currentFailedAttempts + 1
          const totalFailedAfter = currentFailedAttempts + 1;

          if (totalFailedAfter >= 5) {
            // Account should be locked
            expect(error.lockedUntil).toBeDefined();
            expect(error.message).toContain('temporarily locked');
          } else {
            // Account should NOT be locked
            expect(error.lockedUntil).toBeUndefined();
            expect(error.message).not.toContain('temporarily locked');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * When an account is locked, the lock duration SHALL be exactly 15 minutes.
   */
  it('should lock account for exactly 15 minutes when threshold is reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 4, max: 20 }),
        wrongPasswordArb,
        async (currentFailedAttempts, wrongPassword) => {
          vi.clearAllMocks();

          const beforeLogin = Date.now();

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: currentFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'known@example.com',
            password: wrongPassword,
          });

          const afterLogin = Date.now();

          // Total attempts after this attempt >= 5, so account must be locked
          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;
          expect(error.lockedUntil).toBeDefined();

          // Verify lock duration is exactly 15 minutes (within execution time tolerance)
          const lockTime = error.lockedUntil!.getTime();
          const expectedLockMin = beforeLogin + 15 * 60 * 1000;
          const expectedLockMax = afterLogin + 15 * 60 * 1000;

          expect(lockTime).toBeGreaterThanOrEqual(expectedLockMin);
          expect(lockTime).toBeLessThanOrEqual(expectedLockMax);

          // Verify it's approximately 15 minutes (900000ms) with 1 second tolerance
          const durationFromBefore = lockTime - beforeLogin;
          const fifteenMinutesMs = 15 * 60 * 1000;
          expect(Math.abs(durationFromBefore - fifteenMinutesMs)).toBeLessThan(1000);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * An already-locked account should reject login attempts with a locked message.
   */
  it('should reject login attempts on already-locked accounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 14 }),
        fc.boolean(),
        async (minutesRemaining, useCorrectPassword) => {
          vi.clearAllMocks();

          const lockedUntil = new Date(Date.now() + minutesRemaining * 60 * 1000);

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: 5,
            locked_until: lockedUntil,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const password = useCorrectPassword ? KNOWN_PASSWORD : 'WrongPass1';
          const result = await loginUser({
            email: 'known@example.com',
            password,
          });

          // Even with correct password, locked account should be rejected
          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;
          expect(error.message).toContain('temporarily locked');
          expect(error.lockedUntil).toEqual(lockedUntil);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * A successful login should reset the failed attempt counter,
   * meaning subsequent failures start counting from 0 again.
   */
  it('should reset failed attempt counter on successful login', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        async (previousFailedAttempts) => {
          vi.clearAllMocks();

          // Simulate a user with some failed attempts who logs in successfully
          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-123',
            email: 'known@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: previousFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'known@example.com',
            password: KNOWN_PASSWORD,
          });

          // Should succeed regardless of previous failed attempts
          expect(isAuthError(result)).toBe(false);

          // Verify that the update query resets failed_login_attempts to 0
          const updateCalls = mockedQuery.mock.calls;
          const resetCall = updateCalls.find(call =>
            (call[0] as string).includes('failed_login_attempts = 0')
          );
          expect(resetCall).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});
