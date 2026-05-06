import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { enqueueRun } from '../workers/queues';
import { RunService } from '../services/RunService';

const router = Router();
router.use(authenticate);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_REGEX.test(value);
}

const CreateActorSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  runtime: z.enum(['node18', 'python310', 'playwright', 'custom']).default('node18'),
  status: z.enum(['draft', 'active']).default('active'),
  inputSchema: z.record(z.any()).optional().default({}),
  sourceCode: z.string().optional(),
  dockerImage: z.string().optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  defaultRunOptions: z.object({
    memoryMbytes: z.number().default(512),
    timeoutSecs: z.number().default(3600),
  }).default({}),
});

const RunActorSchema = z.object({
  input: z.record(z.any()).default({}),
  options: z.object({
    memoryMbytes: z.number().min(128).max(32768).default(512),
    timeoutSecs: z.number().min(10).max(86400).default(3600),
    proxyGroupId: z.string().uuid().optional(),
    webhookUrl: z.string().url().optional(),
  }).default({}),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', status, search, isPublic } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE (a.org_id = $1::uuid';
    const params: any[] = [req.user!.orgId];
    if (isPublic === 'true') {
      whereClause += ' OR a.is_public = true)';
    } else {
      whereClause += ')';
    }
    if (status) {
      params.push(status);
      whereClause += ` AND a.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (a.name ILIKE $${params.length} OR a.description ILIKE $${params.length})`;
    }
    const countResult = await db.query(`SELECT COUNT(*) FROM actors a ${whereClause}`, params);
    params.push(parseInt(limit), offset);
    const result = await db.query(
      `SELECT a.id, a.name, a.slug, a.description, a.version, a.status, a.is_public, a.runtime, a.tags, a.total_runs, a.avg_duration_secs, a.created_at, a.updated_at, u.name as owner_name
       FROM actors a JOIN users u ON a.owner_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: result.rows, meta: { total: parseInt(countResult.rows[0].count), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)) } });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateActorSchema.parse(req.body);
    const countResult = await db.query(`SELECT COUNT(*) FROM actors WHERE org_id = $1::uuid AND status != 'archived'`, [req.user!.orgId]);
    const orgResult = await db.query('SELECT max_actors FROM organizations WHERE id = $1::uuid', [req.user!.orgId]);
    if (parseInt(countResult.rows[0].count) >= orgResult.rows[0].max_actors) {
      throw new AppError('Actor limit reached for your plan', 402);
    }
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const result = await db.query(
      `INSERT INTO actors (org_id, owner_id, name, slug, description, runtime, input_schema, source_code, docker_image, is_public, tags, default_run_options, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [req.user!.orgId, req.user!.userId, body.name, slug, body.description, body.runtime, JSON.stringify(body.inputSchema), body.sourceCode, body.dockerImage, body.isPublic, body.tags, JSON.stringify(body.defaultRunOptions), body.status]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.get('/:idOrSlug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idOrSlug } = req.params;
    const lookupField = isUuid(idOrSlug) ? 'a.id' : 'a.slug';
    const result = await db.query(
      `SELECT a.*, u.name as owner_name, u.email as owner_email, o.name as org_name
       FROM actors a JOIN users u ON a.owner_id = u.id JOIN organizations o ON a.org_id = o.id
       WHERE ${lookupField} = $1 AND (a.org_id = $2::uuid OR a.is_public = true)`,
      [idOrSlug, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Actor not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const allowed = ['name', 'description', 'sourceCode', 'inputSchema', 'isPublic', 'tags', 'status', 'defaultRunOptions', 'readme', 'category'];
    const updates: Record<string, any> = {};
    const columnMap: Record<string, string> = { sourceCode: 'source_code', inputSchema: 'input_schema', isPublic: 'is_public', defaultRunOptions: 'default_run_options' };
    for (const key of allowed) {
      if (key in req.body) updates[columnMap[key] || key] = req.body[key];
    }
    if (!Object.keys(updates).length) throw new AppError('No valid fields to update', 400);
    const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 3}`).join(', ');
    const result = await db.query(
      `UPDATE actors SET ${setClause}, updated_at = NOW() WHERE id = $1::uuid AND org_id = $2::uuid RETURNING *`,
      [req.params.id, req.user!.orgId, ...Object.values(updates)]
    );
    if (!result.rows.length) throw new AppError('Actor not found', 404);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `UPDATE actors SET status = 'archived', updated_at = NOW() WHERE id = $1::uuid AND org_id = $2::uuid RETURNING id`,
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Actor not found', 404);
    res.json({ success: true, data: { message: 'Actor archived' } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { input, options } = RunActorSchema.parse(req.body);
    const lookupField = isUuid(req.params.id) ? 'id' : 'slug';
    const actorResult = await db.query(
      `SELECT * FROM actors WHERE ${lookupField} = $1 AND (org_id = $2::uuid OR is_public = true)`,
      [req.params.id, req.user!.orgId]
    );
    if (!actorResult.rows.length) throw new AppError('Actor not found', 404);
    const actor = actorResult.rows[0];
    if (actor.status !== 'active' && actor.status !== 'draft') {
      throw new AppError('Actor is not available for runs', 400);
    }
    const run = await RunService.createRun({
      actorId: actor.id,
      orgId: req.user!.orgId,
      userId: req.user!.userId,
      input,
      options: { memoryMbytes: options.memoryMbytes, timeoutSecs: options.timeoutSecs, proxyGroupId: options.proxyGroupId, dockerImage: actor.docker_image },
    });
    await enqueueRun({
      runId: run.id, actorId: actor.id, actorSlug: actor.slug, orgId: req.user!.orgId, userId: req.user!.userId, input,
      options: { memoryMbytes: options.memoryMbytes, timeoutSecs: options.timeoutSecs, dockerImage: actor.docker_image, proxyGroupId: options.proxyGroupId },
    });
    res.status(201).json({ success: true, data: run });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', status } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE r.actor_id = $1::uuid AND r.org_id = $2::uuid';
    const params: any[] = [req.params.id, req.user!.orgId];
    if (status) {
      params.push(status);
      whereClause += ` AND r.status = $${params.length}`;
    }
    const result = await db.query(
      `SELECT r.id, r.status, r.started_at, r.finished_at, r.duration_secs, r.compute_units, r.stats, r.error_message, r.created_at, r.dataset_id, r.key_value_store_id
       FROM runs r ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, parseInt(limit), offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
