import { env, exports } from 'cloudflare:workers';
import { afterEach, expect, it, vi } from 'vitest';

const productionOrigin = 'https://yuanyu0505.github.io';
afterEach(() => vi.restoreAllMocks());

it('returns version limits and the exact allowed production origin', async () => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
    headers: { Origin: 'https://yuanyu0505.github.io' }
  }));
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBe('https://yuanyu0505.github.io');
  expect(await response.json()).toEqual({ minimumReadVersion: '1.0.39', minimumWriteVersion: '1.0.39' });
});

it.each(Array.from({ length: 11 }, (_, index) => `http://localhost:${8000 + index}`))(
  'allows exactly the configured local origin %s', async (origin) => {
    const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
      headers: { Origin: origin }
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toContain('Origin');
  }
);

it.each([
  'https://foreign.example', 'null', 'http://localhost:7999', 'http://localhost:8011',
  'http://localhost:80000', 'https://localhost:8000', 'http://127.0.0.1:8000',
  'https://yuanyu0505.github.io.evil.example', 'https://yuanyu0505.github.io/', '*'
])('rejects foreign or malformed origin %s without CORS permission', async (origin) => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
    headers: { Origin: origin }
  }));
  expect(response.status).toBe(403);
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(await response.json()).toEqual({ error: {
    code: 'ORIGIN_NOT_ALLOWED', message: expect.any(String), retryable: false
  } });
});

it('serves non-browser health checks without adding CORS permission', async () => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health'));
  expect(response.status).toBe(200);
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
  expect(response.headers.get('content-type')).toContain('application/json');
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('uses deployed version limits without exposing other bindings', async () => {
  const { default: worker } = await import('../src/index.js');
  const response = await worker.fetch(new Request('https://worker.test/v1/health'), {
    ...env, MINIMUM_READ_VERSION: '2.0.0', MINIMUM_WRITE_VERSION: '3.0.0',
    PRIVATE_VALUE: 'private-test-fixture'
  }, {});
  expect(await response.json()).toEqual({ minimumReadVersion: '2.0.0', minimumWriteVersion: '3.0.0' });
});

it.each(['', '*', 'https://foreign.example', undefined])(
  'fails closed when the origin is not in the configured allowlist (%s)', async (allowed) => {
    const { default: worker } = await import('../src/index.js');
    const response = await worker.fetch(new Request('https://worker.test/v1/health', {
      headers: { Origin: productionOrigin }
    }), { ...env, ALLOWED_ORIGINS: allowed }, {});
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  }
);

it('does not let configuration expand the fixed origin security boundary', async () => {
  const { default: worker } = await import('../src/index.js');
  const response = await worker.fetch(new Request('https://worker.test/v1/health', {
    headers: { Origin: 'https://foreign.example' }
  }), { ...env, ALLOWED_ORIGINS: 'https://foreign.example' }, {});
  expect(response.status).toBe(403);
});

it('answers preflight with the sync protocol methods and headers', async () => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
    method: 'OPTIONS', headers: {
      Origin: productionOrigin,
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type,x-qin-app-version,idempotency-key,x-chunk-sha256'
    }
  }));
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');
  expect(response.headers.get('access-control-allow-origin')).toBe(productionOrigin);
  expect(response.headers.get('access-control-allow-methods').split(',').map(value => value.trim()))
    .toEqual(expect.arrayContaining(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']));
  expect(response.headers.get('access-control-allow-headers').toLowerCase().split(',').map(value => value.trim()))
    .toEqual(expect.arrayContaining(['authorization', 'content-type', 'x-qin-app-version', 'idempotency-key', 'x-chunk-sha256']));
  expect(response.headers.get('access-control-allow-credentials')).toBeNull();
});

it('rejects preflight from a disallowed origin', async () => {
  const response = await exports.default.fetch(new Request('https://worker.test/v1/health', {
    method: 'OPTIONS', headers: { Origin: 'https://foreign.example' }
  }));
  expect(response.status).toBe(403);
  expect(response.headers.get('access-control-allow-origin')).toBeNull();
});

it.each([
  ['https://worker.test/v1/missing', 'GET', 404, 'NOT_FOUND'],
  ['https://worker.test/v1/health', 'POST', 405, 'METHOD_NOT_ALLOWED']
])('returns stable JSON for unsupported route/method %s %s', async (url, method, status, code) => {
  const response = await exports.default.fetch(new Request(url, {
    method, headers: { Origin: productionOrigin }
  }));
  expect(response.status).toBe(status);
  expect(response.headers.get('access-control-allow-origin')).toBe(productionOrigin);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String), retryable: false } });
});

it('logs only generated request ID, route label, status and stable code', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const { default: worker } = await import('../src/index.js');
  await worker.fetch(new Request('https://worker.test/v1/private-test-fixture?token=private-test-fixture', {
    method: 'POST', headers: {
      Authorization: 'Device private-test-fixture', 'X-Request-ID': 'private-test-fixture',
      Origin: productionOrigin
    }, body: 'private-test-fixture'
  }), env, {});
  expect(log).toHaveBeenCalledTimes(1);
  const record = JSON.parse(log.mock.calls[0][0]);
  expect(record).toEqual({ requestId: expect.any(String), route: 'unmatched', status: 404, code: 'NOT_FOUND' });
  expect(record.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(log.mock.calls)).not.toContain('private-test-fixture');
});

it.each([
  "D1_ERROR: Your account has exceeded D1's free tier daily row read limit.",
  "D1_ERROR: Your account has exceeded D1's free tier daily row write limit.",
  "D1_ERROR: Your account has exceeded D1's maximum account storage limit",
  'D1_ERROR: Exceeded maximum DB size.',
  'D1_ERROR: database or disk is full: SQLITE_FULL'
])('maps quota/storage exhaustion to a retryable stable error: %s', async (message) => {
  const { errorResponse } = await import('../src/errors.js');
  const response = errorResponse(new Error(message));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: {
    code: 'FREE_QUOTA_EXHAUSTED', message: expect.any(String), retryable: true
  } });
});

it('recognizes nested D1 causes without exposing raw errors', async () => {
  const { errorResponse } = await import('../src/errors.js');
  const response = errorResponse(new Error('private-test-fixture', {
    cause: new Error('D1_ERROR: database or disk is full: SQLITE_FULL')
  }));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private-test-fixture');
});

it('hides unknown errors and does not mistake SQL bugs for quota exhaustion', async () => {
  const { errorResponse } = await import('../src/errors.js');
  const response = errorResponse(new Error('D1_ERROR: no such table: private-test-fixture'));
  expect(response.status).toBe(500);
  const body = await response.json();
  expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: expect.any(String), retryable: false } });
  expect(JSON.stringify(body)).not.toContain('private-test-fixture');
});

it('installs all six application tables through the initial migration', async () => {
  const { results } = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('sync_spaces','devices','snapshots','snapshot_chunks','upload_sessions','auth_throttles') ORDER BY name").all();
  expect(results.map(row => row.name)).toEqual([
    'auth_throttles', 'devices', 'snapshot_chunks', 'snapshots', 'sync_spaces', 'upload_sessions'
  ]);
});
