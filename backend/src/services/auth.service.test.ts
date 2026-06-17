/**
 * Unit tests for Auth Service - Login endpoint with lockout logic.
 * Tests Requirements 1.3, 1.4, 1.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock the database module
vi.mock('../utils/database', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

import { loginUser, isAuthError, LoginResponse } from './auth.service';
import { query, queryOne } from '../utils/database';
import { Role } from '../models/enums';

const mockedQueryOne = vi.mocked(queryOne);
const mockedQuery = vi.mocked(query);

describe('Auth Service - Login', () => {
  const validPassword = 'TestPass1';
  let hashedPassword: string;
  let salt: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    salt = await bcrypt.genSalt(12);
    hashedPassword = await bcrypt.hash(validPassword, salt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser = (overrides?: Partial<any>) => ({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'test@example.com',
    password_hash: hashedPassword,
    role: Role.Student,
    failed_login_attempts: 0,
    locked_until: null,
    ...overrides,
  });

  describe('Successful login (Req 1.3)', () => {
    it('should authenticate user with valid credentials and return a JWT token', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser());
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: validPassword });

      expect(isAuthError(result)).toBe(false);
      const loginResult = result as LoginResponse;
      expect(loginResult.userId).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(loginResult.token).toBeDefined();
      expect(typeof loginResult.token).toBe('string');
      expect(loginResult.token.split('.')).toHaveLength(3); // JWT has 3 parts
      expect(loginResult.role).toBe(Role.Student);
    });

    it('should reset failed attempt counter on successful login', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser({ failed_login_attempts: 3 }));
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: validPassword });

      expect(isAuthError(result)).toBe(false);
      // Verify that the update query resets failed_login_attempts to 0
      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts = 0'),
        expect.arrayContaining([expect.any(Date), '123e4567-e89b-12d3-a456-426614174000'])
      );
    });

    it('should normalize email to lowercase before lookup', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser());
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await loginUser({ email: 'TEST@Example.COM', password: validPassword });

      expect(mockedQueryOne).toHaveBeenCalledWith(
        expect.any(String),
        ['test@example.com']
      );
    });
  });

  describe('Invalid credentials - generic error (Req 1.4)', () => {
    it('should return generic error for non-existent email without revealing email does not exist', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      const result = await loginUser({ email: 'nonexistent@example.com', password: 'AnyPass1' });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.message).toBe('Invalid credentials');
      }
    });

    it('should return generic error for wrong password without revealing password is wrong', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser());
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: 'WrongPass1' });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.message).toBe('Invalid credentials');
      }
    });

    it('should return the same error message for wrong email and wrong password', async () => {
      // Test wrong email
      mockedQueryOne.mockResolvedValueOnce(null);
      const wrongEmailResult = await loginUser({ email: 'wrong@example.com', password: validPassword });

      // Test wrong password
      mockedQueryOne.mockResolvedValueOnce(mockUser());
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });
      const wrongPasswordResult = await loginUser({ email: 'test@example.com', password: 'WrongPass1' });

      expect(isAuthError(wrongEmailResult)).toBe(true);
      expect(isAuthError(wrongPasswordResult)).toBe(true);
      if (isAuthError(wrongEmailResult) && isAuthError(wrongPasswordResult)) {
        expect(wrongEmailResult.message).toBe(wrongPasswordResult.message);
      }
    });
  });

  describe('Account lockout (Req 1.5)', () => {
    it('should increment failed attempts on invalid password', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser({ failed_login_attempts: 2 }));
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      await loginUser({ email: 'test@example.com', password: 'WrongPass1' });

      expect(mockedQuery).toHaveBeenCalledWith(
        expect.stringContaining('failed_login_attempts'),
        expect.arrayContaining([3]) // 2 + 1
      );
    });

    it('should lock account after 5 consecutive failed attempts', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser({ failed_login_attempts: 4 }));
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: 'WrongPass1' });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.message).toContain('temporarily locked');
        expect(result.lockedUntil).toBeDefined();
        // Verify lockout is approximately 15 minutes from now
        const lockDuration = result.lockedUntil!.getTime() - Date.now();
        expect(lockDuration).toBeGreaterThan(14 * 60 * 1000); // at least 14 minutes
        expect(lockDuration).toBeLessThanOrEqual(15 * 60 * 1000); // at most 15 minutes
      }
    });

    it('should reject login attempts on a locked account', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // locked for 10 more minutes
      mockedQueryOne.mockResolvedValueOnce(mockUser({ 
        failed_login_attempts: 5, 
        locked_until: lockedUntil 
      }));

      const result = await loginUser({ email: 'test@example.com', password: validPassword });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.message).toContain('temporarily locked');
        expect(result.lockedUntil).toEqual(lockedUntil);
      }
    });

    it('should allow login after lock period expires', async () => {
      const expiredLock = new Date(Date.now() - 1000); // locked_until is in the past
      mockedQueryOne.mockResolvedValueOnce(mockUser({ 
        failed_login_attempts: 5, 
        locked_until: expiredLock 
      }));
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: validPassword });

      expect(isAuthError(result)).toBe(false);
      const loginResult = result as LoginResponse;
      expect(loginResult.token).toBeDefined();
    });

    it('should not increment failed attempts if email does not exist', async () => {
      mockedQueryOne.mockResolvedValueOnce(null);

      await loginUser({ email: 'nonexistent@example.com', password: 'WrongPass1' });

      // query should not be called for updating failed attempts when user doesn't exist
      expect(mockedQuery).not.toHaveBeenCalled();
    });

    it('should not lock account at 4 failed attempts', async () => {
      mockedQueryOne.mockResolvedValueOnce(mockUser({ failed_login_attempts: 3 }));
      mockedQuery.mockResolvedValue({ rows: [], rowCount: 1, command: '', oid: 0, fields: [] });

      const result = await loginUser({ email: 'test@example.com', password: 'WrongPass1' });

      expect(isAuthError(result)).toBe(true);
      if (isAuthError(result)) {
        expect(result.message).toBe('Invalid credentials');
        expect(result.lockedUntil).toBeUndefined();
      }
    });
  });
});
