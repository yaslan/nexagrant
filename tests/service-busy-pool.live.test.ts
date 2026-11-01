import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MUOF85BU7BV3X (İNCELEME-103 G-1) — the real application pool, full.
 *
 * `requireTenantAction`'s pilot check is a query on the application pool
 * (10 connections, `connectionTimeoutMillis` 1 s). With every connection held,
 * the check used to reject with pg-pool's "timeout exceeded when trying to
 * connect", and so did the action. tests/service-busy-action.test.tsx pins the
 * mapping on a made-up error; this file pins it on the error the real driver
 * throws, so a pg or Prisma upgrade that changes its shape turns this red
 * instead of letting the driver's text reach the browser again.
 *
 * Nothing is read or written: the holders only sleep, and the tenant id only
 * has to be non-empty for `set_config('app.tenant_id', …)`.
 */

const SUITE = 'service-busy-pool.live';
const TENANT = 'service-busy-probe';
const APP_POOL_MAX = 10; // pg.Pool default; src/lib/db.ts sets no `max` for the application pool

vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'service-busy-user' }, tenantId: TENANT, role: 'TENANT_OWNER' }),
}));

// The gate raises the connect timeout to 10 s (DB_CONNECT_TIMEOUT_MS, FO-256); this file
// pins the production 1 s, or the waiters outlast the 2.5 s holders and never hit pg-pool's timeout.
process.env.DB_CONNECT_TIMEOUT_MS = '1000';
const db = await import('@/lib/db');
const { requireTenantAction, ServiceBusyError } = await import('@/lib/tenant');
const { SERVICE_BUSY_DIGEST } = await import('@/lib/service-busy');

let ready = false;
let skipReason = '';

beforeAll(async () => {
  try {
    await db.withTenant(TENANT, (tx) => tx.$queryRaw`SELECT 1`);
    ready = true;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
  }
});

beforeEach(({ skip }) => {
  if (!ready) skip(skipReason);
});

afterAll(async () => {
  await db.prisma.$disconnect();
});

describe('application pool full → SERVICE_BUSY', () => {
  test('every action waiting on a full pool rejects with SERVICE_BUSY and a fixed message; none with the driver text', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const holders = Array.from({ length: APP_POOL_MAX }, () =>
      db
        .withTenant(TENANT, (tx) => tx.$queryRaw`SELECT pg_sleep(2.5)::text`, { maxWait: 5_000, timeout: 10_000 })
        .then(() => 'held', (e: unknown) => `holder failed: ${e instanceof Error ? e.message : String(e)}`)
    );
    await new Promise((r) => setTimeout(r, 300));

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => requireTenantAction().then(() => 'passed', (e: unknown) => e))
    );
    // The holders ran to the end: the pool really was full, not broken.
    expect(await Promise.all(holders)).toEqual(Array(APP_POOL_MAX).fill('held'));

    for (const outcome of outcomes) {
      expect(outcome).toBeInstanceOf(ServiceBusyError);
      expect(outcome).toMatchObject({ digest: SERVICE_BUSY_DIGEST });
      expect((outcome as Error).message).not.toContain('timeout exceeded');
    }
    // The driver's text is logged on the server, once per refusal.
    const logged = errors.mock.calls.map((c) => c.map(String).join(' '));
    expect(logged.filter((l) => l.includes('timeout exceeded when trying to connect'))).toHaveLength(outcomes.length);
    errors.mockRestore();

    // Once the pool frees up the same check passes again.
    await expect(requireTenantAction()).resolves.toMatchObject({ tenantId: TENANT });
  }, 30_000);
});
