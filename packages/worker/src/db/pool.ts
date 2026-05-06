import { Pool, PoolClient, QueryResultRow } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const db = {
  query: <T extends QueryResultRow = any>(text: string, params?: any[]) => pool.query<T>(text, params),
  transaction: async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; }
    catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  },
  end: () => pool.end(),
};
