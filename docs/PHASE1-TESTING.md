# Phase 1 SDK Testing Guide

## Prerequisites
- WebMiner API running on http://localhost:3000
- PostgreSQL running
- Redis running
- Valid auth token

## Local Testing (Without Docker)

### 1. Start API Server
```bash
npm run dev:api
```

### 2. Create Test Dataset via Postman

**POST** `http://localhost:3000/api/v1/datasets`
```json
{
  "name": "test-dataset-phase1",
  "actor_id": "basic-scraper"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "ds-abc123",
    "name": "test-dataset-phase1"
  }
}
```

### 3. Run Example Actor

```bash
export WEBMINER_RUN_ID=test-run-001
export WEBMINER_ACTOR_ID=basic-scraper
export WEBMINER_API_URL=http://localhost:3000
export WEBMINER_API_TOKEN=your-token-here
export WEBMINER_DATASET_ID=ds-abc123

cd examples
npm install
node basic-scraper.js
```

### 4. Verify Data Pushed

**GET** `http://localhost:3000/api/v1/datasets/ds-abc123/items`
```json
{
  "success": true,
  "data": [
    {
      "url": "https://example.com/product-1",
      "title": "Product 1",
      "price": 99.99
    },
    {
      "url": "https://example.com/product-2",
      "title": "Product 2",
      "price": 199.99
    }
  ],
  "meta": {
    "total": 2,
    "offset": 0,
    "limit": 100,
    "count": 2
  }
}
```

### 5. Export Dataset

**GET** `http://localhost:3000/api/v1/datasets/ds-abc123/export?format=json`

Response: JSON file with all items

## Docker Testing

### Build Runtime

```bash
npm run docker:build-runtimes
```

### Deploy with Docker Compose

```bash
npm run docker:up:dev
```

### Test Actor in Container

```bash
docker exec webminer-api npm run migrate
docker exec webminer-worker node /app/actors/basic-scraper.js
```

## SDK API Reference

### Actor Initialization

```javascript
const { initActor } = require('@webminer/actor-sdk');
const actor = initActor();
```

Environment variables required:
- `WEBMINER_RUN_ID` - Unique run identifier
- `WEBMINER_ACTOR_ID` - Actor name
- `WEBMINER_ORG_ID` - Organization ID (default: 'dev')
- `WEBMINER_API_URL` - API endpoint (default: http://api:3000)
- `WEBMINER_API_TOKEN` - Bearer token
- `WEBMINER_DATASET_ID` - Dataset ID to write to
- `WEBMINER_REQUEST_QUEUE_ID` - Queue ID (optional)
- `WEBMINER_KVS_ID` - Key-value store ID (optional)

### Logger

```javascript
const logger = actor.getLogger();

logger.debug('Debug message', { data: 'value' });
logger.info('Info message', { data: 'value' });
logger.warn('Warning message', { data: 'value' });
logger.error('Error message', error, { context: 'data' });
logger.metric('items_processed', 100, 'count', { actor: 'scraper' });
```

### Dataset

```javascript
const dataset = actor.openDataset();

// Push single item
await dataset.pushData({ url: 'https://example.com', title: 'Title' });

// Push multiple items
await dataset.pushData([
  { url: '...', title: '...' },
  { url: '...', title: '...' },
]);

// With custom batch size
await dataset.pushData(items, { batchSize: 1000 });

// Get stats
const stats = dataset.getLocalStats();
// { itemsAdded: 2, batchesSent: 1, errorCount: 0, totalDurationMs: 245 }
```

### Error Handling

```javascript
const { ActorError } = require('@webminer/actor-sdk');

try {
  // Some operation
} catch (error) {
  if (error instanceof ActorError) {
    logger.error('Actor error', error, {
      code: error.code,
      retryable: error.retryable,
      statusCode: error.statusCode,
    });
  }
}
```

### Graceful Shutdown

```javascript
try {
  // Work
  await actor.exit(0); // Success
} catch (error) {
  await actor.exit(1); // Failure
}
```

## Postman Collection

Import `Phase1-SDK-Tests.postman_collection.json` into Postman for automated testing.

## Success Criteria

- ✅ Actor SDK compiles without errors
- ✅ Example actor runs locally without errors
- ✅ Data successfully pushes to dataset
- ✅ Logger outputs structured JSON
- ✅ Error handling works correctly
- ✅ Graceful shutdown executes
- ✅ No changes to existing API/Worker/DB
- ✅ SDK works in Docker containers

## Known Limitations (Phase 1)

- No request queue deduplication yet
- No retry logic for failed items
- No browser automation
- No proxy rotation
- No anti-bot handling

These are Phase 2+ features.