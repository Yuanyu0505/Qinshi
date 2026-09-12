const ERRORS = {
  INVALID_REQUEST: { status: 400, message: 'Request is invalid.', retryable: false },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'Idempotency key was already used for a different request.', retryable: false },
  AUTH_FAILED: { status: 401, message: 'Authentication failed.', retryable: false },
  AUTH_COOLDOWN: { status: 429, message: 'Authentication is temporarily paused. Try again later.', retryable: true },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body is too large.', retryable: false },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Content-Type must be application/json.', retryable: false },
  UPGRADE_REQUIRED: { status: 426, message: 'Upgrade the app before continuing cloud sync.', retryable: false },
  ORIGIN_NOT_ALLOWED: { status: 403, message: 'Origin is not allowed.', retryable: false },
  NOT_FOUND: { status: 404, message: 'Route not found.', retryable: false },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method is not allowed.', retryable: false },
  FREE_QUOTA_EXHAUSTED: { status: 503, message: 'Cloud sync is paused because free storage or quota is exhausted.', retryable: true },
  INTERNAL_ERROR: { status: 500, message: 'An internal error occurred.', retryable: false }
};

export class SyncError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(ERRORS, code) ? code : 'INTERNAL_ERROR';
    super(ERRORS[safeCode].message);
    this.name = 'SyncError';
    this.code = safeCode;
  }
}

function isQuotaExhaustion(error) {
  const seen = new Set();
  // D1 can wrap its storage failure in Error.cause. Never log this text.
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current);
    const message = typeof current.message === 'string' ? current.message : '';
    if (/SQLITE_FULL|database or disk is full|exceeded maximum DB size|exceeded D1's (?:maximum account storage limit|free tier daily row (?:read|write) limit)/i.test(message)) {
      return true;
    }
  }
  return false;
}

export function normalizeError(error) {
  const code = error instanceof SyncError && Object.hasOwn(ERRORS, error.code)
    ? error.code
    : isQuotaExhaustion(error) ? 'FREE_QUOTA_EXHAUSTED' : 'INTERNAL_ERROR';
  return { code, ...ERRORS[code] };
}

export function errorResponse(error) {
  const { status, code, message, retryable } = normalizeError(error);
  return Response.json({ error: { code, message, retryable } }, {
    status, headers: { 'Cache-Control': 'no-store' }
  });
}

export function logRequest({ requestId, route, status, code }) {
  // Callers supply a route template, never a raw URL, path, query or body.
  console.info(JSON.stringify({ requestId, route, status, code }));
}
