/**
 * Auth Routes
 * Express route handlers for authentication endpoints.
 * Requirements: 1.1, 1.2, 1.7
 */

import { Router, Request, Response } from 'express';
import { registerUser, loginUser, isAuthError, RegisterRequest, LoginRequest } from './auth.service';
import { Role } from '../models/enums';

const router = Router();

/**
 * POST /api/auth/register
 * Registers a new user account.
 *
 * Body: { name, email, password, role, grade?, targetScore? }
 * Response 201: { userId, token }
 * Response 400: { error, errors? } - validation failures
 * Response 409: { error } - email already in use
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, grade, targetScore } = req.body;

    const input: RegisterRequest = {
      name: name ?? '',
      email: email ?? '',
      password: password ?? '',
      role: role as Role,
      grade: grade ?? undefined,
      targetScore: targetScore ?? undefined,
    };

    const result = await registerUser(input);

    if (isAuthError(result)) {
      // Determine appropriate status code
      const statusCode = result.message === 'Email is already in use' ? 409 : 400;
      return res.status(statusCode).json({ error: result.message });
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates a user and returns a JWT token.
 *
 * Body: { email, password }
 * Response 200: { userId, token }
 * Response 401: { error } - invalid credentials or account locked
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const input: LoginRequest = {
      email: email ?? '',
      password: password ?? '',
    };

    const result = await loginUser(input);

    if (isAuthError(result)) {
      return res.status(401).json({ error: result.message });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
