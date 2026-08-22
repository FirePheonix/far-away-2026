-- Live execution tracing + clean closure.
--
-- Two things this enables:
--   1. assistant_steps stops being a write-once audit row and becomes the live
--      state of the run, upserted on (run_id, step_index) as each step moves
--      through running -> succeeded/failed. The desktop polls it to draw the
--      agent flow while it is still executing.
--   2. Every way a run or task can end now records why, who ended it, and
--      whether a human still owes it follow-up.
--
-- Safe to re-run. Written to work against both the original June schema
-- (assistant_steps.tool/params/result) and a fresh 001_init.sql.

-- ---------------------------------------------------------------------------
-- assistant_steps: reconcile legacy column names, then add the lifecycle
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'tool'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'tool_name'
  ) THEN
    ALTER TABLE assistant_steps RENAME COLUMN tool TO tool_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'params'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'params_json'
  ) THEN
    ALTER TABLE assistant_steps RENAME COLUMN params TO params_json;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'result'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'result_json'
  ) THEN
    ALTER TABLE assistant_steps RENAME COLUMN result TO result_json;
  END IF;
END $$;

ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS tool_name    TEXT;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS params_json  JSONB;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS result_json  JSONB;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS success      BOOLEAN;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS duration_ms  INTEGER;

-- Human-readable label so the desktop can show "Email Sarah the deck"
-- instead of "gmail.send_email".
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS title TEXT;

-- pending | running | succeeded | failed | skipped | awaiting_input | abandoned
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- attempt is the Inngest retry counter; user_retry_count is how many times a
-- human pressed retry after the automatic retries were exhausted.
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS attempt          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS user_retry_count INTEGER NOT NULL DEFAULT 0;

-- transient | permanent | auth | needs_user_input | unknown
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS error_kind    TEXT;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS error_code    TEXT;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS error_detail  TEXT;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS retryable     BOOLEAN;

ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS started_at  TIMESTAMPTZ;
ALTER TABLE assistant_steps ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ;

-- Rows are now written while the step is still running, so success and
-- tool_name cannot stay NOT NULL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'success' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE assistant_steps ALTER COLUMN success DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assistant_steps' AND column_name = 'tool_name' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE assistant_steps ALTER COLUMN tool_name DROP NOT NULL;
  END IF;
END $$;

-- Historical rows were written once, at the end, with only a success flag.
-- Give them a status so the trace view can render old runs too.
UPDATE assistant_steps
SET status = CASE WHEN success IS TRUE THEN 'succeeded' ELSE 'failed' END
WHERE status = 'pending' AND success IS NOT NULL;

-- Progress writes upsert on (run_id, step_index), which PostgREST will only
-- accept with a matching unique index. Older runs bulk-inserted duplicates,
-- so collapse them to the newest row per step first.
DELETE FROM assistant_steps
WHERE ctid NOT IN (
  SELECT MAX(ctid) FROM assistant_steps GROUP BY run_id, step_index
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_steps_run_step_unique
  ON assistant_steps (run_id, step_index);

-- ---------------------------------------------------------------------------
-- assistant_runs: the plan up front, live position, and closure
-- ---------------------------------------------------------------------------

ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS plan_json          JSONB;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS total_steps        INTEGER;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS current_step_index INTEGER;

-- Inngest's own run id, captured from the function context. Needed to line a
-- row up with its trace in the Inngest dashboard.
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS inngest_run_id TEXT;

-- wrong_intent | no_longer_needed | missing_info | doing_it_manually |
-- ai_got_it_wrong | deferred | timeout | system_failure
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS closure_reason_code TEXT;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS closure_note        TEXT;
-- user | system | timeout
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS closed_by           TEXT;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS closed_at           TIMESTAMPTZ;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS follow_up_required  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS follow_up_note      TEXT;
ALTER TABLE assistant_runs ADD COLUMN IF NOT EXISTS follow_up_owner     TEXT;

-- ---------------------------------------------------------------------------
-- pending_tasks: two kinds of task, pause, and closure
-- ---------------------------------------------------------------------------

-- user_input  = the planner asked for missing information
-- step_failure = a tool failed permanently and is handing the work back
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'user_input';

ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS step_index   INTEGER;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS context_json JSONB;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS skipped_data JSONB;

-- Snooze. resume_at always stays inside the workflow's wait window, so a
-- paused task resumes into the same run rather than a new one.
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS wait_expires_at TIMESTAMPTZ;

ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS closure_reason_code TEXT;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS closure_note        TEXT;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS closed_by           TEXT;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS closed_at           TIMESTAMPTZ;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS follow_up_required  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS follow_up_note      TEXT;
ALTER TABLE pending_tasks ADD COLUMN IF NOT EXISTS follow_up_owner     TEXT;

-- Drives the Unresolved view in the desktop overlay.
-- Guarded so a partial run (or 001 on an old project) cannot fail here.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_tasks' AND column_name = 'follow_up_required'
  ) THEN
    CREATE INDEX IF NOT EXISTS pending_tasks_follow_up_idx
      ON pending_tasks (clerk_user_id, follow_up_required, closed_at DESC);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assistant_runs' AND column_name = 'follow_up_required'
  ) THEN
    CREATE INDEX IF NOT EXISTS assistant_runs_follow_up_idx
      ON assistant_runs (follow_up_required, closed_at DESC);
  END IF;
END $$;
