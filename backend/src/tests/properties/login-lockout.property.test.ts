/**
 * Property-Based Tests for Login Error Opacity and Account Lockout
 * Feature: act-ai-tutor-app
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
 * **Validates: Requirements 1.4, 1.5**
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';

// Mock the database module
vi.mock('../../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { loginUser, isAuthError, AuthError, LoginResponse } from '../../services/auth.service';
import { query, queryOne } from '../../utils/database';
import { Role } from '../../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);

// Known test user credentials
const KNOWN_PASSWORD = 'TestPass1';
let knownPasswordHash: string;

beforeEach(async () => {
  vi.clearAllMocks();
  // Use cost factor 4 for faster test execution
  const salt = await bcrypt.genSalt(4);
  knownPasswordHash = await bcrypt.hash(KNOWN_PASSWORD, salt);
});

/**
 * Generator for valid email strings that are different from the known user's email.
 */
const wrongEmailArb = fc.emailAddress().filter(
  email => email.toLowerCase() !== 'testuser@example.com'
);

/**
 * Generator for passwords that are guaranteed to differ from the known password.
 */
const wrongPasswordArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 8 }),
  fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 4 }),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 4 }),
).map(([lower, upper, digit]) => lower + upper + digit)
  .filter(pw => pw !== KNOWN_PASSWORD && pw.length >= 1);

describe('Property 2: Login Error Opacity', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any invalid login attempt (wrong email, wrong password, or both wrong),
   * the error response SHALL be identical regardless of which field is incorrect —
   * never revealing whether the email exists or the password is wrong.
   */
  it('error response is identical for wrong email, wrong password, or both wrong', async () => {
    await fc.assert(
      fc.asyncProperty(
        wrongEmailArb,
        wrongPasswordArb,
        async (wrongEmail, wrongPassword) => {
          // --- Scenario 1: Wrong email (user not found in database) ---
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce(null);

          const wrongEmailResult = await loginUser({
            email: wrongEmail,
            password: KNOWN_PASSWORD,
          });

          // --- Scenario 2: Wrong password (user exists but password incorrect) ---
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: 0,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const wrongPwResult = await loginUser({
            email: 'testuser@example.com',
            password: wrongPassword,
          });

          // --- Scenario 3: Both email and password are wrong ---
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce(null);

          const bothWrongResult = await loginUser({
            email: wrongEmail,
            password: wrongPassword,
          });

          // All three scenarios must return auth errors
          expect(isAuthError(wrongEmailResult)).toBe(true);
          expect(isAuthError(wrongPwResult)).toBe(true);
          expect(isAuthError(bothWrongResult)).toBe(true);

          const err1 = wrongEmailResult as AuthError;
          const err2 = wrongPwResult as AuthError;
          const err3 = bothWrongResult as AuthError;

          // All error messages must be identical
          expect(err1.message).toBe(err2.message);
          expect(err2.message).toBe(err3.message);

          // Error message must not leak which field was wrong
          const msg = err1.message.toLowerCase();
          expect(msg).not.toContain('email');
          expect(msg).not.toContain('password');
          expect(msg).not.toContain('not found');
          expect(msg).not.toContain('does not exist');
          expect(msg).not.toContain('incorrect');
          expect(msg).not.toContain('unknown user');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.4**
   *
   * For any failed attempt count below the lockout threshold,
   * the error response must remain opaque — identical regardless of failure type.
   */
  it('error opacity holds at any failed attempt count below lockout threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 3 }),
        wrongPasswordArb,
        wrongEmailArb,
        async (failedAttempts, wrongPassword, wrongEmail) => {
          // Wrong email scenario
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce(null);

          const wrongEmailResult = await loginUser({
            email: wrongEmail,
            password: wrongPassword,
          });

          // Wrong password scenario with prior failed attempts
          vi.clearAllMocks();
          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: failedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const wrongPwResult = await loginUser({
            email: 'testuser@example.com',
            password: wrongPassword,
          });

          // Both must be errors with identical messages
          expect(isAuthError(wrongEmailResult)).toBe(true);
          expect(isAuthError(wrongPwResult)).toBe(true);

          const err1 = wrongEmailResult as AuthError;
          const err2 = wrongPwResult as AuthError;
          expect(err1.message).toBe(err2.message);

          // Neither should have a lockedUntil (below threshold)
          expect(err1.lockedUntil).toBeUndefined();
          expect(err2.lockedUntil).toBeUndefined();
        }
      ),
      { numRuns: 100 }
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
  it('account is locked if and only if consecutive failed attempts >= 5', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 15 }),
        wrongPasswordArb,
        async (currentFailedAttempts, wrongPassword) => {
          vi.clearAllMocks();

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: currentFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'testuser@example.com',
            password: wrongPassword,
          });

          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;

          // After this attempt, total consecutive failures = currentFailedAttempts + 1
          const totalFailedAfter = currentFailedAttempts + 1;

          if (totalFailedAfter >= 5) {
            // Account MUST be locked
            expect(error.lockedUntil).toBeDefined();
            expect(error.message.toLowerCase()).toContain('locked');
          } else {
            // Account MUST NOT be locked
            expect(error.lockedUntil).toBeUndefined();
            expect(error.message.toLowerCase()).not.toContain('locked');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * When the lockout threshold is reached, the lock duration SHALL be exactly 15 minutes.
   */
  it('lock duration is exactly 15 minutes when threshold is reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 4, max: 20 }),
        wrongPasswordArb,
        async (currentFailedAttempts, wrongPassword) => {
          vi.clearAllMocks();

          const beforeLogin = Date.now();

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: currentFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'testuser@example.com',
            password: wrongPassword,
          });

          const afterLogin = Date.now();

          // totalFailedAfter >= 5, so account must be locked
          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;
          expect(error.lockedUntil).toBeDefined();

          // Verify lock duration is exactly 15 minutes (900000ms)
          const lockTime = error.lockedUntil!.getTime();
          const fifteenMinutesMs = 15 * 60 * 1000;

          // Lock time should be between (beforeLogin + 15min) and (afterLogin + 15min)
          expect(lockTime).toBeGreaterThanOrEqual(beforeLogin + fifteenMinutesMs);
          expect(lockTime).toBeLessThanOrEqual(afterLogin + fifteenMinutesMs);

          // Verify it's approximately 15 minutes with 2 second tolerance for test execution
          const durationFromBefore = lockTime - beforeLogin;
          expect(Math.abs(durationFromBefore - fifteenMinutesMs)).toBeLessThan(2000);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * An already-locked account rejects login even with correct credentials.
   */
  it('already-locked account rejects login regardless of credential correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 14 }),
        fc.boolean(),
        async (minutesRemaining, useCorrectPassword) => {
          vi.clearAllMocks();

          const lockedUntil = new Date(Date.now() + minutesRemaining * 60 * 1000);

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: 5,
            locked_until: lockedUntil,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const password = useCorrectPassword ? KNOWN_PASSWORD : 'WrongPass2';
          const result = await loginUser({
            email: 'testuser@example.com',
            password,
          });

          // Locked account must reject regardless of password correctness
          expect(isAuthError(result)).toBe(true);
          const error = result as AuthError;
          expect(error.message.toLowerCase()).toContain('locked');
          expect(error.lockedUntil).toEqual(lockedUntil);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.5**
   *
   * A successful login resets the failed attempt counter,
   * so subsequent failures start from 0.
   */
  it('successful login resets the failed attempt counter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 4 }),
        async (previousFailedAttempts) => {
          vi.clearAllMocks();

          mockedQueryOne.mockResolvedValueOnce({
            user_id: 'user-abc-123',
            email: 'testuser@example.com',
            password_hash: knownPasswordHash,
            role: Role.Student,
            failed_login_attempts: previousFailedAttempts,
            locked_until: null,
          });
          mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

          const result = await loginUser({
            email: 'testuser@example.com',
            password: KNOWN_PASSWORD,
          });

          // Login must succeed
          expect(isAuthError(result)).toBe(false);
          const success = result as LoginResponse;
          expect(success.userId).toBe('user-abc-123');
          expect(success.token).toBeDefined();

          // Verify the database update resets failed_login_attempts to 0
          const updateCalls = mockedQuery.mock.calls;
          const resetCall = updateCalls.find(call =>
            (call[0] as string).includes('failed_login_attempts = 0')
          );
          expect(resetCall).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
