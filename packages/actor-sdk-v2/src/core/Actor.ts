import { Logger } from '../logging/Logger';
import { ApiClient } from '../core/ApiClient';
import { Dataset } from '../storage/Dataset';
import { RequestQueue } from '../queue/RequestQueue';
import { ActorContext } from '../types/index';

export class Actor {
  private logger: Logger;
  private apiClient: ApiClient;
  private dataset?: Dataset;
  private requestQueue?: RequestQueue;
  private isRunning = false;
  private exitCode = 0;

  constructor(private context: ActorContext) {
    this.logger = new Logger(context.runId, context.actorId);
    this.apiClient = new ApiClient({
      baseUrl: context.apiUrl,
      token: context.apiToken,
      timeout: context.requestTimeout,
      maxRetries: context.maxRetries,
      logger: this.logger,
    });

    this.setupSignalHandlers();
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Get dataset instance
   */
  openDataset(): Dataset {
    if (!this.context.datasetId) {
      throw new Error('Dataset not configured for this run');
    }
    if (!this.dataset) {
      this.dataset = new Dataset(
        this.context.datasetId,
        this.apiClient,
        this.logger,
        this.context.isLocal
      );
    }
    return this.dataset;
  }

  /**
   * Get request queue instance
   */
  openRequestQueue(): RequestQueue {
    if (!this.context.requestQueueId) {
      throw new Error('Request queue not configured for this run');
    }
    if (!this.requestQueue) {
      this.requestQueue = new RequestQueue(
        this.context.requestQueueId,
        this.apiClient,
        this.logger
      );
    }
    return this.requestQueue;
  }

  /**
   * Call this when your actor work is done
   * Ensures graceful shutdown
   */
  async exit(code: number = 0): Promise<never> {
    this.exitCode = code;
    this.isRunning = false;

    try {
      // Send final metrics
      this.logger.info('Actor exiting', {
        exitCode: code,
        runId: this.context.runId,
      });

      // Cleanup
      if (this.dataset) {
        this.dataset.clearBuffer();
      }

      process.exit(code);
    } catch (err) {
      this.logger.error('Cleanup failed', err instanceof Error ? err : new Error(String(err)));
      process.exit(1);
    }
  }

  /**
   * Graceful signal handling
   */
  private setupSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        this.logger.warn(`Received ${signal}, gracefully shutting down`);
        await this.exit(0);
      });
    });

    process.on('uncaughtException', (err) => {
      this.logger.error('Uncaught exception', err);
      this.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', new Error(String(reason)));
      this.exit(1);
    });
  }
}

/**
 * Factory function to initialize Actor from environment
 * Call this at the top of your actor script
 */
export function initActor(): Actor {
  const context: ActorContext = {
    runId: process.env.WEBMINER_RUN_ID || 'local',
    actorId: process.env.WEBMINER_ACTOR_ID || 'unknown',
    orgId: process.env.WEBMINER_ORG_ID || 'dev',
    datasetId: process.env.WEBMINER_DATASET_ID,
    requestQueueId: process.env.WEBMINER_REQUEST_QUEUE_ID,
    kvsId: process.env.WEBMINER_KVS_ID,
    apiUrl: process.env.WEBMINER_API_URL || 'http://api:3000',
    apiToken: process.env.WEBMINER_API_TOKEN || '',
    maxRetries: parseInt(process.env.ACTOR_MAX_RETRIES || '3', 10),
    requestTimeout: parseInt(process.env.ACTOR_REQUEST_TIMEOUT || '30000', 10),
    isLocal: !process.env.WEBMINER_RUN_ID,
  };

  return new Actor(context);
}