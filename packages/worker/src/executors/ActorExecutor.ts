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

// Phase 2 Imports
import { RetryStrategy, RetryConfig } from '../services/RetryStrategy';
import { DeadLetterQueue } from '../services/DeadLetterQueue';
import { URLFingerprint } from '../services/URLFingerprint';

const docker = new Docker({
  socketPath:
    process.env.DOCKER_SOCKET ||
    '/var/run/docker.sock',
});

const activeContainers =
  new Map<
    string,
    Docker.Container
  >();

const RUNTIME_IMAGES: Record<
  string,
  string
> = {
  node18:
    'webminer/runtime-node18:latest',
  python310:
    'webminer/runtime-python310:latest',
  playwright:
    'webminer/runtime-playwright:latest',
  custom: 'node:20-alpine',
};

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
  const configured =
    process.env.STORAGE_PATH
      ? path.resolve(
          process.env.STORAGE_PATH
        )
      : path.resolve(
          process.cwd(),
          '.mash-runtime',
          'storage'
        );

  const candidates = [
    configured,
    path.resolve(
      process.cwd(),
      '.mash-runtime',
      'storage'
    ),
    path.join(
      os.tmpdir(),
      'mash-lead-scrapping',
      'storage'
    ),
  ];

  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      await fs.mkdir(candidate, {
        recursive: true,
      });

      logger.info(
        `Storage initialized at: ${candidate}`
      );

      return candidate;
    } catch (error) {
      lastError = error;

      logger.warn(
        `Storage path unavailable: ${candidate}`,
        error
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        'No writable storage path available'
      );
}

function rewriteApiUrlForHostAccess(
  apiUrl: string
): string {
  try {
    const parsed = new URL(apiUrl);

    if (
      [
        'api',
        'localhost',
        '127.0.0.1',
      ].includes(parsed.hostname)
    ) {
      parsed.hostname =
        'host.docker.internal';

      return parsed
        .toString()
        .replace(/\/$/, '');
    }
  } catch (error) {
    logger.warn(
      `Invalid API URL configured: ${apiUrl}`,
      error
    );
  }

  return apiUrl.replace(/\/$/, '');
}

async function resolveContainerRuntimeConfig(): Promise<ContainerRuntimeConfig> {
  const requestedNetwork =
    process.env.DOCKER_NETWORK ||
    'mash_lead_scrapping_network';

  const configuredApiUrl =
    (
      process.env.API_URL ||
      'http://api:3000'
    ).replace(/\/$/, '');

  try {
    const networks =
      await docker.listNetworks();

    const networkExists =
      networks.some(
        (network) =>
          network.Name ===
          requestedNetwork
      );

    if (networkExists) {
      return {
        apiUrl:
          configuredApiUrl,
        networkMode:
          requestedNetwork,
      };
    }
  } catch (error) {
    logger.warn(
      `Unable to inspect Docker networks`,
      error
    );
  }

  const fallbackApiUrl =
    rewriteApiUrlForHostAccess(
      configuredApiUrl
    );

  logger.warn(
    `Falling back to bridge networking`
  );

  return {
    apiUrl: fallbackApiUrl,
    extraHosts: [
      'host.docker.internal:host-gateway',
    ],
    networkMode: 'bridge',
  };
}

async function stageInlineActorBundle(
  runDir: string,
  sourceCode: string,
  runId: string
): Promise<StagedActorPaths> {
  const actorRoot =
    path.join(runDir, 'actors');

  const actorEntryDir =
    path.join(
      actorRoot,
      'current'
    );

  await fs.mkdir(actorEntryDir, {
    recursive: true,
  });

  try {
    await fs.cp(
      path.resolve(
        process.cwd(),
        'src',
        'actors',
        '_shared'
      ),
      path.join(
        actorRoot,
        '_shared'
      ),
      {
        recursive: true,
        force: true,
      }
    );

    logger.info(
      `[Run:${runId}] Shared folder copied`
    );
  } catch (err) {
    logger.warn(
      `[Run:${runId}] Shared copy failed`,
      err
    );
  }

  try {
    await fs.copyFile(
      path.resolve(
        process.cwd(),
        'src',
        'actors',
        'anti-bot.js'
      ),
      path.join(
        actorRoot,
        'anti-bot.js'
      )
    );

    logger.info(
      `[Run:${runId}] anti-bot.js copied`
    );
  } catch (err) {
    logger.warn(
      `[Run:${runId}] anti-bot copy failed`,
      err
    );
  }

  try {
    const sdkSourceDir =
      path.resolve(
        process.cwd(),
        '..',
        'actor-sdk',
        'src'
      );

    const nodeModulesPath =
      path.join(
        runDir,
        'node_modules',
        '@webminer',
        'actor-sdk',
        'lib'
      );

    await fs.mkdir(
      nodeModulesPath,
      { recursive: true }
    );

    await fs.cp(
      sdkSourceDir,
      nodeModulesPath,
      { recursive: true, force: true }
    );

    logger.info(
      `[Run:${runId}] actor-sdk installed to node_modules`
    );
  } catch (err) {
    logger.warn(
      `[Run:${runId}] actor-sdk setup failed`,
      err
    );
  }

  const mainJsPath =
    path.join(
      actorEntryDir,
      'main.js'
    );

  await fs.writeFile(
    mainJsPath,
    sourceCode,
    'utf8'
  );

  logger.info(
    `[Run:${runId}] main.js created`
  );

  return {
    entrypoint: `/app/storage/runs/${runId}/actors/current/main.js`,
    inputPath: `/app/storage/runs/${runId}/INPUT.json`,
  };
}

export class ActorExecutor {
  static async execute(
    job: Job<RunJobData>
  ): Promise<void> {
    const {
      runId,
      actorId,
      actorSlug,
      orgId,
      input,
      options,
    } = job.data;

    const startTime =
      Date.now();

    logger.info(
      `[Run:${runId}] Starting actor: ${actorSlug}`
    );

    await db.query(
      `UPDATE runs
       SET status = 'running',
           started_at = NOW()
       WHERE id = $1`,
      [runId]
    );

    const [
      actorRes,
      runRes,
    ] = await Promise.all([
      db.query(
        'SELECT * FROM actors WHERE id = $1',
        [actorId]
      ),
      db.query(
        'SELECT * FROM runs WHERE id = $1',
        [runId]
      ),
    ]);

    if (
      !actorRes.rows.length
    ) {
      throw new Error(
        `Actor ${actorId} not found`
      );
    }

    const actor =
      actorRes.rows[0];

    const run =
      runRes.rows[0];

    const dockerImage =
      options.dockerImage ||
      RUNTIME_IMAGES[
        actor.runtime
      ] ||
      RUNTIME_IMAGES.node18;

    const memoryBytes =
      (options.memoryMbytes ||
        512) *
      1024 *
      1024;

    const timeoutMs =
      (options.timeoutSecs ||
        3600) *
      1000;

    const storagePath =
      await ensureWritableStorageRoot();

    const runDir =
      path.join(
        storagePath,
        'runs',
        runId
      );

    await fs.mkdir(runDir, {
      recursive: true,
    });

    await fs.writeFile(
      path.join(
        runDir,
        'INPUT.json'
      ),
      JSON.stringify(
        input,
        null,
        2
      )
    );

    const stagedActor =
      actor.source_code
        ? await stageInlineActorBundle(
            runDir,
            actor.source_code,
            runId
          )
        : {
            entrypoint:
              '/app/src/main.js',
            inputPath: `/app/storage/runs/${runId}/INPUT.json`,
          };

    const hostMainJsPath =
      path.join(
        runDir,
        'actors',
        'current',
        'main.js'
      );

    if (actor.source_code) {
      try {
        const stats =
          await fs.stat(
            hostMainJsPath
          );

        logger.info(
          `[Run:${runId}] DEBUG: Host file verified: ${hostMainJsPath} (${stats.size} bytes)`
        );
      } catch (err) {
        logger.error(
          `[Run:${runId}] DEBUG: Host file missing`,
          err
        );
      }
    }

    let proxyUrl:
      | string
      | undefined;

    if (
      options.proxyGroupId
    ) {
      proxyUrl =
        await ProxyManager.getProxy(
          options.proxyGroupId,
          orgId
        );
    }

    const runtimeConfig =
      await resolveContainerRuntimeConfig();

    const env = [
      `WEBMINER_RUN_ID=${runId}`,
      `WEBMINER_ACTOR_ID=${actorId}`,
      `WEBMINER_ACTOR_SLUG=${actorSlug}`,
      `WEBMINER_INPUT_PATH=${stagedActor.inputPath}`,
      `WEBMINER_API_URL=${runtimeConfig.apiUrl}`,
      `WEBMINER_DATASET_ID=${run.dataset_id}`,
      `WEBMINER_KVS_ID=${run.key_value_store_id}`,
    ];

    if (proxyUrl) {
      env.push(
        `HTTP_PROXY=${proxyUrl}`,
        `HTTPS_PROXY=${proxyUrl}`
      );
    }

    // ===== PHASE 2: RETRY LOGIC START =====
    const maxRetries = (options as any).maxRetries ?? 2;
    const retryConfig: Partial<RetryConfig> = {
      maxRetries,
      initialDelayMs: 2000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
    };

    let attemptNumber = 0;
    let lastError: any;

    while (attemptNumber <= maxRetries) {
      attemptNumber++;

      logger.info(
        `[Run:${runId}] Execution attempt ${attemptNumber}/${maxRetries + 1}`
      );

      let container:
        | Docker.Container
        | null = null;

      let exitCode = 1;

      try {
        const containerConfig = {
          Image:
            dockerImage,

          name: `wm-run-${runId.slice(
            0,
            8
          )}-${attemptNumber}`,

          Cmd: [
            'node',
            stagedActor.entrypoint,
          ],

          Env: env,

          WorkingDir:
            '/app',

          HostConfig: {
            Memory:
              memoryBytes,

            Binds: [
              `webminer_actor_storage:/app/storage:rw`,
            ],

            AutoRemove: false,

            ExtraHosts:
              runtimeConfig.extraHosts,

            NetworkMode:
              runtimeConfig.networkMode,
          },
        };

        logger.info(
          `[Run:${runId}] DEBUG CMD: ${JSON.stringify(containerConfig.Cmd)}`
        );

        container =
          await docker.createContainer(
            containerConfig
          );

        activeContainers.set(
          runId,
          container
        );

        await container.start();

        logger.info(
          `[Run:${runId}] Container started: ${container.id.slice(
            0,
            12
          )}`
        );

        const waitResult =
          await Promise.race([
            container.wait(),
            new Promise<{
              StatusCode: number;
            }>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      'TIMEOUT'
                    )
                  ),
                timeoutMs
              )
            ),
          ]);

        exitCode =
          (waitResult as any)
            .StatusCode ?? 1;

        logger.info(
          `[Run:${runId}] Container exited with code: ${exitCode}`
        );

        try {
          const logs =
            await container.logs({
              stdout: true,
              stderr: true,
            });

          logger.info(
            `[Run:${runId}] Container logs:\n${logs.toString()}`
          );
        } catch (err) {
          logger.warn(
            `[Run:${runId}] Failed to fetch logs`,
            err
          );
        }

        try {
          const inspectData =
            await container.inspect();

          logger.info(
            `[Run:${runId}] ExitCode: ${inspectData.State.ExitCode}`
          );

          logger.info(
            `[Run:${runId}] Error: ${inspectData.State.Error}`
          );
        } catch (err) {
          logger.warn(
            `[Run:${runId}] Inspect failed`,
            err
          );
        }

        // SUCCESS!
        if (exitCode === 0) {
          logger.info(
            `[Run:${runId}] ✅ Execution succeeded on attempt ${attemptNumber}`
          );

          activeContainers.delete(runId);

          if (container) {
            try {
              await container.stop({ t: 10 });
            } catch (e) {
              logger.warn(`[Run:${runId}] Stop failed`, e);
            }
          }

          await ActorExecutor.finishRun(
            runId,
            'succeeded',
            exitCode,
            startTime
          );

          return; // Exit successfully
        }

        // Non-zero exit: might retry
        lastError = new Error(
          `Container exited with code ${exitCode}`
        );

        if (attemptNumber <= maxRetries) {
          const delayMs = RetryStrategy.calculateDelay(
            attemptNumber - 1,
            retryConfig
          );

          logger.warn(
            RetryStrategy.formatRetryHistory(
              attemptNumber,
              delayMs,
              attemptNumber + 1,
              maxRetries
            ),
            { runId }
          );

          // Wait before retry
          await new Promise((resolve) =>
            setTimeout(resolve, delayMs)
          );
        }
      } catch (err: any) {
        lastError = err;

        logger.error(
          `[Run:${runId}] Execution error on attempt ${attemptNumber}`,
          err
        );

        if (attemptNumber <= maxRetries) {
          const delayMs = RetryStrategy.calculateDelay(
            attemptNumber - 1,
            retryConfig
          );

          logger.warn(
            `Retrying in ${Math.round(delayMs / 1000)}s...`,
            { runId }
          );

          await new Promise((resolve) =>
            setTimeout(resolve, delayMs)
          );
        }
      } finally {
        activeContainers.delete(runId);

        if (container) {
          try {
            const info = await container
              .inspect()
              .catch(() => null);

            if (
              info &&
              info.State.Running
            ) {
              await container.stop({
                t: 10,
              });
            }

            logger.info(
              `[Run:${runId}] Container cleaned up`
            );
          } catch (e) {
            logger.warn(
              `[Run:${runId}] Cleanup warning`,
              e
            );
          }
        }
      }
    }

    // All retries exhausted
    logger.error(
      `[Run:${runId}] ❌ Failed after ${attemptNumber} attempts`,
      lastError
    );

    await ActorExecutor.finishRun(
      runId,
      'failed',
      1,
      startTime
    );
    // ===== PHASE 2: RETRY LOGIC END =====
  }

  static async finishRun(
    runId: string,
    status: string,
    exitCode: number,
    startTime: number
  ): Promise<void> {
    const durationSecs =
      Math.round(
        (Date.now() -
          startTime) /
          1000
      );

    const computeUnits =
      parseFloat(
        (
          durationSecs / 3600
        ).toFixed(4)
      );

    await db.query(
      `UPDATE runs SET
       status = $1,
       exit_code = $2,
       duration_secs = $3,
       compute_units = $4,
       finished_at = NOW()
       WHERE id = $5`,
      [
        status,
        exitCode,
        durationSecs,
        computeUnits,
        runId,
      ]
    );

    logger.info(
      `[Run:${runId}] Finished: ${status}`
    );
  }

  static async abortRun(
    runId: string
  ) {
    logger.warn(
      `[Run:${runId}] Abort requested`
    );

    const container =
      activeContainers.get(runId);

    if (container) {
      try {
        await container.stop({
          t: 5,
        });

        await container.remove({
          force: true,
        });

        activeContainers.delete(
          runId
        );

        logger.info(
          `[Run:${runId}] Container aborted successfully`
        );
      } catch (error) {
        logger.error(
          `[Run:${runId}] Abort failed`,
          error
        );
      }
    }

    await db.query(
      `UPDATE runs
       SET status = 'aborted',
           finished_at = NOW()
       WHERE id = $1`,
      [runId]
    );
  }
}