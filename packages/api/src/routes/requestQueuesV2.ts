import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RequestQueueDedup } from '../services/RequestQueueDedup';
import { DeadLetterQueue } from '../services/DeadLetterQueue';
import { URLFingerprint } from '../services/URLFingerprint';

export function createRequestQueuesV2Router(db: Pool) {
  const router = Router();
  const dedup = new RequestQueueDedup(db);
  const dlq = new DeadLetterQueue(db);

  /**
   * POST /api/v1/request-queues/:id/requests/with-dedup
   * Add request with automatic deduplication
   */
  router.post(
    '/:id/requests/with-dedup',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: queueId } = req.params;
        const { url, userData, priority } = req.body;

        if (!url) {
          return res.status(400).json({
            success: false,
            error: { message: 'URL is required', code: 'MISSING_URL' },
          });
        }

        const result = await dedup.addIfNotDuplicate(
          queueId,
          url,
          userData,
          priority || 0
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/v1/request-queues/:id/requests/batch-dedup
   * Batch add with deduplication
   */
  router.post(
    '/:id/requests/batch-dedup',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: queueId } = req.params;
        const { requests } = req.body; // Array of {url, userData, priority}

        if (!Array.isArray(requests) || requests.length === 0) {
          return res.status(400).json({
            success: false,
            error: { message: 'Requests array is required', code: 'MISSING_REQUESTS' },
          });
        }

        const result = await dedup.addBatchIfNotDuplicate(queueId, requests);

        res.json({
          success: true,
          data: result,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/v1/request-queues/:id/dedup-stats
   * Get deduplication statistics
   */
  router.get(
    '/:id/dedup-stats',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = dedup.getStats();

        res.json({
          success: true,
          data: stats,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/v1/request-queues/:id/dead-letter
   * Get dead letter queue items
   */
  router.get(
    '/:id/dead-letter',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id: queueId } = req.params;
        const limit = parseInt(req.query.limit as string) || 100;

        const items = await dlq.getDeadLetters(queueId, limit);
        const stats = await dlq.getStats(queueId);

        res.json({
          success: true,
          data: {
            items,
            stats,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/v1/request-queues/:id/dead-letter/:dlqId/retry
   * Retry a dead letter item
   */
  router.post(
    '/:id/dead-letter/:dlqId/retry',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { dlqId } = req.params;

        await dlq.retryDeadLetter(dlqId);

        res.json({
          success: true,
          data: { message: 'Dead letter item moved back to pending' },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/v1/request-queues/:id/fingerprint
   * Get normalized fingerprint for a URL (for debugging)
   */
  router.get(
    '/:id/fingerprint',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { url } = req.query;

        if (!url) {
          return res.status(400).json({
            success: false,
            error: { message: 'URL query parameter is required', code: 'MISSING_URL' },
          });
        }

        const fingerprint = URLFingerprint.generate(url as string);
        const normalized = URLFingerprint.normalize(url as string);

        res.json({
          success: true,
          data: {
            originalUrl: url,
            normalizedUrl: normalized,
            fingerprint,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}