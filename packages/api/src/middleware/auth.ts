import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../db/pool';
import { redis } from '../db/redis';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export interface AuthPayload {
  userId: string;
  orgId: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      apiKey?: { id: string; scopes: string[] };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-change-me';
const TOKEN_EXPIRY = process.env.JWT_EXPIRY || '7d';

// ─── JWT helpers ──────────────────────────────────────────────────────────────

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY as SignOptions['expiresIn'] });
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'] as string;
    const tokenQuery = typeof req.query.token === 'string' ? req.query.token : null;
    const bearerValue = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenQuery;

    // Method 1: Bearer JWT Token
    if (bearerValue && !/^((mash|wm)_live_)/.test(bearerValue)) {
      const token = bearerValue;

      // Check token blacklist (logout)
      const blacklisted = await redis.get(`token:blacklist:${token.slice(-20)}`);
      if (blacklisted) throw new AppError('Token has been revoked', 401);

      const payload = verifyToken(token);
      req.user = payload;
      return next();
    }

    // Method 2: API Key
    const rawApiKey = apiKeyHeader || (bearerValue && /^((mash|wm)_live_)/.test(bearerValue) ? bearerValue : '');
    if (rawApiKey) {
      const cacheKey = `apikey:${rawApiKey.slice(-16)}`;

      // Check Redis cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        const keyData = JSON.parse(cached);
        req.user = keyData.user;
        req.apiKey = keyData.apiKey;
        return next();
      }

      // Query DB
      const result = await db.query(`
        SELECT ak.id, ak.key_hash, ak.scopes, ak.expires_at, ak.is_active,
               u.id as user_id, u.org_id, u.email, u.role
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_prefix = $1 AND ak.is_active = true
        LIMIT 1
      `, [rawApiKey.substring(0, 20)]);

      if (!result.rows.length) throw new AppError('Invalid API key', 401);

      const row = result.rows[0];
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        throw new AppError('API key has expired', 401);
      }

      // Verify hash
      const valid = await bcrypt.compare(rawApiKey, row.key_hash);
      if (!valid) throw new AppError('Invalid API key', 401);

      const userPayload: AuthPayload = {
        userId: row.user_id,
        orgId: row.org_id,
        email: row.email,
        role: row.role,
      };

      req.user = userPayload;
      req.apiKey = { id: row.id, scopes: row.scopes };

      // Update last_used_at async (non-blocking)
      db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});

      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify({ user: userPayload, apiKey: req.apiKey }));

      return next();
    }

    throw new AppError('Authentication required', 401);

  } catch (err) {
    if (err instanceof AppError) return next(err);
    if ((err as any).name === 'JsonWebTokenError') return next(new AppError('Invalid token', 401));
    if ((err as any).name === 'TokenExpiredError') return next(new AppError('Token expired', 401));
    logger.error('Auth middleware error:', err);
    next(new AppError('Authentication failed', 401));
  }
}

// ─── Authorization helpers ────────────────────────────────────────────────────

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Unauthorized', 401));
    // JWT tokens have full access; API keys are scope-limited
    if (req.apiKey && !req.apiKey.scopes.includes(scope)) {
      return next(new AppError(`API key missing scope: ${scope}`, 403));
    }
    next();
  };
}

// ─── Optional auth (for public endpoints) ────────────────────────────────────

export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await authenticate(req, res, () => {});
    next();
  } catch {
    next();
  }
}
