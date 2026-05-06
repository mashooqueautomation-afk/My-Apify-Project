import { Router, Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { db } from '../db/pool';
import { AppError } from '../utils/AppError';

const router = Router();
router.use(authenticate);

const CreateApiKeySchema = z.object({
  name: z.string().min(2).max(255),
  scopes: z.array(z.string()).default(['read', 'write', 'run']),
  expiresAt: z.string().datetime().optional(),
});

const UpdateApiKeySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  scopes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  rotate: z.boolean().optional(),
});

function buildApiKeyPrefix() {
  return 'mash_live_';
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT id, name, key_prefix, scopes, is_active, created_at, last_used_at, expires_at
       FROM api_keys
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [req.user!.orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateApiKeySchema.parse(req.body);
    const rawKey = `${buildApiKeyPrefix()}${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.slice(0, 20);

    const result = await db.query(
      `INSERT INTO api_keys (org_id, user_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, key_prefix, scopes, is_active, created_at, last_used_at, expires_at`,
      [req.user!.orgId, req.user!.userId, body.name, keyHash, keyPrefix, body.scopes, body.expiresAt || null]
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        key: rawKey,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateApiKeySchema.parse(req.body);
    const existing = await db.query(
      'SELECT id, name FROM api_keys WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!existing.rows.length) throw new AppError('API key not found', 404);

    if (body.rotate) {
      const rawKey = `${buildApiKeyPrefix()}${crypto.randomBytes(24).toString('hex')}`;
      const keyHash = await bcrypt.hash(rawKey, 10);
      const keyPrefix = rawKey.slice(0, 20);

      const rotated = await db.query(
        `UPDATE api_keys
         SET key_hash = $3, key_prefix = $4, is_active = true, last_used_at = NULL
         WHERE id = $1 AND org_id = $2
         RETURNING id, name, key_prefix, scopes, is_active, created_at, last_used_at, expires_at`,
        [req.params.id, req.user!.orgId, keyHash, keyPrefix]
      );

      return res.json({ success: true, data: { ...rotated.rows[0], key: rawKey } });
    }

    const fields: string[] = [];
    const values: any[] = [req.params.id, req.user!.orgId];
    if (body.name !== undefined) {
      values.push(body.name);
      fields.push(`name = $${values.length}`);
    }
    if (body.scopes !== undefined) {
      values.push(body.scopes);
      fields.push(`scopes = $${values.length}`);
    }
    if (body.isActive !== undefined) {
      values.push(body.isActive);
      fields.push(`is_active = $${values.length}`);
    }
    if (!fields.length) throw new AppError('Nothing to update', 400);

    const updated = await db.query(
      `UPDATE api_keys SET ${fields.join(', ')}
       WHERE id = $1 AND org_id = $2
       RETURNING id, name, key_prefix, scopes, is_active, created_at, last_used_at, expires_at`,
      values
    );

    res.json({ success: true, data: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `UPDATE api_keys
       SET is_active = false
       WHERE id = $1 AND org_id = $2
       RETURNING id`,
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('API key not found', 404);
    res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (error) {
    next(error);
  }
});

export default router;
