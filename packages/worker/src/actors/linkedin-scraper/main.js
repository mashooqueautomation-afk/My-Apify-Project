const { Actor } = require('../_shared/runtime');
const {
  cleanNumber,
  cleanText,
  cleanUrl,
  saveOutput,
  withMetadata,
} = require('../_shared/data-utils');
const {
  CaptchaDetector,
  PageHelpers,
  RequestThrottler,
  RetryHelper,
  SessionManager,
  StealthBrowser,
} = require('../anti-bot');

const LOGIN_WALL_SELECTORS = [
  '.authwall-join-form',
  '.sign-in-modal',
  'input[name="session_key"]',
  'a[href*="signup"]',
];

async function applyLinkedInSession(context, sessionCookie, kvs) {
  const sessionManager = new SessionManager(kvs);
  const restored = await sessionManager.loadSession(context, 'linkedin.com');
  if (restored) return { sessionManager, authenticated: true, source: 'restored-session' };

  if (!sessionCookie) {
    return { sessionManager, authenticated: false, source: 'guest' };
  }

  const cookieValue = sessionCookie.replace(/^li_at=/, '');
  await context.addCookies([
    {
      name: 'li_at',
      value: cookieValue,
      domain: '.linkedin.com',
      path: '/',
      httpOnly: true,
      secure: true,
    },
    {
      name: 'lang',
      value: 'v=2&lang=en-us',
      domain: '.linkedin.com',
      path: '/',
      secure: true,
    },
  ]);

  return { sessionManager, authenticated: true, source: 'session-cookie' };
}

async function isLoginWall(page) {
  for (const selector of LOGIN_WALL_SELECTORS) {
    if (await page.$(selector)) return true;
  }
  return false;
}

async function extractProfile(page, sourceUrl) {
  return page.evaluate((sourceUrl) => {
    const getText = (...selectors) => {
      for (const selector of selectors) {
        const value = document.querySelector(selector)?.textContent?.trim();
        if (value) return value;
      }
      return null;
    };

    const getLink = (...selectors) => {
      for (const selector of selectors) {
        const href = document.querySelector(selector)?.getAttribute('href');
        if (href) return new URL(href, window.location.origin).toString();
      }
      return null;
    };

    return {
      name: getText('h1', '.text-heading-xlarge'),
      title: getText('.text-body-medium.break-words', '.top-card-layout__headline'),
      company: getText('a[href*="/company/"] span[aria-hidden="true"]', 'a[href*="/company/"]'),
      location: getText('.text-body-small.inline', '.top-card__subline-item'),
      about: getText('#about ~ div .display-flex span[aria-hidden="true"]', '.core-section-container__content .break-words'),
      connectionsCount: getText('.t-bold span', '.top-card__subline-item', 'a[href*="connections"]'),
      followersCount: getText('a[href*="followers"]', 'span:has(a[href*="followers"])'),
      currentCompanyUrl: getLink('a[href*="/company/"]'),
      sourceUrl,
    };
  }, sourceUrl);
}

async function extractRecentPosts(page, maxPosts) {
  return page.evaluate((maxPosts) => {
    const cards = Array.from(document.querySelectorAll('[data-urn*="activity"], .feed-shared-update-v2')).slice(0, maxPosts);
    return cards.map((card) => {
      const text = card.textContent?.replace(/\s+/g, ' ').trim() || null;
      const link = card.querySelector('a[href*="/posts/"], a[href*="/activity/"]')?.getAttribute('href') || null;
      const published = card.querySelector('time')?.getAttribute('datetime') || null;
      const reactions = card.querySelector('[aria-label*="reaction"], .social-details-social-counts__reactions-count')?.textContent?.trim() || null;
      return {
        content: text,
        link: link ? new URL(link, window.location.origin).toString() : null,
        publishedAt: published,
        reactions,
      };
    }).filter((post) => post.content || post.link);
  }, maxPosts);
}

function hasMeaningfulProfile(profile) {
  return Boolean(
    profile?.name
    || profile?.title
    || profile?.company
    || profile?.about
    || profile?.location
    || profile?.currentCompanyUrl
  );
}

function normalizeProfile(record) {
  return withMetadata({
    name: cleanText(record.name),
    title: cleanText(record.title),
    company: cleanText(record.company),
    location: cleanText(record.location),
    about: cleanText(record.about),
    connectionsCount: cleanNumber(record.connectionsCount),
    followersCount: cleanNumber(record.followersCount),
    currentCompanyUrl: cleanUrl(record.currentCompanyUrl),
    profileUrl: cleanUrl(record.sourceUrl),
  }, {
    sourceUrl: record.sourceUrl,
    sourceType: 'linkedin-profile',
  });
}

Actor.main(async () => {
  const input = await Actor.getInput();
  const dataset = await Actor.openDataset();
  const kvs = await Actor.openKeyValueStore();

  const profileUrls = (input.profileUrls || input.urls || [])
    .map((entry) => typeof entry === 'string' ? entry : entry.url)
    .filter(Boolean)
    .map((url) => String(url).replace(/^http:\/\//i, 'https://'));
  if (!profileUrls.length) {
    throw new Error('Provide profileUrls or urls with LinkedIn profile/company URLs');
  }

  const maxPosts = Math.max(0, Math.min(Number(input.maxPosts || 5), 20));
  const throttler = new RequestThrottler({
    minDelay: Number(input.minDelay || 2500),
    maxDelay: Number(input.maxDelay || 6000),
    burstLimit: 1,
  });

  const { browser, context } = await StealthBrowser.launch({
    proxyUrl: input.proxyUrl,
    headless: input.headless !== false,
    blockResources: false,
    resourceTypes: ['media'],
  });

  const { sessionManager, authenticated, source } = await applyLinkedInSession(context, input.sessionCookie, kvs);
  const records = [];
  const failures = [];
  const warnings = [];

  try {
    if (authenticated) {
      const checkPage = await context.newPage();
      await checkPage.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (await isLoginWall(checkPage)) {
        throw new Error('LinkedIn session is invalid or expired');
      }
      await sessionManager.captureSession(checkPage, 'linkedin.com').catch(() => {});
      await checkPage.close().catch(() => {});
    } else {
      Actor.log.warn('LinkedIn sessionCookie not provided. Attempting guest access; many /in/ profiles will show a login wall and return no data.');
    }

    for (const profileUrl of profileUrls) {
      const page = await context.newPage();
      try {
        await throttler.wait();
        await Actor.setStatusMessage(`Scraping LinkedIn profile ${records.length + 1}/${profileUrls.length}`);

        await RetryHelper.run(
          async () => {
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
          },
          {
            retries: 2,
            shouldRetry: (error) => /timeout|429|503|proxy|ECONNREFUSED|ENOTFOUND/i.test(String(error.message || error)),
          }
        );

        await PageHelpers.acceptCommonBanners(page);

        if (await isLoginWall(page)) {
          throw new Error(`LinkedIn login wall detected for ${profileUrl}. Provide input.sessionCookie with a valid li_at cookie to access authenticated profile pages.`);
        }

        const captcha = await CaptchaDetector.check(page);
        if (captcha.detected) {
          throw new Error(`LinkedIn blocked the session with ${captcha.type}`);
        }

        await PageHelpers.autoScroll(page, { steps: 6, stepPx: 900 });
        const profile = normalizeProfile(await extractProfile(page, profileUrl));

        if (!hasMeaningfulProfile(profile)) {
          throw new Error(`LinkedIn profile loaded but no usable fields were extracted for ${profileUrl}`);
        }

        let posts = [];
        if (maxPosts > 0) {
          const activityUrl = profileUrl.replace(/\/$/, '') + '/recent-activity/all/';
          const activityPage = await context.newPage();
          try {
            await throttler.wait();
            await activityPage.goto(activityUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await PageHelpers.autoScroll(activityPage, { steps: 5, stepPx: 1000 });
            posts = (await extractRecentPosts(activityPage, maxPosts)).map((post) => ({
              content: cleanText(post.content),
              link: cleanUrl(post.link),
              publishedAt: post.publishedAt || null,
              reactions: cleanNumber(post.reactions),
            }));
          } catch (error) {
            const warningMessage = `LinkedIn posts unavailable for ${profileUrl}: ${error.message}`;
            warnings.push({ profileUrl, warning: warningMessage });
            Actor.log.warn(warningMessage);
          } finally {
            await activityPage.close().catch(() => {});
          }
        }

        records.push({
          ...profile,
          posts,
          postCount: posts.length,
        });
      } catch (error) {
        const message = error?.message || String(error);
        failures.push({
          profileUrl,
          error: message,
        });
        Actor.log.error(`LinkedIn scrape failed for ${profileUrl}: ${message}`);
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
    records,
    meta: {
      actor: 'linkedin-scraper',
      requestedProfiles: profileUrls.length,
      maxPosts,
      authenticated,
      authSource: source,
      failures,
      warnings,
    },
  });

  if (!records.length && failures.length) {
    Actor.log.warn(`LinkedIn scraper finished with 0 profiles and ${failures.length} failures`);
    const summary = failures.slice(0, 3).map((item) => `${item.profileUrl}: ${item.error}`).join(' | ');
    throw new Error(`LinkedIn scrape failed for all requested profiles. ${summary}`);
  } else {
    if (warnings.length) {
      Actor.log.warn(`LinkedIn scraper finished with ${output.count} profiles and ${warnings.length} warning(s)`);
    } else {
      Actor.log.info(`LinkedIn scraper finished with ${output.count} profiles`);
    }
  }
});
