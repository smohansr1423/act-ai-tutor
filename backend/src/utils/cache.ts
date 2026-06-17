import { createClient, RedisClientType } from 'redis';

/**
 * Redis cache client for session state and chat context caching.
 * Supports the high-throughput requirements of 1000+ concurrent users.
 */

export interface CacheConfig {
  url: string;
  /** Key prefix to namespace all keys */
  prefix: string;
  /** Default TTL in seconds for cached values */
  defaultTtlSeconds: number;
  /** Connection retry strategy */
  maxRetries: number;
  /** Retry delay in milliseconds */
  retryDelayMs: number;
}

const defaultConfig: CacheConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  prefix: process.env.REDIS_PREFIX || 'act_tutor:',
  defaultTtlSeconds: parseInt(process.env.REDIS_DEFAULT_TTL || '3600', 10),
  maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '5', 10),
  retryDelayMs: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
};

/** Singleton Redis client instance */
let redisClient: RedisClientType | null = null;
let isConnected = false;

/**
 * Get the Redis client instance.
 * Creates and connects the client on first call (lazy initialization).
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClient) {
    redisClient = createClient({
      url: defaultConfig.url,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries >= defaultConfig.maxRetries) {
            console.error('Redis: max reconnection attempts reached');
            return new Error('Max Redis reconnection attempts reached');
          }
          return defaultConfig.retryDelayMs * Math.pow(2, retries);
        },
        connectTimeout: 10000,
      },
    }) as RedisClientType;

    redisClient.on('error', (err) => {
      console.error('Redis client error:', err);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      isConnected = true;
    });

    redisClient.on('disconnect', () => {
      isConnected = false;
    });

    redisClient.on('reconnecting', () => {
      console.warn('Redis client reconnecting...');
    });

    await redisClient.connect();
  }

  return redisClient;
}

/**
 * Prefix a key with the configured namespace.
 */
function prefixKey(key: string): string {
  return `${defaultConfig.prefix}${key}`;
}

/**
 * Set a value in the cache with optional TTL.
 *
 * @param key - Cache key (will be prefixed automatically)
 * @param value - Value to cache (will be JSON serialized)
 * @param ttlSeconds - Time-to-live in seconds (defaults to config value)
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<void> {
  const client = await getRedisClient();
  const serialized = JSON.stringify(value);
  const ttl = ttlSeconds ?? defaultConfig.defaultTtlSeconds;

  await client.set(prefixKey(key), serialized, { EX: ttl });
}

/**
 * Get a value from the cache.
 *
 * @param key - Cache key (will be prefixed automatically)
 * @returns Parsed value or null if not found/expired
 */
export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const client = await getRedisClient();
  const value = await client.get(prefixKey(key));

  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Delete a value from the cache.
 *
 * @param key - Cache key (will be prefixed automatically)
 * @returns true if the key was deleted, false if it didn't exist
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const client = await getRedisClient();
  const result = await client.del(prefixKey(key));
  return result > 0;
}

/**
 * Delete multiple keys matching a pattern.
 *
 * @param pattern - Glob pattern to match (will be prefixed)
 * @returns Number of keys deleted
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = await getRedisClient();
  const fullPattern = prefixKey(pattern);
  let cursor = 0;
  let deletedCount = 0;

  do {
    const result = await client.scan(cursor, { MATCH: fullPattern, COUNT: 100 });
    cursor = result.cursor;

    if (result.keys.length > 0) {
      const deleted = await client.del(result.keys);
      deletedCount += deleted;
    }
  } while (cursor !== 0);

  return deletedCount;
}

/**
 * Check if a key exists in the cache.
 *
 * @param key - Cache key (will be prefixed automatically)
 * @returns true if the key exists
 */
export async function cacheExists(key: string): Promise<boolean> {
  const client = await getRedisClient();
  const result = await client.exists(prefixKey(key));
  return result === 1;
}

/**
 * Set the TTL on an existing key.
 *
 * @param key - Cache key (will be prefixed automatically)
 * @param ttlSeconds - New TTL in seconds
 * @returns true if the TTL was set, false if key doesn't exist
 */
export async function cacheExpire(key: string, ttlSeconds: number): Promise<boolean> {
  const client = await getRedisClient();
  return client.expire(prefixKey(key), ttlSeconds);
}

/**
 * Increment a numeric value in the cache (useful for counters like failed login attempts).
 *
 * @param key - Cache key (will be prefixed automatically)
 * @returns The new value after increment
 */
export async function cacheIncrement(key: string): Promise<number> {
  const client = await getRedisClient();
  return client.incr(prefixKey(key));
}

// --- Session State Helpers ---

/**
 * Store session state in Redis.
 * Used for active test/practice sessions.
 *
 * @param sessionId - The session UUID
 * @param state - Session state object
 * @param ttlSeconds - TTL (default: 24 hours for interrupted session resume)
 */
export async function setSessionState(
  sessionId: string,
  state: unknown,
  ttlSeconds: number = 86400
): Promise<void> {
  await cacheSet(`session:${sessionId}`, state, ttlSeconds);
}

/**
 * Retrieve session state from Redis.
 *
 * @param sessionId - The session UUID
 * @returns Session state or null if not found
 */
export async function getSessionState<T = unknown>(sessionId: string): Promise<T | null> {
  return cacheGet<T>(`session:${sessionId}`);
}

/**
 * Delete session state from Redis.
 *
 * @param sessionId - The session UUID
 */
export async function deleteSessionState(sessionId: string): Promise<void> {
  await cacheDelete(`session:${sessionId}`);
}

// --- Chat Context Helpers ---

/**
 * Store chat context in Redis.
 * Maintains conversation history for up to 50 messages per session.
 *
 * @param chatSessionId - The chat session UUID
 * @param messages - Array of chat messages (max 50)
 * @param ttlSeconds - TTL (default: 2 hours)
 */
export async function setChatContext(
  chatSessionId: string,
  messages: unknown[],
  ttlSeconds: number = 7200
): Promise<void> {
  // Enforce the 50-message context window
  const trimmedMessages = messages.slice(-50);
  await cacheSet(`chat:${chatSessionId}`, trimmedMessages, ttlSeconds);
}

/**
 * Retrieve chat context from Redis.
 *
 * @param chatSessionId - The chat session UUID
 * @returns Array of chat messages or null
 */
export async function getChatContext<T = unknown>(chatSessionId: string): Promise<T[] | null> {
  return cacheGet<T[]>(`chat:${chatSessionId}`);
}

/**
 * Delete chat context from Redis.
 *
 * @param chatSessionId - The chat session UUID
 */
export async function deleteChatContext(chatSessionId: string): Promise<void> {
  await cacheDelete(`chat:${chatSessionId}`);
}

/**
 * Check if the Redis connection is healthy.
 * Useful for health check endpoints.
 */
export async function checkCacheHealth(): Promise<boolean> {
  try {
    if (!isConnected) return false;
    const client = await getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Gracefully close the Redis connection.
 * Should be called during application shutdown.
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
  }
}
