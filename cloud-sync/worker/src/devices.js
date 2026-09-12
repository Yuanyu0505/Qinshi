import { SyncError } from './errors.js';
import { readJson } from './validation.js';
import { requireBlob, requireId, requireObject } from './spaces.js';
import { deviceGuard, snapshotBatch, snapshotContext, snapshotMetadata } from './snapshots.js';

export async function handleDeviceRoute(request, env, deviceId) {
  const methods = deviceId ? ['PATCH', 'DELETE'] : ['GET'];
  if (!methods.includes(request.method)) throw new SyncError('METHOD_NOT_ALLOWED');
  const body = request.method === 'GET' ? null : await readJson(request, request.method === 'PATCH' ? ['encryptedName'] : ['deleteSnapshots']);
  const context = await snapshotContext(request, env, request.method === 'GET' ? 'read' : 'write');
  if (request.method === 'GET') {
    const [, devices, snapshots] = await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
      env.DB.prepare(`SELECT id, encrypted_name_json, revoked_at, last_used_at, last_uploaded_at, created_at FROM devices WHERE space_id = ?
        ORDER BY last_uploaded_at DESC, created_at DESC, id`).bind(context.spaceId),
      env.DB.prepare("SELECT * FROM snapshots WHERE space_id = ? AND role <> 'staged' ORDER BY committed_at DESC, id DESC").bind(context.spaceId)
    ]);
    return Response.json({ devices: devices.results.map(device => {
      const owned = snapshots.results.filter(snapshot => snapshot.device_id === device.id);
      return { deviceId: device.id, encryptedName: JSON.parse(device.encrypted_name_json), current: device.id === context.deviceId,
        revoked: device.revoked_at !== null, revokedAt: device.revoked_at, lastUsedAt: device.last_used_at,
        lastUploadedAt: device.last_uploaded_at, createdAt: device.created_at,
        latestSnapshot: owned.filter(snapshot => snapshot.role === 'latest').map(snapshotMetadata)[0] || null,
        historySnapshots: owned.filter(snapshot => snapshot.role === 'history').map(snapshotMetadata) };
    }) });
  }
  requireId(deviceId);
  const target = await env.DB.prepare('SELECT id FROM devices WHERE id = ? AND space_id = ?').bind(deviceId, context.spaceId).first();
  if (!target) throw new SyncError('NOT_FOUND');
  if (request.method === 'PATCH') {
    requireObject(body, ['encryptedName']); requireBlob(body.encryptedName, false);
    await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
      env.DB.prepare('UPDATE devices SET encrypted_name_json = ? WHERE id = ? AND space_id = ?').bind(JSON.stringify(body.encryptedName), deviceId, context.spaceId)
    ]);
    return Response.json({ deviceId, encryptedName: body.encryptedName });
  }
  requireObject(body, ['deleteSnapshots']);
  if (typeof body.deleteSnapshots !== 'boolean') throw new SyncError('INVALID_REQUEST');
  await snapshotBatch(env.DB, [deviceGuard(env.DB, context),
    env.DB.prepare(`UPDATE devices SET encrypted_name_json = CASE WHEN revoked_at IS NOT NULL OR EXISTS
      (SELECT 1 FROM devices other WHERE other.space_id = ? AND other.id <> ? AND other.revoked_at IS NULL)
      THEN encrypted_name_json ELSE NULL END, revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND space_id = ?`)
      .bind(context.spaceId, deviceId, Date.now(), deviceId, context.spaceId),
    // Staged uploads can never resume after revocation. Retention applies only to
    // immutable committed snapshots; completed receipts remain replay-safe.
    env.DB.prepare(`DELETE FROM snapshots WHERE space_id = ? AND device_id = ? AND (? = 1 OR role = 'staged')`)
      .bind(context.spaceId, deviceId, body.deleteSnapshots ? 1 : 0),
    env.DB.prepare("DELETE FROM upload_sessions WHERE space_id = ? AND device_id = ? AND status <> 'committed'").bind(context.spaceId, deviceId)
  ]);
  return new Response(null, { status: 204 });
}
