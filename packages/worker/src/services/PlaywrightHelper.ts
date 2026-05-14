import { chromium, Browser, BrowserContext } from 'playwright';
import { logger } from '../utils/logger';

/**
 * Playwright Helper Service
 * Manages Playwright browser instances for actor execution
 */

export class PlaywrightHelper {
  /**
   * Check if Playwright is available
   */
  static isAvailable(): boolean {
    try {
      require.resolve('playwright');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Launch browser for actor execution
   */
  static async launchBrowser(
    runId: string,
    options?: {
      headless?: boolean;
      timeout?: number;
      proxy?: string;
    }
  ): Promise<Browser> {
    try {
      logger.info(`[Run:${runId}] Launching Playwright browser`);

      const browser = await chromium.launch({
        headless: options?.headless !== false,
        args: options?.proxy ? [`--proxy-server=${options.proxy}`] : undefined,
      });

      logger.info(`[Run:${runId}] Browser launched successfully`);

      return browser;
    } catch (err) {
      logger.error(`[Run:${runId}] Browser launch failed`, err);
      throw err;
    }
  }

  /**
   * Create browser context with options
   */
  static async createContext(
    browser: Browser,
    runId: string,
    options?: {
      userAgent?: string;
      viewportWidth?: number;
      viewportHeight?: number;
      cookies?: any[];
    }
  ): Promise<BrowserContext> {
    try {
      const context = await browser.newContext({
        viewport: {
          width: options?.viewportWidth || 1920,
          height: options?.viewportHeight || 1080,
        },
        userAgent:
          options?.userAgent ||
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      });

      if (options?.cookies && options.cookies.length > 0) {
        await context.addCookies(options.cookies);
      }

      logger.info(`[Run:${runId}] Browser context created`);

      return context;
    } catch (err) {
      logger.error(`[Run:${runId}] Context creation failed`, err);
      throw err;
    }
  }

  /**
   * Close browser gracefully
   */
  static async closeBrowser(
    browser: Browser,
    runId: string
  ): Promise<void> {
    try {
      await browser.close();

      logger.info(`[Run:${runId}] Browser closed`);
    } catch (err) {
      logger.error(`[Run:${runId}] Browser close failed`, err);
      throw err;
    }
  }

  /**
   * Monitor browser memory usage
   */
  static getMemoryUsage(): {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  } {
    const mem = process.memoryUsage();

    return {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      rss: Math.round(mem.rss / 1024 / 1024),
    };
  }

  /**
   * Kill browser on timeout
   */
  static async killBrowserOnTimeout(
    browser: Browser,
    runId: string,
    timeoutMs: number
  ): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        logger.warn(`[Run:${runId}] Browser timeout (${timeoutMs}ms), killing...`);

        browser.close().catch((err) => {
          logger.error(`[Run:${runId}] Force kill failed`, err);
        });

        resolve();
      }, timeoutMs);
    });
  }
}