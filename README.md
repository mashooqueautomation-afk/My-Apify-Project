# Mash Lead Scrapping — Production-Grade Lead Scraping Platform

> An Apify-like platform for building, deploying, and scheduling web scrapers as isolated Docker-based actors.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│   React Dashboard (Vite)          REST API Consumers                │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────────────┐
│                     NGINX REVERSE PROXY                             │
│          Rate limiting · SSL termination · SPA routing              │
└───────────────┬──────────────────────────────┬──────────────────────┘
                │                              │
┌───────────────▼───────────┐    ┌─────────────▼────────────────────┐
│      API SERVICE          │    │       DASHBOARD SERVICE           │
│  Express + TypeScript     │    │   React 18 + Vite + TailwindCSS   │
│  JWT + API Key Auth       │    │   React Query + Zustand           │
│  BullMQ Job Producer      │    └───────────────────────────────────┘
│  REST /api/v1/*           │
└───────┬───────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────┐
│                      MESSAGE LAYER (Redis)                         │
│     BullMQ Queues: actor-run · webhook · actor-build              │
│     Pub/Sub: run:abort signal                                      │
└───────┬───────────────────────────────────────────────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────┐
│                   WORKER SERVICE (scalable)                        │
│  BullMQ Consumer → Docker Container spawn per run                 │
│  Resource caps · Log streaming → Redis · Proxy rotation           │
│  Webhook delivery · Abort via pub/sub                             │
└───────┬───────────────────────────────────────────────────────────┘
        │
┌───────▼────────────┐  ┌──────────────┐  ┌─────────────────────────┐
│  DOCKER ENGINE     │  │  POSTGRESQL  │  │  MINIO (S3-compatible)  │
│  Actor containers  │  │  Metadata    │  │  Actor builds, outputs  │
│  Per-run isolated  │  │  Datasets    │  │  Screenshots, large data│
│  Memory-capped     │  │  Runs, logs  │  └─────────────────────────┘
└────────────────────┘  └──────────────┘
```

---

## ⚡ Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 18+
- 4GB+ RAM available

```bash
# 1. Clone
git clone https://github.com/your-org/webminer && cd webminer

# 2. Setup (installs deps, starts infra, applies schema)
bash scripts/setup.sh

# 3. Start all services in dev mode
npm run dev
```

**That's it.** Open http://localhost:3001 and login with `admin@mash-lead-scrapping.com` / `Admin@123`.

---

## 🏗️ Services

| Service     | Port  | Description                              |
|-------------|-------|------------------------------------------|
| API         | 3000  | REST API (Express + TypeScript)          |
| Dashboard   | 3001  | React admin UI                           |
| PostgreSQL  | 5432  | Primary database                         |
| Redis       | 6379  | Queue + pub/sub + cache                  |
| MinIO       | 9000  | Object storage (S3-compatible)           |
| MinIO UI    | 9001  | MinIO web console                        |
| Worker      | —     | Actor execution engine (no public port)  |
| Scheduler   | —     | Cron task processor                      |

---

## 📦 Core Concepts

### Actors
Self-contained scraping programs. Each actor has:
- Source code (inline JS or Git repo)
- Runtime: `node18`, `playwright`, `python310`
- Input schema (JSON Schema)
- Versioning

### Mash Store
Install prebuilt scraping apps into your workspace as draft actors:
- LinkedIn lead scraping
- E-commerce price monitoring
- Google Maps business discovery
- News monitoring
- Generic crawling templates

### Runs
Each actor execution is a **Run** — isolated Docker container with:
- Dedicated Dataset (output storage)
- Key-Value Store (key=value storage)
- Request Queue (crawl frontier)
- Live log streaming via SSE
- Memory + timeout caps
- Auto-collected stats

### Tasks
Saved actor configurations with optional **cron schedules**:
```
0 9 * * 1-5    → Every weekday at 9am
*/30 * * * *   → Every 30 minutes
0 0 * * 0      → Every Sunday midnight
```

### Storage

| Type               | Use case                        | API endpoint              |
|--------------------|---------------------------------|---------------------------|
| Dataset            | Structured scraped items (rows) | `/datasets/:id/items`     |
| Key-Value Store    | Arbitrary key=value data        | `/key-value-stores/:id/records/:key` |
| Request Queue      | URLs to crawl (dedup + priority)| `/request-queues/:id/requests`       |

---

## 🔌 API Reference

### Authentication

**Option A — Bearer Token (JWT)**
```http
Authorization: Bearer eyJhbGc...
```

**Option B — API Key**
```http
X-API-Key: wm_live_abc123...
```

### Core Endpoints

```
POST   /api/v1/auth/register          Register new org + user
POST   /api/v1/auth/login             Login → JWT token
GET    /api/v1/auth/me                Current user info
POST   /api/v1/auth/api-keys          Create API key
DELETE /api/v1/auth/api-keys/:id      Revoke API key

GET    /api/v1/actors                 List actors
POST   /api/v1/actors                 Create actor
GET    /api/v1/actors/:id             Get actor details
PATCH  /api/v1/actors/:id             Update actor
DELETE /api/v1/actors/:id             Archive actor
POST   /api/v1/actors/:id/runs        ★ Start a run

GET    /api/v1/runs                   List runs (filterable by status)
GET    /api/v1/runs/:id               Run details + stats
POST   /api/v1/runs/:id/abort         Abort running container
GET    /api/v1/runs/:id/log           Get logs (paginated)
GET    /api/v1/runs/:id/log/stream    Live log stream (SSE)

GET    /api/v1/datasets               List datasets
GET    /api/v1/datasets/:id/items     Get items (offset/limit/fields)
POST   /api/v1/datasets/:id/items     Push items (used by actor SDK)
GET    /api/v1/datasets/:id/export    Export (json/csv/jsonl)

GET    /api/v1/store/apps             Browse Mash Store apps
GET    /api/v1/store/apps/:slug       Get store app details
POST   /api/v1/store/apps/:slug/install  Install app as draft actor

GET    /api/v1/tasks                  List scheduled tasks
POST   /api/v1/tasks                  Create task with cron
PATCH  /api/v1/tasks/:id              Update/pause task
POST   /api/v1/tasks/:id/run          Manually trigger task

GET    /api/v1/key-value-stores/:id/records/:key   Get value
PUT    /api/v1/key-value-stores/:id/records/:key   Set value
DELETE /api/v1/key-value-stores/:id/records/:key   Delete value

POST   /api/v1/request-queues/:id/requests         Add URL
GET    /api/v1/request-queues/:id/head             Get pending URLs

POST   /api/v1/webhooks               Register webhook
GET    /api/v1/webhooks               List webhooks

GET    /api/v1/metrics/overview       Platform stats
GET    /api/v1/metrics/runs/daily     Daily run counts + duration
```

---

## 🤖 Writing Actors

Actors are Node.js scripts that use the **Actor SDK**:

```javascript
const { Actor } = require('./actor-sdk/index');

Actor.main(async () => {
  // 1. Read input
  const input = await Actor.getInput();
  const { url, maxItems = 100 } = input;

  // 2. Open storage
  const dataset = await Actor.openDataset();
  const requestQueue = await Actor.openRequestQueue();

  // 3. Add seed URLs
  await requestQueue.addRequest({ url });

  // 4. Process queue
  while (!(await requestQueue.isEmpty())) {
    const req = await requestQueue.fetchNextRequest();
    if (!req) break;

    const response = await fetch(req.url);
    const data = await response.json();

    // 5. Push results
    await dataset.pushData({ url: req.url, ...data });

    Actor.log.info(`Scraped: ${req.url}`);
    await requestQueue.markRequestHandled(req);
  }
});
```

### Available SDK methods

```javascript
// Input
const input = await Actor.getInput();

// Storage
const ds  = await Actor.openDataset();
const kvs = await Actor.openKeyValueStore();
const rq  = await Actor.openRequestQueue();

// Dataset
await ds.pushData({ key: 'value' });          // Push single item
await ds.pushData([{ a: 1 }, { b: 2 }]);      // Push array
const items = await ds.getData({ offset: 0, limit: 100 });

// KV Store
await kvs.setValue('key', { any: 'json' });
const val = await kvs.getValue('key');

// Request Queue
await rq.addRequest({ url, userData: { depth: 0 } });
const req = await rq.fetchNextRequest();
await rq.markRequestHandled(req);
const empty = await rq.isEmpty();

// Lifecycle
Actor.log.info('message');
Actor.log.warn('message');
Actor.log.error('message');
await Actor.setStatusMessage('Scraping page 42/100');
const shouldStop = Actor.isAborted();
```

---

## 🚀 Production Deployment

### Docker Compose (single server)
```bash
# Set prod secrets in .env, then:
bash scripts/deploy.sh --tag v1.0.0

# Scale workers
SCALE_WORKERS=10 bash scripts/deploy.sh
```

### Kubernetes
```bash
# Update secrets in infra/k8s/base/namespace.yaml
kubectl apply -k infra/k8s/base/

# Check status
kubectl get pods -n webminer

# Scale workers
kubectl scale deployment webminer-worker --replicas=10 -n webminer

# Auto-scale (HPA already applied)
kubectl get hpa -n webminer
```

---

## ⚙️ Configuration

### Plan Limits (DB)
```sql
UPDATE organizations
SET plan = 'professional',
    monthly_compute_units = 50000,
    max_actors = 50,
    max_concurrent_runs = 10,
    storage_gb = 50
WHERE slug = 'your-org-slug';
```

### Proxy Groups
```bash
# Create via API
curl -X POST /api/v1/proxies/groups \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "name": "US Residential", "type": "residential" }'

# Add proxies
curl -X POST /api/v1/proxies/groups/$GROUP_ID/proxies \
  -H "Authorization: Bearer $TOKEN" \
  -d '{ "host": "proxy.example.com", "port": 8080, "username": "user", "password": "pass" }'
```

---

## 🔒 Security Notes

1. **Container isolation** — Each actor runs in a Docker container with:
   - All capabilities dropped (`--cap-drop ALL`)
   - `no-new-privileges` seccomp
   - Memory + CPU hard limits
   - No host network access (custom bridge)

2. **Auth** — JWT tokens expire in 7 days. API keys are bcrypt-hashed in DB (never stored raw).

3. **Webhook HMAC** — All webhooks signed with `sha256=<hmac>` header.

4. **Rate limiting** — 100 req/15min for anonymous, 1000 req/15min for authenticated.

5. **Multi-tenancy** — All queries filter by `org_id`. Row-level isolation enforced in every query.

---

## 📊 Monitoring

```bash
# View live logs
docker compose logs -f api worker scheduler

# Check queue depths
docker compose exec redis redis-cli -a webminer_redis \
  LLEN bull:actor-run:wait

# Active runs
psql $DATABASE_URL -c "SELECT id, status, actor_id FROM runs WHERE status = 'running';"

# Metrics API
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/metrics/overview
```

---

## 🧱 Tech Stack

| Layer        | Technology                           | Why                                          |
|--------------|--------------------------------------|----------------------------------------------|
| API          | Node.js 20 + TypeScript + Express    | Non-blocking I/O, mature ecosystem           |
| Queue        | BullMQ + Redis                       | Priority queues, retry, delayed jobs         |
| Database     | PostgreSQL 16                        | JSONB, row-level isolation, strong ACID      |
| Storage      | MinIO (S3-compatible)                | Self-hosted, S3 API drop-in                  |
| Containers   | Docker via Dockerode                 | Per-run isolation, resource caps             |
| Browser      | Playwright (Chromium/Firefox/WebKit) | Best-in-class browser automation             |
| Dashboard    | React 18 + Vite + TailwindCSS        | Fast build, modern DX                        |
| State        | React Query + Zustand                | Server state + client state separation       |
| Auth         | JWT + bcrypt API keys                | Stateless tokens + long-lived programmatic   |
| Proxy        | Custom ProxyManager                  | Health scoring, round-robin rotation         |
| Scheduler    | node-cron + Redis distributed lock   | Exactly-once cron execution                  |
| Reverse Proxy| Nginx                                | Rate limiting, SSL, SSE support              |
| K8s          | Kustomize + HPA                      | GitOps-friendly, auto-scaling                |
