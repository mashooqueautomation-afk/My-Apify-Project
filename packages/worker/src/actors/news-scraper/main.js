const { Actor } = require('../_shared/runtime');
const {
  cleanText,
  cleanUrl,
  dedupeRecords,
  saveOutput,
  withMetadata,
} = require('../_shared/data-utils');
const {
  CaptchaDetector,
  PageHelpers,
  RequestThrottler,
  RetryHelper,
  StealthBrowser,
} = require('../anti-bot');

const SITE_ADAPTERS = {
  bbc: {
    listReady: ['main a[href*="/news/"]', '[data-testid="card-headline"]'],
    linkSelector: 'main a[href*="/news/"]',
  },
  cnn: {
    listReady: ['a[href*="/202"]', '.container__headline a'],
    linkSelector: '.container__headline a, a[href*="/202"]',
  },
  hackernews: {
    listReady: ['.athing', '.titleline a'],
    linkSelector: '.titleline a',
  },
  medium: {
    listReady: ['article a[href*="/p/"]', 'h2'],
    linkSelector: 'article a[href*="/p/"]',
  },
  generic: {
    listReady: ['article a[href]', 'main a[href]'],
    linkSelector: 'article a[href], main a[href]',
  },
};

function detectSite(url) {
  const host = new URL(url).hostname;
  if (host.includes('bbc.')) return 'bbc';
  if (host.includes('cnn.')) return 'cnn';
  if (host.includes('news.ycombinator.com') || host.includes('hn.algolia.com')) return 'hackernews';
  if (host.includes('medium.com')) return 'medium';
  return 'generic';
}

function buildSeedUrls(input) {
  if (Array.isArray(input.startUrls) && input.startUrls.length) {
    return input.startUrls.map((entry) => typeof entry === 'string' ? entry : entry.url).filter(Boolean);
  }

  if (input.query && input.site === 'bbc') {
    return [`https://www.bbc.com/search?q=${encodeURIComponent(input.query)}`];
  }
  if (input.query && input.site === 'cnn') {
    return [`https://edition.cnn.com/search?q=${encodeURIComponent(input.query)}`];
  }
  if (input.query && input.site === 'medium') {
    return [`https://medium.com/search/posts?q=${encodeURIComponent(input.query)}`];
  }
  if (input.query && input.site === 'hackernews') {
    return [`https://hn.algolia.com/?dateRange=all&page=0&prefix=true&query=${encodeURIComponent(input.query)}&sort=byDate&type=story`];
  }

  return ['https://news.ycombinator.com/'];
}

async function collectArticleLinks(page, adapterName) {
  const adapter = SITE_ADAPTERS[adapterName] || SITE_ADAPTERS.generic;
  return page.evaluate((selector) => {
    const anchors = Array.from(document.querySelectorAll(selector));
    return anchors.map((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href) return null;
      return new URL(href, window.location.origin).toString();
    }).filter(Boolean);
  }, adapter.linkSelector);
}

async function extractArticle(page, siteName, sourceUrl) {
  return page.evaluate(({ siteName, sourceUrl }) => {
    const pickMeta = (...keys) => {
      for (const key of keys) {
        const node = document.querySelector(`meta[name="${key}"], meta[property="${key}"]`);
        const content = node?.getAttribute('content');
        if (content) return content.trim();
      }
      return null;
    };

    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || null;
    const headline = text('h1') || pickMeta('og:title', 'twitter:title');
    const summary = text('main p') || text('article p') || pickMeta('description', 'og:description', 'twitter:description');
    const author = text('[rel="author"], [data-testid="byline-name"], .byline__name, a[href*="/author/"]') || pickMeta('author');
    const publicationDate = document.querySelector('time')?.getAttribute('datetime')
      || pickMeta('article:published_time', 'og:updated_time');
    const category = text('[data-testid="card-metadata-tag"], .breadcrumb__link, a[href*="/topic/"], a[href*="/section/"]');
    const articleBody = Array.from(document.querySelectorAll('article p, main p'))
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join('\n\n');

    const paywallDetected = Boolean(
      document.body?.innerText?.toLowerCase().includes('subscribe to continue')
      || document.body?.innerText?.toLowerCase().includes('sign in to continue')
      || document.body?.innerText?.toLowerCase().includes('membership required')
    );

    return {
      headline,
      summary,
      link: window.location.href,
      author,
      publicationDate,
      category,
      bodyPreview: articleBody || null,
      paywallDetected,
      sourceType: `${siteName}-article`,
      sourceUrl,
    };
  }, { siteName, sourceUrl });
}

Actor.main(async () => {
  const input = await Actor.getInput();
  const dataset = await Actor.openDataset();
  const kvs = await Actor.openKeyValueStore();

  const seedUrls = buildSeedUrls(input);
  const maxArticles = Math.max(1, Math.min(Number(input.maxArticles || 50), 150));
  const maxLinksPerSeed = Math.max(5, Math.min(Number(input.maxLinksPerSeed || 30), 100));
  const includeArticleBody = input.includeArticleBody !== false;

  const { browser, context } = await StealthBrowser.launch({
    proxyUrl: input.proxyUrl,
    headless: input.headless !== false,
    blockResources: true,
    resourceTypes: ['font', 'media'],
  });
  const throttler = new RequestThrottler({
    minDelay: Number(input.minDelay || 1000),
    maxDelay: Number(input.maxDelay || 2600),
    burstLimit: 2,
  });

  const records = [];

  try {
    for (const seedUrl of seedUrls) {
      const siteName = input.site || detectSite(seedUrl);
      const adapter = SITE_ADAPTERS[siteName] || SITE_ADAPTERS.generic;
      const page = await context.newPage();

      try {
        await throttler.wait();
        await page.goto(seedUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await PageHelpers.acceptCommonBanners(page);

        const selector = await PageHelpers.waitForAnySelector(page, adapter.listReady, 15000);
        if (!selector) {
          Actor.log.warn(`No article list selector matched for ${seedUrl}`);
          continue;
        }

        await PageHelpers.autoScroll(page, { steps: 5, stepPx: 1200 });
        const articleLinks = dedupeRecords(
          (await collectArticleLinks(page, siteName)).map((link) => ({ url: link })),
          ['url']
        ).map((entry) => entry.url).slice(0, maxLinksPerSeed);

        for (const link of articleLinks) {
          if (records.length >= maxArticles) break;

          const articlePage = await context.newPage();
          try {
            await throttler.wait();
            await Actor.setStatusMessage(`Scraping article ${records.length + 1}/${maxArticles}`);

            await RetryHelper.run(
              async () => {
                await articlePage.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 });
              },
              {
                retries: 2,
                shouldRetry: (error) => /timeout|429|503|ECONNRESET/i.test(String(error.message || error)),
              }
            );

            const captcha = await CaptchaDetector.check(articlePage);
            if (captcha.detected) {
              Actor.log.warn(`Skipping article due to ${captcha.type}: ${link}`);
              continue;
            }

            const article = await extractArticle(articlePage, siteName, seedUrl);
            const normalized = withMetadata({
              headline: cleanText(article.headline),
              summary: cleanText(article.summary),
              link: cleanUrl(article.link),
              author: cleanText(article.author),
              publicationDate: article.publicationDate || null,
              category: cleanText(article.category),
              bodyPreview: includeArticleBody ? cleanText(article.bodyPreview) : null,
              paywallDetected: Boolean(article.paywallDetected),
            }, {
              sourceUrl: seedUrl,
              sourceType: `${siteName}-article`,
            });

            if (normalized.headline && normalized.link) {
              records.push(normalized);
            }
          } catch (error) {
            Actor.log.error(`Article scrape failed for ${link}: ${error.message}`);
          } finally {
            await articlePage.close().catch(() => {});
          }
        }
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const output = await saveOutput({
    Actor,
    dataset,
    kvs,
    records: dedupeRecords(records, ['link']),
    meta: {
      actor: 'news-scraper',
      requestedArticles: maxArticles,
      sites: [...new Set(seedUrls.map((url) => input.site || detectSite(url)))],
    },
  });

  Actor.log.info(`News scraper finished with ${output.count} articles`);
});
