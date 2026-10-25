import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * FO-63 / PS-K5 (TASK-MVCH33UGSHK1) — the live partner demand signal in the M8
 * seat scorer, against the real tables over `fabrika_app` (NOBYPASSRLS, asserted).
 *
 * Organisation A has its own EXPERTISE_REQUEST on the topic, published five days
 * ago; B only has a withdrawn request and an offer, neither of which counts. So
 * the topic has one active request: topicDemand = 1/5, and
 *   A: 0.4 · 0.2 + 0.4 · 1 + 0.2 · 1 = 0.68     B: 0.4 · 0.2 = 0.08
 * Every other dimension is the same for both, so A ranks above B.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'consortium-live-demand.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `cld-${Date.now().toString(36)}`;
const TOPIC = `${RUN.toUpperCase()}-TOPIC-01`;
const CALL = `${RUN.toUpperCase()}-CALL`;
const ORG_A = `${RUN}-pic-a`;
const ORG_B = `${RUN}-pic-b`;
const DAY_MS = 24 * 3600_000;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient } = await import('@/lib/db');
const { scoreCandidatesForSeat } = await import('@/lib/scoring/consortium');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let seatId = '';
let opportunityId = '';
let topicId = '';

async function score(options: Parameters<typeof scoreCandidatesForSeat>[5]) {
  const rows = await scoreCandidatesForSeat(tenantId, seatId, opportunityId, topicId, 50, options);
  const a = rows.find((r) => r.organizationId === ORG_A);
  const b = rows.find((r) => r.organizationId === ORG_B);
  if (!a || !b) throw new Error(`fixture organisations missing from the ${rows.length} candidates`);
  return { a, b };
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

  await admin.programme.upsert({
    where: { id: 'HE' },
    update: {},
    create: { id: 'HE', name: 'Horizon Europe', sourceKey: 'he' },
  });
  const call = await admin.call.create({ data: { callIdentifier: CALL, title: `${RUN} call`, programmeId: 'HE' } });
  topicId = (
    await admin.topic.create({
      data: { identifier: TOPIC, callId: call.id, title: `${RUN} topic`, status: 'OPEN', deadlines: [], eligibility: {}, keywords: [] },
      select: { id: true },
    })
  ).id;

  // Far more projects than any seeded organisation, so both land in the candidate pool.
  for (const pic of [ORG_A, ORG_B]) {
    await admin.cordisOrganization.create({ data: { organisationId: pic, name: `${RUN} ${pic}`, country: 'DE' } });
    await admin.cordisPartnerProfile.create({
      data: { organisationId: pic, name: `${RUN} ${pic}`, country: 'DE', totalProjects: 1_000_000 },
    });
  }
  const announcement = (externalId: string, pic: string, type: 'EXPERTISE_REQUEST' | 'EXPERTISE_OFFER', extra = {}) =>
    admin!.partnerSearchAnnouncement.create({
      data: {
        externalId: `${RUN}-${externalId}`,
        topicIdentifier: TOPIC,
        type,
        organizationPic: pic,
        organizationName: `${RUN} ${pic}`,
        source: 'PORTAL_API',
        lastSeenAt: new Date(),
        publishedAt: new Date(Date.now() - 5 * DAY_MS - 3600_000),
        ...extra,
      },
    });
  await announcement('a-request', ORG_A, 'EXPERTISE_REQUEST');
  await announcement('b-withdrawn', ORG_B, 'EXPERTISE_REQUEST', { withdrawnAt: new Date() });
  await announcement('b-offer', ORG_B, 'EXPERTISE_OFFER');

  tenantId = (
    await admin.tenant.create({
      data: { name: `${RUN} Belediye`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    })
  ).id;
  const ws = await admin.workspace.create({ data: { tenantId, name: RUN, slug: RUN } });
  opportunityId = (
    await admin.opportunity.create({ data: { tenantId, workspaceId: ws.id, title: `${RUN} opp`, topicId } })
  ).id;
  seatId = (await admin.consortiumSeat.create({ data: { tenantId, opportunityId, roleKey: 'research' } })).id;
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin) {
    if (tenantId) {
      // SeatCandidate has no FK to Tenant; the rest cascades.
      const t = requireId(tenantId, 'tenantId');
      await admin.seatCandidate.deleteMany({ where: { tenantId: t } }).catch(() => {});
      await admin.tenant.delete({ where: { id: t } }).catch(() => {});
    }
    await admin.partnerSearchAnnouncement.deleteMany({ where: { topicIdentifier: TOPIC } }).catch(() => {});
    await admin.topic.deleteMany({ where: { identifier: TOPIC } }).catch(() => {});
    await admin.call.deleteMany({ where: { callIdentifier: CALL } }).catch(() => {});
    await admin.cordisOrganization.deleteMany({ where: { organisationId: { in: [ORG_A, ORG_B] } } }).catch(() => {});
  }
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('M8 seat scoring with live partner demand', () => {
  test('M8 on: the own fresh request lifts A above B and the reason line carries the day count', async () => {
    const { a, b } = await score({ liveDemandVisible: true });

    expect(a.score.liveDemandSignal).toBeCloseTo(0.68, 10);
    expect(b.score.liveDemandSignal).toBeCloseTo(0.08, 10);
    expect(a.score.liveDemandReason).toEqual({ days: 5 });
    expect(b.score.liveDemandReason).toBeNull();
    expect(a.rank).toBeLessThan(b.rank);
    // 15 % default weight on a 0–100 scale: the 0.6 signal gap is worth 9 points.
    expect(a.score.total - b.score.total).toBeCloseTo(9, 1);

    const persisted = await admin!.seatCandidate.findFirst({
      where: { tenantId: requireId(tenantId, 'tenantId'), seatId, organizationId: ORG_A },
    });
    expect(persisted?.breakdown).toMatchObject({ liveDemandReason: { days: 5 } });
  });

  test('M8 off: the signal is still computed but no reason line is returned or stored', async () => {
    const { a, b } = await score({ liveDemandVisible: false });

    expect(a.score.liveDemandSignal).toBeCloseTo(0.68, 10);
    expect(a.score.liveDemandReason).toBeNull();
    expect(b.score.liveDemandReason).toBeNull();
    expect(a.rank).toBeLessThan(b.rank);

    const persisted = await admin!.seatCandidate.findFirst({
      where: { tenantId: requireId(tenantId, 'tenantId'), seatId, organizationId: ORG_A },
    });
    expect(persisted?.breakdown).toMatchObject({ liveDemandReason: null });
  });

  test('weight 0: live demand no longer changes the total', async () => {
    const { a, b } = await score({ liveDemandVisible: true, liveDemandWeight: 0 });

    expect(a.score.liveDemandSignal).toBeCloseTo(0.68, 10);
    expect(a.score.total).toBe(b.score.total);
  });
});
