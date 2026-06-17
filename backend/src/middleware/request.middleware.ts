/**
 * Request Middleware
 * Provides request logging and basic rate limiting for API protection.
 *
 * Requirements: 10.5 (support 1000+ concurrent students)
 */

import { Request, Response, NextFunction } from 'express';

// ─── Request Logger ───────────────────────────────────────────────────────────

/**
 * Logs incoming requests with method, URL, and response time.
 * Lightweight middleware for observability without external dependencies.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    if (process.env.NODE_ENV !== 'test') {
      console[logLevel === 'warn' ? 'warn' : 'log'](
        `[${req.method}] ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
      );
    }
  });

  next();
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

/** Per-IP request tracking */
interface RateEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateEntry>();

/** Maximum requests per window per IP */
const MAX_REQUESTS_PER_WINDOW = parseInt(process.env.RATE_LIMIT_MAX || '200', 10);

/** Window duration in milliseconds (1 minute) */
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);

/** Cleanup interval for expired entries (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Periodic cleanup to prevent memory leaks
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow Node to exit even if the interval is running
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

/**
 * Simple in-memory rate limiter.
 * In production, this would use Redis for shared state across instances.
 * Configured for 200 requests per minute per IP (generous for 1000+ concurrent users).
 */
export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  // Skip rate limiting in test environment
  if (process.env.NODE_ENV === 'test') {
    next();
    return;
  }

  startCleanup();

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = rateLimitStore.get(clientIp);

  if (!entry || now > entry.resetAt) {
    // New window
    entry = { count: 1, resetAt: now + WINDOW_MS };
    rateLimitStore.set(clientIp, entry);
  } else {
    entry.count++;
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS_PER_WINDOW - entry.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000).toString());

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}

/**
 * Reset the rate limiter store (useful for testing).
 */
export function resetRateLimiter(): void {
  rateLimitStore.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
