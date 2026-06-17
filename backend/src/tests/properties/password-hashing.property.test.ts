/**
 * Property-Based Tests for Password Hashing Uniqueness
 * Feature: act-ai-tutor-app, Property 4: Password Hashing Uniqueness
 *
 * **Validates: Requirements 1.7**
 *
 * For any two users with the same password, their stored password hashes SHALL be different
 * (due to unique salts), and for any password the stored hash SHALL not equal the original plaintext.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';

/**
 * Generator for valid passwords meeting registration requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - Max 72 bytes (bcrypt limitation)
 */
const validPasswordArb = fc.tuple(
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 }),
  fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 10 }),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 5 }),
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'.split('')),
    { minLength: 0, maxLength: 20 }
  )
).map(([lower, upper, digit, extra]) => {
  // Combine ensuring at least one of each required character class
  return upper[0] + lower[0] + digit[0] + lower + upper + digit + extra;
}).filter(pw => pw.length >= 8 && pw.length <= 72);

describe('Property 4: Password Hashing Uniqueness', () => {
  /**
   * Property: For any password, the hash is never equal to the plaintext.
   * This validates that bcrypt one-way hashing transforms the password
   * into a fundamentally different representation.
   */
  it('for any password, the stored hash SHALL NOT equal the original plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Use cost factor 4 for faster test execution (production uses 12)
        const salt = await bcrypt.genSalt(4);
        const hash = await bcrypt.hash(password, salt);

        // The hash must never equal the plaintext password
        expect(hash).not.toBe(password);
        // bcrypt hashes always start with $2a$ or $2b$ prefix
        expect(hash).toMatch(/^\$2[aby]?\$/);
        // bcrypt hashes have a fixed length of 60 characters
        expect(hash.length).toBe(60);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any two identical passwords hashed separately, the hashes are different.
   * This validates that unique salts produce unique hashes even for the same input,
   * preventing rainbow table attacks.
   */
  it('for any two identical passwords hashed separately, the hashes SHALL be different (unique salts)', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Simulate two separate user registrations with the same password
        const salt1 = await bcrypt.genSalt(4);
        const hash1 = await bcrypt.hash(password, salt1);

        const salt2 = await bcrypt.genSalt(4);
        const hash2 = await bcrypt.hash(password, salt2);

        // The two hashes must be different due to unique salts
        expect(hash1).not.toBe(hash2);
        // The salts embedded in the hashes must be different
        expect(salt1).not.toBe(salt2);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any password and its hash, the verify function confirms the match.
   * This validates that bcrypt.compare correctly verifies the original password
   * against the generated hash, regardless of which salt was used.
   */
  it('for any password and its hash, bcrypt.compare SHALL confirm the match', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Hash with a unique salt (simulating registration)
        const salt = await bcrypt.genSalt(4);
        const hash = await bcrypt.hash(password, salt);

        // The original password must verify successfully against its hash
        const isValid = await bcrypt.compare(password, hash);
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
