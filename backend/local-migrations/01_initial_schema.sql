CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS google_connections (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  google_sub TEXT NOT NULL,
  google_email TEXT,
  scopes TEXT NOT NULL,
  revoked_at DATETIME,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clerk_user_id, google_sub)
);

CREATE TABLE IF NOT EXISTS google_tokens (
  connection_id TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope_text TEXT,
  expires_at DATETIME,
  FOREIGN KEY (connection_id) REFERENCES google_connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_requests (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assistant_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  success BOOLEAN,
  message TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (request_id) REFERENCES assistant_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS assistant_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  tool TEXT NOT NULL,
  params TEXT, -- JSON
  result TEXT, -- JSON
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES assistant_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  primary_email TEXT,
  organization TEXT,
  role TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clerk_user_id, primary_email)
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT, -- JSON
  embedding TEXT, -- TEXT or JSON for local mock
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS desktop_pairings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  device_name TEXT,
  clerk_user_id TEXT,
  status TEXT DEFAULT 'pending',
  token_enc TEXT,
  claimed_at DATETIME,
  expires_at DATETIME DEFAULT (datetime('now', '+10 minutes'))
);

CREATE TABLE IF NOT EXISTS desktop_tokens (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  device_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  revoked_at DATETIME
);

CREATE TABLE IF NOT EXISTS oauth_connections (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(clerk_user_id, provider)
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  connection_id TEXT PRIMARY KEY,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  token_type TEXT,
  scope_text TEXT,
  expires_at DATETIME,
  FOREIGN KEY (connection_id) REFERENCES oauth_connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_tasks (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  run_id TEXT,
  description TEXT NOT NULL,
  required_fields TEXT NOT NULL, -- JSON array of requested field names/types
  status TEXT NOT NULL, -- 'pending', 'resolved', 'failed'
  resolved_data TEXT, -- JSON object of provided data
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
