import { db } from '../db/pool';
import { redis } from '../db/redis';
import { logger } from '../utils/logger';

interface Proxy {
  id: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
  countryCode?: string;
}

export class ProxyManager {
  /**
   * Get a healthy proxy from a group using round-robin + health scoring
   */
  static async getProxy(groupId: string, orgId: string): Promise<string> {
    const cacheKey = `proxy:group:${groupId}:idx`;

    // Get all active proxies in group
    const result = await db.query(
      `SELECT id, host, port, username, password, country_code,
              success_count, fail_count
       FROM proxies
       WHERE group_id = $1 AND org_id = $2 AND is_active = true
       ORDER BY (fail_count::float / NULLIF(success_count + fail_count, 0)) ASC, last_used_at ASC NULLS FIRST
       LIMIT 50`,
      [groupId, orgId]
    );

    if (!result.rows.length) {
      throw new Error(`No active proxies in group ${groupId}`);
    }

    // Round-robin using Redis counter
    const total = result.rows.length;
    const idx = await redis.incr(cacheKey);
    await redis.expire(cacheKey, 3600);
    const proxy = result.rows[idx % total];

    // Mark as used
    await db.query(
      'UPDATE proxies SET last_used_at = NOW() WHERE id = $1',
      [proxy.id]
    ).catch(() => {});

    return ProxyManager.formatProxyUrl(proxy);
  }

  static formatProxyUrl(proxy: Proxy): string {
    const auth = proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
    return `http://${auth}${proxy.host}:${proxy.port}`;
  }

  /**
   * Record proxy success/failure for health scoring
   */
  static async recordResult(proxyId: string, success: boolean, responseMs?: number): Promise<void> {
    if (success) {
      await db.query(
        'UPDATE proxies SET success_count = success_count + 1 WHERE id = $1',
        [proxyId]
      );
    } else {
      await db.query(
        `UPDATE proxies SET
           fail_count = fail_count + 1,
           is_active = CASE WHEN fail_count >= 9 THEN false ELSE is_active END
         WHERE id = $1`,
        [proxyId]
      );
    }
  }

  /**
   * Health check all proxies in a group
   */
  static async healthCheck(groupId: string): Promise<void> {
    const result = await db.query(
      'SELECT id, host, port, username, password FROM proxies WHERE group_id = $1',
      [groupId]
    );

    logger.info(`Health checking ${result.rows.length} proxies in group ${groupId}`);

    for (const proxy of result.rows) {
      const proxyUrl = ProxyManager.formatProxyUrl(proxy);
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const response = await fetch('https://api.ipify.org?format=json', {
          signal: controller.signal,
          // @ts-ignore
          proxy: proxyUrl,
        });

        clearTimeout(timeout);
        const ms = Date.now() - start;

        if (response.ok) {
          await db.query(
            `UPDATE proxies SET
               is_active = true, avg_response_ms = $1,
               success_count = success_count + 1
             WHERE id = $2`,
            [ms, proxy.id]
          );
          logger.debug(`Proxy ${proxy.host}:${proxy.port} OK (${ms}ms)`);
        }
      } catch {
        await db.query(
          `UPDATE proxies SET fail_count = fail_count + 1,
             is_active = CASE WHEN fail_count >= 4 THEN false ELSE true END
           WHERE id = $1`,
          [proxy.id]
        );
        logger.debug(`Proxy ${proxy.host}:${proxy.port} FAILED`);
      }
    }
  }

  /**
   * Get a formatted proxy list for Playwright/Puppeteer
   */
  static async getPlaywrightProxy(groupId: string, orgId: string): Promise<{
    server: string;
    username?: string;
    password?: string;
  } | undefined> {
    try {
      const result = await db.query(
        `SELECT host, port, username, password FROM proxies
         WHERE group_id = $1 AND org_id = $2 AND is_active = true
         ORDER BY RANDOM() LIMIT 1`,
        [groupId, orgId]
      );

      if (!result.rows.length) return undefined;
      const p = result.rows[0];

      return {
        server: `http://${p.host}:${p.port}`,
        username: p.username,
        password: p.password,
      };
    } catch {
      return undefined;
    }
  }
}
