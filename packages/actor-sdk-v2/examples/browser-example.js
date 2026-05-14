/**
 * Example Browser Actor
 * Demonstrates Phase 3: Browser Tools functionality
 *
 * Run with:
 * WEBMINER_RUN_ID=test WEBMINER_ACTOR_ID=test-actor node browser-example.js
 */

const { initActorWithBrowser } = require('./ActorWithBrowser');

async function main() {
  const actor = initActorWithBrowser();
  const logger = actor.getLogger();

  try {
    logger.info('Browser Example Actor Starting');

    // ===== EXAMPLE 1: Launch Browser =====
    logger.info('Example 1: Launching browser');

    const browser = await actor.launchBrowser({
      headless: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    logger.info('Browser launched successfully');

    // ===== EXAMPLE 2: Navigate and Get Content =====
    logger.info('Example 2: Navigate and get content');

    const manager = actor.getBrowser();
    const page1 = await manager.newPage();

    await manager.goto('https://example.com');
    logger.info('Page loaded');

    const content = await manager.getContent();
    logger.info('Content retrieved', { length: content.length });

    // ===== EXAMPLE 3: Take Screenshot =====
    logger.info('Example 3: Taking screenshot');

    const screenshot = await manager.screenshot({
      fullPage: true,
      type: 'png',
    });

    logger.info('Screenshot taken', { size: screenshot.length });

    // ===== EXAMPLE 4: Extract Data with JavaScript =====
    logger.info('Example 4: Extract data with JavaScript');

    const extracted = await manager.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(
          (h) => h.textContent
        ),
        links: Array.from(document.querySelectorAll('a')).map((a) => ({
          text: a.textContent,
          href: a.href,
        })),
        metaDescription: document
          .querySelector('meta[name="description"]')
          ?.getAttribute('content'),
      };
    });

    logger.info('Data extracted', {
      title: extracted.title,
      headingsCount: extracted.headings.length,
      linksCount: extracted.links.length,
    });

    // ===== EXAMPLE 5: Multi-page Navigation =====
    logger.info('Example 5: Multi-page navigation');

    const page2 = await manager.newPage();
    manager.switchPage(page2);

    await manager.goto('https://www.google.com');
    await manager.waitForSelector('textarea', 5000);

    logger.info('Second page loaded');

    // ===== EXAMPLE 6: Form Filling =====
    logger.info('Example 6: Form filling');

    const queryPage = await manager.newPage();
    manager.switchPage(queryPage);

    await manager.goto('https://www.google.com');
    await manager.waitForSelector('textarea');
    await manager.fill('textarea', 'playwright automation');

    logger.info('Form filled');

    // ===== EXAMPLE 7: Click and Wait =====
    logger.info('Example 7: Click and wait');

    // Note: This example won't actually submit to avoid issues
    // In real scenarios, you would do:
    // await manager.click('input[type="submit"]');
    // await manager.waitForSelector('.search-results');

    logger.info('Click action ready (not executed for safety)');

    // ===== EXAMPLE 8: Push to Dataset =====
    logger.info('Example 8: Push data to dataset');

    if (actor.openDataset) {
      try {
        const dataset = actor.openDataset();

        await dataset.pushData([
          {
            url: 'https://example.com',
            title: extracted.title,
            description: extracted.metaDescription,
            headingsCount: extracted.headings.length,
            linksCount: extracted.links.length,
            timestamp: new Date().toISOString(),
          },
        ]);

        logger.info('Data pushed to dataset');
      } catch (err) {
        logger.warn('Dataset push skipped (not configured)', err.message);
      }
    }

    // ===== EXAMPLE 9: Browser Metrics =====
    logger.info('Example 9: Browser metrics');

    const metrics = actor.getBrowserMetrics();
    logger.info('Browser metrics', metrics);

    // ===== Cleanup =====
    logger.info('Cleaning up');

    await manager.closePage(page1);
    logger.info('Page 1 closed');

    await manager.closePage(page2);
    logger.info('Page 2 closed');

    await manager.closePage(queryPage);
    logger.info('Page 3 closed');

    // ===== Exit =====
    logger.info('✅ Browser Example Actor Completed Successfully');

    await actor.exit(0);
  } catch (err) {
    logger.error('Browser Example Failed', err);
    await actor.exit(1);
  }
}

main().catch((err) => {
  console.error('Uncaught error:', err);
  process.exit(1);
});