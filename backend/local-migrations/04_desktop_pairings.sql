-- Older local.db files used desktop_pairing_sessions. The desktop-auth
-- service writes desktop_pairings. Create it if this DB skipped that table.
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
