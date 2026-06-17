/**
 * Property-Based Tests for Registration Input Validation
 * 
 * **Validates: Requirements 1.1**
 * 
 * Property 1: Registration Input Validation
 * For any registration input, the validation function SHALL accept the input if and only if:
 * - name length is between 1 and 100 characters (after trimming),
 * - email conforms to standard email format,
 * - and password is at least 8 characters containing at least one uppercase letter,
 *   one lowercase letter, and one digit.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateRegistrationInput, RegisterRequest } from './auth.service';
import { Role } from '../models/enums';

// --- Generators ---

/** Generate a valid name: 1-100 non-whitespace-only characters */
function validNameArb(): fc.Arbitrary<string> {
  return fc.stringOf(
    fc.char().filter(c => c !== '\0'),
    { minLength: 1, maxLength: 100 }
  ).filter(s => s.trim().length >= 1 && s.trim().length <= 100);
}

/** Generate an invalid name: empty, whitespace-only, or >100 chars */
function invalidNameArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 10 }), // whitespace-only
    fc.stringOf(fc.char().filter(c => c !== '\0'), { minLength: 101, maxLength: 150 }) // too long
  );
}

/** Generate a valid email matching the pattern: local@domain.tld */
function validEmailArb(): fc.Arbitrary<string> {
  const localPart = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._+-'.split('')),
    { minLength: 1, maxLength: 20 }
  );
  const domainPart = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 1, maxLength: 15 }
  );
  const tldPart = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 2, maxLength: 5 }
  );
  return fc.tuple(localPart, domainPart, tldPart).map(
    ([local, domain, tld]) => `${local}@${domain}.${tld}`
  );
}

/** Generate an invalid email */
function invalidEmailArb(): fc.Arbitrary<string> {
  return fc.oneof(
    fc.constant(''),
    fc.constant('noatsign'),
    fc.constant('missing@domain'),
    fc.constant('@nodomain.com'),
    fc.constant('has space@example.com'),
    fc.constant('user@.com'),
    // email with a space in it
    fc.tuple(
      fc.stringOf(fc.constantFrom(...'abcdefg'.split('')), { minLength: 1, maxLength: 5 }),
      fc.stringOf(fc.constantFrom(...'abcdefg'.split('')), { minLength: 1, maxLength: 5 })
    ).map(([a, b]) => `${a} ${b}@example.com`)
  );
}

/** Generate a valid password: 8+ chars with at least one uppercase, one lowercase, one digit */
function validPasswordArb(): fc.Arbitrary<string> {
  // Strategy: ensure at least one uppercase, one lowercase, one digit, then fill to 8+ chars
  const upper = fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));
  const lower = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));
  const digit = fc.constantFrom(...'0123456789'.split(''));
  const anyValidChar = fc.constantFrom(
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'.split('')
  );

  return fc.tuple(
    upper,
    lower,
    digit,
    fc.array(anyValidChar, { minLength: 5, maxLength: 20 })
  ).chain(([u, l, d, rest]) => {
    // Shuffle the mandatory chars into the rest
    const all = [u, l, d, ...rest];
    return fc.shuffledSubarray(all, { minLength: all.length, maxLength: all.length })
      .map(arr => arr.join(''));
  });
}

/** Generate an invalid password: missing one or more required criteria */
function invalidPasswordArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Too short (even if it has the right character types)
    fc.constant('Ab1cdef'),   // 7 chars
    fc.constant('Aa1'),       // 3 chars
    fc.constant(''),          // empty
    // Missing uppercase
    fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
      { minLength: 8, maxLength: 15 }
    ).filter(s => !/[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s)),
    // Missing lowercase
    fc.stringOf(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
      { minLength: 8, maxLength: 15 }
    ).filter(s => /[A-Z]/.test(s) && !/[a-z]/.test(s) && /\d/.test(s)),
    // Missing digit
    fc.stringOf(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')),
      { minLength: 8, maxLength: 15 }
    ).filter(s => /[A-Z]/.test(s) && /[a-z]/.test(s) && !/\d/.test(s))
  );
}

/** Valid role */
function validRoleArb(): fc.Arbitrary<Role> {
  return fc.constantFrom(Role.Student, Role.Parent);
}

// --- Helper: check if name is valid according to spec ---
function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100;
}

// --- Helper: check if email is valid according to the regex in the service ---
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// --- Helper: check if password meets all criteria ---
function isValidPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password)
  );
}

describe('Property 1: Registration Input Validation', () => {
  /**
   * **Validates: Requirements 1.1**
   * 
   * For any valid registration input (valid name, email, password, and role),
   * the validation function SHALL return no errors (accept the input).
   */
  it('should accept any input where name is 1-100 chars, email is valid format, and password meets criteria', () => {
    fc.assert(
      fc.property(
        validNameArb(),
        validEmailArb(),
        validPasswordArb(),
        validRoleArb(),
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          
          // Valid input should produce zero errors
          expect(errors).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   * 
   * For any input with an invalid name, the validation function SHALL reject
   * (return errors).
   */
  it('should reject any input with invalid name (empty, whitespace-only, or >100 chars)', () => {
    fc.assert(
      fc.property(
        invalidNameArb(),
        validEmailArb(),
        validPasswordArb(),
        validRoleArb(),
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          
          // Invalid name should cause at least one error mentioning 'Name'
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('Name'))).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   * 
   * For any input with an invalid email, the validation function SHALL reject.
   */
  it('should reject any input with invalid email format', () => {
    fc.assert(
      fc.property(
        validNameArb(),
        invalidEmailArb(),
        validPasswordArb(),
        validRoleArb(),
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          
          // Invalid email should cause at least one error mentioning 'Email'
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => e.includes('Email'))).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   * 
   * For any input with an invalid password (too short, missing uppercase,
   * missing lowercase, or missing digit), the validation function SHALL reject.
   */
  it('should reject any input with invalid password', () => {
    fc.assert(
      fc.property(
        validNameArb(),
        validEmailArb(),
        invalidPasswordArb(),
        validRoleArb(),
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);
          
          // Invalid password should cause at least one error mentioning 'Password' or criteria
          expect(errors.length).toBeGreaterThan(0);
          expect(errors.some(e => 
            e.includes('Password') || e.includes('uppercase') || 
            e.includes('lowercase') || e.includes('digit')
          )).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 1.1**
   * 
   * The validation function accepts an input IF AND ONLY IF all fields are valid.
   * This is the bidirectional property: acceptance ↔ all fields valid.
   */
  it('should accept input if and only if name, email, and password all pass validation', () => {
    // Generate arbitrary inputs that may or may not be valid
    const arbitraryName = fc.oneof(validNameArb(), invalidNameArb());
    const arbitraryEmail = fc.oneof(validEmailArb(), invalidEmailArb());
    const arbitraryPassword = fc.oneof(validPasswordArb(), invalidPasswordArb());

    fc.assert(
      fc.property(
        arbitraryName,
        arbitraryEmail,
        arbitraryPassword,
        validRoleArb(),
        (name, email, password, role) => {
          const input: RegisterRequest = { name, email, password, role };
          const errors = validateRegistrationInput(input);

          const nameValid = isValidName(name);
          const emailValid = isValidEmail(email);
          const passwordValid = isValidPassword(password);
          const allValid = nameValid && emailValid && passwordValid;

          if (allValid) {
            // If all fields are valid, no errors should be returned
            expect(errors).toHaveLength(0);
          } else {
            // If any field is invalid, at least one error should be returned
            expect(errors.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
