import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../db/pool';
import { redis } from '../db/redis';
import { signToken, authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(2).max(100),
  orgName: z.string().min(2).max(100).optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
router.post('/register', strictRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(body.password, 12);

    const result = await db.transaction(async (client) => {
      // Create org
      const orgSlug = (body.orgName || body.name)
        .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 50)
        + '-' + crypto.randomBytes(3).toString('hex');

      const orgResult = await client.query(
        `INSERT INTO organizations (name, slug, plan)
         VALUES ($1, $2, 'free') RETURNING id`,
        [body.orgName || `${body.name}'s Org`, orgSlug]
      );
      const orgId = orgResult.rows[0].id;

      // Create user
      const userResult = await client.query(
        `INSERT INTO users (org_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, 'admin') RETURNING id, email, name, role`,
        [orgId, body.email.toLowerCase(), passwordHash, body.name]
      );
      const user = userResult.rows[0];

      return { user, orgId };
    });

    const token = signToken({
      userId: result.user.id,
      orgId: result.orgId,
      email: result.user.email,
      role: result.user.role,
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: result.user.id, email: result.user.email, name: result.user.name },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
router.post('/login', strictRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = LoginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase();
    const candidateEmails = normalizedEmail === 'admin@mash-lead-scrapping.com'
      ? ['admin@mash-lead-scrapping.com', 'admin@webminer.io']
      : normalizedEmail === 'admin@webminer.io'
        ? ['admin@webminer.io', 'admin@mash-lead-scrapping.com']
        : [normalizedEmail];

    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.role, u.password_hash, u.org_id, u.is_active
       FROM users u
       WHERE u.email = ANY($1::text[])
       ORDER BY array_position($1::text[], u.email)
       LIMIT 1`,
      [candidateEmails]
    );

    const user = result.rows[0];
    if (!user) throw new AppError('Invalid credentials', 401);
    if (!user.is_active) throw new AppError('Account disabled', 401);
    if (!user.password_hash) throw new AppError('Use SSO to sign in', 400);

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError('Invalid credentials', 401);

    await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = signToken({
      userId: user.id,
      orgId: user.org_id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) {
      // Blacklist token for 7 days
      await redis.setex(`token:blacklist:${token.slice(-20)}`, 7 * 24 * 3600, '1');
    }
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────
router.get(
  '/me',
  authenticate,
  async (req: any, res: Response) => {
    return res.json({
      success: true,
      data: {
        id: req.user.userId,
        orgId: req.user.orgId,
        email: req.user.email,
        role: req.user.role,
      },
    });
  }
);

// ─── POST /api/v1/auth/api-keys ──────────────────────────────────────────────
router.post('/api-keys', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, scopes = ['read', 'write'], expiresAt } = req.body;
    if (!name) throw new AppError('API key name required', 400);

    // Generate key: mash_live_<48 random chars>
    const rawKey = `mash_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(rawKey, 10);
    const keyPrefix = rawKey.substring(0, 20);

    const result = await db.query(
      `INSERT INTO api_keys (user_id, org_id, name, key_hash, key_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, key_prefix, scopes, created_at`,
      [req.user!.userId, req.user!.orgId, name, keyHash, keyPrefix, scopes, expiresAt || null]
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        key: rawKey,  // Only shown ONCE
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/auth/api-keys ────────────────────────────────────────────────
router.get('/api-keys', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user!.userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/v1/auth/api-keys/:id ────────────────────────────────────────
router.delete('/api-keys/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user!.userId]
    );
    if (!result.rows.length) throw new AppError('API key not found', 404);
    res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (err) {
    next(err);
  }
});

export default router;
