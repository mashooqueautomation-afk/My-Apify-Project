import { Pool } from 'pg';

/**
 * Dead Letter Queue Service
 * Tracks requests that failed permanently after all retries
 */

export interface DeadLetterItem {
  id: string;
  queueId: string;
  url: string;
  errorMessage: string;
  failedAttempts: number;
  maxRetries: number;
  lastFailedAt: Date;
  failureReason: string;
}

export class DeadLetterQueue {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Move request to DLQ when permanently failed
   */
  async moveToDeadLetter(
    queueId: string,
    requestId: string,
    errorMessage: string,
    failedAttempts: number,
    maxRetries: number
  ): Promise<void> {
    const url = await this.db.query(
      `SELECT url FROM request_queue_items WHERE id = $1`,
      [requestId]
    );

    if (url.rows.length === 0) {
      throw new Error(`Request ${requestId} not found`);
    }

    // Insert into dead letter table
    await this.db.query(
      `INSERT INTO dead_letter_queue (queue_id, request_item_id, url, error_message, failed_attempts, max_retries, failure_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        queueId,
        requestId,
        url.rows[0].url,
        errorMessage,
        failedAttempts,
        maxRetries,
        `Failed after ${failedAttempts} attempts. Max retries: ${maxRetries}`,
      ]
    );

    // Update original request status
    await this.db.query(
      `UPDATE request_queue_items SET status = 'dead_letter', updated_at = NOW()
       WHERE id = $1`,
      [requestId]
    );
  }

  /**
   * Get all dead letter items for a queue
   */
  async getDeadLetters(queueId: string, limit: number = 100): Promise<DeadLetterItem[]> {
    const result = await this.db.query(
      `SELECT 
        id, queue_id, url, error_message, failed_attempts, max_retries, 
        last_failed_at, failure_reason
       FROM dead_letter_queue
       WHERE queue_id = $1
       ORDER BY last_failed_at DESC
       LIMIT $2`,
      [queueId, limit]
    );

    return result.rows;
  }

  /**
   * Get dead letter statistics
   */
  async getStats(queueId: string): Promise<{ totalDeadLetters: number; byReason: Record<string, number> }> {
    const result = await this.db.query(
      `SELECT failure_reason, COUNT(*) as count
       FROM dead_letter_queue
       WHERE queue_id = $1
       GROUP BY failure_reason`,
      [queueId]
    );

    const byReason: Record<string, number> = {};
    for (const row of result.rows) {
      byReason[row.failure_reason] = parseInt(row.count, 10);
    }

    const totalResult = await this.db.query(
      `SELECT COUNT(*) as count FROM dead_letter_queue WHERE queue_id = $1`,
      [queueId]
    );

    return {
      totalDeadLetters: parseInt(totalResult.rows[0].count, 10),
      byReason,
    };
  }

  /**
   * Retry a dead letter item (move back to pending)
   */
  async retryDeadLetter(deadLetterId: string): Promise<void> {
    const dlItem = await this.db.query(
      `SELECT request_item_id FROM dead_letter_queue WHERE id = $1`,
      [deadLetterId]
    );

    if (dlItem.rows.length === 0) {
      throw new Error(`Dead letter item ${deadLetterId} not found`);
    }

    const requestId = dlItem.rows[0].request_item_id;

    // Reset request to pending
    await this.db.query(
      `UPDATE request_queue_items 
       SET status = 'pending', retry_count = 0, error_message = NULL, updated_at = NOW()
       WHERE id = $1`,
      [requestId]
    );

    // Mark DL item as retried
    await this.db.query(
      `UPDATE dead_letter_queue SET retried_at = NOW() WHERE id = $1`,
      [deadLetterId]
    );
  }
}