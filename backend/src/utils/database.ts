import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';

/**
 * PostgreSQL connection pool configuration.
 * Sized for 1000+ concurrent users with appropriate settings
 * for a high-throughput educational application.
 *
 * Supports both DATABASE_URL (Railway/Render style) and individual env vars.
 */
const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '3000', 10),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'act_ai_tutor',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: parseInt(process.env.DB_POOL_MAX || '100', 10),
      min: parseInt(process.env.DB_POOL_MIN || '10', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
      statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '3000', 10),
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    };

/** Singleton connection pool instance */
let pool: Pool | null = null;

/**
 * Get the PostgreSQL connection pool instance.
 * Creates the pool on first call (lazy initialization).
 */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      console.error('Unexpected error on idle database client:', err);
    });

    pool.on('connect', () => {
      // Connection established - could add metrics/logging here
    });
  }
  return pool;
}

/**
 * Execute a parameterized SQL query against the database.
 * Uses the connection pool for efficient connection management.
 *
 * @param text - SQL query string with $1, $2, ... placeholders
 * @param params - Array of parameter values
 * @returns Query result with typed rows
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const dbPool = getPool();
  const start = Date.now();
  const result = await dbPool.query<T>(text, params);
  const duration = Date.now() - start;

  // Log slow queries (> 1 second) for performance monitoring
  if (duration > 1000) {
    console.warn('Slow query detected:', { text: text.substring(0, 100), duration, rows: result.rowCount });
  }

  return result;
}

/**
 * Execute a query and return the first row, or null if no results.
 *
 * @param text - SQL query string
 * @param params - Array of parameter values
 * @returns First row or null
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] || null;
}

/**
 * Execute a query and return all rows.
 *
 * @param text - SQL query string
 * @param params - Array of parameter values
 * @returns Array of rows
 */
export async function queryMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/**
 * Execute an INSERT and return the inserted row.
 * Expects the query to use RETURNING *.
 *
 * @param text - SQL INSERT query with RETURNING clause
 * @param params - Array of parameter values
 * @returns The inserted row
 */
export async function insertOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T> {
  const result = await query<T>(text, params);
  if (!result.rows[0]) {
    throw new Error('Insert did not return a row');
  }
  return result.rows[0];
}

/**
 * Execute an UPDATE and return the number of affected rows.
 *
 * @param text - SQL UPDATE query
 * @param params - Array of parameter values
 * @returns Number of rows affected
 */
export async function updateMany(
  text: string,
  params?: unknown[]
): Promise<number> {
  const result = await query(text, params);
  return result.rowCount ?? 0;
}

/**
 * Execute a DELETE and return the number of affected rows.
 *
 * @param text - SQL DELETE query
 * @param params - Array of parameter values
 * @returns Number of rows deleted
 */
export async function deleteMany(
  text: string,
  params?: unknown[]
): Promise<number> {
  const result = await query(text, params);
  return result.rowCount ?? 0;
}

/**
 * Execute multiple queries within a database transaction.
 * Automatically commits on success or rolls back on error.
 *
 * @param callback - Async function receiving a transaction query executor
 * @returns The result of the callback function
 */
export async function withTransaction<T>(
  callback: (txQuery: typeof query) => Promise<T>
): Promise<T> {
  const dbPool = getPool();
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // Create a transaction-scoped query function
    const txQuery = async <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<R>> => {
      return client.query<R>(text, params);
    };

    const result = await callback(txQuery as typeof query);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if the database connection is healthy.
 * Useful for health check endpoints.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as health');
    return result.rows[0]?.health === 1;
  } catch {
    return false;
  }
}

/**
 * Gracefully close the connection pool.
 * Should be called during application shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
