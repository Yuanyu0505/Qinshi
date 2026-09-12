-- Deliberately no foreign key: deletion/recovery response-loss retries outlive bindings.
CREATE TABLE lifecycle_idempotency (
  scope_hash TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  status INTEGER NOT NULL CHECK (status IN (200, 201, 204)),
  response_json TEXT,
  space_id TEXT NOT NULL,
  minimum_read_version TEXT NOT NULL,
  minimum_write_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope_hash, key_hash)
);
CREATE INDEX idx_lifecycle_idempotency_expiry ON lifecycle_idempotency(expires_at);
