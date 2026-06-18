/**
 * Express Application - API Gateway
 * Connects all service endpoints with authentication and validation middleware.
 *
 * Public routes (no authentication):
 *   - POST /api/auth/register
 *   - POST /api/auth/login
 *   - GET /health
 *
 * Protected routes (JWT required):
 *   - All /api/questions/* endpoints
 *   - All /api/sessions/* endpoints
 *   - All /api/adaptive/* endpoints
 *   - All /api/chat/* endpoints
 *   - All /api/analytics/* endpoints
 *
 * Requirements: 1.3, 10.1, 10.5
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { authenticate } from './middleware/auth.middleware';
import { requestLogger, rateLimiter } from './middleware/request.middleware';
import { registerEventHandlers } from './events';

// ─── Route Imports ────────────────────────────────────────────────────────────

import authRoutes from './services/auth.routes';
import questionRoutes from './services/question.routes';
import sessionRoutes from './services/session.routes';
import fullTestRoutes from './services/fulltest.routes';
import adaptiveRoutes from './services/adaptive.routes';
import chatRoutes from './services/chat.routes';
import analyticsRoutes from './services/analytics.routes';
import parentDashboardRoutes from './services/parent-dashboard.routes';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();

// CORS configuration - allow cross-origin requests from mobile and web clients
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',');
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

// Body parsing
app.use(express.json({ limit: '15mb' })); // 15mb to support base64 image uploads
app.use(express.urlencoded({ extended: true }));

// Request logging and rate limiting
app.use(requestLogger);
app.use(rateLimiter);

// ─── Health Check (public) ────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.2.0' });
});

// Database health check - temporary debug endpoint
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    const { checkDatabaseHealth } = await import('./utils/database');
    const healthy = await checkDatabaseHealth();
    res.json({ 
      db: healthy ? 'connected' : 'failed',
      hasDbUrl: !!process.env.DATABASE_URL,
      dbUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'NOT SET'
    });
  } catch (err: any) {
    res.json({ db: 'error', error: err.message, hasDbUrl: !!process.env.DATABASE_URL });
  }
});

// ─── Public Routes (no auth required) ─────────────────────────────────────────

app.use('/api/auth', authRoutes);

// ─── Protected Routes (JWT auth required) ─────────────────────────────────────

app.use('/api/questions', authenticate, questionRoutes);
app.use('/api/sessions', authenticate, sessionRoutes);
app.use('/api/sessions/fulltest', authenticate, fullTestRoutes);
app.use('/api/adaptive', authenticate, adaptiveRoutes);
app.use('/api/chat', authenticate, chatRoutes);
app.use('/api/analytics', authenticate, analyticsRoutes);
app.use('/api/analytics', authenticate, parentDashboardRoutes);

// ─── Static Frontend Serving ──────────────────────────────────────────────────

const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ─── 404 Handler (serve index.html for SPA routes) ────────────────────────────

app.use((req: Request, res: Response) => {
  // If it's an API route, return 404 JSON
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Endpoint not found' });
    return;
  }
  // Otherwise serve the SPA
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Event Pipeline Registration ──────────────────────────────────────────────

registerEventHandlers();

export default app;
