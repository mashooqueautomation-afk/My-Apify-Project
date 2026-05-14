import { Pool } from 'pg';

/**
 * Queue Monitoring Service
 * Tracks queue health and metrics
 */

export interface QueueMetrics {
  queueId: string;
  totalRequests: number;
  pendingRequests: number;
  processingRequests: number;
  completedRequests: number;
  failedRequests: number;
  deadLetterCount: number;
  deduplicationRate: number;
  averageRetries: number;
  oldestPendingRequestAge: string; // ISO duration
}

export class QueueMonitoring {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Get comprehensive queue metrics
   */
  async getQueueMetrics(queueId: string): Promise<QueueMetrics> {
    // Get request counts by status
    const statusResult = await this.db.query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM request_queue_items
       WHERE queue_id = $1
       GROUP BY status`,
      [queueId]
    );

    const counts: Record<string, number> = {};
    for (const row of statusResult.rows) {
      counts[row.status] = parseInt(row.status, 10);
    }

    // Get total requests
    const totalResult = await this.db.query(
      `SELECT COUNT(*) as count FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const totalRequests = parseInt(totalResult.rows[0].count, 10);

    // Get dead letter count
    const dlResult = await this.db.query(
      `SELECT COUNT(*) as count FROM dead_letter_queue WHERE queue_id = $1`,
      [queueId]
    );
    const deadLetterCount = parseInt(dlResult.rows[0].count, 10);

    // Get average retries
    const retryResult = await this.db.query(
      `SELECT AVG(retry_count) as avg_retries FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const averageRetries = retryResult.rows[0].avg_retries
      ? Math.round(parseFloat(retryResult.rows[0].avg_retries) * 100) / 100
      : 0;

    // Get oldest pending request
    const oldestResult = await this.db.query(
      `SELECT created_at FROM request_queue_items 
       WHERE queue_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [queueId]
    );

    let oldestAge = 'N/A';
    if (oldestResult.rows.length > 0) {
      const createdAt = new Date(oldestResult.rows[0].created_at);
      const ageMs = Date.now() - createdAt.getTime();
      oldestAge = this.formatDuration(ageMs);
    }

    // Calculate deduplication rate
    const uniqueResult = await this.db.query(
      `SELECT COUNT(DISTINCT unique_key) as unique_count FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const uniqueCount = parseInt(uniqueResult.rows[0].unique_count, 10);
    const deduplicationRate =
      totalRequests > 0
        ? Math.round(((totalRequests - uniqueCount) / totalRequests) * 100)
        : 0;

    return {
      queueId,
      totalRequests,
      pendingRequests: counts['pending'] || 0,
      processingRequests: counts['processing'] || 0,
      completedRequests: counts['done'] || 0,
      failedRequests: counts['failed'] || 0,
      deadLetterCount,
      deduplicationRate,
      averageRetries,
      oldestPendingRequestAge: oldestAge,
    };
  }

  /**
   * Health check for queue
   */
  async healthCheck(queueId: string): Promise<{ healthy: boolean; issues: string[] }> {
    const metrics = await this.getQueueMetrics(queueId);
    const issues: string[] = [];

    // Check for old pending requests (> 1 hour)
    if (metrics.oldestPendingRequestAge !== 'N/A') {
      const ageMatch = metrics.oldestPendingRequestAge.match(/(\d+)h/);
      if (ageMatch && parseInt(ageMatch[1], 10) > 1) {
        issues.push(`Oldest pending request is ${metrics.oldestPendingRequestAge} old`);
      }
    }

    // Check for high dead letter rate (> 10%)
    const dlRate =
      metrics.totalRequests > 0
        ? Math.round((metrics.deadLetterCount / metrics.totalRequests) * 100)
        : 0;
    if (dlRate > 10) {
      issues.push(`Dead letter rate is high (${dlRate}%)`);
    }

    // Check for too many processing requests (potential stuck jobs)
    if (metrics.processingRequests > 100) {
      issues.push(`Too many processing requests (${metrics.processingRequests})`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Get retry statistics
   */
  async getRetryStats(queueId: string): Promise<{
    totalRetries: number;
    averageAttemptsPerRequest: number;
    maxAttemptsAny: number;
    requestsWithoutRetries: number;
  }> {
    const totalResult = await this.db.query(
      `SELECT SUM(retry_count) as total FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const totalRetries = parseInt(totalResult.rows[0].total || '0', 10);

    const avgResult = await this.db.query(
      `SELECT AVG(retry_count) as avg FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const averageAttemptsPerRequest = avgResult.rows[0].avg
      ? Math.round(parseFloat(avgResult.rows[0].avg) * 100) / 100
      : 0;

    const maxResult = await this.db.query(
      `SELECT MAX(retry_count) as max FROM request_queue_items WHERE queue_id = $1`,
      [queueId]
    );
    const maxAttemptsAny = parseInt(maxResult.rows[0].max || '0', 10);

    const noRetryResult = await this.db.query(
      `SELECT COUNT(*) as count FROM request_queue_items 
       WHERE queue_id = $1 AND retry_count = 0`,
      [queueId]
    );
    const requestsWithoutRetries = parseInt(noRetryResult.rows[0].count, 10);

    return {
      totalRetries,
      averageAttemptsPerRequest,
      maxAttemptsAny,
      requestsWithoutRetries,
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}