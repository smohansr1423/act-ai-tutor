import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';

// Mock pg module
vi.mock('pg', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  return {
    Pool: vi.fn(() => mockPool),
  };
});

describe('Database Utility', () => {
  let db: typeof import('./database');
  let mockPool: any;

  beforeEach(async () => {
    vi.resetModules();
    db = await import('./database');
    // Get the pool instance to access the mock
    const pool = db.getPool();
    mockPool = pool;
  });

  afterEach(async () => {
    await db.closePool();
    vi.clearAllMocks();
  });

  describe('getPool', () => {
    it('should return a Pool instance', () => {
      const pool = db.getPool();
      expect(pool).toBeDefined();
      expect(Pool).toHaveBeenCalled();
    });

    it('should return the same pool instance on subsequent calls', () => {
      const pool1 = db.getPool();
      const pool2 = db.getPool();
      expect(pool1).toBe(pool2);
    });
  });

  describe('query', () => {
    it('should execute a parameterized query', async () => {
      const mockResult = { rows: [{ id: 1, name: 'test' }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await db.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
      expect(result.rowCount).toBe(1);
    });

    it('should execute a query without params', async () => {
      const mockResult = { rows: [{ count: 5 }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await db.query('SELECT COUNT(*) FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT COUNT(*) FROM users', undefined);
      expect(result.rows[0].count).toBe(5);
    });

    it('should propagate database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      await expect(db.query('SELECT 1')).rejects.toThrow('Connection refused');
    });
  });

  describe('queryOne', () => {
    it('should return the first row when results exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1, name: 'Alice' }], rowCount: 1 });

      const result = await db.queryOne('SELECT * FROM users WHERE id = $1', [1]);

      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should return null when no results', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await db.queryOne('SELECT * FROM users WHERE id = $1', [999]);

      expect(result).toBeNull();
    });
  });

  describe('queryMany', () => {
    it('should return all rows', async () => {
      const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
      mockPool.query.mockResolvedValue({ rows, rowCount: 3 });

      const result = await db.queryMany('SELECT * FROM users');

      expect(result).toEqual(rows);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no results', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await db.queryMany('SELECT * FROM users WHERE active = $1', [false]);

      expect(result).toEqual([]);
    });
  });

  describe('insertOne', () => {
    it('should return the inserted row', async () => {
      const insertedRow = { id: 'uuid-1', name: 'Bob', email: 'bob@test.com' };
      mockPool.query.mockResolvedValue({ rows: [insertedRow], rowCount: 1 });

      const result = await db.insertOne(
        'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
        ['Bob', 'bob@test.com']
      );

      expect(result).toEqual(insertedRow);
    });

    it('should throw when insert returns no row', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        db.insertOne('INSERT INTO users (name) VALUES ($1) RETURNING *', ['test'])
      ).rejects.toThrow('Insert did not return a row');
    });
  });

  describe('updateMany', () => {
    it('should return the number of affected rows', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 3 });

      const count = await db.updateMany(
        'UPDATE users SET active = $1 WHERE role = $2',
        [true, 'student']
      );

      expect(count).toBe(3);
    });

    it('should return 0 when no rows match', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const count = await db.updateMany(
        'UPDATE users SET active = $1 WHERE id = $2',
        [false, 'nonexistent']
      );

      expect(count).toBe(0);
    });
  });

  describe('deleteMany', () => {
    it('should return the number of deleted rows', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 2 });

      const count = await db.deleteMany('DELETE FROM sessions WHERE status = $1', ['expired']);

      expect(count).toBe(2);
    });
  });

  describe('withTransaction', () => {
    it('should commit on success', async () => {
      const mockClient = await mockPool.connect();
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 }) // Inner query
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await db.withTransaction(async (txQuery) => {
        const res = await txQuery('INSERT INTO users (name) VALUES ($1) RETURNING *', ['Test']);
        return res.rows[0];
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toEqual({ id: 1 });
    });

    it('should rollback on error', async () => {
      const mockClient = await mockPool.connect();
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('Constraint violation')) // Inner query
        .mockResolvedValueOnce(undefined); // ROLLBACK

      await expect(
        db.withTransaction(async (txQuery) => {
          await txQuery('INSERT INTO users (email) VALUES ($1)', ['duplicate@test.com']);
        })
      ).rejects.toThrow('Constraint violation');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('checkDatabaseHealth', () => {
    it('should return true when database is responsive', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ health: 1 }], rowCount: 1 });

      const healthy = await db.checkDatabaseHealth();

      expect(healthy).toBe(true);
    });

    it('should return false when database is unreachable', async () => {
      mockPool.query.mockRejectedValue(new Error('Connection refused'));

      const healthy = await db.checkDatabaseHealth();

      expect(healthy).toBe(false);
    });
  });

  describe('closePool', () => {
    it('should close the pool', async () => {
      db.getPool(); // Ensure pool is created
      await db.closePool();

      expect(mockPool.end).toHaveBeenCalled();
    });
  });
});
