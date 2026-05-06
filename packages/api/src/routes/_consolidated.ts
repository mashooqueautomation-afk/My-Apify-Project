// ─── Key-Value Stores ─────────────────────────────────────────────────────────
import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';

export const kvStoreRouter = Router();
kvStoreRouter.use(authenticate);

kvStoreRouter.get('/', async (req, res, next) => {
  try {
    const r = await db.query(
      'SELECT * FROM key_value_stores WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user!.orgId]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { console.error('GET KVS ERROR 👉', e); next(e); }
});

kvStoreRouter.get('/:id/records/:key', async (req, res, next) => {
  try {
    const store = await db.query(
      'SELECT id FROM key_value_stores WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!store.rows.length) throw new AppError('Store not found', 404);

    const r = await db.query(
      'SELECT key, value, content_type FROM key_value_store_records WHERE store_id = $1 AND key = $2',
      [req.params.id, req.params.key]
    );
    if (!r.rows.length) throw new AppError('Record not found', 404);

    const record = r.rows[0];
    res.set('Content-Type', record.content_type);
    res.send(record.value);
  } catch (e) { console.error('GET RECORD ERROR 👉', e); next(e); }
});

kvStoreRouter.put('/:id/records/:key', async (req, res, next) => {
  try {
    const value = typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body);
    const contentType = req.headers['content-type'] || 'application/json';

    await db.query(
      `INSERT INTO key_value_store_records (store_id, key, value, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id, key) DO UPDATE
       SET value = $3, content_type = $4, size_bytes = $5, updated_at = NOW()`,
      [req.params.id, req.params.key, value, contentType, value.length]
    );

    await db.query(
      `UPDATE key_value_stores SET
         item_count = (SELECT COUNT(*) FROM key_value_store_records WHERE store_id = $1),
         updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { key: req.params.key } });
  } catch (e) { console.error('PUT RECORD ERROR 👉', e); next(e); }
});

kvStoreRouter.delete('/:id/records/:key', async (req, res, next) => {
  try {
    await db.query(
      'DELETE FROM key_value_store_records WHERE store_id = $1 AND key = $2',
      [req.params.id, req.params.key]
    );
    res.json({ success: true });
  } catch (e) { console.error('DELETE RECORD ERROR 👉', e); next(e); }
});

kvStoreRouter.get('/:id/keys', async (req, res, next) => {
  try {
    const r = await db.query(
      `SELECT key, content_type, size_bytes, updated_at
       FROM key_value_store_records WHERE store_id = $1 ORDER BY key`,
      [req.params.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { console.error('GET KEYS ERROR 👉', e); next(e); }
});

// ─── Request Queues ───────────────────────────────────────────────────────────
export const requestQueueRouter = Router();
requestQueueRouter.use(authenticate);

requestQueueRouter.get('/:id/head', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string || '25'), 100);
    const r = await db.query(
      `SELECT * FROM request_queue_items
       WHERE queue_id = $1 AND status = 'pending'
       ORDER BY priority DESC, created_at ASC LIMIT $2`,
      [req.params.id, limit]
    );
    res.json({ success: true, data: r.rows });
  } catch (e) { console.error('QUEUE HEAD ERROR 👉', e); next(e); }
});

requestQueueRouter.post('/:id/requests', async (req, res, next) => {
  try {
    const { url, method = 'GET', headers, payload, userData, priority = 0, uniqueKey } = req.body;
    if (!url) throw new AppError('url is required', 400);

    const key = uniqueKey || Buffer.from(url).toString('base64').slice(0, 250);
    const r = await db.query(
      `INSERT INTO request_queue_items
         (queue_id, url, unique_key, method, headers, payload, user_data, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (queue_id, unique_key) DO NOTHING
       RETURNING *`,
      [req.params.id, url, key, method, JSON.stringify(headers || {}),
       payload || null, JSON.stringify(userData || {}), priority]
    );

    await db.query(
      `UPDATE request_queues SET
         total_requests = total_requests + 1,
         pending_requests = pending_requests + 1,
         updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    res.status(201).json({ success: true, data: r.rows[0] || { duplicate: true } });
  } catch (e) { console.error('QUEUE ADD ERROR 👉', e); next(e); }
});

requestQueueRouter.put('/:id/requests/:requestId/handled', async (req, res, next) => {
  try {
    const { wasAlreadyHandled = false } = req.body;
    await db.query(
      `UPDATE request_queue_items
       SET status = 'done', handled_at = NOW()
       WHERE id = $1 AND queue_id = $2`,
      [req.params.requestId, req.params.id]
    );

    if (!wasAlreadyHandled) {
      await db.query(
        `UPDATE request_queues SET
           handled_requests = handled_requests + 1,
           pending_requests = GREATEST(0, pending_requests - 1),
           updated_at = NOW()
         WHERE id = $1`,
        [req.params.id]
      );
    }
    res.json({ success: true });
  } catch (e) { console.error('QUEUE HANDLE ERROR 👉', e); next(e); }
});

// ─── Lightweight placeholders for routes imported by index.ts ───────────────
export const proxiesRouter = Router();
proxiesRouter.use(authenticate);
proxiesRouter.get('/', async (_req, res) => {
  res.json({ success: true, data: [] });
});

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get('/', async (_req, res) => {
  res.json({ success: true, data: [] });
});

export const orgsRouter = Router();
orgsRouter.use(authenticate);
orgsRouter.get('/', async (req, res) => {
  res.json({ success: true, data: [{ id: req.user?.orgId }] });
});

export const metricsRouter = Router();
metricsRouter.use(authenticate);
metricsRouter.get('/overview', async (_req, res) => {
  res.json({ success: true, data: {} });
});
