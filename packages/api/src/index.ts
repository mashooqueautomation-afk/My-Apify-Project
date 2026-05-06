import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';

import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { rateLimiter } from './middleware/rateLimiter';
import { db } from './db/pool';
import { redis } from './db/redis';
import { setupQueues } from './workers/queues';

// Routes
import authRouter from './routes/auth';
import actorsRouter from './routes/actors';
import runsRouter from './routes/runs';
import tasksRouter from './routes/tasks';
import datasetsRouter from './routes/datasets';
import kvStoresRouter from './routes/kvStores';
import requestQueuesRouter from './routes/requestQueues';
import proxiesRouter from './routes/proxies';
import webhooksRouter from './routes/webhooks';
import usersRouter from './routes/users';
import orgsRouter from './routes/organizations';
import metricsRouter from './routes/metrics';
import prometheusRouter from './routes/prometheus';
import scrapingRouter from './routes/scraping';
import apiKeysRouter from './routes/apiKeys';
import storeRouter from './routes/store';

const app = express();
const PORT = process.env.PORT || 3000;
const STARTUP_RETRIES = parseInt(process.env.STARTUP_RETRIES || '30', 10);
const STARTUP_RETRY_DELAY_MS = parseInt(process.env.STARTUP_RETRY_DELAY_MS || '2000', 10);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ['http://localhost:3001'], credentials: true }));
app.use(compression());
app.use(express.json());
app.use(requestId);
app.use(morgan('dev'));

// Rate limit
app.use('/api/', rateLimiter);

// Safe route loader (CRASH nahi hone dega)
const apiV1 = express.Router();

function safeUse(path: string, router: any) {
  if (!router) {
    console.error(`❌ Router missing at ${path}`);
    return;
  }
  apiV1.use(path, router);
}

// Routes (safe mount)
safeUse('/auth', authRouter);
safeUse('/actors', actorsRouter);
safeUse('/scraping', scrapingRouter);
safeUse('/runs', runsRouter);
safeUse('/tasks', tasksRouter);
safeUse('/datasets', datasetsRouter);
safeUse('/key-value-stores', kvStoresRouter);
safeUse('/request-queues', requestQueuesRouter);
safeUse('/proxies', proxiesRouter);
safeUse('/webhooks', webhooksRouter);
safeUse('/api-keys', apiKeysRouter);
safeUse('/store', storeRouter);
safeUse('/users', usersRouter);
safeUse('/organizations', orgsRouter);
safeUse('/metrics', metricsRouter);

app.use('/metrics', prometheusRouter);
app.use('/api/v1', apiV1);

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use(errorHandler);

// Start
async function start() {
  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      await db.query('SELECT 1');
      await redis.ping();
      await setupQueues();

      createServer(app).listen(PORT, () => {
        logger.info(`🚀 API running on http://localhost:${PORT}`);
      });
      return;
    } catch (err) {
      const isLastAttempt = attempt === STARTUP_RETRIES;
      logger.error(`API startup attempt ${attempt}/${STARTUP_RETRIES} failed:`, err);
      if (isLastAttempt) {
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
    }
  }
}

start();

export default app;
