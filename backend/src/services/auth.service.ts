/**
 * Authentication Service
 * Handles user registration and login with account lockout logic.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../utils/database';
import { User } from '../models/interfaces';
import { Role } from '../models/enums';

/** JWT secret - should be loaded from environment in production */
const JWT_SECRET = process.env.JWT_SECRET || 'act-ai-tutor-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';


/** Lockout configuration */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/** Generic error message for invalid login - never reveals which field is wrong */
const INVALID_CREDENTIALS_ERROR = 'Invalid credentials';
const ACCOUNT_LOCKED_ERROR = 'Account is temporarily locked. Please try again later.';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  userId: string;
  token: string;
  role: Role;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: Role;
  grade?: number;
  targetScore?: number;
}

export interface RegisterResponse {
  userId: string;
  token: string;
}

export interface AuthError {
  message: string;
  lockedUntil?: Date;
}

/**
 * Validates registration input fields.
 * - Name: 1-100 characters
 * - Email: standard email format
 * - Password: 8+ chars with at least one uppercase, one lowercase, one digit
 */
export function validateRegistrationInput(input: RegisterRequest): string[] {
  const errors: string[] = [];

  // Name validation: 1-100 characters
  if (!input.name || input.name.trim().length < 1 || input.name.trim().length > 100) {
    errors.push('Name must be between 1 and 100 characters');
  }

  // Email validation: standard email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!input.email || !emailRegex.test(input.email)) {
    errors.push('Email must be a valid email address');
  }

  // Password validation: 8+ chars, at least one uppercase, one lowercase, one digit
  if (!input.password || input.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  } else {
    if (!/[A-Z]/.test(input.password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(input.password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(input.password)) {
      errors.push('Password must contain at least one digit');
    }
  }

  // Role validation
  if (!input.role || !Object.values(Role).includes(input.role)) {
    errors.push('Role must be either "student" or "parent"');
  }

  return errors;
}

/**
 * Register a new user account.
 * Validates input, checks for duplicate email, hashes password with unique salt,
 * and stores the user in the database.
 */
export async function registerUser(input: RegisterRequest): Promise<RegisterResponse | AuthError> {
  // Validate input
  const validationErrors = validateRegistrationInput(input);
  if (validationErrors.length > 0) {
    return { message: validationErrors.join('; ') };
  }

  // Check for existing email
  const existingUser = await queryOne<User>(
    'SELECT user_id FROM users WHERE email = $1',
    [input.email.toLowerCase()]
  );
  if (existingUser) {
    return { message: 'Email is already in use' };
  }

  // Hash password with unique salt (bcryptjs generates unique salt automatically)
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(input.password, salt);

  const userId = uuidv4();
  const now = new Date();

  await query(
    `INSERT INTO users (user_id, name, email, password_hash, password_salt, role, grade, target_score, failed_login_attempts, locked_until, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      userId,
      input.name.trim(),
      input.email.toLowerCase(),
      passwordHash,
      salt,
      input.role,
      input.grade || null,
      input.targetScore || null,
      0,
      null,
      now,
      now,
    ]
  );

  // Generate JWT token
  const token = generateToken(userId, input.role);

  return { userId, token };
}

/**
 * Authenticate user credentials and return a JWT token on success.
 *
 * Security features:
 * - Returns generic "invalid credentials" error without revealing which field is wrong
 * - Tracks consecutive failed attempts per account
 * - Locks account for 15 minutes after 5 consecutive failures
 * - Resets failed attempt counter on successful login
 */
export async function loginUser(input: LoginRequest): Promise<LoginResponse | AuthError> {
  // Look up user by email
  const user = await queryOne<User>(
    `SELECT user_id, email, password_hash, role, failed_login_attempts, locked_until
     FROM users WHERE email = $1`,
    [input.email.toLowerCase()]
  );

  // If user not found, return generic error (don't reveal email doesn't exist)
  if (!user) {
    return { message: INVALID_CREDENTIALS_ERROR };
  }

  // Check if account is locked
  if (user.locked_until) {
    const lockExpiry = new Date(user.locked_until);
    if (lockExpiry > new Date()) {
      return {
        message: ACCOUNT_LOCKED_ERROR,
        lockedUntil: lockExpiry,
      };
    }
    // Lock has expired - reset the lockout state before proceeding
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = $1 WHERE user_id = $2`,
      [new Date(), user.user_id]
    );
    user.failed_login_attempts = 0;
    user.locked_until = null;
  }

  // Verify password
  const passwordValid = await bcrypt.compare(input.password, user.password_hash);

  if (!passwordValid) {
    // Increment failed attempts
    const newFailedAttempts = user.failed_login_attempts + 1;

    if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
      // Lock the account for 15 minutes
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = $3 WHERE user_id = $4`,
        [newFailedAttempts, lockedUntil, new Date(), user.user_id]
      );
      return {
        message: ACCOUNT_LOCKED_ERROR,
        lockedUntil,
      };
    } else {
      // Just increment the counter
      await query(
        `UPDATE users SET failed_login_attempts = $1, updated_at = $2 WHERE user_id = $3`,
        [newFailedAttempts, new Date(), user.user_id]
      );
    }

    return { message: INVALID_CREDENTIALS_ERROR };
  }

  // Successful login - reset failed attempt counter
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = $1 WHERE user_id = $2`,
    [new Date(), user.user_id]
  );

  // Generate JWT token
  const token = generateToken(user.user_id, user.role as Role);

  return {
    userId: user.user_id,
    token,
    role: user.role as Role,
  };
}

/**
 * Check if a login response is an error.
 */
export function isAuthError(response: LoginResponse | RegisterResponse | AuthError): response is AuthError {
  return 'message' in response;
}

/**
 * Generate a JWT token for the authenticated user.
 */
function generateToken(userId: string, role: Role): string {
  return jwt.sign(
    { userId, role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
  );
}
