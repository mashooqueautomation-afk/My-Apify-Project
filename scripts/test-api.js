#!/usr/bin/env node
/**
 * WebMiner API Integration Test Suite
 * Tests all major endpoints end-to-end against a running API
 *
 * Usage:
 *   API_URL=http://localhost:3000 node scripts/test-api.js
 *   API_URL=https://api.webminer.io node scripts/test-api.js --token <jwt>
 */

const API_URL  = process.env.API_URL  || 'http://localhost:3000';
const EMAIL    = process.env.TEST_EMAIL || `test_${Date.now()}@webminer.io`;
const PASSWORD = 'TestPassword@123';

let TOKEN    = process.env.API_TOKEN || '';
let ORG_ID   = '';
let ACTOR_ID = '';
let RUN_ID   = '';
let DATASET_ID = '';
let TASK_ID  = '';

let passed = 0;
let failed = 0;
const errors = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function request(method, path, body, token) {
  const url = `${API_URL}/api/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token || TOKEN ? { Authorization: `Bearer ${token || TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  return { status: res.status, data };
}

function test(name, fn) {
  return fn()
    .then(() => { console.log(`  ✅ ${name}`); passed++; })
    .catch(err => {
      console.log(`  ❌ ${name}: ${err.message}`);
      errors.push({ name, error: err.message });
      failed++;
    });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Test suites ──────────────────────────────────────────────────────────────

async function testHealth() {
  console.log('\n📡 Health Check');
  await test('GET /health returns ok', async () => {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(data.status === 'ok', `Expected status:ok, got ${data.status}`);
  });

  await test('GET /api/v1 returns API info', async () => {
    const res = await fetch(`${API_URL}/api/v1`);
    const data = await res.json();
    assert(res.status === 200, `Expected 200`);
    assert(data.name === 'WebMiner API', 'Missing name');
  });
}

async function testAuth() {
  console.log('\n🔐 Auth');

  await test('POST /auth/register — creates new org+user', async () => {
    const { status, data } = await request('POST', '/auth/register', {
      email: EMAIL, password: PASSWORD,
      name: 'Test User', orgName: 'Test Org',
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.data.token, 'Missing token');
    TOKEN = data.data.token;
  });

  await test('POST /auth/login — returns JWT', async () => {
    const { status, data } = await request('POST', '/auth/login', {
      email: EMAIL, password: PASSWORD,
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.token, 'Missing token');
    TOKEN = data.data.token;
  });

  await test('POST /auth/login — rejects wrong password', async () => {
    const { status } = await request('POST', '/auth/login', {
      email: EMAIL, password: 'wrong',
    });
    assert(status === 401, `Expected 401, got ${status}`);
  });

  await test('GET /auth/me — returns user', async () => {
    const { status, data } = await request('GET', '/auth/me');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.email === EMAIL, 'Wrong email');
    ORG_ID = data.data.org_id;
  });

  await test('POST /auth/api-keys — creates API key', async () => {
    const { status, data } = await request('POST', '/auth/api-keys', {
      name: 'test-key', scopes: ['read', 'write'],
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(data.data.key.startsWith('wm_live_'), 'Key has wrong prefix');
  });

  await test('GET /auth/api-keys — lists keys', async () => {
    const { status, data } = await request('GET', '/auth/api-keys');
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
    assert(data.data.length >= 1, 'Expected at least 1 key');
  });
}

async function testActors() {
  console.log('\n🤖 Actors');

  await test('GET /actors — returns empty list', async () => {
    const { status, data } = await request('GET', '/actors');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(data.data), 'Expected array');
  });

  await test('POST /actors — creates actor', async () => {
    const { status, data } = await request('POST', '/actors', {
      name: 'Test Actor',
      description: 'Integration test actor',
      runtime: 'node18',
      sourceCode: `
        const { Actor } = require('./actor-sdk/index');
        Actor.main(async () => {
          const input = await Actor.getInput();
          const dataset = await Actor.openDataset();
          await dataset.pushData({ test: true, url: input.url || 'https://example.com', ts: new Date().toISOString() });
          Actor.log.info('Test actor done');
        });
      `,
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.data.id, 'Missing actor ID');
    ACTOR_ID = data.data.id;
  });

  await test('GET /actors/:id — returns actor', async () => {
    const { status, data } = await request('GET', `/actors/${ACTOR_ID}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.name === 'Test Actor', 'Wrong name');
  });

  await test('PATCH /actors/:id — updates actor', async () => {
    const { status, data } = await request('PATCH', `/actors/${ACTOR_ID}`, {
      description: 'Updated description',
    });
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.description === 'Updated description', 'Description not updated');
  });
}

async function testRuns() {
  console.log('\n▶️  Runs');

  await test('POST /actors/:id/runs — starts a run', async () => {
    const { status, data } = await request('POST', `/actors/${ACTOR_ID}/runs`, {
      input: { url: 'https://example.com', test: true },
      options: { memoryMbytes: 256, timeoutSecs: 60 },
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.data.id, 'Missing run ID');
    assert(['queued', 'running'].includes(data.data.status), `Unexpected status: ${data.data.status}`);
    RUN_ID = data.data.id;
    DATASET_ID = data.data.dataset_id;
  });

  await test('GET /runs/:id — returns run', async () => {
    const { status, data } = await request('GET', `/runs/${RUN_ID}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.id === RUN_ID, 'Wrong run ID');
  });

  await test('GET /runs — lists runs', async () => {
    const { status, data } = await request('GET', '/runs?limit=10');
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
    assert(data.data.length >= 1, 'Expected at least 1 run');
  });

  await test('GET /runs/:id/log — returns log array', async () => {
    const { status, data } = await request('GET', `/runs/${RUN_ID}/log`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(Array.isArray(data.data.items), 'Expected items array');
  });
}

async function testDatasets() {
  console.log('\n🗄️  Datasets');

  await test('GET /datasets — lists datasets', async () => {
    const { status, data } = await request('GET', '/datasets');
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
  });

  await test('GET /datasets/:id — returns dataset', async () => {
    const { status, data } = await request('GET', `/datasets/${DATASET_ID}`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.id === DATASET_ID, 'Wrong dataset ID');
  });

  await test('POST /datasets/:id/items — pushes items', async () => {
    const items = [
      { url: 'https://example.com/1', title: 'Page 1' },
      { url: 'https://example.com/2', title: 'Page 2' },
    ];
    const { status, data } = await request('POST', `/datasets/${DATASET_ID}/items`, items);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.itemsAdded === 2, `Expected 2 items, got ${data.data.itemsAdded}`);
  });

  await test('GET /datasets/:id/items — retrieves items', async () => {
    const { status, data } = await request('GET', `/datasets/${DATASET_ID}/items?limit=10`);
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
    assert(data.data.length >= 2, `Expected ≥2 items, got ${data.data.length}`);
  });
}

async function testTasks() {
  console.log('\n📅 Tasks');

  await test('POST /tasks — creates scheduled task', async () => {
    const { status, data } = await request('POST', '/tasks', {
      actorId:  ACTOR_ID,
      name:     'Test Daily Task',
      cronExpr: '0 9 * * *',
      timezone: 'UTC',
      input:    { url: 'https://example.com' },
    });
    assert(status === 201, `Expected 201, got ${status}: ${JSON.stringify(data)}`);
    assert(data.data.id, 'Missing task ID');
    TASK_ID = data.data.id;
  });

  await test('GET /tasks — lists tasks', async () => {
    const { status, data } = await request('GET', '/tasks');
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
  });

  await test('PATCH /tasks/:id — pauses task', async () => {
    const { status, data } = await request('PATCH', `/tasks/${TASK_ID}`, { status: 'paused' });
    assert(status === 200, `Expected 200`);
    assert(data.data.status === 'paused', 'Task not paused');
  });
}

async function testMetrics() {
  console.log('\n📊 Metrics');

  await test('GET /metrics/overview — returns platform stats', async () => {
    const { status, data } = await request('GET', '/metrics/overview');
    assert(status === 200, `Expected 200, got ${status}`);
    assert(data.data.runs, 'Missing runs metrics');
    assert(data.data.actors, 'Missing actors metrics');
  });

  await test('GET /metrics/runs/daily — returns daily data', async () => {
    const { status, data } = await request('GET', '/metrics/runs/daily?days=7');
    assert(status === 200, `Expected 200`);
    assert(Array.isArray(data.data), 'Expected array');
  });
}

async function testCleanup() {
  console.log('\n🧹 Cleanup');

  await test('DELETE /actors/:id — archives actor', async () => {
    const { status } = await request('DELETE', `/actors/${ACTOR_ID}`);
    assert(status === 200, `Expected 200, got ${status}`);
  });
}

// ─── Run all tests ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔬 WebMiner API Integration Tests`);
  console.log(`   API: ${API_URL}`);
  console.log(`   Email: ${EMAIL}`);
  console.log('─'.repeat(50));

  await testHealth();
  await testAuth();
  await testActors();
  await testRuns();
  await testDatasets();
  await testTasks();
  await testMetrics();
  await testCleanup();

  console.log('\n' + '─'.repeat(50));
  console.log(`\n📋 Results: ${passed} passed, ${failed} failed\n`);

  if (errors.length > 0) {
    console.log('Failed tests:');
    errors.forEach(e => console.log(`  ❌ ${e.name}: ${e.error}`));
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
