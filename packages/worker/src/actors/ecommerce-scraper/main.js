const { Actor } = require('../_shared/runtime');
const {
  cleanNumber,
  cleanText,
  cleanUrl,
  dedupeRecords,
  normalizePrice,
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

const SITE_CONFIG = {
  amazon: {
    listReady: ['[data-component-type="s-search-result"]'],
    itemSelector: '[data-component-type="s-search-result"]',
    nextPage: 'a.s-pagination-next:not(.s-pagination-disabled)',
  },
  ebay: {
    listReady: ['.srp-results .s-item'],
    itemSelector: '.srp-results .s-item',
    nextPage: 'a[type="next"], a.pagination__next',
  },
  aliexpress: {
    listReady: ['[class*="search-item-card-wrapper"]', '[class*="manhattan--container"]'],
    itemSelector: '[class*="search-item-card-wrapper"], [class*="manhattan--container"]',
    nextPage: 'button[aria-label="Next page"], a[title="Next page"]',
  },
  generic: {
    listReady: ['article', '.product', '.product-card', '[data-testid*="product"]'],
    itemSelector: 'article, .product, .product-card, [data-testid*="product"]',
    nextPage: 'a[rel="next"], a.next, .pagination-next a',
  },
};

function detectSite(url) {
  const host = new URL(url).hostname;
  if (host.includes('amazon.')) return 'amazon';
  if (host.includes('ebay.')) return 'ebay';
  if (host.includes('aliexpress.')) return 'aliexpress';
  return 'generic';
}

function buildSeedUrls(input) {
  if (Array.isArray(input.startUrls) && input.startUrls.length) {
    return input.startUrls.map((entry) => typeof entry === 'string' ? entry : entry.url).filter(Boolean);
  }

  if (input.query && input.site === 'ebay') {
    return [`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(input.query)}`];
  }
  if (input.query && input.site === 'amazon') {
    return [`https://www.amazon.com/s?k=${encodeURIComponent(input.query)}`];
  }
  if (input.query && input.site === 'aliexpress') {
    return [`https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(input.query)}`];
  }

  return ['https://www.ebay.com/sch/i.html?_nkw=laptop'];
}

async function extractProducts(page, siteName, sourceUrl) {
  return page.evaluate(({ siteName, sourceUrl }) => {
    const selectorMap = {
      amazon: {
        item: '[data-component-type="s-search-result"]',
        title: 'h2 span',
        priceWhole: '.a-price .a-offscreen, .a-price-whole',
        rating: '.a-icon-alt',
        reviews: '[aria-label$="ratings"], [data-csa-c-func-deps="aui-da-a-popover"] span',
        image: 'img.s-image',
        link: 'h2 a',
        seller: 'h5 span, .a-row .a-size-base.a-color-secondary',
      },
      ebay: {
        item: '.srp-results .s-item',
        title: '.s-item__title',
        priceWhole: '.s-item__price',
        rating: '.x-star-rating span[role="text"], .clipped',
        reviews: '.s-item__reviews-count span',
        image: '.s-item__image img',
        link: '.s-item__link',
        seller: '.s-item__seller-info-text',
      },
      aliexpress: {
        item: '[class*="search-item-card-wrapper"], [class*="manhattan--container"]',
        title: 'h3, [class*="multi--titleText"], [class*="title"]',
        priceWhole: '[class*="multi--price-sale"], [class*="price-sale"], [class*="price"]',
        rating: '[class*="star"], [class*="evaluation"]',
        reviews: '[class*="trade"], [class*="sold"], [class*="review"]',
        image: 'img',
        link: 'a[href*="/item/"], a[href*="/i/"]',
        seller: '[class*="store"], [class*="shop"]',
      },
      generic: {
        item: 'article, .product, .product-card, [data-testid*="product"]',
        title: 'h2, h3, [itemprop="name"], .product-title',
        priceWhole: '[itemprop="price"], .price, [class*="price"]',
        rating: '[itemprop="ratingValue"], .rating',
        reviews: '.review-count, [class*="review"]',
        image: 'img',
        link: 'a[href]',
        seller: '.seller, [class*="seller"], [class*="brand"]',
      },
    };

    const selected = selectorMap[siteName] || selectorMap.generic;
    const nodes = Array.from(document.querySelectorAll(selected.item));

    const getText = (root, selector) => root.querySelector(selector)?.textContent?.trim() || null;
    const getAttr = (root, selector, attr) => root.querySelector(selector)?.getAttribute(attr) || null;

    return nodes.map((node) => {
      const relativeUrl = getAttr(node, selected.link, 'href');
      return {
        title: getText(node, selected.title),
        rawPrice: getText(node, selected.priceWhole),
        rawRating: getText(node, selected.rating),
        rawReviewCount: getText(node, selected.reviews),
        image: getAttr(node, selected.image, 'src') || getAttr(node, selected.image, 'data-src'),
        seller: getText(node, selected.seller),
        availability: getText(node, '[aria-label*="stock"], [class*="availability"], [class*="stock"]'),
        url: relativeUrl ? new URL(relativeUrl, window.location.origin).toString() : null,
        sourceUrl,
      };
    }).filter((item) => item.title || item.url);
  }, { siteName, sourceUrl });
}

function normalizeProducts(rawProducts, siteName) {
  return rawProducts.map((item) => {
    const price = normalizePrice(item.rawPrice, siteName === 'amazon' || siteName === 'ebay' ? 'USD' : null);
    return withMetadata({
      title: cleanText(item.title),
      price: price.amount,
      currency: price.currency,
      rating: cleanNumber(item.rawRating),
      reviewCount: cleanNumber(item.rawReviewCount),
      availability: cleanText(item.availability),
      image: cleanUrl(item.image),
      seller: cleanText(item.seller),
      sku: item.url?.match(/\/([A-Z0-9]{8,14})(?:[/?]|$)/i)?.[1] || null,
      url: cleanUrl(item.url),
    }, {
      sourceUrl: item.sourceUrl,
      sourceType: `${siteName}-product`,
    });
  }).filter((item) => item.title && item.url);
}

Actor.main(async () => {
  const input = await Actor.getInput();
  const dataset = await Actor.openDataset();
  const kvs = await Actor.openKeyValueStore();

  const seedUrls = buildSeedUrls(input);
  const maxProducts = Math.max(1, Math.min(Number(input.maxProducts || 50), 250));
  const maxPages = Math.max(1, Math.min(Number(input.maxPages || 3), 10));
  const throttler = new RequestThrottler({
    minDelay: Number(input.minDelay || 1200),
    maxDelay: Number(input.maxDelay || 3500),
    burstLimit: 2,
  });

  const { browser, context } = await StealthBrowser.launch({
    proxyUrl: input.proxyUrl,
    headless: input.headless !== false,
    blockResources: true,
    resourceTypes: ['font', 'media'],
  });

  const collected = [];

  try {
    for (const seedUrl of seedUrls) {
      const siteName = input.site || detectSite(seedUrl);
      const site = SITE_CONFIG[siteName] || SITE_CONFIG.generic;
      let nextUrl = seedUrl;
      let pageNumber = 0;

      while (nextUrl && pageNumber < maxPages && collected.length < maxProducts) {
        const page = await context.newPage();
        try {
          pageNumber += 1;
          await throttler.wait();
          await Actor.setStatusMessage(`Scraping ${siteName} page ${pageNumber}`);

          await RetryHelper.run(
            async () => {
              await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            },
            {
              retries: 2,
              shouldRetry: (error) => /timeout|net::|429|503/i.test(String(error.message || error)),
              onRetry: async (error, attempt, delay) => {
                Actor.log.warn(`Retrying ${nextUrl} after error: ${error.message || error} (attempt ${attempt + 1}, wait ${delay}ms)`);
              },
            }
          );

          await PageHelpers.acceptCommonBanners(page);
          const captcha = await CaptchaDetector.check(page);
          if (captcha.detected) {
            throw new Error(`CAPTCHA detected on ${siteName}: ${captcha.type}`);
          }

          const readySelector = await PageHelpers.waitForAnySelector(page, site.listReady, 12000);
          if (!readySelector) {
            Actor.log.warn(`No product list matched on ${nextUrl}`);
            break;
          }

          await PageHelpers.autoScroll(page, { steps: 8, stepPx: 1400 });
          const normalized = normalizeProducts(await extractProducts(page, siteName, nextUrl), siteName);
          const fresh = dedupeRecords(normalized).filter((item) => !collected.some((seen) => seen.url === item.url));
          if (fresh.length) {
            collected.push(...fresh.slice(0, maxProducts - collected.length));
            Actor.log.info(`Collected ${fresh.length} ${siteName} products from page ${pageNumber}`);
          }

          nextUrl = await page.evaluate((selector) => {
            const anchor = document.querySelector(selector);
            const href = anchor?.getAttribute('href');
            if (!href) return null;
            return new URL(href, window.location.origin).toString();
          }, site.nextPage).catch(() => null);
        } catch (error) {
          Actor.log.error(`Failed on ${nextUrl}: ${error.message}`);
          nextUrl = null;
        } finally {
          await page.close().catch(() => {});
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const output = await saveOutput({
    Actor,
    dataset,
    kvs,
    records: collected.slice(0, maxProducts),
    meta: {
      actor: 'ecommerce-scraper',
      requestedProducts: maxProducts,
      sites: [...new Set(seedUrls.map((url) => input.site || detectSite(url)))],
    },
  });

  Actor.log.info(`E-commerce scraper finished with ${output.count} products`);
});
