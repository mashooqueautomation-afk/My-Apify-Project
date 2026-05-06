/**
 * WebMiner Actor SDK
 * Actors use this to interact with the platform: push data, manage queues, log, etc.
 * Usage: const { Actor } = require('@webminer/actor-sdk');
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.WEBMINER_API_URL || 'http://api:3000';
const API_TOKEN = process.env.WEBMINER_API_TOKEN || '';
const RUN_ID = process.env.WEBMINER_RUN_ID || 'local';
const DATASET_ID = process.env.WEBMINER_DATASET_ID;
const KVS_ID = process.env.WEBMINER_KVS_ID;
const REQUEST_QUEUE_ID = process.env.WEBMINER_REQUEST_QUEUE_ID;
const IS_LOCAL = !process.env.WEBMINER_RUN_ID;

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function apiRequest(method, endpoint, body) {
  const url = `${API_URL}/api/v1${endpoint}`;
  const resp = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`API error ${resp.status}: ${err}`);
  }

  const ct = resp.headers.get('content-type') || '';
  return ct.includes('application/json') ? resp.json() : resp.text();
}

// ─── Log ─────────────────────────────────────────────────────────────────────
function log(level, ...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`;
  process.stdout.write(line + '\n');
}

// ─── Dataset ──────────────────────────────────────────────────────────────────
class Dataset {
  constructor(id) {
    this.id = id;
    this._localItems = IS_LOCAL ? [] : null;
  }

  async pushData(items) {
    const arr = Array.isArray(items) ? items : [items];
    if (IS_LOCAL) {
      this._localItems.push(...arr);
      log('info', `[Dataset] Pushed ${arr.length} items (local mode)`);
      return;
    }

    // Batch push in 500-item chunks
    for (let i = 0; i < arr.length; i += 500) {
      const chunk = arr.slice(i, i + 500);
      await apiRequest('POST', `/datasets/${this.id}/items`, chunk);
    }
    log('info', `[Dataset] Pushed ${arr.length} items`);
  }

  async getData({ offset = 0, limit = 100 } = {}) {
    if (IS_LOCAL) return this._localItems.slice(offset, offset + limit);
    const r = await apiRequest('GET', `/datasets/${this.id}/items?offset=${offset}&limit=${limit}`);
    return r.data;
  }

  async getInfo() {
    if (IS_LOCAL) return { itemCount: this._localItems.length };
    const r = await apiRequest('GET', `/datasets/${this.id}`);
    return r.data;
  }
}

// ─── Key-Value Store ──────────────────────────────────────────────────────────
class KeyValueStore {
  constructor(id) {
    this.id = id;
    this._local = IS_LOCAL ? new Map() : null;
  }

  async getValue(key) {
    if (IS_LOCAL) return this._local.get(key) ?? null;
    try {
      const r = await apiRequest('GET', `/key-value-stores/${this.id}/records/${encodeURIComponent(key)}`);
      return typeof r === 'string' ? JSON.parse(r) : r;
    } catch (e) {
      if (e.message.includes('404')) return null;
      throw e;
    }
  }

  async setValue(key, value) {
    if (IS_LOCAL) { this._local.set(key, value); return; }
    await apiRequest('PUT', `/key-value-stores/${this.id}/records/${encodeURIComponent(key)}`, value);
  }

  async deleteValue(key) {
    if (IS_LOCAL) { this._local.delete(key); return; }
    await apiRequest('DELETE', `/key-value-stores/${this.id}/records/${encodeURIComponent(key)}`);
  }
}

// ─── Request Queue ────────────────────────────────────────────────────────────
class RequestQueue {
  constructor(id) {
    this.id = id;
    this._local = IS_LOCAL ? [] : null;
    this._localHandled = IS_LOCAL ? new Set() : null;
  }

  async addRequest(request) {
    const { url, method = 'GET', headers, userData, priority = 0, uniqueKey } = request;
    if (IS_LOCAL) {
      const key = uniqueKey || url;
      if (!this._localHandled.has(key)) {
        this._local.push({ ...request, uniqueKey: key });
      }
      return;
    }
    await apiRequest('POST', `/request-queues/${this.id}/requests`, {
      url, method, headers, userData, priority, uniqueKey,
    });
  }

  async addRequests(requests) {
    for (const req of requests) await this.addRequest(req);
  }

  async fetchNextRequest() {
    if (IS_LOCAL) {
      return this._local.find(r => !this._localHandled.has(r.uniqueKey || r.url)) || null;
    }
    const r = await apiRequest('GET', `/request-queues/${this.id}/head?limit=1`);
    return r.data?.[0] || null;
  }

  async markRequestHandled(request) {
    if (IS_LOCAL) { this._localHandled.add(request.uniqueKey || request.url); return; }
    await apiRequest('PUT', `/request-queues/${this.id}/requests/${request.id}/handled`, { wasAlreadyHandled: false });
  }

  async isEmpty() {
    if (IS_LOCAL) {
      const pending = this._local.filter(r => !this._localHandled.has(r.uniqueKey || r.url));
      return pending.length === 0;
    }
    const r = await apiRequest('GET', `/request-queues/${this.id}/head?limit=1`);
    return (r.data?.length || 0) === 0;
  }
}

// ─── Main Actor class ─────────────────────────────────────────────────────────
class Actor {
  static async getInput() {
    const inputPath = process.env.WEBMINER_INPUT_PATH || path.join(process.cwd(), 'INPUT.json');
    try {
      const raw = fs.readFileSync(inputPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  static async openDataset(nameOrId) {
    const id = nameOrId || DATASET_ID;
    if (!id) throw new Error('No dataset ID available. Are you running inside WebMiner?');
    return new Dataset(id);
  }

  static async openKeyValueStore(nameOrId) {
    const id = nameOrId || KVS_ID;
    if (!id) throw new Error('No KVS ID available');
    return new KeyValueStore(id);
  }

  static async openRequestQueue(nameOrId) {
    const id = nameOrId || REQUEST_QUEUE_ID;
    if (!id) throw new Error('No request queue ID available');
    return new RequestQueue(id);
  }

  static async setValue(key, value) {
    const kvs = await Actor.openKeyValueStore();
    await kvs.setValue(key, value);
  }

  static async getValue(key) {
    const kvs = await Actor.openKeyValueStore();
    return kvs.getValue(key);
  }

  static log = {
    info: (...args) => log('info', ...args),
    debug: (...args) => log('debug', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
  };

  /**
   * Main entry point wrapper — handles errors and exit
   */
  static async main(fn) {
    try {
      Actor.log.info('Actor starting...');
      await fn();
      Actor.log.info('Actor finished successfully');
      process.exit(0);
    } catch (err) {
      Actor.log.error('Actor failed:', err.message);
      Actor.log.error(err.stack);
      process.exit(1);
    }
  }

  /**
   * Abort check — actor can call this to see if it should stop early
   */
  static isAborted() {
    return process.env.WEBMINER_ABORT === '1';
  }

  /**
   * Report progress back to platform
   */
  static async setStatusMessage(message) {
    if (IS_LOCAL) { Actor.log.info(`[Status] ${message}`); return; }
    await apiRequest('PATCH', `/runs/${RUN_ID}`, { statusMessage: message }).catch(() => {});
  }
}

module.exports = { Actor, Dataset, KeyValueStore, RequestQueue };
