PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL, participant_key TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX auth_expiry ON auth_sessions(expires_at);
CREATE TABLE oauth_transactions (
  state_hash TEXT PRIMARY KEY, cookie_hash TEXT NOT NULL, nonce TEXT NOT NULL,
  verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE task_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX sessions_owner ON task_sessions(user_id, updated_at DESC);
CREATE TABLE rounds (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES task_sessions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL, payload TEXT NOT NULL, fingerprint TEXT NOT NULL,
  received_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  UNIQUE(session_id, ordinal)
);
CREATE INDEX rounds_expiry ON rounds(expires_at);
CREATE TABLE research_permissions (
  session_id TEXT PRIMARY KEY REFERENCES task_sessions(id) ON DELETE CASCADE,
  granted_at INTEGER NOT NULL, version TEXT NOT NULL, withdrawn_at INTEGER
);
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
  session_id TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX audit_expiry ON admin_audit(created_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE deletion_log (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('user','session')), target_id TEXT NOT NULL, deleted_at INTEGER NOT NULL);
CREATE INDEX deletion_expiry ON deletion_log(deleted_at);
