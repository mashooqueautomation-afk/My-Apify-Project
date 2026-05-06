import 'dotenv/config';
import cron from 'node-cron';
import axios from 'axios';
import { Pool } from 'pg';
import IORedis from 'ioredis';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL)
  : new IORedis({ host: 'localhost', port: 6379 });

const API_URL = process.env.API_URL || 'http://api:3000';
const SCHEDULER_TOKEN = process.env.SCHEDULER_TOKEN || 'internal-scheduler-token';
const STARTUP_RETRIES = parseInt(process.env.STARTUP_RETRIES || '30', 10);
const STARTUP_RETRY_DELAY_MS = parseInt(process.env.STARTUP_RETRY_DELAY_MS || '2000', 10);

function log(level: string, msg: string, ...rest: any[]) {
  console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`, ...rest);
}

/**
 * Find all tasks due to run and trigger them via API
 */
async function processDueTasks(): Promise<void> {
  const result = await pool.query(
    `SELECT t.id, t.actor_id, t.org_id, t.input, t.run_options, t.cron_expr,
            t.timezone, t.next_run_at, a.docker_image
     FROM tasks t
     JOIN actors a ON t.actor_id = a.id
     WHERE t.status = 'active'
       AND t.cron_expr IS NOT NULL
       AND t.next_run_at <= NOW()
       AND t.next_run_at >= NOW() - INTERVAL '5 minutes'`
  );

  if (!result.rows.length) return;

  log('info', `Found ${result.rows.length} due tasks`);

  for (const task of result.rows) {
    // Distributed lock — prevent double-execution
    const lockKey = `scheduler:lock:task:${task.id}`;
    const acquired = await redis.set(lockKey, '1', 'EX', 300, 'NX');
    if (!acquired) {
      log('debug', `Task ${task.id} already being processed (lock held)`);
      continue;
    }

    try {
      log('info', `Triggering task: ${task.id}`);

      await axios.post(
        `${API_URL}/api/v1/tasks/${task.id}/run`,
        { input: {} },
        {
          headers: {
            Authorization: `Bearer ${SCHEDULER_TOKEN}`,
            'X-Internal-Scheduler': '1',
          },
          timeout: 10_000,
        }
      );

      log('info', `Task ${task.id} triggered successfully`);
    } catch (err: any) {
      log('error', `Failed to trigger task ${task.id}:`, err.message);
      // Release lock so it can retry
      await redis.del(lockKey);
    }
  }
}

/**
 * Clean up stale runs stuck in 'running' state (worker crash recovery)
 */
async function recoverStalledRuns(): Promise<void> {
  const result = await pool.query(
    `UPDATE runs
     SET status = 'failed',
         finished_at = NOW(),
         error_message = 'Run stalled — worker may have crashed'
     WHERE status = 'running'
       AND started_at < NOW() - INTERVAL '2 hours'
       AND timeout_secs < 7200
     RETURNING id`
  );

  if (result.rows.length) {
    log('warn', `Recovered ${result.rows.length} stalled runs`);
  }
}

/**
 * Clean up old completed runs and their Redis logs
 */
async function cleanupOldData(): Promise<void> {
  // Remove Redis logs for runs older than 7 days
  const oldRuns = await pool.query(
    `SELECT id FROM runs
     WHERE status IN ('succeeded', 'failed', 'aborted')
       AND finished_at < NOW() - INTERVAL '7 days'
     LIMIT 100`
  );

  for (const run of oldRuns.rows) {
    await redis.del(`run:logs:${run.id}`);
  }

  if (oldRuns.rows.length) {
    log('debug', `Cleaned ${oldRuns.rows.length} old run logs`);
  }
}

/**
 * Aggregate daily usage metrics
 */
async function aggregateMetrics(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const today = new Date(yesterday);
  today.setDate(today.getDate() + 1);

  const orgsResult = await pool.query('SELECT id FROM organizations');

  for (const org of orgsResult.rows) {
    const metrics = await pool.query(
      `SELECT
         COUNT(*) as runs_count,
         COALESCE(SUM(compute_units), 0) as compute_units
       FROM runs
       WHERE org_id = $1
         AND created_at >= $2 AND created_at < $3`,
      [org.id, yesterday, today]
    );

    if (parseInt(metrics.rows[0].runs_count) > 0) {
      await pool.query(
        `INSERT INTO usage_metrics (org_id, period_start, period_end, compute_units, runs_count)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [
          org.id, yesterday, today,
          metrics.rows[0].compute_units,
          metrics.rows[0].runs_count,
        ]
      ).catch(() => {});
    }
  }
}

// ─── Cron Jobs ────────────────────────────────────────────────────────────────
async function main() {
  log('info', '⏰ WebMiner Scheduler starting...');

  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      log('info', '✅ PostgreSQL connected');

      await redis.ping();
      log('info', '✅ Redis connected');
      break;
    } catch (err: any) {
      const isLastAttempt = attempt === STARTUP_RETRIES;
      log('error', `Scheduler dependency check ${attempt}/${STARTUP_RETRIES} failed:`, err.message);
      if (isLastAttempt) throw err;
      await new Promise((resolve) => setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
    }
  }

  // Poll for due tasks every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    await processDueTasks().catch(e => log('error', 'Task polling error:', e.message));
  });

  // Recover stalled runs every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    await recoverStalledRuns().catch(e => log('error', 'Stall recovery error:', e.message));
  });

  // Cleanup old data every hour
  cron.schedule('0 * * * *', async () => {
    await cleanupOldData().catch(e => log('error', 'Cleanup error:', e.message));
  });

  // Aggregate metrics daily at midnight
  cron.schedule('0 0 * * *', async () => {
    await aggregateMetrics().catch(e => log('error', 'Metrics aggregation error:', e.message));
  });

  log('info', '🚀 Scheduler running — checking every 30s for due tasks');

  process.on('SIGTERM', async () => {
    log('info', 'SIGTERM received');
    await pool.end();
    await redis.quit();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Scheduler failed:', err);
  process.exit(1);
});
