import { SyncError } from './errors.js';

export async function readJson(request, allowedKeys, maxBytes = 64 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new SyncError('INTERNAL_ERROR');
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(type)) {
    throw new SyncError('UNSUPPORTED_MEDIA_TYPE');
  }
  const length = request.headers.get('Content-Length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > maxBytes) {
    throw new SyncError('PAYLOAD_TOO_LARGE');
  }
  // The actual stream, not Content-Length, is authoritative. Never buffer an unbounded body.
  const reader = request.body?.getReader();
  if (!reader) throw new SyncError('INVALID_REQUEST');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new SyncError('PAYLOAD_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new SyncError('INVALID_REQUEST');
  }
  const fields = new Set(allowedKeys);
  if (!body || Array.isArray(body) || typeof body !== 'object'
    || Object.keys(body).some(key => !fields.has(key))) throw new SyncError('INVALID_REQUEST');
  return body;
}

function versionParts(version) {
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function requireVersion(request, env, operation) {
  if (operation !== 'read' && operation !== 'write') throw new SyncError('INTERNAL_ERROR');
  const minimum = versionParts(operation === 'read' ? env.MINIMUM_READ_VERSION : env.MINIMUM_WRITE_VERSION);
  if (!minimum) throw new SyncError('INTERNAL_ERROR');
  const client = versionParts(request.headers.get('X-Qin-App-Version'));
  if (!client) throw new SyncError('UPGRADE_REQUIRED');
  for (let index = 0; index < 3; index += 1) {
    if (client[index] > minimum[index]) return;
    if (client[index] < minimum[index]) throw new SyncError('UPGRADE_REQUIRED');
  }
}
