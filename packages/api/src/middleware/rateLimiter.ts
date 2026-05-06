import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req: Request) => {
    // Authenticated users get higher limits
    if (req.user) return 1000;
    return 100;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMITED' },
  },
  skip: (req) => {
    if (req.path === '/health') return true;
    return /^\/v1\/runs\/[^/]+\/log(?:\/stream)?$/.test(req.path);
  },
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMITED' },
  },
});

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-ID', id);
  next();
}
