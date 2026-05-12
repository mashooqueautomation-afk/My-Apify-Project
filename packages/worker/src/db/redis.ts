import Redis from 'ioredis';

const opts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const REDIS_HOST =
  process.env.REDIS_HOST || 'mash_redis';

const REDIS_PORT =
  Number(process.env.REDIS_PORT) || 6379;

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, opts)
  : new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      ...opts,
    });

export const createRedisConnection = () => {
  return process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, {
        ...opts,
        lazyConnect: true,
      })
    : new Redis({
        host: REDIS_HOST,
        port: REDIS_PORT,
        ...opts,
        lazyConnect: true,
      });
};