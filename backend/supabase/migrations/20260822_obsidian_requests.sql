-- Obsidian integration: requests table for the local desktop bridge.
-- The backend inserts rows here; the desktop app polls for pending rows,
-- executes the file I/O locally, and POSTs the result back.

CREATE TABLE IF NOT EXISTS obsidian_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL,
  run_id TEXT,
  request_id TEXT,
  action TEXT NOT NULL,       -- 'search_notes' | 'append_to_note' | 'write_daily_note'
  params JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'completed' | 'failed'
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_obsidian_requests_user_status
  ON obsidian_requests (clerk_user_id, status);

-- RLS: only the backend (service role) reads/writes this table.
ALTER TABLE obsidian_requests ENABLE ROW LEVEL SECURITY;
