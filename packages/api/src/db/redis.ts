import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,  // required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis: max retries reached');
      return null;
    }
    return Math.min(times * 200, 3000);
  },
};

// Parse REDIS_URL or use individual env vars
function createRedisClient(lazyConnect = false): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url, { ...redisOptions, lazyConnect });
  }
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    ...redisOptions,
    lazyConnect,
  });
}

export const redis = createRedisClient();
export const redisSubscriber = createRedisClient(true);

// Factory for BullMQ (needs fresh connection per queue)
export function createRedisConnection(): Redis {
  return createRedisClient(true);
}

redis.on('error', (err: Error) => logger.error('Redis error:', err));
redis.on('ready', () => logger.info('Redis ready'));

export default redis;
