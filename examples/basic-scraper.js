/**
 * Example: Basic WebMiner Actor
 * Tests the new Actor SDK v2
 */

const { initActor } = require('@webminer/actor-sdk');

async function main() {
  // Initialize actor from environment variables
  const actor = initActor();
  const logger = actor.getLogger();

  logger.info('🚀 Actor started', {
    runId: process.env.WEBMINER_RUN_ID,
    datasetId: process.env.WEBMINER_DATASET_ID,
  });

  try {
    // Get dataset
    const dataset = actor.openDataset();
    logger.info('📊 Dataset opened');

    // Push some test data
    const testData = [
      {
        url: 'https://example.com/product-1',
        title: 'Product 1',
        price: 99.99,
        timestamp: new Date().toISOString(),
      },
      {
        url: 'https://example.com/product-2',
        title: 'Product 2',
        price: 199.99,
        timestamp: new Date().toISOString(),
      },
    ];

    logger.info('Pushing test data', { count: testData.length });
    const result = await dataset.pushData(testData);

    logger.info('✅ Data pushed successfully', {
      itemsAdded: result.itemsAdded,
      batches: result.batchCount,
      durationMs: result.durationMs,
    });

    // Get dataset stats
    const stats = dataset.getLocalStats();
    logger.info('📈 Dataset stats', stats);

    // Exit gracefully
    logger.info('✅ Actor completed successfully');
    await actor.exit(0);
  } catch (error) {
    logger.error('❌ Actor failed', error);
    await actor.exit(1);
  }
}

main();