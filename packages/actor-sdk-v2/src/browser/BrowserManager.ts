import { Browser, BrowserContext, Page } from 'playwright';

/**
 * Browser Manager Service
 * Manages Playwright browser lifecycle within actor execution
 */

export interface BrowserOptions {
  headless?: boolean;
  timeout?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  userAgent?: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  type?: 'png' | 'jpeg';
  quality?: number;
  omitBackground?: boolean;
}

export interface PDFOptions {
  format?: string;
  landscape?: boolean;
  margin?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
  scale?: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private currentPageId: string | null = null;

  constructor(private logger: any) {}

  /**
   * Initialize browser instance
   */
  async init(
    browser: Browser,
    options: BrowserOptions = {}
  ): Promise<void> {
    this.browser = browser;

    // Create context with options
    this.context = await browser.newContext({
      viewport: {
        width: options.viewportWidth || 1920,
        height: options.viewportHeight || 1080,
      },
      userAgent:
        options.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    this.logger.info('Browser context initialized', {
      viewport: `${options.viewportWidth || 1920}x${options.viewportHeight || 1080}`,
    });
  }

  /**
   * Open new page/tab
   */
  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call init() first.');
    }

    const page = await this.context.newPage();
    const pageId = this.generatePageId();

    this.pages.set(pageId, page);
    this.currentPageId = pageId;

    this.logger.info('New page created', { pageId });

    return page;
  }

  /**
   * Get current active page
   */
  getCurrentPage(): Page {
    if (!this.currentPageId || !this.pages.has(this.currentPageId)) {
      throw new Error('No active page. Call newPage() first.');
    }

    return this.pages.get(this.currentPageId)!;
  }

  /**
   * Switch to page by ID
   */
  switchPage(pageId: string): Page {
    if (!this.pages.has(pageId)) {
      throw new Error(`Page ${pageId} not found`);
    }

    this.currentPageId = pageId;
    this.logger.info('Switched page', { pageId });

    return this.pages.get(pageId)!;
  }

  /**
   * Navigate to URL
   */
  async goto(
    url: string,
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }
  ): Promise<string | null> {
    const page = this.getCurrentPage();

    try {
      const response = await page.goto(url, {
        waitUntil: options?.waitUntil || 'load',
        timeout: 30000,
      });

      this.logger.info('Navigation completed', {
        url,
        status: response?.status(),
      });

      return response?.url() || url;
    } catch (err: any) {
      this.logger.error('Navigation failed', err, { url });
      throw err;
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(
    options: ScreenshotOptions = {}
  ): Promise<Buffer> {
    const page = this.getCurrentPage();

    try {
      const buffer = await page.screenshot({
        fullPage: options.fullPage ?? true,
        type: options.type || 'png',
        quality: options.quality,
        omitBackground: options.omitBackground,
      });

      this.logger.info('Screenshot taken', {
        size: buffer.length,
        fullPage: options.fullPage,
      });

      return buffer;
    } catch (err: any) {
      this.logger.error('Screenshot failed', err);
      throw err;
    }
  }

  /**
   * Generate PDF
   */
  async pdf(options: PDFOptions = {}): Promise<Buffer> {
    const page = this.getCurrentPage();

    try {
      const buffer = await page.pdf({
        format: options.format || 'A4',
        landscape: options.landscape ?? false,
        margin: options.margin,
        scale: options.scale || 1,
      });

      this.logger.info('PDF generated', {
        size: buffer.length,
      });

      return buffer;
    } catch (err: any) {
      this.logger.error('PDF generation failed', err);
      throw err;
    }
  }

  /**
   * Get page content
   */
  async getContent(): Promise<string> {
    const page = this.getCurrentPage();

    try {
      const content = await page.content();

      this.logger.info('Content retrieved', {
        size: content.length,
      });

      return content;
    } catch (err: any) {
      this.logger.error('Get content failed', err);
      throw err;
    }
  }

  /**
   * Evaluate JavaScript in page
   */
  async evaluate<T = any>(
    script: string | ((window: any) => T),
    arg?: any
  ): Promise<T> {
    const page = this.getCurrentPage();

    try {
      const result = await page.evaluate(script, arg);

      this.logger.info('JavaScript evaluated', {
        type: typeof script,
      });

      return result;
    } catch (err: any) {
      this.logger.error('Evaluation failed', err);
      throw err;
    }
  }

  /**
   * Wait for selector
   */
  async waitForSelector(
    selector: string,
    timeout?: number
  ): Promise<void> {
    const page = this.getCurrentPage();

    try {
      await page.waitForSelector(selector, {
        timeout: timeout || 30000,
      });

      this.logger.info('Selector found', { selector });
    } catch (err: any) {
      this.logger.error('Selector wait failed', err, { selector });
      throw err;
    }
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    const page = this.getCurrentPage();

    try {
      await page.click(selector);

      this.logger.info('Element clicked', { selector });
    } catch (err: any) {
      this.logger.error('Click failed', err, { selector });
      throw err;
    }
  }

  /**
   * Fill input field
   */
  async fill(selector: string, text: string): Promise<void> {
    const page = this.getCurrentPage();

    try {
      await page.fill(selector, text);

      this.logger.info('Input filled', { selector });
    } catch (err: any) {
      this.logger.error('Fill failed', err, { selector });
      throw err;
    }
  }

  /**
   * Get text from element
   */
  async getText(selector: string): Promise<string> {
    const page = this.getCurrentPage();

    try {
      const text = await page.textContent(selector);

      this.logger.info('Text extracted', { selector, length: text?.length });

      return text || '';
    } catch (err: any) {
      this.logger.error('Get text failed', err, { selector });
      throw err;
    }
  }

  /**
   * Set cookies
   */
  async setCookies(
    cookies: Array<{
      name: string;
      value: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>
  ): Promise<void> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      await this.context.addCookies(cookies as any);

      this.logger.info('Cookies set', { count: cookies.length });
    } catch (err: any) {
      this.logger.error('Set cookies failed', err);
      throw err;
    }
  }

  /**
   * Get all cookies
   */
  async getCookies(): Promise<any[]> {
    if (!this.context) {
      throw new Error('Browser context not initialized');
    }

    try {
      const cookies = await this.context.cookies();

      this.logger.info('Cookies retrieved', { count: cookies.length });

      return cookies;
    } catch (err: any) {
      this.logger.error('Get cookies failed', err);
      throw err;
    }
  }

  /**
   * Close page
   */
  async closePage(pageId?: string): Promise<void> {
    const id = pageId || this.currentPageId;

    if (!id || !this.pages.has(id)) {
      throw new Error(`Page ${id} not found`);
    }

    const page = this.pages.get(id)!;

    try {
      await page.close();

      this.pages.delete(id);

      if (this.currentPageId === id) {
        this.currentPageId = this.pages.keys().next().value || null;
      }

      this.logger.info('Page closed', { pageId: id });
    } catch (err: any) {
      this.logger.error('Close page failed', err);
      throw err;
    }
  }

  /**
   * Close all pages and context
   */
  async cleanup(): Promise<void> {
    try {
      // Close all pages
      for (const [pageId, page] of this.pages) {
        try {
          await page.close();
        } catch (err) {
          this.logger.warn('Page close failed during cleanup', err, { pageId });
        }
      }

      this.pages.clear();

      // Close context
      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      this.logger.info('Browser cleaned up');
    } catch (err: any) {
      this.logger.error('Browser cleanup failed', err);
      throw err;
    }
  }

  /**
   * Get browser metrics
   */
  getMetrics(): {
    openPages: number;
    memoryUsage?: {
      heapUsed: number;
      heapTotal: number;
    };
  } {
    return {
      openPages: this.pages.size,
      memoryUsage:
        typeof process !== 'undefined'
          ? {
              heapUsed: Math.round(
                process.memoryUsage().heapUsed / 1024 / 1024
              ),
              heapTotal: Math.round(
                process.memoryUsage().heapTotal / 1024 / 1024
              ),
            }
          : undefined,
    };
  }

  private generatePageId(): string {
    return `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}