-- Cloud-side schema for the assistant.
--
-- Credentials (google_connections, google_tokens, oauth_connections,
-- oauth_tokens, desktop_tokens, desktop_pairings) deliberately stay in local
-- SQLite so encrypted tokens never leave the machine. Everything below is
-- history and memory, which is safe to keep in Supabase.
--
-- Run this once in the Supabase SQL editor. It is idempotent.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS profiles (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assistant_requests (
  id UUID PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_requests_user_created_idx
  ON assistant_requests (clerk_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_runs (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES assistant_requests(id) ON DELETE CASCADE,
  success BOOLEAN,
  message TEXT,
  abandonment_reason TEXT,
  plan_json JSONB,
  total_steps INTEGER,
  current_step_index INTEGER,
  inngest_run_id TEXT,
  closure_reason_code TEXT,
  closure_note TEXT,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  follow_up_note TEXT,
  follow_up_owner TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS assistant_runs_request_idx
  ON assistant_runs (request_id, started_at DESC);

-- Written while the run is still executing, then upserted on
-- (run_id, step_index) as each step progresses. Nothing here is NOT NULL
-- beyond the identity columns because a row exists before the step starts.
CREATE TABLE IF NOT EXISTS assistant_steps (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES assistant_runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  tool_name TEXT,
  title TEXT,
  params_json JSONB,
  result_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  success BOOLEAN,
  attempt INTEGER NOT NULL DEFAULT 0,
  user_retry_count INTEGER NOT NULL DEFAULT 0,
  error_kind TEXT,
  error_code TEXT,
  error_message TEXT,
  error_detail TEXT,
  retryable BOOLEAN,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_steps_run_step_unique
  ON assistant_steps (run_id, step_index);

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  primary_email TEXT,
  organization TEXT,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clerk_user_id, primary_email)
);

-- run_id holds the assistant_requests id, not the run id — the workflow
-- matches resume events on the request.
CREATE TABLE IF NOT EXISTS pending_tasks (
  id UUID PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  run_id UUID,
  kind TEXT NOT NULL DEFAULT 'user_input',
  step_index INTEGER,
  description TEXT NOT NULL,
  required_fields JSONB NOT NULL,
  context_json JSONB,
  status TEXT NOT NULL,
  resolved_data JSONB,
  skipped_data JSONB,
  abandonment_reason TEXT,
  paused_at TIMESTAMPTZ,
  resume_at TIMESTAMPTZ,
  wait_expires_at TIMESTAMPTZ,
  closure_reason_code TEXT,
  closure_note TEXT,
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  follow_up_required BOOLEAN NOT NULL DEFAULT false,
  follow_up_note TEXT,
  follow_up_owner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_tasks_user_status_idx
  ON pending_tasks (clerk_user_id, status, created_at DESC);

-- Only created when the column exists. On a pre-existing project 001's
-- CREATE TABLE IF NOT EXISTS is a no-op, so this index is added by 003.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pending_tasks'
      AND column_name = 'follow_up_required'
  ) THEN
    CREATE INDEX IF NOT EXISTS pending_tasks_follow_up_idx
      ON pending_tasks (clerk_user_id, follow_up_required, closed_at DESC);
  END IF;
END $$;

-- Long-term memory. 1536 dimensions matches text-embedding-3-small,
-- the default of env.OPENAI_EMBEDDING_MODEL.
CREATE TABLE IF NOT EXISTS memory_items (
  id UUID PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_items_user_created_idx
  ON memory_items (clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS memory_items_embedding_idx
  ON memory_items USING hnsw (embedding vector_cosine_ops);

-- Cosine similarity search, scoped to one user. Called via PostgREST rpc()
-- because the Data API cannot express the `<=>` operator directly.
CREATE OR REPLACE FUNCTION match_memories(
  p_user TEXT,
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  min_similarity FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  title TEXT,
  body TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.kind,
    m.title,
    m.body,
    m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memory_items m
  WHERE m.clerk_user_id = p_user
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) >= min_similarity
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Only the backend (service role, which bypasses RLS) should reach this data.
-- Enabling RLS without policies denies anon and authenticated clients.
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_items        ENABLE ROW LEVEL SECURITY;
