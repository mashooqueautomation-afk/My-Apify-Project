-- Mash Lead Scrapping Platform - Full Database Schema
-- PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'user', 'viewer');
CREATE TYPE plan_type AS ENUM ('free', 'starter', 'professional', 'enterprise');
CREATE TYPE actor_status AS ENUM ('draft', 'active', 'deprecated', 'archived');
CREATE TYPE run_status AS ENUM ('scheduled', 'queued', 'running', 'succeeded', 'failed', 'aborted', 'timeout');
CREATE TYPE task_status AS ENUM ('active', 'paused', 'archived');
CREATE TYPE proxy_type AS ENUM ('datacenter', 'residential', 'mobile');
CREATE TYPE storage_type AS ENUM ('dataset', 'key_value_store', 'request_queue');

-- ─── ORGANIZATIONS / TENANTS ──────────────────────────────────────────────────

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  plan          plan_type NOT NULL DEFAULT 'free',
  settings      JSONB NOT NULL DEFAULT '{}',
  -- Quotas
  monthly_compute_units INTEGER NOT NULL DEFAULT 1000,
  max_actors    INTEGER NOT NULL DEFAULT 5,
  max_concurrent_runs INTEGER NOT NULL DEFAULT 2,
  storage_gb    INTEGER NOT NULL DEFAULT 1,
  -- Billing
  stripe_customer_id VARCHAR(255),
  billing_email VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── USERS ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name          VARCHAR(255) NOT NULL,
  avatar_url    VARCHAR(500),
  role          user_role NOT NULL DEFAULT 'user',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  last_login_at TIMESTAMPTZ,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── API KEYS ─────────────────────────────────────────────────────────────────

CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  key_hash      VARCHAR(255) UNIQUE NOT NULL,
  key_prefix    VARCHAR(20) NOT NULL,  -- e.g. "mash_live_..."
  scopes        TEXT[] NOT NULL DEFAULT '{"read","write"}',
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ACTORS ───────────────────────────────────────────────────────────────────

CREATE TABLE actors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL,
  description   TEXT,
  version       VARCHAR(50) NOT NULL DEFAULT '0.1.0',
  status        actor_status NOT NULL DEFAULT 'active',
  is_public     BOOLEAN NOT NULL DEFAULT false,
  -- Configuration
  input_schema  JSONB NOT NULL DEFAULT '{}',   -- JSON Schema for input
  default_run_options JSONB NOT NULL DEFAULT '{}',
  -- Runtime
  docker_image  VARCHAR(500),
  runtime       VARCHAR(50) NOT NULL DEFAULT 'node18',  -- node18, python310, playwright
  source_code   TEXT,        -- inline code (small actors)
  git_repo      VARCHAR(500), -- git repo URL
  build_cmd     VARCHAR(500),
  -- Stats
  total_runs    INTEGER NOT NULL DEFAULT 0,
  success_runs  INTEGER NOT NULL DEFAULT 0,
  avg_duration_secs INTEGER,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  -- SEO / store
  readme        TEXT,
  category      VARCHAR(100),
  icon_url      VARCHAR(500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- ─── ACTOR BUILDS ─────────────────────────────────────────────────────────────

CREATE TABLE actor_builds (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  version       VARCHAR(50) NOT NULL,
  docker_image  VARCHAR(500),
  build_log     TEXT,
  status        VARCHAR(50) NOT NULL DEFAULT 'building',  -- building, ready, failed
  size_bytes    BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

-- ─── TASKS (Saved Configurations) ────────────────────────────────────────────

CREATE TABLE tasks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES users(id),
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(255) NOT NULL,
  status        task_status NOT NULL DEFAULT 'active',
  input         JSONB NOT NULL DEFAULT '{}',
  run_options   JSONB NOT NULL DEFAULT '{}',
  -- Scheduling
  cron_expr     VARCHAR(100),
  timezone      VARCHAR(100) NOT NULL DEFAULT 'UTC',
  next_run_at   TIMESTAMPTZ,
  last_run_at   TIMESTAMPTZ,
  -- Stats
  total_runs    INTEGER NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

-- ─── RUNS ─────────────────────────────────────────────────────────────────────

CREATE TABLE runs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id      UUID NOT NULL REFERENCES actors(id),
  task_id       UUID REFERENCES tasks(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  user_id       UUID REFERENCES users(id),
  -- Runtime config
  input         JSONB NOT NULL DEFAULT '{}',
  run_options   JSONB NOT NULL DEFAULT '{}',
  -- Execution
  status        run_status NOT NULL DEFAULT 'queued',
  container_id  VARCHAR(255),   -- Docker container ID
  worker_id     VARCHAR(100),
  worker_host   VARCHAR(255),
  -- Results
  exit_code     INTEGER,
  error_message TEXT,
  stats         JSONB NOT NULL DEFAULT '{}',  -- items_scraped, requests_made, etc.
  -- Timing
  queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  duration_secs INTEGER,
  -- Storage refs
  dataset_id    UUID,
  key_value_store_id UUID,
  log_store_id  UUID,
  -- Compute
  compute_units DECIMAL(10,4) NOT NULL DEFAULT 0,
  memory_mb     INTEGER NOT NULL DEFAULT 512,
  timeout_secs  INTEGER NOT NULL DEFAULT 3600,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_runs_actor_id ON runs(actor_id);
CREATE INDEX idx_runs_org_id ON runs(org_id);
CREATE INDEX idx_runs_status ON runs(status);
CREATE INDEX idx_runs_created_at ON runs(created_at DESC);

-- ─── STORAGE: DATASETS ────────────────────────────────────────────────────────

CREATE TABLE datasets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID REFERENCES runs(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255),
  item_count    INTEGER NOT NULL DEFAULT 0,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  fields        TEXT[] NOT NULL DEFAULT '{}',  -- detected field names
  schema        JSONB,
  clean_items   INTEGER NOT NULL DEFAULT 0,
  is_public     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dataset_items (
  id            BIGSERIAL PRIMARY KEY,
  dataset_id    UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  data          JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dataset_items_dataset_id ON dataset_items(dataset_id);

-- ─── STORAGE: KEY-VALUE STORE ─────────────────────────────────────────────────

CREATE TABLE key_value_stores (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID REFERENCES runs(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255),
  item_count    INTEGER NOT NULL DEFAULT 0,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  is_public     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE key_value_store_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id      UUID NOT NULL REFERENCES key_value_stores(id) ON DELETE CASCADE,
  key           VARCHAR(500) NOT NULL,
  value         BYTEA,
  content_type  VARCHAR(255) NOT NULL DEFAULT 'application/json',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, key)
);

CREATE INDEX idx_kvs_records_store_id ON key_value_store_records(store_id);

-- ─── STORAGE: REQUEST QUEUES ──────────────────────────────────────────────────

CREATE TABLE request_queues (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id        UUID REFERENCES runs(id),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255),
  total_requests INTEGER NOT NULL DEFAULT 0,
  handled_requests INTEGER NOT NULL DEFAULT 0,
  pending_requests INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE request_queue_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id      UUID NOT NULL REFERENCES request_queues(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  unique_key    VARCHAR(500) NOT NULL,
  method        VARCHAR(10) NOT NULL DEFAULT 'GET',
  headers       JSONB,
  payload       TEXT,
  user_data     JSONB,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  max_retries   INTEGER NOT NULL DEFAULT 3,
  priority      INTEGER NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, done, failed
  error_message TEXT,
  handled_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(queue_id, unique_key)
);

CREATE INDEX idx_rqi_queue_status ON request_queue_items(queue_id, status, priority DESC);

-- ─── PROXY GROUPS ────────────────────────────────────────────────────────────

CREATE TABLE proxy_groups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  name          VARCHAR(255) NOT NULL,
  type          proxy_type NOT NULL DEFAULT 'datacenter',
  country_codes TEXT[] NOT NULL DEFAULT '{}',
  provider      VARCHAR(100),
  is_shared     BOOLEAN NOT NULL DEFAULT false,
  credentials   JSONB,  -- encrypted
  proxy_count   INTEGER NOT NULL DEFAULT 0,
  active_proxies INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE proxies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id      UUID NOT NULL REFERENCES proxy_groups(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  host          VARCHAR(255) NOT NULL,
  port          INTEGER NOT NULL,
  username      VARCHAR(255),
  password      VARCHAR(255),
  country_code  VARCHAR(10),
  type          proxy_type NOT NULL DEFAULT 'datacenter',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_used_at  TIMESTAMPTZ,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  avg_response_ms INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── WEBHOOKS ────────────────────────────────────────────────────────────────

CREATE TABLE webhooks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  actor_id      UUID REFERENCES actors(id),
  task_id       UUID REFERENCES tasks(id),
  url           TEXT NOT NULL,
  events        TEXT[] NOT NULL DEFAULT '{"run.succeeded","run.failed"}',
  headers       JSONB NOT NULL DEFAULT '{}',
  secret        VARCHAR(255),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_fired_at TIMESTAMPTZ,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  user_id       UUID REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id   UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_created ON audit_logs(org_id, created_at DESC);

-- ─── USAGE METRICS ───────────────────────────────────────────────────────────

CREATE TABLE usage_metrics (
  id            BIGSERIAL PRIMARY KEY,
  org_id        UUID NOT NULL REFERENCES organizations(id),
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  compute_units DECIMAL(12,4) NOT NULL DEFAULT 0,
  runs_count    INTEGER NOT NULL DEFAULT 0,
  data_transferred_gb DECIMAL(10,4) NOT NULL DEFAULT 0,
  storage_gb    DECIMAL(10,4) NOT NULL DEFAULT 0,
  cost_usd      DECIMAL(10,4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── FUNCTIONS ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER actors_updated_at BEFORE UPDATE ON actors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER datasets_updated_at BEFORE UPDATE ON datasets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER key_value_stores_updated_at BEFORE UPDATE ON key_value_stores FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── SEED DATA ───────────────────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug, plan, monthly_compute_units, max_actors, max_concurrent_runs, storage_gb)
VALUES ('00000000-0000-0000-0000-000000000001', 'Mash Lead Scrapping Admin', 'mash-lead-scrapping-admin', 'enterprise', 999999, 999, 50, 1000);

INSERT INTO users (id, org_id, email, password_hash, name, role, email_verified)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'admin@mash-lead-scrapping.com',
  -- Password: Admin@123 (bcrypt)
  '$2b$10$rQnZ8G7LXJbP.mMzTzQ0/.K8xVFqJLl1JXmh/dIl.5NSxoRqO5FiW',
  'Admin User',
  'admin',
  true
);
