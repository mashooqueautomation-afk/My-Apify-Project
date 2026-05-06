import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { RunService } from '../services/RunService';

const router = Router();
router.use(authenticate);

// ─── GET /api/v1/runs ─────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', status, actorId } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [req.user!.orgId];
    let where = 'WHERE r.org_id = $1';

    if (status) { params.push(status); where += ` AND r.status = $${params.length}`; }
    if (actorId) { params.push(actorId); where += ` AND r.actor_id = $${params.length}`; }

    const [countRes, runsRes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM runs r ${where}`, params),
      db.query(
        `SELECT r.id, r.status, r.started_at, r.finished_at, r.duration_secs,
                r.compute_units, r.stats, r.error_message, r.created_at,
                r.dataset_id, r.memory_mb, r.timeout_secs,
                a.name as actor_name, a.slug as actor_slug
         FROM runs r JOIN actors a ON r.actor_id = a.id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit), offset]
      ),
    ]);

    res.json({
      success: true,
      data: runsRes.rows,
      meta: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/runs/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await RunService.getRunById(req.params.id, req.user!.orgId);
    if (!run) throw new AppError('Run not found', 404);
    res.json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/runs/:id/abort ─────────────────────────────────────────────
router.post('/:id/abort', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const aborted = await RunService.abortRun(req.params.id, req.user!.orgId);
    if (!aborted) throw new AppError('Run not found or already finished', 404);
    res.json({ success: true, data: { message: 'Run abort signal sent' } });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/runs/:id/log ─────────────────────────────────────────────────
router.get('/:id/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const offset = parseInt(req.query.offset as string || '0');
    res.set('Cache-Control', 'no-store');

    // Check access
    const exists = await db.query(
      'SELECT id FROM runs WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!exists.rows.length) throw new AppError('Run not found', 404);

    const logs = await RunService.getLogs(req.params.id, offset);
    res.json({
      success: true,
      data: { items: logs, nextOffset: offset + logs.length },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/runs/:id/log/stream (SSE) ───────────────────────────────────
router.get('/:id/log/stream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const exists = await db.query(
      'SELECT id, status FROM runs WHERE id = $1 AND org_id = $2',
      [req.params.id, req.user!.orgId]
    );
    if (!exists.rows.length) throw new AppError('Run not found', 404);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let offset = 0;
    const send = async () => {
      const logs = await RunService.getLogs(req.params.id, offset);
      for (const line of logs) {
        res.write(`data: ${JSON.stringify({ line })}\n\n`);
        offset++;
      }
    };

    await send();
    const interval = setInterval(send, 1000);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });

    // Auto-close after run finishes (poll status)
    const checkFinished = setInterval(async () => {
      const statusRes = await db.query(
        "SELECT status FROM runs WHERE id = $1 AND status NOT IN ('queued', 'running')",
        [req.params.id]
      ).catch(() => null);

      if (statusRes?.rows.length) {
        await send(); // flush remaining logs
        res.write('event: done\ndata: {}\n\n');
        clearInterval(checkFinished);
        clearInterval(interval);
        res.end();
      }
    }, 3000);

  } catch (err) {
    next(err);
  }
});

export default router;
