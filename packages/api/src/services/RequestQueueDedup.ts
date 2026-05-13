import { Pool } from 'pg';
import { URLFingerprint } from './URLFingerprint';

/**
 * Request Queue Deduplication Service
 * Prevents duplicate requests from being added to queue
 */

export interface DeduplicationStats {
  totalAttempted: number;
  duplicatesSkipped: number;
  newAdded: number;
  deduplicationRate: number; // percentage
}

export class RequestQueueDedup {
  private db: Pool;
  private stats: DeduplicationStats = {
    totalAttempted: 0,
    duplicatesSkipped: 0,
    newAdded: 0,
    deduplicationRate: 0,
  };

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Check if URL already exists in queue
   */
  async isDuplicate(queueId: string, url: string): Promise<boolean> {
    const fingerprint = URLFingerprint.generate(url);

    const result = await this.db.query(
      `SELECT id FROM request_queue_items 
       WHERE queue_id = $1 AND unique_key = $2 
       LIMIT 1`,
      [queueId, fingerprint]
    );

    return result.rows.length > 0;
  }

  /**
   * Get all pending URLs in queue (for reference)
   */
  async getPendingUrls(queueId: string, limit: number = 1000): Promise<string[]> {
    const result = await this.db.query(
      `SELECT url FROM request_queue_items 
       WHERE queue_id = $1 AND status = 'pending'
       LIMIT $2`,
      [queueId, limit]
    );

    return result.rows.map((row) => row.url);
  }

  /**
   * Add request if not duplicate (returns whether it was added)
   */
  async addIfNotDuplicate(
    queueId: string,
    url: string,
    userData?: Record<string, any>,
    priority: number = 0
  ): Promise<{ added: boolean; reason?: string; itemId?: string }> {
    this.stats.totalAttempted++;

    const fingerprint = URLFingerprint.generate(url);

    // Check for existing
    const existing = await this.db.query(
      `SELECT id, status FROM request_queue_items 
       WHERE queue_id = $1 AND unique_key = $2`,
      [queueId, fingerprint]
    );

    if (existing.rows.length > 0) {
      this.stats.duplicatesSkipped++;
      this.updateDeduplicationRate();
      return {
        added: false,
        reason: `Duplicate URL (status: ${existing.rows[0].status}, id: ${existing.rows[0].id})`,
      };
    }

    // Add new request
    const newItem = await this.db.query(
      `INSERT INTO request_queue_items (queue_id, url, unique_key, user_data, priority, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [queueId, url, fingerprint, JSON.stringify(userData || {}), priority]
    );

    this.stats.newAdded++;
    this.updateDeduplicationRate();

    return {
      added: true,
      itemId: newItem.rows[0].id,
    };
  }

  /**
   * Batch add with deduplication
   */
  async addBatchIfNotDuplicate(
    queueId: string,
    urls: Array<{ url: string; userData?: Record<string, any>; priority?: number }>
  ): Promise<{ added: number; skipped: number; results: Array<{ url: string; added: boolean }> }> {
    const results = [];
    let added = 0;
    let skipped = 0;

    for (const item of urls) {
      const result = await this.addIfNotDuplicate(
        queueId,
        item.url,
        item.userData,
        item.priority || 0
      );
      results.push({ url: item.url, added: result.added });
      if (result.added) added++;
      else skipped++;
    }

    return { added, skipped, results };
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalAttempted: 0,
      duplicatesSkipped: 0,
      newAdded: 0,
      deduplicationRate: 0,
    };
  }

  private updateDeduplicationRate(): void {
    if (this.stats.totalAttempted === 0) {
      this.stats.deduplicationRate = 0;
    } else {
      this.stats.deduplicationRate = Math.round(
        (this.stats.duplicatesSkipped / this.stats.totalAttempted) * 100
      );
    }
  }
}