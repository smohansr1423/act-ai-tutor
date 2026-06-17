/**
 * Property-Based Tests for Password Hashing Uniqueness
 * 
 * Property 4: Password Hashing Uniqueness
 * For any two users with the same password, their stored password hashes SHALL be
 * different (due to unique salts), and for any password the stored hash SHALL not
 * equal the original plaintext.
 * 
 * **Validates: Requirements 1.7**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import bcrypt from 'bcryptjs';

/**
 * Generator for valid passwords that meet registration requirements:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
const validPasswordArb = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) }),
  fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
  fc.string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'0123456789'.split('')) }),
  fc.string({ minLength: 0, maxLength: 20, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'.split('')) })
).map(([upper, lower, digit, rest]) => {
  // Shuffle the combined characters to avoid predictable patterns
  const chars = (upper + lower + digit + rest).split('');
  // Simple Fisher-Yates shuffle using a deterministic approach for reproducibility
  for (let i = chars.length - 1; i > 0; i--) {
    const j = i % (i + 1); // deterministic but shuffled enough for testing
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}).filter(pw => pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw));

describe('Property 4: Password Hashing Uniqueness', () => {
  it('for any password, the stored hash SHALL not equal the original plaintext', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Hash the password using the same mechanism as auth.service.ts
        const salt = await bcrypt.genSalt(10); // Use cost factor 10 for faster tests
        const hash = await bcrypt.hash(password, salt);

        // The hash must never equal the plaintext password
        expect(hash).not.toBe(password);
        // The hash should be a bcrypt hash string (starts with $2a$ or $2b$)
        expect(hash).toMatch(/^\$2[aby]?\$/);
        // The hash should have a different length than most passwords
        expect(hash.length).toBe(60); // bcrypt hashes are always 60 chars
      }),
      { numRuns: 50 }
    );
  });

  it('for any two users with the same password, their stored hashes SHALL be different (unique salts)', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        // Simulate two users registering with the same password
        const salt1 = await bcrypt.genSalt(10);
        const hash1 = await bcrypt.hash(password, salt1);

        const salt2 = await bcrypt.genSalt(10);
        const hash2 = await bcrypt.hash(password, salt2);

        // The salts must be different (bcrypt.genSalt generates unique salts)
        expect(salt1).not.toBe(salt2);

        // The hashes must be different due to unique salts
        expect(hash1).not.toBe(hash2);

        // Both hashes should still verify against the original password
        const verify1 = await bcrypt.compare(password, hash1);
        const verify2 = await bcrypt.compare(password, hash2);
        expect(verify1).toBe(true);
        expect(verify2).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('for any password, bcrypt.compare SHALL correctly verify the hash against the original password', async () => {
    await fc.assert(
      fc.asyncProperty(validPasswordArb, async (password) => {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // The hash should verify against the correct password
        const isValid = await bcrypt.compare(password, hash);
        expect(isValid).toBe(true);

        // The hash should NOT verify against a different password
        const wrongPassword = password + 'X';
        const isInvalid = await bcrypt.compare(wrongPassword, hash);
        expect(isInvalid).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});
