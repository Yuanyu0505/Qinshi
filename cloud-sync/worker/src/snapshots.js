import { authenticateDevice, hashAuthValue } from './auth.js';
import { SyncError } from './errors.js';
import { base64url, requireBlob, requireId, requireObject } from './spaces.js';
import { requireIdempotencyKey } from './idempotency.js';
import { readJson, requireVersion } from './validation.js';

const MAX_CHUNK_BYTES = 512 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_SPACE_BYTES = 100 * 1024 * 1024;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const FIELDS = ['operation', 'snapshotId', 'sourceSnapshotId', 'appVersion', 'formatVersion', 'schemaVersion', 'encoding',
  'clientCreatedAt', 'dataHash', 'iv', 'ciphertextBytes', 'chunkCount', 'ciphertextDigest', 'encryptedSummary'];
const OPERATIONS = ['upload', 'replace-before', 'replace-after', 'restore-before', 'restore-after'];

function canonical(value) {
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function digest(bytes) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// All mutations recheck revocation inside their D1 transaction. The impossible
// NULL token branch aborts even if the authenticated device/space disappeared.
export function deviceGuard(db, context, now = Date.now()) {
  return db.prepare(`INSERT INTO devices (id, space_id, token_digest, encrypted_name_json, last_used_at, created_at)
    VALUES (?, ?, (SELECT token_digest FROM devices WHERE id = ? AND space_id = ? AND token_digest = ? AND revoked_at IS NULL), '{}', ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_used_at = excluded.last_used_at`)
    .bind(context.deviceId, context.spaceId, context.deviceId, context.spaceId, context.credentialDigest, now, now);
}

export async function snapshotBatch(db, statements) {
  try { return await db.batch(statements); }
  catch (error) {
    for (let current = error, seen = new Set(); current && !seen.has(current); current = current.cause) {
      seen.add(current);
      const message = current.message || '';
      if (/NOT NULL constraint failed: devices.token_digest/.test(message)) throw new SyncError('AUTH_FAILED');
      if (/NOT NULL constraint failed: devices.encrypted_name_json/.test(message)) throw new SyncError('INVALID_REQUEST');
      if (/NOT NULL constraint failed: snapshots.ciphertext_bytes/.test(message)) throw new SyncError('FREE_QUOTA_EXHAUSTED');
      if (/NOT NULL constraint failed: snapshots.data_hash/.test(message)) throw new SyncError('NOT_FOUND');
      if (/NOT NULL constraint failed: (upload_sessions.status|snapshot_chunks.body|snapshot_chunks.chunk_digest)/.test(message)) throw new SyncError('IDEMPOTENCY_CONFLICT');
      if (/UNIQUE constraint failed: (upload_sessions|snapshots)\./.test(message)) throw new SyncError('IDEMPOTENCY_CONFLICT');
    }
    throw error;
  }
}

export async function snapshotContext(request, env, operation) {
  requireVersion(request, env, operation);
  const context = await authenticateDevice(request, env);
  // Keep this proof internal: it never enters any response or log. Matching the
  // exact authenticated token also prevents delete/recreate identifier ABA races.
  context.credentialDigest = await hashAuthValue(request.headers.get('Authorization').split('.')[1]);
  requireVersion(request, { MINIMUM_READ_VERSION: context.minimumReadVersion, MINIMUM_WRITE_VERSION: context.minimumWriteVersion }, operation);
  const now = Date.now();
  // Only a later authenticated request performs cleanup; scope and work are bounded.
  // Delete ciphertext before its session, now that receipt retention is independent.
  await snapshotBatch(env.DB, [deviceGuard(env.DB, context, now),
    env.DB.prepare(`DELETE FROM snapshots WHERE role = 'staged' AND space_id = ? AND id IN
      (SELECT snapshot_id FROM upload_sessions WHERE space_id = ? AND status = 'staged' AND expires_at <= ? ORDER BY expires_at, id LIMIT 100)`)
      .bind(context.spaceId, context.spaceId, now),
    env.DB.prepare(`DELETE FROM upload_sessions WHERE id IN
      (SELECT id FROM upload_sessions WHERE space_id = ? AND status = 'staged' AND expires_at <= ? ORDER BY expires_at, id LIMIT 100)`)
      .bind(context.spaceId, now)
  ]);
  return context;
}

export function snapshotMetadata(row) {
  return { snapshotId: row.id, sourceSnapshotId: row.source_snapshot_id, appVersion: row.app_version,
    formatVersion: row.format_version, schemaVersion: row.schema_version, encoding: row.encoding,
    clientCreatedAt: row.client_created_at, dataHash: row.data_hash, iv: row.iv,
    ciphertextBytes: row.ciphertext_bytes, chunkCount: row.chunk_count, ciphertextDigest: row.ciphertext_digest,
    encryptedSummary: JSON.parse(row.encrypted_summary_json), serverCreatedAt: row.server_created_at, deviceId: row.device_id };
}

function validateUpload(body, request) {
  requireObject(body, FIELDS);
  requireId(body.snapshotId);
  if (body.sourceSnapshotId !== null) requireId(body.sourceSnapshotId);
  if (!OPERATIONS.includes(body.operation) || body.appVersion !== request.headers.get('X-Qin-App-Version')
    || body.formatVersion !== 1 || body.schemaVersion !== 1 || !['identity', 'gzip'].includes(body.encoding)) throw new SyncError('INVALID_REQUEST');
  const isAfter = body.operation.endsWith('-after');
  if (isAfter !== (body.sourceSnapshotId !== null) || body.sourceSnapshotId === body.snapshotId) throw new SyncError('INVALID_REQUEST');
  const time = typeof body.clientCreatedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.clientCreatedAt)
    ? Date.parse(body.clientCreatedAt) : NaN;
  if (!Number.isFinite(time) || new Date(time).toISOString() !== body.clientCreatedAt.replace(/(?<=:\d{2})Z$/, '.000Z')) throw new SyncError('INVALID_REQUEST');
  base64url(body.dataHash, 32); base64url(body.iv, 12); base64url(body.ciphertextDigest, 32); requireBlob(body.encryptedSummary, false);
  if (!Number.isSafeInteger(body.ciphertextBytes) || body.ciphertextBytes < 16) throw new SyncError('INVALID_REQUEST');
  if (body.ciphertextBytes > MAX_SNAPSHOT_BYTES) throw new SyncError('PAYLOAD_TOO_LARGE');
  if (!Number.isSafeInteger(body.chunkCount) || body.chunkCount !== Math.ceil(body.ciphertextBytes / MAX_CHUNK_BYTES)) throw new SyncError('INVALID_REQUEST');
}

async function sessionFor(db, context, id) {
  const session = await db.prepare('SELECT * FROM upload_sessions WHERE id = ? AND space_id = ? AND device_id = ?')
    .bind(id, context.spaceId, context.deviceId).first();
  if (!session || (session.status !== 'committed' && session.expires_at <= Date.now())) throw new SyncError('NOT_FOUND');
  return session;
}

async function sessionResponse(db, session) {
  const { results } = await db.prepare('SELECT chunk_index FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY chunk_index').bind(session.snapshot_id).all();
  return Response.json({ uploadId: session.id, snapshotId: session.snapshot_id, expiresAt: session.expires_at,
    uploadedChunks: results.map(row => row.chunk_index) }, { status: 201 });
}

async function createUpload(request, env) {
  const body = await readJson(request, FIELDS);
  const context = await snapshotContext(request, env, 'write');
  const key = requireIdempotencyKey(request);
  // Receipts outlive ciphertext deletion: retain a canonical request fingerprint,
  // never the encrypted summary itself. The source ID is the only commit input
  // not already represented by the session's dedicated columns.
  const requestJson = canonical({ requestDigest: await digest(new TextEncoder().encode(canonical(body))), sourceSnapshotId: body.sourceSnapshotId });
  const findReplay = () => env.DB.prepare('SELECT * FROM upload_sessions WHERE space_id = ? AND device_id = ? AND idempotency_key = ?')
    .bind(context.spaceId, context.deviceId, key).first();
  const replay = async saved => {
    if (saved.request_json !== requestJson) throw new SyncError('IDEMPOTENCY_CONFLICT');
    return sessionResponse(env.DB, saved);
  };
  let saved = await findReplay();
  if (saved && saved.status !== 'committed' && saved.expires_at <= Date.now()) {
    // The requested expired row may lie beyond this request's generic 100-row
    // cleanup window. Remove that exact staged pair too before retry admission.
    await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
      env.DB.prepare(`DELETE FROM snapshots WHERE id = ? AND space_id = ? AND device_id = ? AND role = 'staged'
        AND EXISTS (SELECT 1 FROM upload_sessions WHERE id = ? AND status = 'staged' AND expires_at <= ?)`)
        .bind(saved.snapshot_id, context.spaceId, context.deviceId, saved.id, Date.now()),
      env.DB.prepare("DELETE FROM upload_sessions WHERE id = ? AND space_id = ? AND device_id = ? AND status = 'staged' AND expires_at <= ?")
        .bind(saved.id, context.spaceId, context.deviceId, Date.now())
    ]);
    saved = await findReplay();
  }
  if (saved) return replay(saved);
  validateUpload(body, request);
  const now = Date.now();
  const session = { id: crypto.randomUUID(), snapshot_id: body.snapshotId, expires_at: now + UPLOAD_TTL_MS };
  try {
    await snapshotBatch(env.DB, [deviceGuard(env.DB, context, now),
      env.DB.prepare(`INSERT INTO snapshots (id, space_id, device_id, source_snapshot_id, role, app_version, format_version,
        schema_version, encoding, client_created_at, data_hash, iv, ciphertext_bytes, chunk_count, ciphertext_digest,
        encrypted_summary_json, server_created_at) VALUES (?, ?, ?, ?, 'staged', ?, ?, ?, ?, ?,
        CASE WHEN ? IS NULL OR EXISTS (SELECT 1 FROM snapshots WHERE id = ? AND space_id = ? AND role <> 'staged') THEN ? ELSE NULL END, ?,
        CASE WHEN (SELECT COALESCE(SUM(ciphertext_bytes), 0) FROM snapshots WHERE space_id = ?) + ? <= ? THEN ? ELSE NULL END, ?, ?, ?, ?)`)
        .bind(body.snapshotId, context.spaceId, context.deviceId, body.sourceSnapshotId, body.appVersion, body.formatVersion,
          body.schemaVersion, body.encoding, body.clientCreatedAt, body.sourceSnapshotId, body.sourceSnapshotId, context.spaceId,
          body.dataHash, body.iv, context.spaceId, body.ciphertextBytes, MAX_SPACE_BYTES, body.ciphertextBytes,
          body.chunkCount, body.ciphertextDigest, JSON.stringify(body.encryptedSummary), now),
      env.DB.prepare(`INSERT INTO upload_sessions (id, space_id, device_id, snapshot_id, operation, idempotency_key, request_json,
        expected_chunks, expected_bytes, expected_digest, status, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)`)
        .bind(session.id, context.spaceId, context.deviceId, body.snapshotId, body.operation, key, requestJson,
          body.chunkCount, body.ciphertextBytes, body.ciphertextDigest, session.expires_at, now)
    ]);
  } catch (error) {
    const winner = await findReplay();
    if (winner) return replay(winner);
    throw error;
  }
  return sessionResponse(env.DB, session);
}

function chunkIndex(value) {
  if (!/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new SyncError('INVALID_REQUEST');
  return Number(value);
}

async function readChunk(request) {
  if (request.headers.get('Content-Type')?.trim().toLowerCase() !== 'application/octet-stream') throw new SyncError('UNSUPPORTED_MEDIA_TYPE');
  if (Number(request.headers.get('Content-Length')) > MAX_CHUNK_BYTES) throw new SyncError('PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new SyncError('INVALID_REQUEST');
  const parts = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CHUNK_BYTES) { await reader.cancel(); throw new SyncError('PAYLOAD_TOO_LARGE'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

async function putChunk(request, env, uploadId, indexText) {
  const context = await snapshotContext(request, env, 'write');
  requireId(uploadId);
  const index = chunkIndex(indexText);
  const session = await sessionFor(env.DB, context, uploadId);
  if (session.status !== 'staged') throw new SyncError('IDEMPOTENCY_CONFLICT');
  if (index >= session.expected_chunks) throw new SyncError('INVALID_REQUEST');
  const bytes = await readChunk(request);
  const expectedSize = index < session.expected_chunks - 1 ? MAX_CHUNK_BYTES : session.expected_bytes - index * MAX_CHUNK_BYTES;
  if (bytes.length !== expectedSize) throw new SyncError('INVALID_REQUEST');
  const hash = request.headers.get('X-Chunk-SHA256');
  base64url(hash, 32);
  if (hash !== await digest(bytes)) throw new SyncError('INVALID_REQUEST');
  await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
    env.DB.prepare(`INSERT INTO snapshot_chunks (snapshot_id, chunk_index, body, chunk_digest) VALUES (?, ?,
      CASE WHEN EXISTS (SELECT 1 FROM upload_sessions u JOIN snapshots s ON s.id = u.snapshot_id
        WHERE u.id = ? AND u.space_id = ? AND u.device_id = ? AND u.status = 'staged' AND u.expires_at > ? AND s.role = 'staged')
      THEN ? ELSE NULL END, ?) ON CONFLICT(snapshot_id, chunk_index) DO UPDATE SET
      chunk_digest = CASE WHEN snapshot_chunks.chunk_digest = excluded.chunk_digest AND snapshot_chunks.body = excluded.body
        THEN snapshot_chunks.chunk_digest ELSE NULL END`)
      .bind(session.snapshot_id, index, uploadId, context.spaceId, context.deviceId, Date.now(), bytes, hash)
  ]);
  return Response.json({ chunkIndex: index });
}

async function verifyComplete(db, session) {
  if (session.status !== 'staged') throw new SyncError('INVALID_REQUEST');
  const { results } = await db.prepare('SELECT chunk_index, body FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY chunk_index').bind(session.snapshot_id).all();
  if (results.length !== session.expected_chunks) throw new SyncError('INVALID_REQUEST');
  const bytes = new Uint8Array(session.expected_bytes);
  let offset = 0;
  for (let index = 0; index < results.length; index += 1) {
    const chunk = new Uint8Array(results[index].body);
    if (results[index].chunk_index !== index || offset + chunk.length > bytes.length) throw new SyncError('INVALID_REQUEST');
    bytes.set(chunk, offset); offset += chunk.length;
  }
  if (offset !== bytes.length || await digest(bytes) !== session.expected_digest) throw new SyncError('INVALID_REQUEST');
}

function claimSession(db, session, context, commitJson, now) {
  // UPSERT's NOT NULL admission fails on a missing/consumed/expired session, rather
  // than allowing a zero-row UPDATE to silently commit later statements.
  return db.prepare(`INSERT INTO upload_sessions (id, space_id, device_id, snapshot_id, operation, idempotency_key, request_json,
    expected_chunks, expected_bytes, expected_digest, status, commit_request_json, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN EXISTS
      (SELECT 1 FROM upload_sessions u JOIN snapshots s ON s.id = u.snapshot_id WHERE u.id = ? AND u.space_id = ?
        AND u.device_id = ? AND u.status = 'staged' AND u.expires_at > ? AND s.role = 'staged'
        AND (s.source_snapshot_id IS NULL OR EXISTS (SELECT 1 FROM snapshots source WHERE source.id = s.source_snapshot_id AND source.space_id = s.space_id AND source.role <> 'staged')))
      THEN 'committing' ELSE NULL END, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = excluded.status, commit_request_json = excluded.commit_request_json`)
    .bind(session.id, context.spaceId, context.deviceId, session.snapshot_id, session.operation, session.idempotency_key, session.request_json,
      session.expected_chunks, session.expected_bytes, session.expected_digest, session.id, context.spaceId, context.deviceId, now,
      commitJson, session.expires_at, session.created_at);
}

async function commitUpload(request, env, uploadId) {
  const body = await readJson(request, ['beforeUploadId', 'sourceSnapshotId']);
  const context = await snapshotContext(request, env, 'write');
  requireId(uploadId);
  const session = await sessionFor(env.DB, context, uploadId);
  if (session.operation.endsWith('-before')) throw new SyncError('INVALID_REQUEST');
  const creation = JSON.parse(session.request_json);
  const normalized = { beforeUploadId: body.beforeUploadId ?? null,
    sourceSnapshotId: Object.hasOwn(body, 'sourceSnapshotId') ? body.sourceSnapshotId : creation.sourceSnapshotId };
  const commitJson = canonical(normalized);
  const replay = saved => {
    if (saved.commit_request_json !== commitJson) throw new SyncError('IDEMPOTENCY_CONFLICT');
    return Response.json(JSON.parse(saved.result_json));
  };
  if (session.status === 'committed') return replay(session);
  const isAfter = session.operation.endsWith('-after');
  if (normalized.sourceSnapshotId !== creation.sourceSnapshotId
    || isAfter !== (normalized.beforeUploadId !== null)) throw new SyncError('INVALID_REQUEST');
  let before;
  if (isAfter) {
    requireId(normalized.beforeUploadId);
    const found = await env.DB.prepare('SELECT * FROM upload_sessions WHERE id = ? AND space_id = ? AND device_id = ?')
      .bind(normalized.beforeUploadId, context.spaceId, context.deviceId).first();
    if (!found || found.operation !== session.operation.replace('-after', '-before') || found.status !== 'staged' || found.expires_at <= Date.now()) throw new SyncError('INVALID_REQUEST');
    before = found;
    await verifyComplete(env.DB, before);
  }
  await verifyComplete(env.DB, session);
  const now = Date.now();
  // Public server time is finalized only when staged data becomes immutable.
  // A per-device monotonic timestamp preserves before/old-latest ordering even
  // with equal wall times or uploads staged in a different order than commits.
  const promote = (id, role) => env.DB.prepare(`UPDATE snapshots SET role = ?, committed_at = MAX(?,
    (SELECT COALESCE(MAX(committed_at), 0) + 1 FROM snapshots WHERE space_id = ? AND device_id = ?)),
    server_created_at = MAX(?, (SELECT COALESCE(MAX(committed_at), 0) + 1 FROM snapshots WHERE space_id = ? AND device_id = ?))
    WHERE id = ? AND space_id = ? AND device_id = ? AND role = 'staged'`)
    .bind(role, now, context.spaceId, context.deviceId, now, context.spaceId, context.deviceId, id, context.spaceId, context.deviceId);
  try {
    const result = await snapshotBatch(env.DB, [deviceGuard(env.DB, context, now),
      claimSession(env.DB, session, context, commitJson, now),
      ...(before ? [claimSession(env.DB, before, context, commitJson, now)] : []),
      env.DB.prepare("UPDATE snapshots SET role = 'history' WHERE space_id = ? AND device_id = ? AND role = 'latest'").bind(context.spaceId, context.deviceId),
      ...(before ? [promote(before.snapshot_id, 'history')] : []),
      promote(session.snapshot_id, 'latest'),
      env.DB.prepare(`DELETE FROM snapshots WHERE id IN (SELECT id FROM snapshots WHERE space_id = ? AND device_id = ?
        AND role = 'history' ORDER BY committed_at DESC, id DESC LIMIT -1 OFFSET 3)`).bind(context.spaceId, context.deviceId),
      env.DB.prepare(`UPDATE upload_sessions SET status = 'committed', result_json = json_object('operationId', id,
        'latestSnapshotId', snapshot_id, 'historySnapshotIds', json((SELECT json_group_array(id) FROM
          (SELECT id FROM snapshots WHERE space_id = ? AND device_id = ? AND role = 'history' ORDER BY committed_at DESC, id DESC))),
        'serverCommittedAt', ?) WHERE id = ?`).bind(context.spaceId, context.deviceId, now, session.id),
      ...(before ? [env.DB.prepare("UPDATE upload_sessions SET status = 'committed', result_json = (SELECT result_json FROM upload_sessions WHERE id = ?) WHERE id = ?")
        .bind(session.id, before.id)] : []),
      env.DB.prepare('UPDATE devices SET last_uploaded_at = ? WHERE id = ? AND space_id = ?').bind(now, context.deviceId, context.spaceId),
      env.DB.prepare('SELECT result_json FROM upload_sessions WHERE id = ?').bind(session.id)
    ]);
    return Response.json(JSON.parse(result.at(-1).results[0].result_json));
  } catch (error) {
    const winner = await sessionFor(env.DB, context, uploadId);
    if (winner.status === 'committed') return replay(winner);
    throw error;
  }
}

async function readSnapshot(request, env, snapshotId, indexText) {
  const context = await snapshotContext(request, env, 'read');
  requireId(snapshotId);
  if (indexText !== undefined) {
    const index = chunkIndex(indexText);
    const [, result] = await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
      env.DB.prepare(`SELECT c.body, c.chunk_digest FROM snapshot_chunks c JOIN snapshots s ON s.id = c.snapshot_id
        WHERE s.id = ? AND s.space_id = ? AND s.role <> 'staged' AND c.chunk_index = ?`).bind(snapshotId, context.spaceId, index)
    ]);
    const row = result.results[0];
    if (!row) throw new SyncError('NOT_FOUND');
    return new Response(new Uint8Array(row.body), { headers: { 'Content-Type': 'application/octet-stream', 'X-Chunk-SHA256': row.chunk_digest } });
  }
  const [, result] = await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
    env.DB.prepare("SELECT * FROM snapshots WHERE id = ? AND space_id = ? AND role <> 'staged'").bind(snapshotId, context.spaceId)
  ]);
  const row = result.results[0];
  if (!row) throw new SyncError('NOT_FOUND');
  return Response.json(snapshotMetadata(row));
}

export async function handleSnapshotRoute(request, env, operation, id, index) {
  const method = operation === 'chunk-put' ? 'PUT' : operation === 'read' ? 'GET' : 'POST';
  if (request.method !== method) throw new SyncError('METHOD_NOT_ALLOWED');
  if (operation === 'create') return createUpload(request, env);
  if (operation === 'chunk-put') return putChunk(request, env, id, index);
  if (operation === 'commit') return commitUpload(request, env, id);
  return readSnapshot(request, env, id, index);
}
