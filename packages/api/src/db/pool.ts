import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

pool.on('connect', () => {
  logger.debug('New DB client connected');
});

// ─── Query helpers ────────────────────────────────────────────────────────────

export const db = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]) =>
    pool.query<T>(text, params),

  getClient: (): Promise<PoolClient> =>
    pool.connect(),

  /**
   * Transaction helper — automatically commits or rolls back
   */
  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  end: () => pool.end(),
};

export default db;
