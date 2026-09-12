-- Completed operation receipts must survive history trimming and explicit ciphertext
-- deletion. Space/device deletion still cascades; no credentials enter this ledger.
CREATE TABLE upload_sessions_v3 (
  id TEXT PRIMARY KEY, space_id TEXT NOT NULL, device_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upload','replace-before','replace-after','restore-before','restore-after')),
  idempotency_key TEXT NOT NULL, request_json TEXT NOT NULL,
  expected_chunks INTEGER NOT NULL, expected_bytes INTEGER NOT NULL,
  expected_digest TEXT NOT NULL, status TEXT NOT NULL,
  result_json TEXT, commit_request_json TEXT, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE (space_id, device_id, idempotency_key),
  FOREIGN KEY (space_id) REFERENCES sync_spaces(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);
INSERT INTO upload_sessions_v3 (id, space_id, device_id, snapshot_id, operation, idempotency_key, request_json,
  expected_chunks, expected_bytes, expected_digest, status, result_json, expires_at, created_at)
  SELECT id, space_id, device_id, snapshot_id, operation, idempotency_key, request_json,
    expected_chunks, expected_bytes, expected_digest, status, result_json, expires_at, created_at FROM upload_sessions;
DROP TABLE upload_sessions;
ALTER TABLE upload_sessions_v3 RENAME TO upload_sessions;
CREATE INDEX idx_upload_sessions_expiry ON upload_sessions(space_id, status, expires_at);
CREATE UNIQUE INDEX idx_upload_sessions_snapshot ON upload_sessions(snapshot_id);
CREATE INDEX idx_snapshots_device_history ON snapshots(space_id, device_id, role, committed_at DESC);
