import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUN3W76B4XEJE — the consortium page's "Aday Bul" (`findCandidates`) on an
 * expired pilot. The M8 twin was İNCELEME-30 B-1 (TASK-MUN39FIAKFY2R).
 *
 * `findCandidates` was marked `readOnly`, but the scorer it calls ends with
 * `seatCandidate.deleteMany` + `create`. The flag only tells
 * `requireTenantAction` to skip the pilot check; nothing about it stops a write.
 * So an expired pilot's seat candidates were deleted and rewritten.
 *
 * NG-100 / K-579560=A: the button now runs the M8 matcher (`generateSeatCandidates`,
 * src/modules/m8/server/matching.ts), which clears the seat's rows and writes new
 * ones the same way; the retired consortium scorer is no longer called. The
 * pilot rule and these assertions are unchanged.
 *
 * Here nothing about the pilot is mocked: `requireTenantAction` and
 * `assertTenantWritable` are the real ones and read the test tenant's real
 * `Subscription` row over `fabrika_app` (NOBYPASSRLS, asserted). Only the
 * session and `revalidatePath` are replaced. The running-pilot case proves the
 * same call does rewrite the rows, so an unchanged snapshot in the expired case
 * is the gate and not a path that never reached the database.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'consortium-find-candidates-pilot.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `cfp-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  session: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/auth', () => ({ auth: async () => state.session }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

const { createDbClient } = await import('@/lib/db');
const { PilotExpiredError } = await import('@/lib/billing/pilot');
const { PILOT_EXPIRED_DIGEST } = await import('@/lib/pilot-expired');
const { findCandidates } = await import('@/app/[locale]/(app)/[workspace]/pipeline/[id]/consortium/actions');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let userId = '';
let seatId = '';

/** The test tenant's seat candidates, every column, in a stable order. */
async function candidates(): Promise<string> {
  const rows = await admin!.seatCandidate.findMany({
    where: { tenantId: requireId(tenantId, 'tenantId') },
    orderBy: { id: 'asc' },
  });
  return JSON.stringify(rows);
}

async function setTrialEnd(offsetMs: number) {
  await admin!.subscription.update({
    where: { tenantId: requireId(tenantId, 'tenantId') },
    data: { trialEndsAt: new Date(Date.now() + offsetMs) },
  });
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);

  tenantId = (
    await admin.tenant.create({
      data: { name: `${RUN} Belediye`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    })
  ).id;
  userId = (await admin.user.create({ data: { email: `${RUN}@example.invalid`, name: 'Owner' } })).id;
  state.session = { user: { id: userId }, tenantId, role: 'TENANT_OWNER' };
  const ws = await admin.workspace.create({ data: { tenantId, name: RUN, slug: RUN } });
  const opp = await admin.opportunity.create({ data: { tenantId, workspaceId: ws.id, title: `${RUN} opp` } });
  // The pilot row as `grantPilot` writes it; `trialEndsAt` is moved per test.
  await admin.subscription.create({
    data: {
      tenantId,
      planId: 'public-team',
      status: 'TRIALING',
      provider: 'pilot',
      trialEndsAt: new Date(Date.now() - 60_000),
    },
  });
  seatId = (await admin.consortiumSeat.create({ data: { tenantId, opportunityId: opp.id, roleKey: 'research' } })).id;
  for (const rank of [1, 2]) {
    await admin.seatCandidate.create({
      data: { tenantId, seatId, organizationId: `${RUN}-org-${rank}`, score: 3 - rank, breakdown: {}, rank },
    });
  }
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenantId) {
    // SeatCandidate and Subscription have no FK to Tenant; the rest cascades.
    const t = requireId(tenantId, 'tenantId');
    await admin.seatCandidate.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await admin.subscription.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await admin.auditEvent.deleteMany({ where: { tenantId: t } }).catch(() => {});
    await admin.tenant.delete({ where: { id: t } }).catch(() => {});
    await admin.user.deleteMany({ where: { email: `${RUN}@example.invalid` } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('consortium findCandidates on a pilot tenant', () => {
  test('expired pilot: refused with the PILOT_EXPIRED digest and the seat candidates are unchanged', async () => {
    await setTrialEnd(-60_000);
    const before = await candidates();
    expect(JSON.parse(before)).toHaveLength(2);

    const err = await findCandidates(seatId).then(
      (value) => ({ resolved: value }),
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(PilotExpiredError);
    expect((err as { digest?: string }).digest).toBe(PILOT_EXPIRED_DIGEST);
    expect(await candidates()).toBe(before);
  });

  test('running pilot: the same call deletes and rewrites the seat candidates', async () => {
    await setTrialEnd(10 * 24 * 3600_000);
    const before = await candidates();

    await expect(findCandidates(seatId)).resolves.toBeInstanceOf(Array);

    // The rewrite starts with a delete, so none of the seeded rows survive.
    expect(await candidates()).not.toBe(before);
    expect(
      await admin!.seatCandidate.count({
        where: { tenantId: requireId(tenantId, 'tenantId'), organizationId: { startsWith: RUN } },
      })
    ).toBe(0);
  });
});
