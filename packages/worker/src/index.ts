import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { logger } from './utils/logger';
import { db } from './db/pool';
import { redis, createRedisConnection } from './db/redis';
import { ActorExecutor } from './executors/ActorExecutor';
import { WebhookWorker } from './executors/WebhookWorker';
import { RunJobData } from './types';

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5');
const STARTUP_RETRIES = parseInt(process.env.STARTUP_RETRIES || '30', 10);
const STARTUP_RETRY_DELAY_MS = parseInt(process.env.STARTUP_RETRY_DELAY_MS || '2000', 10);

async function bootstrap() {
  logger.info(`🔧 Worker starting (concurrency: ${CONCURRENCY})`);

  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      await db.query('SELECT 1');
      logger.info('✅ PostgreSQL connected');
      await redis.ping();
      logger.info('✅ Redis connected');
      break;
    } catch (err) {
      const isLastAttempt = attempt === STARTUP_RETRIES;
      logger.error(`Worker dependency check ${attempt}/${STARTUP_RETRIES} failed:`, err);
      if (isLastAttempt) throw err;
      await new Promise((resolve) => setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
    }
  }

  // ─── Actor Run Worker ──────────────────────────────────────────────────────
  const runWorker = new Worker<RunJobData>(
    'actor-run',
    async (job: Job<RunJobData>) => {
      logger.info(`Processing run job: ${job.id} (actor: ${job.data.actorSlug})`);
      await ActorExecutor.execute(job);
    },
    {
      connection: createRedisConnection(),
      concurrency: CONCURRENCY,
      limiter: {
        max: CONCURRENCY,
        duration: 1000,
      },
    }
  );

  runWorker.on('completed', (job) => {
    logger.info(`✅ Run job completed: ${job.id}`);
  });

  runWorker.on('failed', (job, err) => {
    logger.error(`❌ Run job failed: ${job?.id}`, err.message);
  });

  runWorker.on('error', (err) => {
    logger.error('Run worker error:', err);
  });

  runWorker.on('stalled', (jobId) => {
    logger.warn(`⚠️ Run job stalled: ${jobId}`);
  });

  // ─── Webhook Worker ────────────────────────────────────────────────────────
  const webhookWorker = new Worker(
    'webhook',
    async (job) => {
      await WebhookWorker.fire(job.data);
    },
    {
      connection: createRedisConnection(),
      concurrency: 20,
    }
  );

  webhookWorker.on('failed', (job, err) => {
    logger.error(`Webhook failed: ${job?.id}`, err.message);
  });

  // ─── Abort signal subscription ─────────────────────────────────────────────
  await redis.subscribe('run:abort');
  redis.on('message', async (channel, message) => {
    if (channel === 'run:abort') {
      const { runId } = JSON.parse(message);
      logger.info(`Abort signal received for run: ${runId}`);
      await ActorExecutor.abortRun(runId);
    }
  });

  logger.info('🚀 Worker ready — listening for jobs...');

  // ─── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, closing workers...`);
    await runWorker.close();
    await webhookWorker.close();
    await db.end();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Worker bootstrap failed:', err);
  process.exit(1);
});
