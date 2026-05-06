import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Operational errors (expected)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[${req.method}] ${req.path} - ${err.message}`, {
        stack: err.stack,
        requestId: req.headers['x-request-id'],
      });
    } else {
      logger.warn(`[${req.method}] ${req.path} - ${err.message}`);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code || `ERROR_${err.statusCode}`,
        ...(err.details && { details: err.details }),
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      },
    });
    return;
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    res.status(422).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: (err as any).errors,
      },
    });
    return;
  }

  // PostgreSQL errors
  if ((err as any).code === '23505') {
    res.status(409).json({
      success: false,
      error: {
        message: 'Resource already exists',
        code: 'DUPLICATE_ERROR',
      },
    });
    return;
  }

  // Unknown errors — never expose internals
  logger.error('Unhandled error:', { err, path: req.path, method: req.method });
  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
    },
  });
}
