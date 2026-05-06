import Redis, { RedisOptions } from 'ioredis';
const opts: RedisOptions = { maxRetriesPerRequest: null, enableReadyCheck: false };
export const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, opts) : new Redis({ host: 'localhost', port: 6379, ...opts });
export function createRedisConnection() {
  return process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, { ...opts, lazyConnect: true }) : new Redis({ host: 'localhost', port: 6379, ...opts, lazyConnect: true });
}
export default redis;
