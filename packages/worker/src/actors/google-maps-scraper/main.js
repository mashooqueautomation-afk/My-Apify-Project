/**
 * Google Maps Scraper Actor
 * Scrapes business listings from Google Maps
 * Input: { query, location, maxResults, language }
 */

const { chromium } = require('playwright');
const { Actor } = require('../../actor-sdk/src/index');

const SELECTORS = {
  searchInput:    'input#searchboxinput',
  searchButton:   'button#searchbox-searchbutton',
  resultsList:    'div[role="feed"]',
  resultItem:     'div[role="feed"] > div > div[jsaction]',
  placeName:      'div.qBF1Pd.fontHeadlineSmall',
  rating:         'span.MW4etd',
  reviewCount:    'span.UY7F9',
  category:       'div.W4Efsd:first-of-type span.W4Efsd > span:first-child',
  address:        'div.W4Efsd:nth-of-type(2) span.W4Efsd > span:first-child',
  phone:          'span.UsdlK',
  website:        'a[data-value="Website"]',
  hours:          'div.t39EBf.GUrTXd',
  // Detail panel
  detailName:     'h1.DUwDvf.lfPIob',
  detailRating:   'div.F7nice span[aria-hidden="true"]:first-child',
  detailReviews:  'div.F7nice span[aria-label]',
  detailAddress:  'button[data-item-id="address"] div.rogA2c',
  detailPhone:    'button[data-item-id^="phone"] div.rogA2c',
  detailWebsite:  'a[data-item-id="authority"]',
  detailCategory: 'button.DkEaL',
  detailHours:    'div.t39EBf table',
  plusCode:       'button[data-item-id="oloc"] div.rogA2c',
};

async function scrapeDetailPanel(page) {
  try {
    await page.waitForSelector(SELECTORS.detailName, { timeout: 5000 });

    const detail = await page.evaluate((sel) => {
      const getText = (s) => document.querySelector(s)?.textContent?.trim() || null;
      const getHref = (s) => document.querySelector(s)?.getAttribute('href') || null;

      // Parse opening hours table
      const hoursRows = document.querySelectorAll(`${sel.detailHours} tr`);
      const hours = {};
      hoursRows.forEach(row => {
        const day = row.querySelector('td:first-child')?.textContent?.trim();
        const time = row.querySelector('td:last-child')?.textContent?.trim();
        if (day && time) hours[day] = time;
      });

      // Get all photos count
      const photosEl = document.querySelector('div.YkuOqf');
      const photosText = photosEl?.textContent?.match(/[\d,]+/)?.[0];

      return {
        name:        getText(sel.detailName),
        rating:      parseFloat(getText(sel.detailRating)) || null,
        reviewCount: parseInt((getText(sel.detailReviews) || '0').replace(/[^\d]/g, '')) || 0,
        address:     getText(sel.detailAddress),
        phone:       getText(sel.detailPhone),
        website:     getHref(sel.detailWebsite),
        category:    getText(sel.detailCategory),
        hours,
        totalPhotos: parseInt((photosText || '0').replace(',', '')) || 0,
        plusCode:    getText(sel.plusCode),
      };
    }, SELECTORS);

    // Get coordinates from URL
    const url = page.url();
    const coordMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      detail.latitude  = parseFloat(coordMatch[1]);
      detail.longitude = parseFloat(coordMatch[2]);
    }

    detail.googleMapsUrl = url;
    return detail;
  } catch {
    return null;
  }
}

async function autoScroll(page, container, targetCount) {
  let previousCount = 0;
  let stuckCount = 0;

  while (true) {
    const items = await page.$$(SELECTORS.resultItem);
    if (items.length >= targetCount) break;
    if (items.length === previousCount) {
      stuckCount++;
      if (stuckCount >= 3) break; // No more results loading
    } else {
      stuckCount = 0;
    }
    previousCount = items.length;

    // Scroll the results panel
    await page.evaluate((sel) => {
      const feed = document.querySelector(sel);
      if (feed) feed.scrollTop = feed.scrollHeight;
    }, SELECTORS.resultsList);

    await page.waitForTimeout(1500);
  }
}

Actor.main(async () => {
  const input = await Actor.getInput();
  const {
    query         = 'restaurants',
    location      = 'New York, NY',
    maxResults    = 20,
    language      = 'en',
    scrapeDetails = true,
    proxyUrl,
  } = input;

  Actor.log.info(`Searching Google Maps for: "${query}" in "${location}"`);
  Actor.log.info(`Target results: ${maxResults}`);

  const dataset = await Actor.openDataset();
  const kvs     = await Actor.openKeyValueStore();

  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${query} ${location}`)}?hl=${language}`;

  // ── Launch browser ────────────────────────────────────────────────
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--disable-plugins',
      '--disable-gpu',
      `--lang=${language}`,
    ],
    ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: language,
    geolocation: null,
    permissions: [],
  });

  // Block unnecessary resources to speed up scraping
  await context.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,otf}', route => route.abort());
  await context.route('**/maps/api/js**', route => route.continue());

  const page = await context.newPage();

  // Anti-detection: remove webdriver property
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
  });

  const results = [];

  try {
    Actor.log.info(`Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Handle consent dialog
    const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")').first();
    if (await consentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await consentBtn.click();
      await page.waitForTimeout(1000);
    }

    // Wait for results feed
    await page.waitForSelector(SELECTORS.resultsList, { timeout: 15000 });
    Actor.log.info('Results panel loaded, scrolling to collect listings...');

    // Scroll to load enough results
    await autoScroll(page, SELECTORS.resultsList, maxResults);

    const items = await page.$$(SELECTORS.resultItem);
    Actor.log.info(`Found ${items.length} listings, processing up to ${maxResults}`);

    const toProcess = Math.min(items.length, maxResults);

    for (let i = 0; i < toProcess; i++) {
      if (Actor.isAborted()) {
        Actor.log.warn('Actor aborted by user');
        break;
      }

      await Actor.setStatusMessage(`Scraping listing ${i + 1}/${toProcess}`);

      try {
        // Re-query items (DOM may shift)
        const currentItems = await page.$$(SELECTORS.resultItem);
        const item = currentItems[i];
        if (!item) continue;

        // Extract basic info from list
        const basicInfo = await item.evaluate((el, sel) => {
          const getText = (s) => el.querySelector(s)?.textContent?.trim() || null;
          return {
            name:        getText(sel.placeName),
            rating:      parseFloat(getText(sel.rating)) || null,
            reviewCount: parseInt((getText(sel.reviewCount) || '0').replace(/[^\d]/g, '')) || 0,
            category:    getText(sel.category),
            address:     getText(sel.address),
          };
        }, SELECTORS);

        if (!basicInfo.name) continue;

        let placeData = {
          ...basicInfo,
          searchQuery: query,
          searchLocation: location,
          scrapedAt: new Date().toISOString(),
          position: i + 1,
        };

        // Click to open detail panel and get full info
        if (scrapeDetails) {
          await item.click();
          await page.waitForTimeout(2000);
          const detail = await scrapeDetailPanel(page);
          if (detail) {
            placeData = { ...placeData, ...detail };
          }
        }

        results.push(placeData);
        Actor.log.info(`✓ [${i + 1}/${toProcess}] ${placeData.name} (${placeData.rating || 'N/A'}★)`);

        // Push in batches of 10
        if (results.length % 10 === 0) {
          await dataset.pushData(results.splice(0, 10));
        }

        await page.waitForTimeout(800 + Math.random() * 500); // Human-like delay

      } catch (itemErr) {
        Actor.log.warn(`Error processing item ${i + 1}:`, itemErr.message);
      }
    }

    // Push remaining
    if (results.length) {
      await dataset.pushData(results);
    }

  } finally {
    await browser.close();
  }

  const finalDataset = await dataset.getInfo();
  Actor.log.info(`✅ Done! Scraped ${finalDataset.itemCount} places`);

  // Save summary to KV store
  await kvs.setValue('OUTPUT', {
    totalScraped: finalDataset.itemCount,
    query,
    location,
    completedAt: new Date().toISOString(),
  });
});
