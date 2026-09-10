import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { envValue } from './helpers/dotenv';

/**
 * TASK-MTVTQTJIQ5SDB — MarketplaceListing: written tenant-owned, read by everyone.
 *
 * `prisma/schema.prisma` gives the model a NON-NULL `tenantId` and
 * `prisma/rls.sql:13` puts it under `tenant_isolation`, yet the marketplace page
 * read it with a bare `prisma.marketplaceListing.findMany({ orderBy })` — no
 * `withTenant`, and no `where` clause of any kind — while
 * `src/modules/marketplace/server/actions.ts:31` wrote it inside `withTenant`.
 *
 * The reason this file measures over BOTH database roles is that the single
 * defect fails in opposite directions depending on which one is connected, and
 * a fix for either arm alone looks complete when tested over the other:
 *
 *   fabrika      SUPERUSER + BYPASSRLS. What `DATABASE_URL` actually is
 *                (prisma/rls-app-role.sql:4). Policies are never evaluated, so
 *                the unscoped read returned EVERY tenant's listings. Here the
 *                `where: { tenantId }` is the thing under test; `withTenant`
 *                alone would change nothing.
 *   fabrika_app  NOBYPASSRLS. What a correctly configured deployment looks like
 *                (prisma/rls.sql:2) and what `pnpm rls:verify` measures with.
 *                With no scope open `current_setting('app.tenant_id')` is NULL,
 *                `"tenantId" = NULL` is NULL, and the read returns ZERO rows —
 *                so the page renders its hardcoded demo listings instead of the
 *                tenant's real ones. Here `withTenant` is the thing under test;
 *                the `where` clause alone would change nothing.
 *
 * `.live` because it needs the Postgres in docker-compose plus the app role; it
 * skips itself when either is missing rather than reddening the gate on a
 * machine with no database to measure.
 */

const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');

/** Privileged handle: writes fixtures and reads rows back past the policies. */
const admin: PrismaClient | undefined = ADMIN_URL ? createDbClient(ADMIN_URL) : undefined;

const dbReachable =
  RLS_URL !== undefined &&
  admin !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));

if (!dbReachable) {
  console.warn(
    'marketplace listing tenant-scope test skipped: needs Postgres and ' +
      'DATABASE_URL_RLS_TEST (`docker compose up -d` then `pnpm db:rls-role`).'
  );
}

/**
 * The connection the code under test runs over, swapped between the two roles
 * by the suites below. A `vi.hoisted` box because `vi.mock` is lifted above
 * every `const` in the file; the factory reads it lazily, per call.
 */
const box = vi.hoisted(() => ({ client: undefined as PrismaClient | undefined }));
const rls: PrismaClient | undefined = dbReachable ? createDbClient(RLS_URL!) : undefined;

const db = (): PrismaClient => admin!;

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    get prisma() {
      return box.client ?? actual.prisma;
    },
    withTenant: <T>(tenantId: string, cb: (tx: never) => Promise<T>): Promise<T> =>
      withTenantOn(box.client ?? actual.prisma, tenantId, cb as never),
  };
});

const { listTenantListings } = await import('@/modules/marketplace/server/listings');

/** Every row this file creates carries it, so cleanup can never over-reach. */
const RUN = `mtvtqt-${Date.now()}`;

interface Fixture {
  tenantId: string;
  listingId: string;
}

async function makeTenant(label: string): Promise<Fixture> {
  const tenant = await db().tenant.create({
    data: { name: `Tenant ${label} ${RUN}`, slug: `${RUN}-${label}`, country: 'TR', orgType: 'SME' },
  });
  const listing = await db().marketplaceListing.create({
    data: {
      tenantId: tenant.id,
      kind: 'consultancy',
      title: `${label.toUpperCase()}-OWNED LISTING ${RUN}`,
      description: `owned by tenant ${label}`,
      price: '€1',
      status: 'active',
    },
  });
  return { tenantId: tenant.id, listingId: listing.id };
}

describe.skipIf(!dbReachable)('MarketplaceListing reads are tenant-scoped', () => {
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    a = await makeTenant('a');
    b = await makeTenant('b');
  });

  afterAll(async () => {
    await db().marketplaceListing.deleteMany({
      where: { tenantId: { in: [a?.tenantId, b?.tenantId] } },
    });
    await db().tenant.deleteMany({ where: { id: { in: [a?.tenantId, b?.tenantId] } } });
    await rls?.$disconnect();
    await admin?.$disconnect();
  });

  /**
   * The role the application actually connects as today. RLS is inert here, so
   * nothing but the `where` clause stands between tenant A and tenant B's rows.
   */
  describe('over the BYPASSRLS role the app connects as (DATABASE_URL)', () => {
    beforeAll(() => {
      box.client = admin;
    });

    it('is a role the policies do NOT apply to — otherwise this suite proves nothing', async () => {
      const rows = await admin!.$queryRaw<Array<{ bypass: boolean }>>`
        SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`;
      expect(rows[0]?.bypass).toBe(true);
    });

    /** Red before the fix: the bare `findMany` had no `where` clause at all. */
    it("never returns another tenant's listing", async () => {
      const rows = await listTenantListings(a.tenantId);

      expect(rows.map((r) => r.id)).not.toContain(b.listingId);
      expect(rows.every((r) => r.tenantId === a.tenantId)).toBe(true);
    });

    /** The counterfactual: a reader that returned nothing would pass the above. */
    it('still returns the calling tenant its own listing', async () => {
      const rows = await listTenantListings(a.tenantId);

      expect(rows.map((r) => r.id)).toContain(a.listingId);
    });
  });

  /**
   * The role a correct deployment uses. Here the `where` clause is not enough:
   * without an open tenant scope the policy matches nothing and the tenant's
   * own listings vanish behind the page's hardcoded demo rows.
   */
  describe('over the RLS-subject role (DATABASE_URL_RLS_TEST)', () => {
    beforeAll(() => {
      box.client = rls;
    });

    it('measures over a role the policies actually apply to', async () => {
      const rows = await rls!.$queryRaw<Array<{ bypass: boolean }>>`
        SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`;
      expect(rows[0]?.bypass).toBe(false);
    });

    /** Red before the fix, in the positive direction: unwrapped, this was []. */
    it('returns the calling tenant its own listing rather than zero rows', async () => {
      const rows = await listTenantListings(a.tenantId);

      expect(rows.map((r) => r.id)).toContain(a.listingId);
    });

    it("never returns another tenant's listing", async () => {
      const rows = await listTenantListings(a.tenantId);

      expect(rows.map((r) => r.id)).not.toContain(b.listingId);
    });
  });
});
