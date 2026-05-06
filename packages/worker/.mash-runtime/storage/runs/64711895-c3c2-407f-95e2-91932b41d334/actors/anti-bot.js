/**
 * WebMiner Anti-Bot Protection Module
 * Provides stealth browser configuration, request randomization,
 * CAPTCHA detection, and fingerprint evasion for Playwright actors.
 *
 * Usage in actors:
 *   const { StealthBrowser, RequestThrottler, CaptchaDetector } = require('./anti-bot');
 */

const { chromium } = require('playwright');

// ─── User Agent Pool ──────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900  },
  { width: 1366, height: 768  },
  { width: 1280, height: 800  },
  { width: 1536, height: 864  },
];

const LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU'];
const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Asia/Tokyo',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Stealth Browser Factory ──────────────────────────────────────────────────

class StealthBrowser {
  /**
   * Launch a Playwright browser with full stealth configuration
   */
  static async launch(options = {}) {
    const {
      proxyUrl,
      headless = true,
      randomizeFingerprint = true,
      blockResources = true,
      resourceTypes = ['image', 'font', 'media'],
    } = options;

    const browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-client-side-phishing-detection',
        '--no-first-run',
        '--no-default-browser-check',
        '--ignore-certificate-errors',
        `--window-size=${randomizeFingerprint ? randomItem(VIEWPORTS).width : 1280},${
          randomizeFingerprint ? randomItem(VIEWPORTS).height : 800
        }`,
      ],
      ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
    });

    const ua         = randomItem(USER_AGENTS);
    const viewport   = randomItem(VIEWPORTS);
    const locale     = randomItem(LOCALES);
    const timezone   = randomItem(TIMEZONES);

    const context = await browser.newContext({
      userAgent:        ua,
      viewport:         randomizeFingerprint ? viewport : { width: 1280, height: 800 },
      locale,
      timezoneId:       timezone,
      colorScheme:      'light',
      deviceScaleFactor: randomizeFingerprint ? randomItem([1, 1, 2]) : 1,
      hasTouch:         false,
      isMobile:         false,
      javaScriptEnabled: true,
      bypassCSP:        false,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language':    `${locale},en;q=0.9`,
        'Accept-Encoding':    'gzip, deflate, br',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest':    'document',
        'Sec-Fetch-Mode':    'navigate',
        'Sec-Fetch-Site':    'none',
        'Sec-Fetch-User':    '?1',
        'Cache-Control':     'max-age=0',
        'DNT':               '1',
      },
    });

    // Block unnecessary resource types to speed up scraping
    if (blockResources && resourceTypes.length > 0) {
      await context.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (resourceTypes.includes(type)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    // Apply stealth scripts to every page
    await context.addInitScript(StealthBrowser._stealthScript());

    return { browser, context, meta: { userAgent: ua, viewport, locale, timezone } };
  }

  /**
   * Inject stealth scripts to evade bot detection
   */
  static _stealthScript() {
    return `
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });

      // Spoof plugin count
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin',   filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
            { name: 'Chrome PDF Viewer',   filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
            { name: 'Native Client',       filename: 'internal-nacl-plugin', description: '', length: 2 },
          ];
          plugins.__proto__ = PluginArray.prototype;
          return plugins;
        },
      });

      // Spoof languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Fix iframe contentWindow check
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );

      // Mask automation via chrome object
      window.chrome = {
        app: { isInstalled: false },
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({}),
      };

      // Spoof connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
        }),
      });

      // Fix toString fingerprint
      const nativeToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return nativeToString.call(this);
      };
    `;
  }

  /**
   * Human-like page interaction helpers
   */
  static async humanType(page, selector, text) {
    await page.click(selector);
    for (const char of text) {
      await page.keyboard.type(char);
      await page.waitForTimeout(randomInt(50, 150));
    }
  }

  static async humanScroll(page, direction = 'down', amount = null) {
    const scrollAmount = amount ?? randomInt(300, 800);
    await page.evaluate((y) => window.scrollBy(0, y), direction === 'down' ? scrollAmount : -scrollAmount);
    await page.waitForTimeout(randomInt(500, 1500));
  }

  static async humanMove(page, x, y) {
    // Move to random intermediate point first
    const midX = x + randomInt(-50, 50);
    const midY = y + randomInt(-50, 50);
    await page.mouse.move(midX, midY, { steps: randomInt(3, 8) });
    await page.waitForTimeout(randomInt(50, 200));
    await page.mouse.move(x, y, { steps: randomInt(3, 6) });
  }

  static async humanClick(page, selector) {
    const el = await page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    const box = await el.boundingBox();
    if (box) {
      const x = box.x + box.width  * (0.2 + Math.random() * 0.6);
      const y = box.y + box.height * (0.2 + Math.random() * 0.6);
      await StealthBrowser.humanMove(page, x, y);
      await page.waitForTimeout(randomInt(100, 400));
      await page.mouse.click(x, y);
    } else {
      await el.click();
    }
  }
}

// ─── Request Throttler ────────────────────────────────────────────────────────

class RequestThrottler {
  constructor(options = {}) {
    this.minDelay   = options.minDelay   ?? 500;
    this.maxDelay   = options.maxDelay   ?? 3000;
    this.burstLimit = options.burstLimit ?? 5;
    this.burstWindow = options.burstWindow ?? 10000; // ms
    this._requestTimes = [];
  }

  async wait() {
    const now = Date.now();
    // Remove old entries outside burst window
    this._requestTimes = this._requestTimes.filter(t => now - t < this.burstWindow);

    // If we're at burst limit, wait for the oldest to expire
    if (this._requestTimes.length >= this.burstLimit) {
      const oldestAge = now - this._requestTimes[0];
      const waitTime = this.burstWindow - oldestAge + randomInt(100, 500);
      if (waitTime > 0) {
        await new Promise(r => setTimeout(r, waitTime));
      }
    }

    // Add jittered delay between requests
    const delay = randomInt(this.minDelay, this.maxDelay);
    await new Promise(r => setTimeout(r, delay));

    this._requestTimes.push(Date.now());
  }
}

class RetryHelper {
  static async run(task, options = {}) {
    const {
      retries = 3,
      baseDelayMs = 1000,
      maxDelayMs = 10000,
      shouldRetry = () => true,
      onRetry = () => {},
    } = options;

    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= retries || !shouldRetry(error, attempt)) {
          throw error;
        }
        const delay = Math.min(baseDelayMs * (2 ** attempt) + randomInt(100, 600), maxDelayMs);
        await onRetry(error, attempt, delay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt += 1;
      }
    }

    throw lastError;
  }
}

class UserAgentManager {
  static getProfile() {
    const userAgent = randomItem(USER_AGENTS);
    const locale = randomItem(LOCALES);
    const viewport = randomItem(VIEWPORTS);

    return {
      userAgent,
      locale,
      viewport,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': `${locale},en;q=0.9`,
        'Cache-Control': 'max-age=0',
        'Sec-CH-UA-Mobile': '?0',
        'Upgrade-Insecure-Requests': '1',
      },
    };
  }
}

class PageHelpers {
  static async acceptCommonBanners(page) {
    const selectors = [
      'button:has-text("Accept")',
      'button:has-text("Accept all")',
      'button:has-text("I agree")',
      'button:has-text("Continue")',
      '#onetrust-accept-btn-handler',
      '[aria-label="Accept cookies"]',
    ];

    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
          await button.click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(randomInt(300, 900));
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  }

  static async autoScroll(page, options = {}) {
    const {
      steps = 10,
      stepPx = 1200,
      waitMs = [500, 1000],
      stopWhen = null,
    } = options;

    for (let index = 0; index < steps; index += 1) {
      await page.evaluate((pixels) => window.scrollBy(0, pixels), stepPx);
      await page.waitForTimeout(randomInt(waitMs[0], waitMs[1]));
      if (stopWhen && await stopWhen(index)) break;
    }
  }

  static async waitForAnySelector(page, selectors, timeout = 10000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      for (const selector of selectors) {
        if (await page.$(selector)) return selector;
      }
      await page.waitForTimeout(250);
    }
    return null;
  }
}

// ─── CAPTCHA Detector ─────────────────────────────────────────────────────────

class CaptchaDetector {
  /**
   * Check if current page has a CAPTCHA
   * Returns: { detected: boolean, type: string | null }
   */
  static async check(page) {
    try {
      const result = await page.evaluate(() => {
        const body = document.body?.innerHTML?.toLowerCase() ?? '';
        const title = document.title?.toLowerCase() ?? '';

        const checks = {
          recaptcha:       body.includes('g-recaptcha') || body.includes('recaptcha/api.js'),
          hcaptcha:        body.includes('hcaptcha.com') || body.includes('h-captcha'),
          cloudflare:      body.includes('cf-browser-verification') || body.includes('cloudflare') && body.includes('checking your browser'),
          datadome:        body.includes('datadome') || body.includes('_dd_s'),
          akamai:          body.includes('akamai') || body.includes('_abck'),
          imperva:         body.includes('incapsula') || body.includes('imperva'),
          distilNetworks:  body.includes('distil_r_captcha'),
          arkose:          body.includes('arkoselabs') || body.includes('funcaptcha'),
          accessDenied:    title.includes('access denied') || title.includes('403') || body.includes('access denied'),
          robotCheck:      body.includes('robot') && (body.includes('verify') || body.includes('check')),
        };

        const detected = Object.entries(checks).find(([, v]) => v);
        return {
          detected: !!detected,
          type:     detected ? detected[0] : null,
        };
      });
      return result;
    } catch {
      return { detected: false, type: null };
    }
  }

  /**
   * Wait and check again — handles Cloudflare JS challenges (usually 5s)
   */
  static async waitAndCheck(page, maxWaitMs = 15000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const result = await CaptchaDetector.check(page);
      if (!result.detected) return { cleared: true };
      if (result.type !== 'cloudflare') {
        return { cleared: false, type: result.type };  // Non-JS challenge, can't auto-solve
      }
      await page.waitForTimeout(2000);
    }
    return { cleared: false, type: 'cloudflare' };
  }
}

// ─── IP Rotation Helper ───────────────────────────────────────────────────────

class IpRotation {
  /**
   * Get current IP via proxy
   */
  static async getCurrentIp(page) {
    try {
      const resp = await page.evaluate(async () => {
        const r = await fetch('https://api.ipify.org?format=json');
        return r.json();
      });
      return resp.ip;
    } catch {
      return null;
    }
  }

  /**
   * Verify proxy is working by checking if IP differs from residential
   */
  static async verifyProxy(page, expectedCountry = null) {
    try {
      const resp = await page.evaluate(async () => {
        const r = await fetch('https://ipapi.co/json/');
        return r.json();
      });
      return {
        ip:      resp.ip,
        country: resp.country_code,
        city:    resp.city,
        valid:   expectedCountry ? resp.country_code === expectedCountry : true,
      };
    } catch {
      return { valid: false };
    }
  }
}

// ─── Session Manager ──────────────────────────────────────────────────────────

class SessionManager {
  constructor(kvStore) {
    this.kvs = kvStore;
  }

  async saveSession(domain, cookies, localStorage = {}) {
    await this.kvs.setValue(`session:${domain}`, {
      cookies,
      localStorage,
      savedAt: new Date().toISOString(),
    });
  }

  async loadSession(context, domain) {
    const session = await this.kvs.getValue(`session:${domain}`);
    if (!session) return false;

    const ageMs = Date.now() - new Date(session.savedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) return false; // Stale after 24h

    if (session.cookies?.length) {
      await context.addCookies(session.cookies);
    }
    return true;
  }

  async captureSession(page, domain) {
    const cookies = await page.context().cookies();
    const domainCookies = cookies.filter(c =>
      c.domain.includes(domain.replace(/https?:\/\//, ''))
    );
    await this.saveSession(domain, domainCookies);
    return domainCookies;
  }
}

module.exports = {
  StealthBrowser,
  RequestThrottler,
  RetryHelper,
  UserAgentManager,
  PageHelpers,
  CaptchaDetector,
  IpRotation,
  SessionManager,
  randomInt,
  randomItem,
};
