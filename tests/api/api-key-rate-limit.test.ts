/**
 * TASK-MUN80XIW5NPV1 (security scan TASK-MUN66T2HM4A4E O-4) — the per-key rate
 * limit in authenticateApiKey, with the database faked: what the route does
 * with the counter the UPDATE returns. The live suite
 * (api-key-rate-limit.live.test.ts) proves the UPDATE itself on Postgres.
 */
import crypto from 'crypto';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { API_KEY_RATE_LIMIT_PER_MINUTE } from '@/lib/api-rate-limit';

const KEY = 'fp_live_ratelimit_unit_0001';
const HASH = crypto.createHash('sha256').update(KEY).digest('hex');

const db = vi.hoisted(() => ({ queryRaw: vi.fn(), down: false }));

vi.mock('@/lib/system-scope', () => ({
  withSystemScope: async <T,>(_p: string, _c: string, cb: (tx: unknown) => Promise<T>) =>
    cb({ apiKey: { findUnique: async ({ where }: { where: { keyHash: string } }) => (where.keyHash === HASH ? { id: 'k1', tenantId: 't1', name: 'unit' } : null) } }),
}));
vi.mock('@/lib/db', () => ({
  withTenant: async <T,>(_t: string, cb: (tx: unknown) => Promise<T>) => {
    if (db.down) throw new Error('connection refused');
    return cb({ $queryRaw: db.queryRaw });
  },
}));

import { authenticateApiKey } from '@/lib/api-auth';

function call() {
  return authenticateApiKey(new Request('http://localhost/api/v1/calls', { headers: { 'x-api-key': KEY } }));
}

beforeEach(() => db.queryRaw.mockReset());

describe('authenticateApiKey rate limit', () => {
  test('the screen and the enforcement read the same number', () => {
    expect(API_KEY_RATE_LIMIT_PER_MINUTE).toBe(1000);
  });

  test('the request that reaches the limit still passes', async () => {
    db.queryRaw.mockResolvedValue([{ count: API_KEY_RATE_LIMIT_PER_MINUTE, windowStartedAt: new Date() }]);
    const res = await call();
    expect(res.authenticated).toBe(true);
    expect(db.queryRaw).toHaveBeenCalledTimes(1);
  });

  test('one over the limit is 429 with Retry-After inside the window', async () => {
    const windowStartedAt = new Date(Date.now() - 45_000);
    db.queryRaw.mockResolvedValue([{ count: API_KEY_RATE_LIMIT_PER_MINUTE + 1, windowStartedAt }]);
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(429);
    const retryAfter = Number(res.errorResponse.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(14);
    expect(retryAfter).toBeLessThanOrEqual(16);
    expect(await res.errorResponse.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });

  test('a counter that cannot be written fails closed', async () => {
    db.down = true;
    const res = await call();
    db.down = false;
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(500);
    expect(await res.errorResponse.json()).toMatchObject({ code: 'AUTH_INTERNAL_ERROR' });
  });

  test('a key deleted between lookup and count is refused', async () => {
    db.queryRaw.mockResolvedValue([]);
    const res = await call();
    expect(res.authenticated).toBe(false);
    if (res.authenticated) return;
    expect(res.errorResponse.status).toBe(401);
  });
});
