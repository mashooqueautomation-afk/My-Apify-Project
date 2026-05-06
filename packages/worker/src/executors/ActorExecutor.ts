import { Job } from 'bullmq';
import Docker from 'dockerode';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { db } from '../db/pool';
import { redis } from '../db/redis';
import { logger } from '../utils/logger';
import { RunJobData } from '../types';
import { ProxyManager } from '../proxy/ProxyManager';

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock',
});

// Map of runId → container (for abort)
const activeContainers = new Map<string, Docker.Container>();

// Default Docker images per runtime
const RUNTIME_IMAGES: Record<string, string> = {
  node18:     'webminer/runtime-node18:latest',
  python310:  'webminer/runtime-python310:latest',
  playwright: 'webminer/runtime-playwright:latest',
  custom:     'node:20-alpine',  // fallback
};

function getMissingRuntimeImageMessage(runtime: string, image: string): string {
  return [
    `Runtime image not found for "${runtime}": ${image}`,
    'Build the runtime images before starting runs.',
    'Recommended command: npm run docker:build-runtimes',
  ].join('. ');
}

type ContainerRuntimeConfig = {
  apiUrl: string;
  extraHosts?: string[];
  networkMode?: string;
};

type StagedActorPaths = {
  entrypoint: string;
  inputPath: string;
};

async function ensureWritableStorageRoot(): Promise<string> {
  // Resolve storage path with proper absolute path
  const configured = process.env.STORAGE_PATH 
    ? path.resolve(process.env.STORAGE_PATH)
    : path.resolve(process.cwd(), '.mash-runtime', 'storage');
  
  const candidates = [
    configured,
    path.resolve(process.cwd(), '.mash-runtime', 'storage'),
    path.join(os.tmpdir(), 'mash-lead-scrapping', 'storage'),
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      logger.info(`Storage initialized at: ${candidate}`);
      return candidate;
    } catch (error) {
      lastError = error;
      logger.warn(`Storage path unavailable: ${candidate}`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No writable storage path available');
}

function rewriteApiUrlForHostAccess(apiUrl: string): string {
  try {
    const parsed = new URL(apiUrl);
    if (['api', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      parsed.hostname = 'host.docker.internal';
      let result = parsed.toString();
      // Remove trailing slash to prevent double slashes in URL construction
      return result.replace(/\/$/, '');
    }
  } catch (error) {
    logger.warn(`Invalid API URL configured for actor runtime fallback: ${apiUrl}`, error);
  }

  // Remove trailing slash before returning
  return apiUrl.replace(/\/$/, '');
}

async function resolveContainerRuntimeConfig(): Promise<ContainerRuntimeConfig> {
  const requestedNetwork = process.env.DOCKER_NETWORK || 'mash_lead_scrapping_network';
  const configuredApiUrl = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');

  try {
    const networks = await docker.listNetworks();
    const networkExists = networks.some((network) => network.Name === requestedNetwork);

    if (networkExists) {
      return {
        apiUrl: configuredApiUrl,
        networkMode: requestedNetwork,
      };
    }
  } catch (error) {
    logger.warn(`Unable to inspect Docker networks, falling back to bridge networking`, error);
  }

  const fallbackApiUrl = rewriteApiUrlForHostAccess(configuredApiUrl);
  logger.warn(
    `Docker network "${requestedNetwork}" not found. Falling back to bridge networking with API URL ${fallbackApiUrl}`
  );

  return {
    apiUrl: fallbackApiUrl,
    extraHosts: ['host.docker.internal:host-gateway'],
    networkMode: 'bridge',
  };
}

async function stageInlineActorBundle(runDir: string, sourceCode: string, runId: string): Promise<StagedActorPaths> {
  const actorRoot = path.join(runDir, 'actors');
  const actorEntryDir = path.join(actorRoot, 'current');
  const actorSdkDir = path.join(runDir, 'actor-sdk', 'src');

  await fs.mkdir(actorEntryDir, { recursive: true });
  await fs.mkdir(actorSdkDir, { recursive: true });

  await fs.cp(path.resolve(process.cwd(), 'src', 'actors', '_shared'), path.join(actorRoot, '_shared'), {
    recursive: true,
    force: true,
  });
  await fs.copyFile(
    path.resolve(process.cwd(), 'src', 'actors', 'anti-bot.js'),
    path.join(actorRoot, 'anti-bot.js')
  );
//   await fs.copyFile(
//     path.resolve(process.cwd(), '..', 'actor-sdk', 'src', 'index.js'),
//     path.join(actorSdkDir, 'index.js')
//   );
//   await fs.writeFile(path.join(actorEntryDir, 'main.js'), sourceCode);

  return {
    entrypoint: `/app/storage/runs/${runId}/actors/current/main.js`,
    inputPath: `/app/storage/runs/${runId}/INPUT.json`,
  };
}

export class ActorExecutor {
  static async execute(job: Job<RunJobData>): Promise<void> {
    const { runId, actorId, actorSlug, orgId, input, options } = job.data;
    const startTime = Date.now();

    logger.info(`[Run:${runId}] Starting actor: ${actorSlug}`);

    // ── Mark run as running ─────────────────────────────────────────────────
    await db.query(
      `UPDATE runs SET status = 'running', started_at = NOW() WHERE id = $1`,
      [runId]
    );

    // ── Fetch actor + run details ───────────────────────────────────────────
    const [actorRes, runRes] = await Promise.all([
      db.query('SELECT * FROM actors WHERE id = $1', [actorId]),
      db.query('SELECT * FROM runs WHERE id = $1', [runId]),
    ]);

    if (!actorRes.rows.length) throw new Error(`Actor ${actorId} not found`);

    const actor = actorRes.rows[0];
    const run = runRes.rows[0];

    const dockerImage = options.dockerImage || RUNTIME_IMAGES[actor.runtime] || RUNTIME_IMAGES.node18;
    const memoryBytes = (options.memoryMbytes || 512) * 1024 * 1024;
    const timeoutMs = (options.timeoutSecs || 3600) * 1000;

    // ── Setup working directory ────────────────────────────────────────────
    const storagePath = await ensureWritableStorageRoot();
    const runDir = path.join(storagePath, 'runs', runId);
    await fs.mkdir(runDir, { recursive: true });

    // Write input to file for container to read
    await fs.writeFile(path.join(runDir, 'INPUT.json'), JSON.stringify(input, null, 2));

    const stagedActor = actor.source_code
      ? await stageInlineActorBundle(runDir, actor.source_code, runId)
      : {
          entrypoint: '/app/src/main.js',
          inputPath: `/app/storage/runs/${runId}/INPUT.json`,
        };

    // ── Proxy config ────────────────────────────────────────────────────────
    let proxyUrl: string | undefined;
    if (options.proxyGroupId) {
      proxyUrl = await ProxyManager.getProxy(options.proxyGroupId, orgId);
    }

    const runtimeConfig = await resolveContainerRuntimeConfig();

    // ── Environment variables for container ─────────────────────────────────
    const env = [
      `WEBMINER_RUN_ID=${runId}`,
      `WEBMINER_ACTOR_ID=${actorId}`,
      `WEBMINER_ACTOR_SLUG=${actorSlug}`,
      `WEBMINER_INPUT_PATH=${stagedActor.inputPath}`,
      `WEBMINER_API_URL=${runtimeConfig.apiUrl}`,
      `WEBMINER_API_TOKEN=${await ActorExecutor.generateRunToken(runId, orgId)}`,
      `WEBMINER_DATASET_ID=${run.dataset_id}`,
      `WEBMINER_KVS_ID=${run.key_value_store_id}`,
      `WEBMINER_REQUEST_QUEUE_ID=${run.log_store_id}`,
      `WEBMINER_MEMORY_MBYTES=${options.memoryMbytes || 512}`,
      ...(proxyUrl ? [`HTTP_PROXY=${proxyUrl}`, `HTTPS_PROXY=${proxyUrl}`] : []),
    ];

    // ── Create container ────────────────────────────────────────────────────
    let container: Docker.Container | null = null;
    let exitCode = 1;

    try {
      container = await docker.createContainer({
        Image: dockerImage,
        name: `wm-run-${runId.slice(0, 8)}`,
        Cmd: actor.source_code
          ? ['node', stagedActor.entrypoint]
          : (actor.build_cmd?.split(' ') || ['node', stagedActor.entrypoint]),
        Env: env,
        WorkingDir: '/app',
        HostConfig: {
          Memory: memoryBytes,
          MemorySwap: memoryBytes * 2,
          CpuShares: 512,  // relative CPU weight
          ...(runtimeConfig.networkMode ? { NetworkMode: runtimeConfig.networkMode } : {}),
          Binds: [`${storagePath}:/app/storage:rw`],
          AutoRemove: false,
          ReadonlyRootfs: false,
          CapDrop: ['ALL'],  // Drop all capabilities for security
          SecurityOpt: ['no-new-privileges:true'],
          ...(runtimeConfig.extraHosts ? { ExtraHosts: runtimeConfig.extraHosts } : {}),
          Ulimits: [
            { Name: 'nofile', Soft: 65536, Hard: 65536 },
          ],
        },
        Labels: {
          'webminer.run_id': runId,
          'webminer.actor_id': actorId,
          'webminer.org_id': orgId,
        },
      });

      await container.start();
      activeContainers.set(runId, container);
      await db.query(
        'UPDATE runs SET container_id = $1 WHERE id = $2',
        [container.id, runId]
      );

      logger.info(`[Run:${runId}] Container started: ${container.id.slice(0, 12)}`);

      // ── Stream logs to Redis ────────────────────────────────────────────
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true,
      });

      const logKey = `run:logs:${runId}`;
      let logBuffer = '';

      (logStream as NodeJS.ReadableStream).on('data', (chunk: Buffer) => {
        // Docker multiplexed stream: first 8 bytes are header
        const text = chunk.length > 8
          ? chunk.slice(8).toString('utf8')
          : chunk.toString('utf8');

        const lines = (logBuffer + text).split('\n');
        logBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            redis.rpush(logKey, line).catch(() => {});
            redis.expire(logKey, 7 * 24 * 3600).catch(() => {});
          }
        }
      });

      // ── Wait for completion with timeout ───────────────────────────────
      const waitResult = await Promise.race([
        container.wait(),
        new Promise<{ StatusCode: number }>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        ),
      ]);

      exitCode = (waitResult as any).StatusCode ?? 1;
      logger.info(`[Run:${runId}] Container exited with code: ${exitCode}`);

    } catch (err: any) {
      const isTimeout = err.message === 'TIMEOUT';
      const isAbort = err.message === 'ABORTED';
      const isMissingImage =
        err.statusCode === 404 &&
        /No such image/i.test(String(err.reason || err.message || ''));

      if (isTimeout) {
        logger.warn(`[Run:${runId}] Execution timed out after ${options.timeoutSecs}s`);
        if (container) await container.stop({ t: 5 }).catch(() => {});
        await ActorExecutor.finishRun(runId, 'timeout', -1, startTime, { error: 'Execution timeout' });
        return;
      }

      if (isAbort) {
        await ActorExecutor.finishRun(runId, 'aborted', -1, startTime, { error: 'Aborted by user' });
        return;
      }

      if (isMissingImage) {
        const message = getMissingRuntimeImageMessage(actor.runtime, dockerImage);
        logger.error(`[Run:${runId}] ${message}`);
        await ActorExecutor.finishRun(runId, 'failed', exitCode, startTime, { error: message });
        throw new Error(message);
      }

      logger.error(`[Run:${runId}] Execution error:`, err.message);
      await ActorExecutor.finishRun(runId, 'failed', exitCode, startTime, { error: err.message });
      throw err; // Re-throw so BullMQ records it

    } finally {
      activeContainers.delete(runId);

      // Cleanup container
      if (container) {
        try {
          const info = await container.inspect().catch(() => null);
          if (info && info.State.Running) await container.stop({ t: 10 });
          await container.remove({ force: true });
        } catch (e) {
          logger.warn(`[Run:${runId}] Container cleanup warning:`, e);
        }
      }

      // Collect dataset stats
      await ActorExecutor.collectStats(runId, run.dataset_id).catch(() => {});
    }

    // ── Final status based on exit code ────────────────────────────────────
    const finalStatus = exitCode === 0 ? 'succeeded' : 'failed';
    await ActorExecutor.finishRun(runId, finalStatus, exitCode, startTime);
  }

  static async finishRun(
    runId: string,
    status: string,
    exitCode: number,
    startTime: number,
    extra: Record<string, any> = {}
  ): Promise<void> {
    const durationSecs = Math.round((Date.now() - startTime) / 1000);
    const computeUnits = parseFloat((durationSecs / 3600).toFixed(4));  // 1 CU = 1 hour

    await db.query(
      `UPDATE runs SET
         status = $1, exit_code = $2, duration_secs = $3,
         compute_units = $4, finished_at = NOW(),
         error_message = $5
       WHERE id = $6`,
      [
        status, exitCode, durationSecs, computeUnits,
        extra.error || null, runId,
      ]
    );

    // Update actor avg stats if succeeded
    if (status === 'succeeded') {
      await db.query(
        `UPDATE actors SET
           success_runs = success_runs + 1,
           avg_duration_secs = (
             SELECT ROUND(AVG(duration_secs)) FROM runs
             WHERE actor_id = actors.id AND status = 'succeeded'
           )
         FROM runs WHERE runs.id = $1 AND actors.id = runs.actor_id`,
        [runId]
      ).catch(() => {});
    }

    logger.info(`[Run:${runId}] Finished: ${status} in ${durationSecs}s (${computeUnits} CU)`);
  }

  static async collectStats(runId: string, datasetId: string): Promise<void> {
    if (!datasetId) return;

    const r = await db.query(
      'SELECT item_count FROM datasets WHERE id = $1',
      [datasetId]
    );

    if (r.rows.length) {
      await db.query(
        'UPDATE runs SET stats = stats || $1 WHERE id = $2',
        [JSON.stringify({ items_scraped: r.rows[0].item_count }), runId]
      );
    }
  }

  static async abortRun(runId: string): Promise<void> {
    const container = activeContainers.get(runId);
    if (container) {
      logger.info(`[Run:${runId}] Aborting container...`);
      await container.stop({ t: 5 }).catch(() => {});
      activeContainers.delete(runId);
    }
  }

  static async generateRunToken(runId: string, orgId: string): Promise<string> {
    // Short-lived token for actor to call back to API
    const jwt = await import('jsonwebtoken');
    return jwt.default.sign(
      { runId, orgId, type: 'run-token' },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '12h' }
    );
  }
}