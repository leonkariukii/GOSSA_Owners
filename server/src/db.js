import pg from 'pg';

export function createPool(config, logger) {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
  });

  pool.on('error', (error) => {
    logger?.error('Idle database client error', { error: error.message });
  });

  return pool;
}

/**
 * Run `work(client)` in a single transaction. Any thrown error rolls the whole
 * transaction back, so no partial job/history/mechanic changes survive a failure.
 */
export async function withTransaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error is more useful than a failed rollback.
    }
    throw error;
  } finally {
    client.release();
  }
}
