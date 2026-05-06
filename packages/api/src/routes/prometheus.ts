import { Request, Response, Router } from 'express';
import { db } from '../db/pool';
import { redis } from '../db/redis';
import { logger } from '../utils/logger';

const router = Router();

// ─── Simple Prometheus text format serializer ─────────────────────────────────
function gauge(name: string, help: string, value: number | string, labels: Record<string, string> = {}): string {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const metric = labelStr ? `${name}{${labelStr}}` : name;
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${metric} ${value}\n`;
}

function counter(name: string, help: string, value: number, labels: Record<string, string> = {}): string {
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
  const metric = labelStr ? `${name}{${labelStr}}` : name;
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${metric} ${value}\n`;
}

// ─── GET /metrics (Prometheus format) ────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const startMs = Date.now();

  try {
    // Gather all metrics in parallel
    const [
      runStats,
      actorStats,
      datasetStats,
      redisInfo,
      queueDepths,
    ] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'running')   AS running,
          COUNT(*) FILTER (WHERE status = 'queued')    AS queued,
          COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded,
          COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
          COUNT(*) FILTER (WHERE status = 'aborted')   AS aborted,
          COUNT(*) FILTER (WHERE status = 'timeout')   AS timeout,
          AVG(duration_secs) FILTER (WHERE status = 'succeeded' AND created_at > NOW() - INTERVAL '1 hour') AS avg_duration_1h,
          SUM(compute_units) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')  AS cu_24h
        FROM runs
      `),
      db.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'active') AS active
        FROM actors
      `),
      db.query(`
        SELECT COUNT(*) AS total_datasets,
               COALESCE(SUM(item_count), 0) AS total_items,
               COALESCE(SUM(size_bytes), 0) AS total_bytes
        FROM datasets
      `),
      redis.info('stats').catch(() => ''),
      Promise.all([
        redis.llen('bull:actor-run:wait').catch(() => 0),
        redis.llen('bull:actor-run:active').catch(() => 0),
        redis.llen('bull:actor-run:failed').catch(() => 0),
        redis.llen('bull:webhook:wait').catch(() => 0),
      ]),
    ]);

    const runs     = runStats.rows[0];
    const actors   = actorStats.rows[0];
    const datasets = datasetStats.rows[0];

    // Parse Redis memory usage
    const redisMemMatch = redisInfo.match?.(/used_memory:(\d+)/);
    const redisMem = redisMemMatch ? parseInt(redisMemMatch[1]) : 0;

    const [runQueueWaiting, runQueueActive, runQueueFailed, webhookWaiting] = queueDepths;

    const scrapeStart = Date.now();
    let output = '';

    // ── Process metrics ──────────────────────────────────────────────────────
    output += gauge('webminer_runs_active',    'Currently running actor runs',    parseInt(runs.running)   || 0);
    output += gauge('webminer_runs_queued',    'Actor runs waiting in queue',     parseInt(runs.queued)    || 0);
    output += gauge('webminer_runs_succeeded', 'Total succeeded runs (all time)', parseInt(runs.succeeded) || 0);
    output += gauge('webminer_runs_failed',    'Total failed runs (all time)',     parseInt(runs.failed)    || 0);
    output += gauge('webminer_runs_aborted',   'Total aborted runs',              parseInt(runs.aborted)   || 0);
    output += gauge('webminer_runs_timeout',   'Total timed-out runs',            parseInt(runs.timeout)   || 0);

    output += gauge('webminer_run_avg_duration_seconds_1h',
      'Average run duration (last 1 hour)',
      runs.avg_duration_1h ? parseFloat(runs.avg_duration_1h).toFixed(2) : 0
    );

    output += gauge('webminer_compute_units_24h',
      'Compute units consumed in last 24h',
      runs.cu_24h ? parseFloat(runs.cu_24h).toFixed(4) : 0
    );

    // ── Actor metrics ────────────────────────────────────────────────────────
    output += gauge('webminer_actors_total',  'Total actors registered', parseInt(actors.total)  || 0);
    output += gauge('webminer_actors_active', 'Active actors',           parseInt(actors.active) || 0);

    // ── Storage metrics ──────────────────────────────────────────────────────
    output += gauge('webminer_datasets_total',      'Total datasets',          parseInt(datasets.total_datasets) || 0);
    output += gauge('webminer_dataset_items_total', 'Total dataset items',     parseInt(datasets.total_items)    || 0);
    output += gauge('webminer_dataset_bytes_total', 'Total dataset size bytes',parseInt(datasets.total_bytes)    || 0);

    // ── Queue metrics ────────────────────────────────────────────────────────
    output += gauge('webminer_queue_run_waiting',     'Actor run queue depth (waiting)',     runQueueWaiting);
    output += gauge('webminer_queue_run_active',      'Actor run queue depth (active)',      runQueueActive);
    output += gauge('webminer_queue_run_failed',      'Actor run queue failed jobs',         runQueueFailed);
    output += gauge('webminer_queue_webhook_waiting', 'Webhook queue depth (waiting)',       webhookWaiting);

    // ── Infrastructure metrics ────────────────────────────────────────────────
    output += gauge('webminer_redis_memory_bytes', 'Redis memory usage in bytes', redisMem);
    output += gauge('webminer_api_scrape_duration_seconds',
      'Time to collect metrics',
      ((Date.now() - scrapeStart) / 1000).toFixed(3)
    );

    // ── Node.js process metrics ───────────────────────────────────────────────
    const mem = process.memoryUsage();
    output += gauge('webminer_api_memory_heap_used_bytes',  'API heap used bytes',  mem.heapUsed);
    output += gauge('webminer_api_memory_heap_total_bytes', 'API heap total bytes', mem.heapTotal);
    output += gauge('webminer_api_memory_rss_bytes',        'API RSS bytes',        mem.rss);
    output += gauge('webminer_api_uptime_seconds',          'API process uptime',   Math.round(process.uptime()));

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(output);

  } catch (err) {
    logger.error('Metrics collection error:', err);
    res.status(500).send('# Error collecting metrics\n');
  }
});

// ─── GET /metrics/health (JSON — for load balancers) ─────────────────────────
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [dbOk, redisOk] = await Promise.all([
      db.query('SELECT 1').then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
    ]);

    const status = dbOk && redisOk ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      services: {
        postgres: dbOk    ? 'ok' : 'down',
        redis:    redisOk ? 'ok' : 'down',
      },
      memory: {
        heapUsedMb:  Math.round(process.memoryUsage().heapUsed  / 1024 / 1024),
        heapTotalMb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rssMb:       Math.round(process.memoryUsage().rss       / 1024 / 1024),
      },
    });
  } catch (err) {
    res.status(503).json({ status: 'error', error: String(err) });
  }
});

export default router;
