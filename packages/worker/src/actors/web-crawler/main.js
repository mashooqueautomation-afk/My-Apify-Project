/**
 * WebMiner Web Crawler Actor
 * Crawls websites recursively, extracts content (title, text, links, meta, images)
 * Input: { startUrls, maxDepth, maxPages, crawlLinks, extractSelectors, respectRobots }
 */

const { Actor } = require('../../actor-sdk/src/index');

Actor.main(async () => {
  const input = await Actor.getInput();
  const {
    startUrls         = [{ url: 'https://example.com' }],
    maxDepth          = 3,
    maxPages          = 100,
    crawlLinks        = true,
    respectRobots     = true,
    extractSelectors  = {},
    urlPatterns       = [],          // [] = allow all
    excludePatterns   = [],
    downloadMedia     = false,
    waitForSelector   = null,
    pageTimeout       = 30000,
    requestDelay      = 500,
  } = input;

  const dataset = await Actor.openDataset();
  const requestQueue = await Actor.openRequestQueue();
  const kvs = await Actor.openKeyValueStore();

  function normalizeUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      parsed.hash = '';
      const cleanedPath = parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.origin}${cleanedPath}`;
    } catch {
      return rawUrl.split('?')[0].split('#')[0];
    }
  }

  // Add seed URLs
  const enqueuedUrls = new Set();
  for (const urlObj of startUrls) {
    const url = typeof urlObj === 'string' ? urlObj : urlObj.url;
    const uniqueKey = normalizeUrl(url);
    if (enqueuedUrls.has(uniqueKey)) continue;
    enqueuedUrls.add(uniqueKey);
    await requestQueue.addRequest({
      url,
      uniqueKey,
      userData: { depth: 0, parentUrl: null },
    });
  }

  // Robots.txt cache
  const robotsCache = new Map();
  const visitedUrls = new Set();
  let pagesScraped = 0;

  async function isAllowedByRobots(url) {
    if (!respectRobots) return true;
    try {
      const { hostname, protocol } = new URL(url);
      const robotsUrl = `${protocol}//${hostname}/robots.txt`;

      if (!robotsCache.has(hostname)) {
        const resp = await fetchWithRetry(robotsUrl, { timeout: 5000 });
        const text = resp.ok ? await resp.text() : '';
        // Simple robots.txt parser - check Disallow rules for *
        const disallowed = [];
        let inUserAgent = false;
        for (const line of text.split('\n')) {
          const l = line.trim().toLowerCase();
          if (l.startsWith('user-agent: *')) { inUserAgent = true; continue; }
          if (l.startsWith('user-agent:')) { inUserAgent = false; continue; }
          if (inUserAgent && l.startsWith('disallow:')) {
            const path = l.replace('disallow:', '').trim();
            if (path) disallowed.push(path);
          }
        }
        robotsCache.set(hostname, disallowed);
      }

      const disallowed = robotsCache.get(hostname);
      const pathname = new URL(url).pathname;
      return !disallowed.some(d => pathname.startsWith(d));
    } catch {
      return true;
    }
  }

  function matchesPatterns(url, patterns) {
    if (!patterns.length) return true;
    return patterns.some(p => {
      if (p.startsWith('/') && p.endsWith('/')) {
        return new RegExp(p.slice(1, -1)).test(url);
      }
      return url.includes(p);
    });
  }

  async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeout || pageTimeout);
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WebMinerBot/1.0; +https://webminer.io/bot)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
          },
          ...options,
        });
        clearTimeout(timeout);
        return resp;
      } catch (err) {
        if (attempt === retries) throw err;
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  function extractLinks(html, baseUrl) {
    const links = [];
    const linkRegex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = match[1].trim();
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
        const absolute = new URL(href, baseUrl).toString();
        // Remove fragment
        links.push(absolute.split('#')[0]);
      } catch { /* ignore malformed URLs */ }
    }

    return [...new Set(links)];
  }

  function extractMeta(html) {
    const meta = {};
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    meta.title = titleMatch?.[1]?.trim() || null;

    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
                   || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
    meta.description = descMatch?.[1]?.trim() || null;

    const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']*)["']/i);
    meta.keywords = keywordsMatch?.[1]?.trim() || null;

    // Open Graph
    const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
    if (ogTitle) meta.ogTitle = ogTitle[1].trim();

    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
    if (ogImage) meta.ogImage = ogImage[1].trim();

    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
    meta.canonical = canonicalMatch?.[1]?.trim() || null;

    return meta;
  }

  function extractText(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000); // Limit text length
  }

  function extractImages(html, baseUrl) {
    const images = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?/gi;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      try {
        const src = new URL(match[1], baseUrl).toString();
        images.push({ src, alt: match[2] || null });
      } catch { /* skip */ }
    }

    return images.slice(0, 20); // Max 20 images per page
  }

  function extractCustomSelectors(html, selectors) {
    const results = {};
    // Basic regex-based extraction for custom selectors
    for (const [key, selector] of Object.entries(selectors)) {
      try {
        // Support simple tag[attribute] patterns
        const tagMatch = selector.match(/^(\w+)(?:\[(\w+)\])?$/);
        if (tagMatch) {
          const [, tag, attr] = tagMatch;
          if (attr) {
            const r = html.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']*)["']`, 'i'));
            results[key] = r?.[1] || null;
          } else {
            const r = html.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'));
            results[key] = r?.[1]?.trim() || null;
          }
        }
      } catch { results[key] = null; }
    }
    return results;
  }

  // ── Main crawl loop ──────────────────────────────────────────────────────
  Actor.log.info(`Starting crawl: ${startUrls.length} seed URL(s), max ${maxPages} pages, depth ${maxDepth}`);

  while (!(await requestQueue.isEmpty()) && pagesScraped < maxPages) {
    if (Actor.isAborted()) break;

    const request = await requestQueue.fetchNextRequest();
    if (!request) break;

    const { url, userData } = request;
    const depth = userData?.depth ?? 0;

    // Skip already visited
    const normalizedUrl = normalizeUrl(url);
    if (visitedUrls.has(normalizedUrl)) {
      await requestQueue.markRequestHandled(request);
      continue;
    }
    visitedUrls.add(normalizedUrl);

    // Check URL patterns
    if (urlPatterns.length && !matchesPatterns(url, urlPatterns)) {
      await requestQueue.markRequestHandled(request);
      continue;
    }

    if (excludePatterns.length && matchesPatterns(url, excludePatterns)) {
      await requestQueue.markRequestHandled(request);
      continue;
    }

    // Check robots.txt
    if (!(await isAllowedByRobots(url))) {
      Actor.log.debug(`Blocked by robots.txt: ${url}`);
      await requestQueue.markRequestHandled(request);
      continue;
    }

    await Actor.setStatusMessage(`Crawling page ${pagesScraped + 1}/${maxPages}: ${url}`);

    try {
      const resp = await fetchWithRetry(url);
      if (!resp.ok) {
        Actor.log.warn(`HTTP ${resp.status} for ${url}`);
        await requestQueue.markRequestHandled(request);
        continue;
      }

      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        await requestQueue.markRequestHandled(request);
        continue;
      }

      const html = await resp.text();
      const meta = extractMeta(html);
      const text = extractText(html);
      const images = extractImages(html, url);
      const custom = Object.keys(extractSelectors).length
        ? extractCustomSelectors(html, extractSelectors)
        : {};

      const pageData = {
        url,
        depth,
        parentUrl:      userData?.parentUrl || null,
        title:          meta.title,
        description:    meta.description,
        keywords:       meta.keywords,
        ogTitle:        meta.ogTitle || null,
        ogImage:        meta.ogImage || null,
        canonical:      meta.canonical,
        text:           text,
        textLength:     text.length,
        imageCount:     images.length,
        images:         downloadMedia ? images : images.map(i => i.src),
        statusCode:     resp.status,
        contentType:    contentType.split(';')[0].trim(),
        loadedAt:       new Date().toISOString(),
        ...custom,
      };

      await dataset.pushData(pageData);
      pagesScraped++;

      Actor.log.info(`[${pagesScraped}/${maxPages}] depth=${depth} → ${meta.title || url}`);

      // Extract and enqueue links
      if (crawlLinks && depth < maxDepth) {
        const links = extractLinks(html, url);
        const { hostname } = new URL(url);

        let enqueued = 0;
        for (const link of links) {
          try {
            const linkHost = new URL(link).hostname;
            // Only follow same-domain links (configurable)
            if (linkHost !== hostname && !input.allowExternalLinks) continue;
            const normalizedLink = normalizeUrl(link);
            if (visitedUrls.has(normalizedLink) || enqueuedUrls.has(normalizedLink)) continue;

            await requestQueue.addRequest({
              url: link,
              uniqueKey: normalizedLink,
              userData: { depth: depth + 1, parentUrl: url },
            });
            enqueuedUrls.add(normalizedLink);
            enqueued++;
          } catch { /* invalid URL */ }
        }

        if (enqueued) Actor.log.debug(`Enqueued ${enqueued} links from ${url}`);
      }

      // Request delay to be polite
      if (requestDelay > 0) {
        await new Promise(r => setTimeout(r, requestDelay + Math.random() * 200));
      }

    } catch (err) {
      Actor.log.error(`Failed to crawl ${url}:`, err.message);
    }

    await requestQueue.markRequestHandled(request);
  }

  const finalInfo = await dataset.getInfo();

  Actor.log.info(`✅ Crawl complete! Pages scraped: ${pagesScraped}`);
  Actor.log.info(`Total items in dataset: ${finalInfo.itemCount}`);

  await kvs.setValue('CRAWL_STATS', {
    pagesScraped,
    uniqueUrlsVisited: visitedUrls.size,
    maxDepthReached: maxDepth,
    completedAt: new Date().toISOString(),
  });
});
