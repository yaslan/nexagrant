import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { LOCK_POOL_MAX, LOCK_POOL_NAME, prisma, withTenant, withTenantLockPool } from '@/lib/db';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * TASK-MUO9IFMMVRUDJ (İNCELEME-92 B-1) — `withTenantLockPool` is a pool of its
 * own, capped at LOCK_POOL_MAX, and not the application pool.
 *
 * The evidence suites route it to a test client, so this is the one place the
 * real function is called: on the application pool a slow object store let
 * evidence confirms take every connection of the process.
 *
 * No table is read and nothing is written; the tenant id only has to be
 * non-empty for `set_config('app.tenant_id', …)`.
 */

const SUITE = 'lock-pool.live';
const TENANT = 'lock-pool-probe';
let ready = false;
let skipReason = '';

const whoAmI = `SELECT current_setting('application_name') AS app, pg_backend_pid() AS pid`;
type Who = { app: string; pid: number };

beforeAll(async () => {
  try {
    await withTenantLockPool(TENANT, (tx) => tx.$queryRawUnsafe(whoAmI));
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
  await prisma.$disconnect();
});

describe('withTenantLockPool', () => {
  test('runs on the lock pool, and withTenant does not', async () => {
    const [locked] = await withTenantLockPool(TENANT, (tx) => tx.$queryRawUnsafe<Who[]>(whoAmI));
    const [plain] = await withTenant(TENANT, (tx) => tx.$queryRawUnsafe<Who[]>(whoAmI));
    expect(locked?.app).toBe(LOCK_POOL_NAME);
    expect(plain?.app).not.toBe(LOCK_POOL_NAME);
  });

  test(`never holds more than ${LOCK_POOL_MAX} connections, however many transactions ask`, async () => {
    const asked = LOCK_POOL_MAX + 2;
    const seen = await Promise.all(
      Array.from({ length: asked }, () =>
        withTenantLockPool(TENANT, async (tx) => {
          const [who] = await tx.$queryRawUnsafe<Who[]>(`${whoAmI}, pg_sleep(0.4)::text AS z`);
          return who!.pid;
        })
      )
    );
    // All of them ran — the extra ones waited their turn — on at most LOCK_POOL_MAX connections.
    // Counted by backend pid, not in pg_stat_activity: other suites running at the
    // same time open connections under the same application_name.
    expect(seen).toHaveLength(asked);
    expect(new Set(seen).size).toBeLessThanOrEqual(LOCK_POOL_MAX);
  });
});
