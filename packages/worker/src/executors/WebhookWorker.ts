import crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../db/pool';

interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: Record<string, any>;
  secret?: string;
  headers?: Record<string, string>;
}

export class WebhookWorker {
  static async fire(data: WebhookJobData): Promise<void> {
    const { webhookId, url, event, payload, secret, headers = {} } = data;

    const body = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WebMiner-Webhooks/1.0',
      'X-WebMiner-Event': event,
      'X-WebMiner-Delivery': crypto.randomUUID(),
      ...headers,
    };

    if (secret) {
      const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
      requestHeaders['X-WebMiner-Signature'] = `sha256=${sig}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} from webhook endpoint`);
      }

      await db.query(
        'UPDATE webhooks SET last_fired_at = NOW(), fail_count = 0 WHERE id = $1',
        [webhookId]
      );

      logger.info(`Webhook fired: ${event} → ${url} [${response.status}]`);
    } catch (err: any) {
      await db.query(
        `UPDATE webhooks SET
           fail_count = fail_count + 1,
           is_active = CASE WHEN fail_count >= 9 THEN false ELSE is_active END
         WHERE id = $1`,
        [webhookId]
      );
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
