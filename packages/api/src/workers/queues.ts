import { Queue, QueueEvents, Worker, Job } from 'bullmq';
import { createRedisConnection } from '../db/redis';
import { logger } from '../utils/logger';
import { db } from '../db/pool';
import { WebhookService } from '../services/WebhookService';

// ─── Queue names ──────────────────────────────────────────────────────────────
export const QUEUES = {
  ACTOR_RUN: 'actor-run',
  WEBHOOK: 'webhook',
  BUILD: 'actor-build',
  CLEANUP: 'cleanup',
  METRICS: 'metrics',
} as const;

// ─── Queue instances (API only publishes, worker consumes) ────────────────────
let runQueue: Queue;
let webhookQueue: Queue;
let buildQueue: Queue;

export async function setupQueues() {
  const connection = createRedisConnection();

  runQueue = new Queue(QUEUES.ACTOR_RUN, {
    connection,
    defaultJobOptions: {
      attempts: 1,              // actor runs do NOT retry by default (user-controlled)
      removeOnComplete: { count: 100, age: 24 * 3600 },
      removeOnFail: { count: 500, age: 7 * 24 * 3600 },
    },
  });

  webhookQueue = new Queue(QUEUES.WEBHOOK, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 200 },
    },
  });

  buildQueue = new Queue(QUEUES.BUILD, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
    },
  });

  // Listen to run queue events to update DB status
  const runEvents = new QueueEvents(QUEUES.ACTOR_RUN, {
    connection: createRedisConnection(),
  });

  runEvents.on('completed', async ({ jobId }) => {
    logger.info(`Run job completed: ${jobId}`);
  });

  runEvents.on('failed', async ({ jobId, failedReason }) => {
    logger.error(`Run job failed: ${jobId} - ${failedReason}`);
    // Mark run as failed in DB
    await db.query(
      `UPDATE runs SET status = 'failed', error_message = $1, finished_at = NOW() WHERE id = $2`,
      [failedReason, jobId]
    ).catch((e) => logger.error('DB update error:', e));
  });

  runEvents.on('active', async ({ jobId }) => {
    await db.query(
      `UPDATE runs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [jobId]
    ).catch((e) => logger.error('DB update error:', e));
  });

  logger.info('BullMQ queues initialized:', Object.values(QUEUES));
}

// ─── Queue API ────────────────────────────────────────────────────────────────

export function getRunQueue(): Queue {
  if (!runQueue) throw new Error('Queues not initialized');
  return runQueue;
}

export function getWebhookQueue(): Queue {
  if (!webhookQueue) throw new Error('Queues not initialized');
  return webhookQueue;
}

export function getBuildQueue(): Queue {
  if (!buildQueue) throw new Error('Queues not initialized');
  return buildQueue;
}

// ─── Enqueue a new actor run ──────────────────────────────────────────────────

export interface RunJobData {
  runId: string;
  actorId: string;
  actorSlug: string;
  orgId: string;
  userId?: string;
  input: Record<string, any>;
  options: {
    memoryMbytes: number;
    timeoutSecs: number;
    dockerImage?: string;
    proxyGroupId?: string;
  };
}

export async function enqueueRun(data: RunJobData, delayMs = 0): Promise<Job> {
  const queue = getRunQueue();
  return queue.add('run', data, {
    jobId: data.runId,
    priority: 1,
    delay: delayMs,
  });
}

// ─── Enqueue webhook fire ─────────────────────────────────────────────────────

export interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: Record<string, any>;
  secret?: string;
  headers?: Record<string, string>;
}

export async function enqueueWebhook(data: WebhookJobData): Promise<void> {
  await getWebhookQueue().add('fire', data);
}
