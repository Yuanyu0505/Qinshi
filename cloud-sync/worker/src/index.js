import { errorResponse, logRequest, normalizeError, SyncError } from './errors.js';

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
    let response;
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/v1/health') route = '/v1/health';
      const requestedOrigin = request.headers.get('Origin');
      if (requestedOrigin !== null) {
        if (!allowedOrigin(requestedOrigin, env.ALLOWED_ORIGINS)) {
          throw new SyncError('ORIGIN_NOT_ALLOWED');
        }
        origin = requestedOrigin;
      }
      if (request.method === 'OPTIONS') {
        response = new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Qin-App-Version, Idempotency-Key, X-Chunk-SHA256'
        } });
      } else if (route === '/v1/health') {
        if (request.method !== 'GET') throw new SyncError('METHOD_NOT_ALLOWED');
        response = Response.json({
          minimumReadVersion: env.MINIMUM_READ_VERSION,
          minimumWriteVersion: env.MINIMUM_WRITE_VERSION
        });
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
    if (response.status === 405) response.headers.set('Allow', 'GET, OPTIONS');
    logRequest({ requestId, route, status: response.status, code });
    return response;
  }
};
