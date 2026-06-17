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
 * Generator for valid passwords that meet the registration requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
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
  // Shuffle all characters together to form a valid password
  const chars = (lower + upper + digit + extra).split('');
  // Simple deterministic shuffle (Fisher-Yates with a fixed approach won't work in PBT,
  // so we just concatenate in a way that guarantees validity)
  return upper[0] + lower[0] + digit[0] + chars.join('');
}).filter(pw => pw.length >= 8 && pw.length <= 72); // bcrypt max input is 72 bytes

describe('Property 4: Password Hashing Uniqueness', () => {
  it('for any password, the stored hash SHALL NOT equal the original plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        const salt = await bcrypt.genSalt(4); // Use lower cost for test speed
        const hash = await bcrypt.hash(password, salt);

        // The hash must never equal the plaintext password
        expect(hash).not.toBe(password);
        // The hash should be significantly longer/different structure than most passwords
        expect(hash.length).toBeGreaterThan(0);
        // bcrypt hashes start with $2a$ or $2b$
        expect(hash).toMatch(/^\$2[aby]?\$/);
      }),
      { numRuns: 100 }
    );
  });

  it('for any two users with the same password, their stored password hashes SHALL be different (unique salts)', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Hash the same password twice (simulating two different user registrations)
        const salt1 = await bcrypt.genSalt(4); // Use lower cost for test speed
        const hash1 = await bcrypt.hash(password, salt1);

        const salt2 = await bcrypt.genSalt(4);
        const hash2 = await bcrypt.hash(password, salt2);

        // The two hashes must be different due to unique salts
        expect(hash1).not.toBe(hash2);
        // The salts themselves must be different
        expect(salt1).not.toBe(salt2);
      }),
      { numRuns: 100 }
    );
  });

  it('bcrypt.compare correctly validates the original password against each hash', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Hash the same password twice with different salts
        const salt1 = await bcrypt.genSalt(4);
        const hash1 = await bcrypt.hash(password, salt1);

        const salt2 = await bcrypt.genSalt(4);
        const hash2 = await bcrypt.hash(password, salt2);

        // The original password should validate against BOTH hashes
        const isValid1 = await bcrypt.compare(password, hash1);
        const isValid2 = await bcrypt.compare(password, hash2);

        expect(isValid1).toBe(true);
        expect(isValid2).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('a different password should NOT validate against the hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        validPasswordArb,
        validPasswordArb,
        async (password1, password2) => {
          // Only test when passwords are actually different
          fc.pre(password1 !== password2);

          const salt = await bcrypt.genSalt(4);
          const hash = await bcrypt.hash(password1, salt);

          // A different password must not validate against the hash
          const isValid = await bcrypt.compare(password2, hash);
          expect(isValid).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
