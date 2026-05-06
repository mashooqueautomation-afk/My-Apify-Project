ALTER TABLE actors
  ALTER COLUMN status SET DEFAULT 'active';

UPDATE actors
SET status = 'active',
    updated_at = NOW()
WHERE status = 'draft';
