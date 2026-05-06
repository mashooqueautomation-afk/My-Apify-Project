import { db } from '../db/pool';
import { redis } from '../db/redis';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { enqueueWebhook } from '../workers/queues';

export interface CreateRunOptions {
  actorId: string; orgId: string; userId?: string; taskId?: string;
  input: Record<string, any>;
  options: { memoryMbytes: number; timeoutSecs: number; dockerImage?: string; proxyGroupId?: string };
}

export class RunService {
  static async createRun(opts: CreateRunOptions) {
    return db.transaction(async (client) => {
      const concurrentResult = await client.query(
        `SELECT COUNT(*)::int as count FROM runs WHERE org_id = $1::uuid AND status IN ('queued', 'running')`,
        [opts.orgId]
      );
      const orgResult = await client.query('SELECT max_concurrent_runs FROM organizations WHERE id = $1::uuid', [opts.orgId]);
      const current = parseInt(concurrentResult.rows[0].count) || 0;
      const max = orgResult.rows[0].max_concurrent_runs;
      if (current >= max) throw new AppError(`Concurrent run limit reached (${max})`, 429, { code: 'CONCURRENT_LIMIT_REACHED' });

      const datasetResult = await client.query(`INSERT INTO datasets (org_id) VALUES ($1::uuid) RETURNING id`, [opts.orgId]);
      const kvsResult = await client.query(`INSERT INTO key_value_stores (org_id) VALUES ($1::uuid) RETURNING id`, [opts.orgId]);
      await client.query(`INSERT INTO request_queues (org_id) VALUES ($1::uuid) RETURNING id`, [opts.orgId]);

      const runResult = await client.query(
        `INSERT INTO runs (actor_id, org_id, user_id, task_id, input, run_options, status, memory_mb, timeout_secs, dataset_id, key_value_store_id, log_store_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::jsonb, $6::jsonb, 'queued', $7, $8, $9::uuid, $10::uuid, $10::uuid) RETURNING *`,
        [opts.actorId, opts.orgId, opts.userId || null, opts.taskId || null, JSON.stringify(opts.input), JSON.stringify(opts.options),
          opts.options.memoryMbytes, opts.options.timeoutSecs, datasetResult.rows[0].id, kvsResult.rows[0].id]
      );

      await client.query('UPDATE actors SET total_runs = total_runs + 1 WHERE id = $1::uuid', [opts.actorId]);
      return runResult.rows[0];
    });
  }

  static async getRunById(runId: string, orgId: string) {
    const result = await db.query(
      `SELECT r.*, a.name as actor_name FROM runs r JOIN actors a ON r.actor_id = a.id WHERE r.id = $1::uuid AND r.org_id = $2::uuid`,
      [runId, orgId]
    );
    return result.rows[0] || null;
  }

  static async abortRun(runId: string, orgId: string): Promise<boolean> {
    await redis.publish('run:abort', JSON.stringify({ runId }));
    const result = await db.query(
      `UPDATE runs SET status = 'aborted', finished_at = NOW(), error_message = 'Aborted by user'
       WHERE id = $1::uuid AND org_id = $2::uuid AND status IN ('queued', 'running') RETURNING id`,
      [runId, orgId]
    );
    return result.rows.length > 0;
  }

  static async updateRunStatus(runId: string, status: string, extra: Record<string, any> = {}): Promise<void> {
    const setClauses: string[] = [`status = '${status}'`];
    const params: any[] = [];
    if (extra.errorMessage) { params.push(extra.errorMessage); setClauses.push(`error_message = $${params.length}`); }
    if (extra.stats) { params.push(JSON.stringify(extra.stats)); setClauses.push(`stats = $${params.length}::jsonb`); }
    if (extra.exitCode !== undefined) { params.push(extra.exitCode); setClauses.push(`exit_code = $${params.length}`); }
    if (extra.computeUnits !== undefined) { params.push(extra.computeUnits); setClauses.push(`compute_units = $${params.length}`); }
    if (status === 'running') setClauses.push('started_at = NOW()');
    if (['succeeded', 'failed', 'aborted', 'timeout'].includes(status)) {
      setClauses.push('finished_at = NOW()');
      setClauses.push(`duration_secs = EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at)))::INTEGER`);
    }
    params.push(runId);
    await db.query(`UPDATE runs SET ${setClauses.join(', ')} WHERE id = $${params.length}::uuid`, params);
    if (['succeeded', 'failed', 'aborted'].includes(status)) {
      RunService.fireWebhooks(runId, status).catch((e) => logger.error('Webhook fire error:', e));
      if (status === 'succeeded') {
        await db.query(
          `UPDATE actors SET success_runs = success_runs + 1, avg_duration_secs = (SELECT AVG(duration_secs) FROM runs WHERE actor_id = actors.id AND status = 'succeeded')
           FROM runs WHERE runs.id = $1::uuid AND actors.id = runs.actor_id`,
          [runId]
        ).catch(() => {});
      }
    }
  }

  static async fireWebhooks(runId: string, event: string): Promise<void> {
    const runResult = await db.query('SELECT actor_id, task_id, org_id FROM runs WHERE id = $1::uuid', [runId]);
    if (!runResult.rows.length) return;
    const run = runResult.rows[0];
    const webhooks = await db.query(
      `SELECT id, url, headers, secret FROM webhooks WHERE org_id = $1::uuid AND is_active = true
       AND (actor_id = $2::uuid OR task_id = $3::uuid OR (actor_id IS NULL AND task_id IS NULL)) AND $4 = ANY(events)`,
      [run.org_id, run.actor_id, run.task_id, `run.${event}`]
    );
    for (const wh of webhooks.rows) {
      await enqueueWebhook({
        webhookId: wh.id, url: wh.url, event: `run.${event}`,
        payload: { runId, actorId: run.actor_id, event: `run.${event}` },
        secret: wh.secret, headers: wh.headers,
      });
    }
  }

  static async getLogs(runId: string, offset = 0): Promise<string[]> {
    return redis.lrange(`run:logs:${runId}`, offset, -1);
  }
}