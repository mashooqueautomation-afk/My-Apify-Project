-- Phase 2: Request Queue Deduplication & Dead Letter Queue

-- Add unique_key column to request_queue_items for deduplication
ALTER TABLE request_queue_items 
ADD COLUMN unique_key VARCHAR(500);

-- Update existing rows with SHA256 of URL
UPDATE request_queue_items 
SET unique_key = encode(digest(url, 'sha256'), 'hex')
WHERE unique_key IS NULL;

-- Make unique_key required and indexed
ALTER TABLE request_queue_items 
ALTER COLUMN unique_key SET NOT NULL;

CREATE UNIQUE INDEX idx_request_queue_unique_key 
ON request_queue_items(queue_id, unique_key) 
WHERE status != 'dead_letter';

-- Add retry tracking columns
ALTER TABLE request_queue_items
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- Dead Letter Queue table
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id UUID NOT NULL REFERENCES request_queues(id) ON DELETE CASCADE,
  request_item_id UUID NOT NULL REFERENCES request_queue_items(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  error_message TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  failure_reason TEXT NOT NULL,
  retried_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dead_letter_queue_id ON dead_letter_queue(queue_id);
CREATE INDEX idx_dead_letter_created_at ON dead_letter_queue(created_at DESC);

-- Request retry history (for analytics)
CREATE TABLE IF NOT EXISTS request_retry_history (
  id BIGSERIAL PRIMARY KEY,
  queue_id UUID NOT NULL REFERENCES request_queues(id),
  request_item_id UUID NOT NULL REFERENCES request_queue_items(id),
  attempt_number INTEGER NOT NULL,
  error_message TEXT,
  next_retry_delay_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_retry_history_request ON request_retry_history(request_item_id);
CREATE INDEX idx_retry_history_queue ON request_retry_history(queue_id);