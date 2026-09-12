import { errorResponse, logRequest, normalizeError, SyncError } from './errors.js';
import { handleSpaceRoute } from './spaces.js';
import { handleDeviceRoute } from './devices.js';
import { handleSnapshotRoute } from './snapshots.js';

const ALLOWED_LOCAL = /^http:\/\/localhost:(800[0-9]|8010)$/;

function allowedOrigin(origin, configuredOrigins) {
  const inSecurityBoundary = origin === 'https://yuanyu0505.github.io' || ALLOWED_LOCAL.test(origin || '');
  return inSecurityBoundary && typeof configuredOrigins === 'string'
    && configuredOrigins.split(',').map(value => value.trim()).includes(origin);
}

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    let route = 'unmatched';
    let origin = null;
    let code = 'OK';
    let allowedMethods = 'GET, OPTIONS';
    let response;
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/v1/health') route = '/v1/health';
      const spaceRoute = /^\/v1\/spaces\/([^/]+)\/(parameters|pair|recover)$/.exec(pathname);
      let spaceOperation;
      if (spaceRoute) {
        route = `/v1/spaces/:code/${spaceRoute[2]}`;
        spaceOperation = spaceRoute[2];
      } else if (pathname === '/v1/spaces') {
        route = pathname; spaceOperation = 'create';
      } else if (pathname === '/v1/spaces/current') {
        route = pathname; spaceOperation = 'delete';
      } else if (pathname === '/v1/security/password' || pathname === '/v1/security/recovery-key') {
        route = pathname; spaceOperation = pathname.split('/').at(-1);
      }
      if (spaceOperation) allowedMethods = `${spaceOperation === 'parameters' ? 'GET' : spaceOperation === 'delete' ? 'DELETE' : 'POST'}, OPTIONS`;
      const deviceRoute = /^\/v1\/devices(?:\/([^/]+))?$/.exec(pathname);
      const uploadRoute = /^\/v1\/uploads(?:\/([^/]+)\/(commit|chunks\/([^/]+)))?$/.exec(pathname);
      const snapshotRoute = /^\/v1\/snapshots\/([^/]+)(?:\/chunks\/([^/]+))?$/.exec(pathname);
      if (deviceRoute) {
        route = deviceRoute[1] ? '/v1/devices/:deviceId' : '/v1/devices';
        allowedMethods = deviceRoute[1] ? 'PATCH, DELETE, OPTIONS' : 'GET, OPTIONS';
      }
      if (uploadRoute) {
        route = !uploadRoute[1] ? '/v1/uploads' : uploadRoute[3] !== undefined ? '/v1/uploads/:uploadId/chunks/:index' : '/v1/uploads/:uploadId/commit';
        allowedMethods = uploadRoute[3] !== undefined ? 'PUT, OPTIONS' : 'POST, OPTIONS';
      }
      if (snapshotRoute) route = snapshotRoute[2] === undefined ? '/v1/snapshots/:snapshotId' : '/v1/snapshots/:snapshotId/chunks/:index';
      const requestedOrigin = request.headers.get('Origin');
      if (requestedOrigin !== null) {
        if (!allowedOrigin(requestedOrigin, env.ALLOWED_ORIGINS)) {
          throw new SyncError('ORIGIN_NOT_ALLOWED');
        }
        origin = requestedOrigin;
      }
      if (request.method === 'OPTIONS') {
        response = new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Qin-App-Version, Idempotency-Key, X-Chunk-SHA256'
        } });
      } else if (route === '/v1/health') {
        if (request.method !== 'GET') throw new SyncError('METHOD_NOT_ALLOWED');
        response = Response.json({
          minimumReadVersion: env.MINIMUM_READ_VERSION,
          minimumWriteVersion: env.MINIMUM_WRITE_VERSION
        });
      } else if (spaceOperation) {
        response = await handleSpaceRoute(request, env, spaceOperation, spaceRoute?.[1]);
      } else if (deviceRoute) {
        response = await handleDeviceRoute(request, env, deviceRoute[1]);
      } else if (uploadRoute) {
        response = await handleSnapshotRoute(request, env, !uploadRoute[1] ? 'create' : uploadRoute[3] !== undefined ? 'chunk-put' : 'commit', uploadRoute[1], uploadRoute[3]);
      } else if (snapshotRoute) {
        response = await handleSnapshotRoute(request, env, 'read', snapshotRoute[1], snapshotRoute[2]);
      } else {
        throw new SyncError('NOT_FOUND');
      }
    } catch (error) {
      code = normalizeError(error).code;
      response = errorResponse(error);
    }
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Vary', 'Origin');
    if (origin !== null) response.headers.set('Access-Control-Allow-Origin', origin);
    if (response.status === 405) response.headers.set('Allow', allowedMethods);
    logRequest({ requestId, route, status: response.status, code });
    return response;
  }
};
