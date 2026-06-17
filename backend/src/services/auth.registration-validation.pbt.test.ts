/**
 * Property-Based Tests for Registration Input Validation
 * Feature: act-ai-tutor-app, Property 1: Registration Input Validation
 *
 * For any registration input, the validation function SHALL accept the input
 * if and only if: name length is between 1 and 100 characters, email conforms
 * to standard email format, and password is at least 8 characters containing
 * at least one uppercase letter, one lowercase letter, and one digit.
 *
 * **Validates: Requirements 1.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateRegistrationInput, RegisterRequest } from './auth.service';
import { Role } from '../models/enums';

/**
 * Generators for valid registration inputs
 */

// Valid name: 1-100 non-whitespace-only characters (trimmed length 1-100)
const validNameArb = fc
  .stringOf(fc.char(), { minLength: 1, maxLength: 100 })
  .filter((name) => name.trim().length >= 1 && name.trim().length <= 100);

// Valid email: standard format local@domain.tld
const validEmailArb = fc
  .tuple(
    // local part: 1-20 alphanumeric chars (no spaces or @)
    fc.stringOf(
      fc.oneof(fc.char().filter((c) => /[a-zA-Z0-9._+\-]/.test(c) && c !== '@' && c !== ' '),
      fc.constant('a')),
      { minLength: 1, maxLength: 20 }
    ).filter((s) => /^[a-zA-Z0-9._+\-]+$/.test(s)),
    // domain part: 1-15 alphanumeric chars
    fc.stringOf(
      fc.oneof(fc.char().filter((c) => /[a-zA-Z0-9\-]/.test(c)),
      fc.constant('x')),
      { minLength: 1, maxLength: 15 }
    ).filter((s) => /^[a-zA-Z0-9\-]+$/.test(s) && s.length > 0),
    // TLD: 2-6 lowercase letters
    fc.stringOf(fc.char().filter((c) => /[a-z]/.test(c)), { minLength: 2, maxLength: 6 })
      .filter((s) => /^[a-z]+$/.test(s) && s.length >= 2)
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Valid password: 8+ chars, at least one uppercase, one lowercase, one digit
const validPasswordArb = fc
  .tuple(
    fc.char().filter((c) => /[A-Z]/.test(c)),  // at least one uppercase
    fc.char().filter((c) => /[a-z]/.test(c)),  // at least one lowercase
    fc.char().filter((c) => /\d/.test(c)),     // at least one digit
    // remaining chars to make it 8+ total (5-47 additional chars)
    fc.stringOf(
      fc.oneof(
        fc.char().filter((c) => /[a-zA-Z0-9!@#$%^&*]/.test(c)),
        fc.constant('a')
      ),
      { minLength: 5, maxLength: 47 }
    )
  )
  .map(([upper, lower, digit, rest]) => {
    // Shuffle the required chars into the rest
    const chars = [upper, lower, digit, ...rest.split('')];
    // Simple deterministic shuffle by placing required chars at different positions
    return upper + rest.slice(0, 2) + lower + rest.slice(2, 4) + digit + rest.slice(4);
  })
  .filter((pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw));

// Valid role
const validRoleArb = fc.constantFrom(Role.Student, Role.Parent);

/**
 * Generators for invalid registration inputs
 */

// Invalid name: empty, whitespace-only, or >100 chars
const invalidNameArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n'),
  // Name with trimmed length > 100
  fc.stringOf(fc.char().filter((c) => /[a-zA-Z]/.test(c)), { minLength: 101, maxLength: 150 })
);

// Invalid email: missing @, missing domain, spaces, etc.
const invalidEmailArb = fc.oneof(
  fc.constant(''),
  fc.constant('nodomain'),
  fc.constant('user@'),
  fc.constant('@domain.com'),
  fc.constant('user@domain'),
  fc.constant('user @example.com'),
  fc.constant('user@ example.com'),
  // Random strings without proper email structure
  fc.stringOf(fc.char().filter((c) => c !== '@'), { minLength: 1, maxLength: 30 })
    .filter((s) => !s.includes('@'))
);

// Invalid password: too short, missing uppercase, missing lowercase, or missing digit
const passwordTooShortArb = fc
  .stringOf(fc.char().filter((c) => /[a-zA-Z0-9]/.test(c)), { minLength: 1, maxLength: 7 })
  .filter((pw) => pw.length < 8);

const passwordNoUppercaseArb = fc
  .stringOf(fc.char().filter((c) => /[a-z0-9]/.test(c)), { minLength: 8, maxLength: 30 })
  .filter((pw) => pw.length >= 8 && !/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw));

const passwordNoLowercaseArb = fc
  .stringOf(fc.char().filter((c) => /[A-Z0-9]/.test(c)), { minLength: 8, maxLength: 30 })
  .filter((pw) => pw.length >= 8 && /[A-Z]/.test(pw) && !/[a-z]/.test(pw) && /\d/.test(pw));

const passwordNoDigitArb = fc
  .stringOf(fc.char().filter((c) => /[a-zA-Z]/.test(c)), { minLength: 8, maxLength: 30 })
  .filter((pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && !/\d/.test(pw));

describe('Feature: act-ai-tutor-app, Property 1: Registration Input Validation', () => {
  describe('Valid inputs should be accepted', () => {
    it('should accept any registration with valid name (1-100 chars), valid email, and valid password', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          validPasswordArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            // Valid inputs should produce no validation errors
            expect(errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid name should be rejected', () => {
    it('should reject any registration with an invalid name (empty, whitespace-only, or >100 chars)', () => {
      fc.assert(
        fc.property(
          invalidNameArb,
          validEmailArb,
          validPasswordArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            // At least one error should mention the name
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('name'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid email should be rejected', () => {
    it('should reject any registration with an invalid email format', () => {
      fc.assert(
        fc.property(
          validNameArb,
          invalidEmailArb,
          validPasswordArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            // At least one error should mention the email
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('email'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid password - too short should be rejected', () => {
    it('should reject any registration with password shorter than 8 characters', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          passwordTooShortArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('password'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid password - no uppercase should be rejected', () => {
    it('should reject any registration with password missing uppercase letter', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          passwordNoUppercaseArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('uppercase'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid password - no lowercase should be rejected', () => {
    it('should reject any registration with password missing lowercase letter', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          passwordNoLowercaseArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('lowercase'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invalid password - no digit should be rejected', () => {
    it('should reject any registration with password missing a digit', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          passwordNoDigitArb,
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.toLowerCase().includes('digit'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Boundary conditions', () => {
    it('should accept name with exactly 1 non-whitespace character and reject name with 0', () => {
      fc.assert(
        fc.property(
          fc.char().filter((c) => c.trim().length === 1),
          validEmailArb,
          validPasswordArb,
          validRoleArb,
          (nameChar, email, password, role) => {
            const input: RegisterRequest = { name: nameChar, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors.filter((e) => e.toLowerCase().includes('name'))).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept name with exactly 100 characters and reject name with 101 characters', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 50 }),
          validEmailArb,
          validPasswordArb,
          validRoleArb,
          (extraChars, email, password, role) => {
            // 100 chars should pass
            const name100 = 'a'.repeat(100);
            const input100: RegisterRequest = { name: name100, email, password, role };
            const errors100 = validateRegistrationInput(input100);
            expect(errors100.filter((e) => e.toLowerCase().includes('name'))).toHaveLength(0);

            // 101+ chars should fail
            const name101 = 'a'.repeat(101 + extraChars);
            const input101: RegisterRequest = { name: name101, email, password, role };
            const errors101 = validateRegistrationInput(input101);
            expect(errors101.some((e) => e.toLowerCase().includes('name'))).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept password with exactly 8 characters meeting all criteria', () => {
      fc.assert(
        fc.property(
          validNameArb,
          validEmailArb,
          // Generate 8-char passwords with uppercase, lowercase, digit
          fc.tuple(
            fc.char().filter((c) => /[A-Z]/.test(c)),
            fc.char().filter((c) => /[a-z]/.test(c)),
            fc.char().filter((c) => /\d/.test(c)),
            fc.stringOf(fc.char().filter((c) => /[a-z]/.test(c)), { minLength: 5, maxLength: 5 })
          ).map(([upper, lower, digit, rest]) => `${upper}${lower}${digit}${rest}`)
           .filter((pw) => pw.length === 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)),
          validRoleArb,
          (name, email, password, role) => {
            const input: RegisterRequest = { name, email, password, role };
            const errors = validateRegistrationInput(input);
            expect(errors).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
