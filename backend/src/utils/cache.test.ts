import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock redis module
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  get: vi.fn(),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  incr: vi.fn(),
  scan: vi.fn(),
  ping: vi.fn().mockResolvedValue('PONG'),
  on: vi.fn(),
};

vi.mock('redis', () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

describe('Cache Utility', () => {
  let cache: typeof import('./cache');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    // Re-setup default mock behaviors after clear
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.quit.mockResolvedValue(undefined);
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.ping.mockResolvedValue('PONG');
    cache = await import('./cache');
  });

  afterEach(async () => {
    await cache.closeRedisClient();
  });

  describe('getRedisClient', () => {
    it('should create and connect a Redis client', async () => {
      const client = await cache.getRedisClient();
      expect(client).toBeDefined();
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should return the same client on subsequent calls', async () => {
      const client1 = await cache.getRedisClient();
      const client2 = await cache.getRedisClient();
      expect(client1).toBe(client2);
      expect(mockRedisClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('cacheSet', () => {
    it('should store a JSON-serialized value with default TTL', async () => {
      await cache.cacheSet('test-key', { data: 'hello' });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'act_tutor:test-key',
        JSON.stringify({ data: 'hello' }),
        { EX: 3600 }
      );
    });

    it('should store a value with custom TTL', async () => {
      await cache.cacheSet('temp-key', 'temporary', 60);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'act_tutor:temp-key',
        JSON.stringify('temporary'),
        { EX: 60 }
      );
    });

    it('should handle numeric values', async () => {
      await cache.cacheSet('counter', 42);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'act_tutor:counter',
        '42',
        { EX: 3600 }
      );
    });
  });

  describe('cacheGet', () => {
    it('should retrieve and parse a cached value', async () => {
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ data: 'hello' }));

      const result = await cache.cacheGet<{ data: string }>('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('act_tutor:test-key');
      expect(result).toEqual({ data: 'hello' });
    });

    it('should return null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await cache.cacheGet('missing-key');

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      mockRedisClient.get.mockResolvedValue('not valid json {{{');

      const result = await cache.cacheGet('bad-key');

      expect(result).toBeNull();
    });
  });

  describe('cacheDelete', () => {
    it('should return true when key is deleted', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      const result = await cache.cacheDelete('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('act_tutor:test-key');
      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.del.mockResolvedValue(0);

      const result = await cache.cacheDelete('missing-key');

      expect(result).toBe(false);
    });
  });

  describe('cacheDeletePattern', () => {
    it('should delete all keys matching a pattern', async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce({ cursor: 5, keys: ['act_tutor:session:1', 'act_tutor:session:2'] })
        .mockResolvedValueOnce({ cursor: 0, keys: ['act_tutor:session:3'] });
      mockRedisClient.del
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const count = await cache.cacheDeletePattern('session:*');

      expect(count).toBe(3);
    });

    it('should handle empty scan results', async () => {
      mockRedisClient.scan.mockResolvedValue({ cursor: 0, keys: [] });

      const count = await cache.cacheDeletePattern('nonexistent:*');

      expect(count).toBe(0);
    });
  });

  describe('cacheExists', () => {
    it('should return true when key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await cache.cacheExists('test-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await cache.cacheExists('missing-key');

      expect(result).toBe(false);
    });
  });

  describe('cacheExpire', () => {
    it('should set TTL on an existing key', async () => {
      mockRedisClient.expire.mockResolvedValue(true);

      const result = await cache.cacheExpire('test-key', 300);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('act_tutor:test-key', 300);
      expect(result).toBe(true);
    });
  });

  describe('cacheIncrement', () => {
    it('should increment a counter', async () => {
      mockRedisClient.incr.mockResolvedValue(3);

      const result = await cache.cacheIncrement('login-attempts:user1');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('act_tutor:login-attempts:user1');
      expect(result).toBe(3);
    });
  });

  describe('Session State Helpers', () => {
    it('should set session state with 24-hour TTL', async () => {
      const state = { answers: [{ q: 1, a: 'B' }], timeRemaining: 1800 };

      await cache.setSessionState('session-123', state);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'act_tutor:session:session-123',
        JSON.stringify(state),
        { EX: 86400 }
      );
    });

    it('should get session state', async () => {
      const state = { answers: [], timeRemaining: 2700 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(state));

      const result = await cache.getSessionState('session-123');

      expect(result).toEqual(state);
    });

    it('should delete session state', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await cache.deleteSessionState('session-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('act_tutor:session:session-123');
    });
  });

  describe('Chat Context Helpers', () => {
    it('should store chat context with 2-hour TTL', async () => {
      const messages = [
        { role: 'user', content: 'Help with math' },
        { role: 'ai', content: 'Sure, what topic?' },
      ];

      await cache.setChatContext('chat-456', messages);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'act_tutor:chat:chat-456',
        JSON.stringify(messages),
        { EX: 7200 }
      );
    });

    it('should trim messages to max 50 when setting chat context', async () => {
      const messages = Array.from({ length: 60 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'ai',
        content: `Message ${i}`,
      }));

      await cache.setChatContext('chat-789', messages);

      const setCall = mockRedisClient.set.mock.calls[0];
      const storedMessages = JSON.parse(setCall[1]);
      expect(storedMessages).toHaveLength(50);
      // Should keep the most recent 50 messages (index 10-59)
      expect(storedMessages[0].content).toBe('Message 10');
      expect(storedMessages[49].content).toBe('Message 59');
    });

    it('should retrieve chat context', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(messages));

      const result = await cache.getChatContext('chat-456');

      expect(result).toEqual(messages);
    });

    it('should delete chat context', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await cache.deleteChatContext('chat-456');

      expect(mockRedisClient.del).toHaveBeenCalledWith('act_tutor:chat:chat-456');
    });
  });

  describe('checkCacheHealth', () => {
    it('should return true when Redis is responsive', async () => {
      // Trigger connection to set isConnected
      await cache.getRedisClient();
      // Simulate the 'connect' event handler
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      );
      if (connectHandler) connectHandler[1]();

      const healthy = await cache.checkCacheHealth();

      expect(healthy).toBe(true);
    });
  });

  describe('closeRedisClient', () => {
    it('should close the Redis connection', async () => {
      await cache.getRedisClient(); // Ensure client exists
      await cache.closeRedisClient();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
