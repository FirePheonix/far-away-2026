-- User knowledge-base: facts the AI collects and updates agentically.
--
-- Each row is one "fact" about the user's world:
--   kind    = 'contact' | 'preference' | 'fact' | 'credential' | 'alias'
--   subject = the canonical name/entity this fact is about ("Shubham", "standup")
--   key     = what kind of info it is ("email", "slack_channel", "timezone", ...)
--   value   = the actual value ("shubham@example.com", "#standup-dev", "IST")
--   aliases = JSON array of alternative names the user might say ("Shubham", "Shubh")
--   source  = 'user_provided' | 'ai_inferred' | 'imported'
--   confidence = 0.0–1.0 (1.0 = confirmed by user, lower = AI inferred)
--
-- The AI can upsert rows via the kb_update tool.
-- The planner reads rows at plan-time via buildMemoryContext.

CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fact',   -- 'contact'|'preference'|'fact'|'credential'|'alias'
  subject TEXT NOT NULL,               -- canonical entity name, e.g. "Shubham"
  key TEXT NOT NULL,                   -- fact key, e.g. "email", "slack_id", "timezone"
  value TEXT NOT NULL,                 -- fact value
  aliases TEXT NOT NULL DEFAULT '[]',  -- JSON array of alternative names
  source TEXT NOT NULL DEFAULT 'user_provided',
  confidence REAL NOT NULL DEFAULT 1.0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clerk_user_id, subject, key)
);

CREATE INDEX IF NOT EXISTS idx_kb_user ON knowledge_base(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_kb_kind ON knowledge_base(clerk_user_id, kind);
