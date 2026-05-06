import * as crypto from 'crypto';
import { db } from '../db/pool';
import { logger } from '../utils/logger';

export class WebhookService {
  static sign(secret: string, payload: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  static async deliver(
    webhookId: string,
    url: string,
    event: string,
    payload: Record<string, any>,
    secret?: string,
    extraHeaders?: Record<string, string>,
    orgId?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      event,
      timestamp,
      ...payload,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Mash-Lead-Scrapping-Webhook/1.0',
      'X-Mash-Event': event,
      'X-Mash-Delivery': crypto.randomUUID(),
      'X-Mash-Timestamp': timestamp,
      ...(extraHeaders || {}),
    };

    if (secret) {
      headers['X-Mash-Signature'] = `sha256=${WebhookService.sign(secret, body)}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      await db.query(
        'UPDATE webhooks SET last_fired_at = NOW(), fail_count = 0 WHERE id = $1',
        [webhookId]
      );
      if (orgId && webhookId !== 'test') {
        await db.query(
          `INSERT INTO webhook_deliveries (org_id, webhook_id, event, target_url, payload, response_status, success)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [orgId, webhookId, event, url, JSON.stringify(payload), response.status]
        ).catch(() => {});
      }

      logger.info(`Webhook delivered: ${event} → ${url} (${response.status})`);
    } catch (err: any) {
      await db.query(
        'UPDATE webhooks SET fail_count = fail_count + 1 WHERE id = $1',
        [webhookId]
      );
      if (orgId && webhookId !== 'test') {
        await db.query(
          `INSERT INTO webhook_deliveries (org_id, webhook_id, event, target_url, payload, response_status, success, error_message)
           VALUES ($1, $2, $3, $4, $5, $6, false, $7)`,
          [orgId, webhookId, event, url, JSON.stringify(payload), null, err.message || String(err)]
        ).catch(() => {});
      }

      // Auto-disable after 10 consecutive failures
      await db.query(
        'UPDATE webhooks SET is_active = false WHERE id = $1 AND fail_count >= 10',
        [webhookId]
      );

      throw err; // Let BullMQ handle retry
    } finally {
      clearTimeout(timeout);
    }
  }
}
