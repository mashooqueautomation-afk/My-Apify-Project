import { BrowserManager, BrowserOptions } from '../browser/BrowserManager';
import { chromium, Browser } from 'playwright';

/**
 * Actor Browser Wrapper
 * Provides high-level browser API for actors
 */

export class ActorBrowser {
  private browserManager: BrowserManager | null = null;
  private playwrightBrowser: Browser | null = null;
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * Launch browser
   */
  async launch(options: BrowserOptions = {}): Promise<BrowserManager> {
    try {
      // Launch Playwright browser
      this.playwrightBrowser = await chromium.launch({
        headless: options.headless !== false,
      });

      // Initialize manager
      this.browserManager = new BrowserManager(this.logger);
      await this.browserManager.init(this.playwrightBrowser, options);

      this.logger.info('Browser launched successfully');

      return this.browserManager;
    } catch (err) {
      this.logger.error('Browser launch failed', err);
      throw err;
    }
  }

  /**
   * Get current browser manager instance
   */
  getManager(): BrowserManager {
    if (!this.browserManager) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    return this.browserManager;
  }

  /**
   * Check if browser is active
   */
  isActive(): boolean {
    return this.browserManager !== null;
  }

  /**
   * Close browser completely
   */
  async close(): Promise<void> {
    try {
      if (this.browserManager) {
        await this.browserManager.cleanup();
        this.browserManager = null;
      }

      if (this.playwrightBrowser) {
        await this.playwrightBrowser.close();
        this.playwrightBrowser = null;
      }

      this.logger.info('Browser closed');
    } catch (err) {
      this.logger.error('Browser close failed', err);
      throw err;
    }
  }
}