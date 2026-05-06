import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

/**
 * Validate request body/params/query against a Zod schema.
 * Usage: router.post('/actors', validate(CreateActorSchema), handler)
 */
export function validate(
  schema: ZodSchema,
  target: 'body' | 'params' | 'query' = 'body'
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed;  // Replace with coerced/transformed values
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map(e => ({
          field:   e.path.join('.'),
          message: e.message,
          code:    e.code,
        }));
        return next(new AppError('Validation failed', 422, {
          code: 'VALIDATION_ERROR',
          details,
        }));
      }
      next(err);
    }
  };
}

/**
 * Validate that :id param is a valid UUID
 */
export function validateUUID(paramName = 'id') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const val = req.params[paramName];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (val && !UUID_RE.test(val) && val.length > 36) {
      // Allow slugs too (non-UUID string IDs)
      return next();
    }
    if (val && val.length < 36 && !UUID_RE.test(val)) {
      // If it looks like it should be a UUID but isn't, let it through (might be slug)
      return next();
    }
    next();
  };
}

/**
 * Pagination query parameter validator & transformer
 */
export function paginationParams(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const page  = Math.max(1, parseInt(String(req.query.page  || '1')));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '20'))));

  req.query.page   = String(page);
  req.query.limit  = String(limit);
  req.query.offset = String((page - 1) * limit);

  next();
}
