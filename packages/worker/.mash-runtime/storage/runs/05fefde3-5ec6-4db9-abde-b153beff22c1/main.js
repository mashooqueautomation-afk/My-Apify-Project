const { Actor } = require('./actor-sdk/index');

Actor.main(async () => {
  const input = await Actor.getInput();
  const { url = 'https://example.com' } = input;

  Actor.log.info('Fetching:', url);
  const resp = await fetch(url);
  const html = await resp.text();

  const dataset = await Actor.openDataset();
  await dataset.pushData({
    url,
    title: html.match(/<title>([^<]*)<\/title>/i)?.[1] || 'N/A',
    length: html.length,
    scrapedAt: new Date().toISOString(),
  });

  Actor.log.info('Done!');
});
