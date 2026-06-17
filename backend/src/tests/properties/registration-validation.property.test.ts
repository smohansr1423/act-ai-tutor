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
import { validateRegistrationInput, RegisterRequest } from '../../services/auth.service';
import { Role } from '../../models/enums';

// ============================================================================
// Generators
// ============================================================================

/** Valid name: 1-100 characters where trimmed length is between 1 and 100 */
const validNameArb = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'.split('')
    ),
    { minLength: 1, maxLength: 100 }
  )
  .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

/** Invalid name: empty, whitespace-only, or trimmed length > 100 */
const invalidNameArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t \n'),
  // Too long: 101+ characters after trim
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 101, maxLength: 120 }
  )
);

/** Valid email: matches the pattern local@domain.tld (no spaces, no @-only) */
const validEmailArb = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.+_-'.split('')),
      { minLength: 1, maxLength: 20 }
    ),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
      { minLength: 1, maxLength: 15 }
    ),
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
      { minLength: 2, maxLength: 6 }
    )
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Invalid email: does not conform to standard email format */
const invalidEmailArb = fc.oneof(
  fc.constant(''),
  fc.constant('plaintext'),
  fc.constant('@missinglocal.com'),
  fc.constant('missing@.com'),
  fc.constant('user@domain'),
  fc.constant('space user@example.com'),
  fc.constant('user@ space.com'),
  // No @ sign at all
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 3, maxLength: 20 }
  )
);

/**
 * Valid password: 8+ chars with at least one uppercase, one lowercase, one digit.
 * Built by assembling guaranteed chars then filling to min length.
 */
const validPasswordArb = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.constantFrom(...'0123456789'.split('')),
    fc.array(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'.split('')
      ),
      { minLength: 5, maxLength: 25 }
    )
  )
  .map(([upper, lower, digit, rest]) => {
    // Place required chars at known positions combined with random fill
    const chars = [upper, lower, digit, ...rest];
    return chars.join('');
  })
  .filter(
    (pw) =>
      pw.length >= 8 &&
      /[A-Z]/.test(pw) &&
      /[a-z]/.test(pw) &&
      /\d/.test(pw)
  );

/** Password too short (< 8 chars) */
const passwordTooShortArb = fc
  .stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 7 }
  )
  .filter((pw) => pw.length < 8);

/** Password missing uppercase */
const passwordNoUpperArb = fc
  .stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 8, maxLength: 20 }
  )
  .filter((pw) => !/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw));

/** Password missing lowercase */
const passwordNoLowerArb = fc
  .stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
    { minLength: 8, maxLength: 20 }
  )
  .filter((pw) => /[A-Z]/.test(pw) && !/[a-z]/.test(pw) && /\d/.test(pw));

/** Password missing digit */
const passwordNoDigitArb = fc
  .stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 8, maxLength: 20 }
  )
  .filter((pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && !/\d/.test(pw));

/** Valid role */
const validRoleArb = fc.constantFrom(Role.Student, Role.Parent);

// ============================================================================
// Reference validation functions (oracle)
// ============================================================================

function isValidName(name: string): boolean {
  return !!name && name.trim().length >= 1 && name.trim().length <= 100;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return !!email && emailRegex.test(email);
}

function isValidPassword(password: string): boolean {
  return (
    !!password &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

// ============================================================================
// Property Tests
// ============================================================================

describe('Feature: act-ai-tutor-app, Property 1: Registration Input Validation', () => {
  /**
   * **Validates: Requirements 1.1**
   *
   * For any registration input with valid name, email, password, and role,
   * the validation function SHALL return no errors (accept the input).
   */
  it('SHALL accept any input with valid name (1-100 chars), valid email, and valid password (8+ chars with upper, lower, digit)', () => {
    fc.assert(
      fc.property(
        validNameArb,
        validEmailArb,
        validPasswordArb,
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

  /**
   * **Validates: Requirements 1.1**
   *
   * For any input with an invalid name (empty, whitespace-only, or >100 chars trimmed),
   * the validation function SHALL reject the input.
   */
  it('SHALL reject any input with invalid name', () => {
    fc.assert(
      fc.property(
        invalidNameArb,
        validEmailArb,
        validPasswordArb,
        validRoleArb,
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some((e) => e.toLowerCase().includes('name'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   *
   * For any input with an invalid email format, the validation function SHALL reject.
   */
  it('SHALL reject any input with invalid email format', () => {
    fc.assert(
      fc.property(
        validNameArb,
        invalidEmailArb,
        validPasswordArb,
        validRoleArb,
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some((e) => e.toLowerCase().includes('email'))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   *
   * For any password shorter than 8 characters, the validation function SHALL reject.
   */
  it('SHALL reject any input with password shorter than 8 characters', () => {
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

  /**
   * **Validates: Requirements 1.1**
   *
   * For any password of 8+ chars missing an uppercase letter, the validation SHALL reject.
   */
  it('SHALL reject any input with password missing uppercase letter', () => {
    fc.assert(
      fc.property(
        validNameArb,
        validEmailArb,
        passwordNoUpperArb,
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

  /**
   * **Validates: Requirements 1.1**
   *
   * For any password of 8+ chars missing a lowercase letter, the validation SHALL reject.
   */
  it('SHALL reject any input with password missing lowercase letter', () => {
    fc.assert(
      fc.property(
        validNameArb,
        validEmailArb,
        passwordNoLowerArb,
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

  /**
   * **Validates: Requirements 1.1**
   *
   * For any password of 8+ chars missing a digit, the validation SHALL reject.
   */
  it('SHALL reject any input with password missing a digit', () => {
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

  /**
   * **Validates: Requirements 1.1**
   *
   * Bidirectional property: the validation function SHALL accept the input
   * IF AND ONLY IF name, email, and password are all valid.
   */
  it('SHALL accept input if and only if all of name, email, and password are valid', () => {
    const arbitraryName = fc.oneof(validNameArb, invalidNameArb);
    const arbitraryEmail = fc.oneof(validEmailArb, invalidEmailArb);
    const arbitraryPassword = fc.oneof(validPasswordArb, passwordTooShortArb, passwordNoUpperArb, passwordNoLowerArb, passwordNoDigitArb);

    fc.assert(
      fc.property(
        arbitraryName,
        arbitraryEmail,
        arbitraryPassword,
        validRoleArb,
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);

          const nameValid = isValidName(name);
          const emailValid = isValidEmail(email);
          const passwordValid = isValidPassword(password);
          const allValid = nameValid && emailValid && passwordValid;

          if (allValid) {
            expect(errors).toHaveLength(0);
          } else {
            expect(errors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
