-- Add abandonment support to assistant_runs and pending_tasks

ALTER TABLE assistant_runs ADD COLUMN abandonment_reason TEXT;

ALTER TABLE pending_tasks ADD COLUMN abandonment_reason TEXT;

-- Extend pending_tasks status to support 'skipped' and 'abandoned'
-- SQLite CHECK constraints cannot be added via ALTER TABLE, so this is
-- documented here: valid status values are:
--   'pending' | 'resolved' | 'failed' | 'skipped' | 'abandoned'

-- Add skipped_data column to store any partial context captured at skip time
ALTER TABLE pending_tasks ADD COLUMN skipped_data TEXT; -- JSON
