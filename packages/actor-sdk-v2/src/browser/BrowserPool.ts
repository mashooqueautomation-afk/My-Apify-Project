import { Browser, chromium } from 'playwright';

export interface BrowserPoolOptions {
  maxBrowsers?: number;
  headless?: boolean;
}

export class BrowserPool {
  private browsers: Browser[] = [];

  private options: Required<BrowserPoolOptions>;

  constructor(options: BrowserPoolOptions = {}) {
    this.options = {
      maxBrowsers: options.maxBrowsers || 5,
      headless: options.headless ?? true,
    };
  }

  /**
   * Get browser from pool
   */
  async getBrowser(): Promise<Browser> {

    // reuse existing browser
    if (this.browsers.length > 0) {
      return this.browsers[0];
    }

    // create new browser
    if (
      this.browsers.length <
      this.options.maxBrowsers
    ) {

      const browser =
        await chromium.launch({
          headless:
            this.options.headless,
        });

      this.browsers.push(browser);

      return browser;
    }

    // fallback reuse
    return this.browsers[0];
  }

  /**
   * Close all browsers
   */
  async destroy(): Promise<void> {

    for (const browser of this.browsers) {
      await browser.close();
    }

    this.browsers = [];
  }

  /**
   * Pool stats
   */
  getStats() {
    return {
      browsers: this.browsers.length,
      maxBrowsers:
        this.options.maxBrowsers,
    };
  }
}