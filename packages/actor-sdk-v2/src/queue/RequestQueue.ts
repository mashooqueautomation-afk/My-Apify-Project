import { Logger } from '../logging/Logger';
import { ApiClient } from '../core/ApiClient';
import { RequestQueueItem, RequestQueueStats } from '../types/index';

export class RequestQueue {
  private processedUrls = new Set<string>();

  constructor(
    private id: string,
    private apiClient: ApiClient,
    private logger: Logger
  ) {}

  /**
   * Add request to queue
   * Handles deduplication and retry logic
   */
  async addRequest(item: RequestQueueItem): Promise<{ id: string }> {
    if (!item.url) {
      throw new Error('URL is required');
    }

    // Client-side deduplication tracking (server does actual dedup)
    const urlHash = Buffer.from(item.url).toString('base64');
    if (this.processedUrls.has(urlHash)) {
      this.logger.debug('Duplicate URL skipped', { url: item.url });
      return { id: 'deduplicated' };
    }

    try {
      const result = await this.apiClient.post(
        `/request-queues/${this.id}/requests`,
        {
          url: item.url,
          userData: item.userData || {},
          priority: item.priority || 0,
          headers: item.headers,
          method: item.method || 'GET',
          body: item.body,
        }
      );

      this.processedUrls.add(urlHash);
      return result as { id: string };
    } catch (err) {
      this.logger.error('Failed to add request', err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Batch add requests
   */
  async addRequests(items: RequestQueueItem[]): Promise<void> {
    const results = await Promise.allSettled(
      items.map(item => this.addRequest(item))
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      this.logger.warn(`${failed}/${items.length} requests failed to add`);
    }
  }

  /**
   * Fetch pending requests
   */
  async getHead(limit: number = 25): Promise<RequestQueueItem[]> {
    const result = await this.apiClient.get(
      `/request-queues/${this.id}/head?limit=${Math.min(limit, 100)}`
    );
    return (result as any).data || [];
  }

  /**
   * Mark request as succeeded
   */
  async markRequestHandled(requestId: string): Promise<void> {
    await this.apiClient.post(
      `/request-queues/${this.id}/requests/${requestId}/handled`,
      {}
    );
  }

  /**
   * Mark request as failed (will retry)
   */
  async markRequestFailed(requestId: string, errorMsg?: string): Promise<void> {
    await this.apiClient.post(
      `/request-queues/${this.id}/requests/${requestId}/failed`,
      { error: errorMsg }
    );
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<RequestQueueStats> {
    const result = await this.apiClient.get(`/request-queues/${this.id}/stats`);
    return result as RequestQueueStats;
  }
}