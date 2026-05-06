import * as crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { db } from '../db/pool';
import { AppError } from '../utils/AppError';
import { WebhookService } from '../services/WebhookService';

const router = Router();
router.use(authenticate);

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  actorId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  events: z.array(z.string()).default(['campaign.completed', 'campaign.failed']),
  headers: z.record(z.string()).default({}),
  secret: z.string().optional(),
  isActive: z.boolean().default(true),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT w.*, a.name as campaign_name
       FROM webhooks w
       LEFT JOIN actors a ON a.id = w.actor_id
       WHERE w.org_id = $1
       ORDER BY w.created_at DESC`,
      [req.user!.orgId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `SELECT id, webhook_id, event, target_url, response_status, success, created_at, payload
       FROM webhook_deliveries
       WHERE org_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user!.orgId]
    ).catch(() => ({ rows: [] }));
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateWebhookSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO webhooks (org_id, actor_id, task_id, url, events, headers, secret, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user!.orgId,
        body.actorId || null,
        body.taskId || null,
        body.url,
        body.events,
        JSON.stringify(body.headers),
        body.secret || crypto.randomBytes(24).toString('hex'),
        body.isActive,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.query(
      `SELECT id FROM webhooks WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.orgId]
    );
    if (!existing.rows.length) throw new AppError('Webhook not found', 404);

    const allowed = ['url', 'events', 'headers', 'secret', 'is_active'];
    const updates = Object.entries(req.body || {}).filter(([key]) => allowed.includes(key));
    if (!updates.length) throw new AppError('Nothing to update', 400);

    const values: any[] = [req.params.id, req.user!.orgId];
    const setClause = updates.map(([key, value]) => {
      values.push(key === 'headers' ? JSON.stringify(value) : value);
      return `${key} = $${values.length}`;
    }).join(', ');

    const result = await db.query(
      `UPDATE webhooks SET ${setClause}
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query(
      `DELETE FROM webhooks WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, req.user!.orgId]
    );
    if (!result.rows.length) throw new AppError('Webhook not found', 404);
    res.json({ success: true, data: { message: 'Webhook deleted' } });
  } catch (error) {
    next(error);
  }
});

router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, secret, campaignId } = req.body || {};
    if (!url) throw new AppError('Webhook URL is required', 400);

    const payload = {
      event: 'campaign.completed',
      timestamp: new Date().toISOString(),
      campaignId: campaignId || null,
      campaignName: 'Mash Lead Scrapping Demo Campaign',
      runId: crypto.randomUUID(),
      recordCount: 25,
      duration_seconds: 42,
      success_rate: 99.1,
      sourceUrls: ['https://example.com'],
      data: [
        {
          company_name: 'Acme Inc',
          email: 'hello@acme.test',
          website: 'https://acme.test',
        },
      ],
      metadata: {
        scrape_rate: '0.6 items/sec',
        errors: 0,
        warnings: 0,
        data_quality: 99.1,
      },
    };

    await WebhookService.deliver(
      'test',
      url,
      'campaign.completed',
      payload,
      secret,
      {},
      req.user!.orgId
    );

    res.json({ success: true, data: { message: 'Test webhook delivered' } });
  } catch (error) {
    next(error);
  }
});

export default router;
