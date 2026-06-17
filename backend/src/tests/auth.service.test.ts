/**
 * Unit tests for Auth Service - Registration
 * Tests validation, password hashing, and registration logic.
 * Requirements: 1.1, 1.2, 1.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateRegistrationInput,
  registerUser,
  isAuthError,
  RegisterRequest,
} from '../services/auth.service';
import { Role } from '../models/enums';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getPool: vi.fn(() => ({
    query: vi.fn(),
    on: vi.fn(),
  })),
}));

import * as db from '../utils/database';

describe('Auth Service - Registration Validation', () => {
  describe('validateRegistrationInput', () => {
    const validInput: RegisterRequest = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    it('should return empty array for valid input', () => {
      const errors = validateRegistrationInput(validInput);
      expect(errors).toHaveLength(0);
    });

    it('should return empty array for parent role', () => {
      const errors = validateRegistrationInput({ ...validInput, role: Role.Parent });
      expect(errors).toHaveLength(0);
    });

    it('should accept a single character name', () => {
      const errors = validateRegistrationInput({ ...validInput, name: 'A' });
      expect(errors).toHaveLength(0);
    });

    it('should accept a 100-character name', () => {
      const name = 'a'.repeat(100);
      const errors = validateRegistrationInput({ ...validInput, name });
      expect(errors).toHaveLength(0);
    });

    it('should reject an empty name', () => {
      const errors = validateRegistrationInput({ ...validInput, name: '' });
      expect(errors.some(e => e.includes('Name'))).toBe(true);
    });

    it('should reject a whitespace-only name', () => {
      const errors = validateRegistrationInput({ ...validInput, name: '   ' });
      expect(errors.some(e => e.includes('Name'))).toBe(true);
    });

    it('should reject a name longer than 100 characters', () => {
      const name = 'a'.repeat(101);
      const errors = validateRegistrationInput({ ...validInput, name });
      expect(errors.some(e => e.includes('Name'))).toBe(true);
    });

    it('should accept a valid email', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'user@example.com' });
      expect(errors).toHaveLength(0);
    });

    it('should accept email with subdomain', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'user@mail.example.com' });
      expect(errors).toHaveLength(0);
    });

    it('should accept email with plus addressing', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'user+tag@example.com' });
      expect(errors).toHaveLength(0);
    });

    it('should reject empty email', () => {
      const errors = validateRegistrationInput({ ...validInput, email: '' });
      expect(errors.some(e => e.includes('Email'))).toBe(true);
    });

    it('should reject email without @', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'userexample.com' });
      expect(errors.some(e => e.includes('Email'))).toBe(true);
    });

    it('should reject email without domain extension', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'user@example' });
      expect(errors.some(e => e.includes('Email'))).toBe(true);
    });

    it('should reject email with spaces', () => {
      const errors = validateRegistrationInput({ ...validInput, email: 'user @example.com' });
      expect(errors.some(e => e.includes('Email'))).toBe(true);
    });

    it('should accept password with uppercase, lowercase, and digit (8+ chars)', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'Password1' });
      expect(errors).toHaveLength(0);
    });

    it('should accept exactly 8-character password meeting all criteria', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'Abcdef1g' });
      expect(errors).toHaveLength(0);
    });

    it('should reject password shorter than 8 characters', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'Pass1' });
      expect(errors.some(e => e.includes('Password') && e.includes('8'))).toBe(true);
    });

    it('should reject password without uppercase', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'password1' });
      expect(errors.some(e => e.includes('uppercase'))).toBe(true);
    });

    it('should reject password without lowercase', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'PASSWORD1' });
      expect(errors.some(e => e.includes('lowercase'))).toBe(true);
    });

    it('should reject password without a digit', () => {
      const errors = validateRegistrationInput({ ...validInput, password: 'Passwords' });
      expect(errors.some(e => e.includes('digit'))).toBe(true);
    });

    it('should reject empty password', () => {
      const errors = validateRegistrationInput({ ...validInput, password: '' });
      expect(errors.some(e => e.includes('Password'))).toBe(true);
    });

    it('should reject invalid role', () => {
      const errors = validateRegistrationInput({ ...validInput, role: 'admin' as Role });
      expect(errors.some(e => e.includes('Role'))).toBe(true);
    });

    it('should collect multiple errors for completely invalid input', () => {
      const errors = validateRegistrationInput({
        name: '',
        email: 'invalid',
        password: 'short',
        role: 'admin' as Role,
      });
      expect(errors.length).toBeGreaterThan(1);
    });
  });
});

describe('Auth Service - Password Hashing (via registerUser)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should hash the password before storing (hash differs from plaintext)', async () => {
    // Mock: no existing user
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    // Mock: capture the INSERT query to verify hash
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    const result = await registerUser(input);
    expect(isAuthError(result)).toBe(false);

    // Verify the INSERT was called with a hashed password (not the plaintext)
    const insertCall = vi.mocked(db.query).mock.calls[0];
    const params = insertCall[1] as unknown[];
    const storedHash = params[3] as string; // password_hash is 4th param
    const storedSalt = params[4] as string; // password_salt is 5th param

    expect(storedHash).not.toBe('Password123');
    expect(storedHash.length).toBeGreaterThan(0);
    expect(storedSalt.length).toBeGreaterThan(0);
  });

  it('should produce unique salts for different registrations', async () => {
    // First registration
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input1: RegisterRequest = {
      name: 'User One',
      email: 'user1@example.com',
      password: 'SamePassword1',
      role: Role.Student,
    };
    await registerUser(input1);
    const firstCall = vi.mocked(db.query).mock.calls[0];
    const firstSalt = (firstCall[1] as unknown[])[4] as string;
    const firstHash = (firstCall[1] as unknown[])[3] as string;

    vi.clearAllMocks();

    // Second registration with same password
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input2: RegisterRequest = {
      name: 'User Two',
      email: 'user2@example.com',
      password: 'SamePassword1',
      role: Role.Student,
    };
    await registerUser(input2);
    const secondCall = vi.mocked(db.query).mock.calls[0];
    const secondSalt = (secondCall[1] as unknown[])[4] as string;
    const secondHash = (secondCall[1] as unknown[])[3] as string;

    // Different salts and hashes even with same password
    expect(firstSalt).not.toBe(secondSalt);
    expect(firstHash).not.toBe(secondHash);
  });
});

describe('Auth Service - registerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error for invalid input', async () => {
    const input: RegisterRequest = {
      name: '',
      email: 'invalid',
      password: 'short',
      role: Role.Student,
    };

    const result = await registerUser(input);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.message).toContain('Name');
    }
  });

  it('should return error when email already exists', async () => {
    // Mock: existing user found
    vi.mocked(db.queryOne).mockResolvedValueOnce({ user_id: 'existing-id' });

    const input: RegisterRequest = {
      name: 'Test User',
      email: 'existing@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    const result = await registerUser(input);
    expect(isAuthError(result)).toBe(true);
    if (isAuthError(result)) {
      expect(result.message).toBe('Email is already in use');
    }
  });

  it('should successfully register with valid input and return userId + token', async () => {
    // Mock: no existing user
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    // Mock: INSERT succeeds
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    const result = await registerUser(input);
    expect(isAuthError(result)).toBe(false);
    if (!isAuthError(result)) {
      expect(result.userId).toBeDefined();
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
    }
  });

  it('should store email in lowercase', async () => {
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: 'Test User',
      email: 'Test@EXAMPLE.COM',
      password: 'Password123',
      role: Role.Student,
    };

    await registerUser(input);

    // Verify the email existence check used lowercase
    expect(vi.mocked(db.queryOne)).toHaveBeenCalledWith(
      expect.any(String),
      ['test@example.com']
    );

    // Verify the INSERT used lowercase email
    const insertCall = vi.mocked(db.query).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[2]).toBe('test@example.com');
  });

  it('should trim the name before storing', async () => {
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: '  Test User  ',
      email: 'test@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    await registerUser(input);

    const insertCall = vi.mocked(db.query).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[1]).toBe('Test User');
  });

  it('should store grade and target score for student', async () => {
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: 'Student',
      email: 'student@example.com',
      password: 'Password123',
      role: Role.Student,
      grade: 11,
      targetScore: 30,
    };

    await registerUser(input);

    const insertCall = vi.mocked(db.query).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[6]).toBe(11); // grade
    expect(params[7]).toBe(30); // targetScore
  });

  it('should initialize failed_login_attempts to 0', async () => {
    vi.mocked(db.queryOne).mockResolvedValueOnce(null);
    vi.mocked(db.query).mockResolvedValueOnce({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

    const input: RegisterRequest = {
      name: 'Test User',
      email: 'test@example.com',
      password: 'Password123',
      role: Role.Student,
    };

    await registerUser(input);

    const insertCall = vi.mocked(db.query).mock.calls[0];
    const params = insertCall[1] as unknown[];
    expect(params[8]).toBe(0); // failed_login_attempts
    expect(params[9]).toBeNull(); // locked_until
  });
});
