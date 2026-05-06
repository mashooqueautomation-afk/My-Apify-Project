const { Actor } = require('./actor-sdk/index');
Actor.main(async () => {
  const input = await Actor.getInput();
  const dataset = await Actor.openDataset();
  await dataset.pushData({ test: true, timestamp: new Date().toISOString() });
  Actor.log.info('✅ Test actor complete');
});