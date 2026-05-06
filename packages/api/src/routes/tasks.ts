import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { enqueueRun } from '../workers/queues';
import { RunService } from '../services/RunService';

const router = Router();
router.use(authenticate);

const CreateTaskSchema = z.object({
  actorId: z.string().uuid(),
  name: z.string().min(2).max(255),
  input: z.record(z.any()).default({}),
  runOptions: z.object({
    memoryMbytes: z.number().default(512),
    timeoutSecs: z.number().default(3600),
  }).default({}),
  cronExpr: z.string().optional(),
  timezone: z.string().default('UTC'),
});

// ─── GET /api/v1/tasks ────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT t.*, a.name as actor_name, a.slug as actor_slug
       FROM tasks t JOIN actors a ON t.actor_id = a.id
       WHERE t.org_id = $1 AND t.status != 'archived'
       ORDER BY t.created_at DESC`,
      [req.user!.orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/tasks ───────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateTaskSchema.parse(req.body);

    // Validate actor belongs to org
    const actorRes = await db.query(
      'SELECT id FROM actors WHERE id = $1 AND org_id = $2',
      [body.actorId, req.user!.orgId]
    );
    if (!actorRes.rows.length) throw new AppError('Actor not found', 404);

    const slug = body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    // Calculate next run from cron
    let nextRunAt: string | null = null;
    if (body.cronExpr) {
      const { getNextCronDate } = await import('../utils/cron');
      nextRunAt = getNextCronDate(body.cronExpr, body.timezone).toISOString();
    }

    const result = await db.query(
      `INSERT INTO tasks (actor_id, org_id, owner_id, name, slug, input, run_options, cron_expr, timezone, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        body.actorId, req.user!.orgId, req.user!.userId,
        body.name, slug, JSON.stringify(body.input),
        JSON.stringify(body.runOptions), body.cronExpr || null,
        body.timezone, nextRunAt,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/tasks/:id ───────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT t.*, a.name as actor_name FROM tasks t JOIN actors a ON t.actor_id = a.id
       WHERE t.id = $1 AND t.org_id = $2`,
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Task not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ─── PATCH /api/v1/tasks/:id ─────────────────────────────────────────────────
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, input, runOptions, cronExpr, timezone, status } = req.body;
    const updates: Record<string, any> = {};

    if (name) updates.name = name;
    if (input) updates.input = JSON.stringify(input);
    if (runOptions) updates.run_options = JSON.stringify(runOptions);
    if (timezone) updates.timezone = timezone;
    if (status) updates.status = status;

    if (cronExpr !== undefined) {
      updates.cron_expr = cronExpr || null;
      if (cronExpr) {
        const { getNextCronDate } = await import('../utils/cron');
        updates.next_run_at = getNextCronDate(cronExpr, timezone || 'UTC').toISOString();
      } else {
        updates.next_run_at = null;
      }
    }

    if (!Object.keys(updates).length) throw new AppError('Nothing to update', 400);

    const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(', ');
    const result = await db.query(
      `UPDATE tasks SET ${setClause}, updated_at = NOW()
       WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.user!.orgId, ...Object.values(updates)]
    );
    if (!result.rows.length) throw new AppError('Task not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/tasks/:id/run ──────────────────────────────────────────────
router.post('/:id/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskRes = await db.query(
      `SELECT t.*, a.docker_image FROM tasks t JOIN actors a ON t.actor_id = a.id
       WHERE t.id = $1 AND t.org_id = $2`,
      [req.params.id, req.user!.orgId]
    );
    if (!taskRes.rows.length) throw new AppError('Task not found', 404);
    const task = taskRes.rows[0];

    const inputOverride = req.body.input || {};
    const mergedInput = { ...task.input, ...inputOverride };

    const run = await RunService.createRun({
      actorId: task.actor_id,
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      taskId: task.id,
      input: mergedInput,
      options: {
        memoryMbytes: task.run_options.memoryMbytes || 512,
        timeoutSecs: task.run_options.timeoutSecs || 3600,
        dockerImage: task.docker_image,
      },
    });

    await enqueueRun({
      runId: run.id,
      actorId: task.actor_id,
      actorSlug: task.slug,
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      input: mergedInput,
      options: run.run_options,
    });

    // Update task last/next run
    const { getNextCronDate } = await import('../utils/cron');
    const nextRun = task.cron_expr
      ? getNextCronDate(task.cron_expr, task.timezone).toISOString()
      : null;

    await db.query(
      `UPDATE tasks SET last_run_at = NOW(), next_run_at = $1,
       total_runs = total_runs + 1 WHERE id = $2`,
      [nextRun, task.id]
    );

    res.status(201).json({ success: true, data: run });
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/tasks/:id ────────────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query(
      `UPDATE tasks SET status = 'archived' WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.orgId]
    );
    res.json({ success: true, data: { message: 'Task archived' } });
  } catch (err) { next(err); }
});

export default router;
