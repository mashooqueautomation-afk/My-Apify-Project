import { ActorBrowser, BrowserOptions } from './ActorBrowser';
import { BrowserManager } from '../browser/BrowserManager';
import { Dataset } from '../storage/Dataset';
import { Logger } from '../logging/Logger';
import { ApiClient } from '../core/ApiClient';

/**
 * Enhanced Actor Class with Browser Support
 * Extends the base Actor with Playwright browser capabilities
 */

export class ActorWithBrowser {
  private id: string;
  private runId: string;
  private apiUrl: string;
  private apiToken: string;
  private datasetId?: string;
  private logger: Logger;
  private apiClient: ApiClient;
  private dataset?: Dataset;
  private browser: ActorBrowser;

  constructor(config: {
    actorId: string;
    runId: string;
    apiUrl: string;
    apiToken: string;
    datasetId?: string;
  }) {
    this.id = config.actorId;
    this.runId = config.runId;
    this.apiUrl = config.apiUrl;
    this.apiToken = config.apiToken;
    this.datasetId = config.datasetId;

    // Initialize core services
    this.logger = new Logger({
      runId: this.runId,
      actorId: this.id,
    });

    this.apiClient = new ApiClient(this.apiUrl, this.apiToken, this.logger);
    this.browser = new ActorBrowser(this.logger);

    if (this.datasetId) {
      this.dataset = new Dataset(this.datasetId, this.apiClient, this.logger);
    }
  }

  /**
   * Get logger instance
   */
  getLogger(): Logger {
    return this.logger;
  }

  /**
   * Open dataset for pushing data
   */
  openDataset(): Dataset {
    if (!this.dataset) {
      throw new Error('Dataset ID not configured');
    }

    return this.dataset;
  }

  /**
   * Launch browser
   */
  async launchBrowser(
    options: BrowserOptions = {}
  ): Promise<BrowserManager> {
    this.logger.info('Launching browser', {
      headless: options.headless !== false,
      viewport: `${options.viewportWidth || 1920}x${options.viewportHeight || 1080}`,
    });

    return await this.browser.launch(options);
  }

  /**
   * Get browser manager
   */
  getBrowser(): BrowserManager {
    return this.browser.getManager();
  }

  /**
   * Check if browser is active
   */
  isBrowserActive(): boolean {
    return this.browser.isActive();
  }

  /**
   * Helper: Navigate and get content
   */
  async navigateAndGetContent(url: string): Promise<{
    html: string;
    title: string;
    url: string;
  }> {
    const manager = this.browser.getManager();
    const page = manager.getCurrentPage();

    await manager.goto(url);
    const html = await manager.getContent();
    const title = await page.title();

    return { html, title, url };
  }

  /**
   * Helper: Navigate and take screenshot
   */
  async navigateAndScreenshot(url: string): Promise<Buffer> {
    const manager = this.browser.getManager();

    await manager.goto(url);
    return await manager.screenshot({ fullPage: true });
  }

  /**
   * Helper: Navigate and extract data
   */
  async navigateAndExtract(
    url: string,
    script: (window: any) => any
  ): Promise<any> {
    const manager = this.browser.getManager();

    await manager.goto(url);
    return await manager.evaluate(script);
  }

  /**
   * Helper: Take screenshot and push to dataset
   */
  async screenshotToDataset(
    url: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.dataset) {
      throw new Error('Dataset not configured');
    }

    const manager = this.browser.getManager();

    await manager.goto(url);
    const screenshot = await manager.screenshot({ fullPage: true });

    await this.dataset.pushData({
      url,
      screenshot: screenshot.toString('base64'),
      screenshotSize: screenshot.length,
      timestamp: new Date().toISOString(),
      ...metadata,
    });

    this.logger.info('Screenshot pushed to dataset', { url });
  }

  /**
   * Get browser metrics
   */
  getBrowserMetrics() {
    if (!this.browser.isActive()) {
      return { active: false };
    }

    return {
      active: true,
      ...this.browser.getManager().getMetrics(),
    };
  }

  /**
   * Graceful shutdown
   */
  async exit(code: number = 0): Promise<void> {
    try {
      // Close browser
      if (this.browser.isActive()) {
        await this.browser.close();
      }

      // Close dataset
      if (this.dataset) {
        await this.dataset.finalize();
      }

      this.logger.info('Actor exiting', { code });

      process.exit(code);
    } catch (err) {
      this.logger.error('Exit failed', err);
      process.exit(1);
    }
  }
}

/**
 * Factory function
 */
export function initActorWithBrowser(config?: Partial<{
  actorId: string;
  runId: string;
  apiUrl: string;
  apiToken: string;
  datasetId: string;
}>): ActorWithBrowser {
  const finalConfig = {
    actorId: config?.actorId || process.env.WEBMINER_ACTOR_ID || 'unknown',
    runId: config?.runId || process.env.WEBMINER_RUN_ID || 'unknown',
    apiUrl: config?.apiUrl || process.env.WEBMINER_API_URL || 'http://api:3000',
    apiToken: config?.apiToken || process.env.WEBMINER_API_TOKEN || 'default',
    datasetId: config?.datasetId || process.env.WEBMINER_DATASET_ID,
  };

  return new ActorWithBrowser(finalConfig);
}