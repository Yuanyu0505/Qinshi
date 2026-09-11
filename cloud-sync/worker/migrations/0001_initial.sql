CREATE TABLE sync_spaces (
  id TEXT PRIMARY KEY, locator_hash TEXT NOT NULL UNIQUE, kdf_json TEXT NOT NULL,
  auth_digest TEXT NOT NULL, password_wrapped_master_json TEXT NOT NULL,
  recovery_auth_digest TEXT NOT NULL, recovery_wrapped_master_json TEXT NOT NULL,
  minimum_read_version TEXT NOT NULL, minimum_write_version TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE,
  encrypted_name_json TEXT NOT NULL, revoked_at INTEGER, last_used_at INTEGER NOT NULL,
  last_uploaded_at INTEGER, created_at INTEGER NOT NULL,
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE
);
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, device_id TEXT NOT NULL,
  source_snapshot_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('latest','history','staged')),
  app_version TEXT NOT NULL, format_version INTEGER NOT NULL, schema_version INTEGER NOT NULL,
  encoding TEXT NOT NULL CHECK (encoding IN ('gzip','identity')),
  client_created_at TEXT NOT NULL, data_hash TEXT NOT NULL, iv TEXT NOT NULL,
  ciphertext_bytes INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
  ciphertext_digest TEXT NOT NULL, encrypted_summary_json TEXT NOT NULL,
  server_created_at INTEGER NOT NULL, committed_at INTEGER,
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
CREATE TABLE snapshot_chunks (
  snapshot_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, body BLOB NOT NULL,
  chunk_digest TEXT NOT NULL, PRIMARY KEY (snapshot_id, chunk_index),
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, device_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upload','replace-before','replace-after','restore-before','restore-after')),
  idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
  expected_chunks INTEGER NOT NULL, expected_bytes INTEGER NOT NULL,
  expected_digest TEXT NOT NULL, status TEXT NOT NULL,
  result_json TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (space_id, device_id, idempotency_key),
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);
CREATE TABLE auth_throttles (
  locator_hash TEXT PRIMARY KEY, failure_count INTEGER NOT NULL,
  cooldown_until INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_device_role_time ON snapshots(space_id, device_id, role, server_created_at DESC);
CREATE UNIQUE INDEX idx_snapshots_one_latest ON snapshots(space_id, device_id) WHERE role='latest';
CREATE INDEX idx_upload_sessions_expiry ON upload_sessions(status, expires_at);
