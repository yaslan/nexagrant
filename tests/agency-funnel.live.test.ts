import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createDbClient, withTenantOn } from '@/lib/db';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { skipOrFailOnMissingDbObject } from './helpers/require-db-object';
import { readinessSettings } from '@/lib/readiness/account';

/** TASK-MULRR8P7HIII4 (B6): a valid scorecard result code. */
const READINESS_CODE = 'municipality.012120201012120';

/**
 * TASK-MULRQSJFB8RWJ (FB KAMU B2) — the agency funnel returns numbers only,
 * and only for the agency's own organisations. Measured on `fabrika_app`
 * (NOBYPASSRLS, asserted below): under `fabrika` (SUPERUSER) every isolation
 * claim here would hold by construction.
 *
 * `@/lib/db` is swapped, for this file only, for a copy whose `prisma` and
 * `withTenant` run over `fabrika_app`, so `getAgencyFunnel` and be-fb's
 * `countApplicationOutcomes` (B7) run exactly as in the app, on the RLS role.
 * `admin` (fabrika) only builds fixtures.
 *
 * `.live`: needs the docker-compose Postgres with add-agency-funnel.sql applied
 * (scripts/apply-migrations.sh) and `pnpm db:rls`. Locally a missing database or
 * migration skips the file; in CI it fails it (tests/helpers/live-db-role.ts).
 */

const SUITE = 'agency-funnel.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `b2-${Date.now().toString(36)}`;

vi.mock('@/lib/db', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/db')>();
  const { envValue: readEnv } = await import('./helpers/dotenv');
  const url = readEnv('DATABASE_URL_RLS_TEST');
  if (!url) return real;
  const client = real.createDbClient(url);
  return {
    ...real,
    prisma: client,
    withTenant: <T,>(tenantId: string, cb: Parameters<typeof real.withTenant<T>>[1]) =>
      real.withTenantOn(client, tenantId, cb),
  };
});

let rls: PrismaClient | undefined;
let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';

const tenants: string[] = [];
const ids = { agencyA: '', agencyB: '', orgB: '', orphan: '', template: '' };
/** Organisations linked to A: 6 SMEs with everything, 2 municipalities with nothing. */
const linkedA: string[] = [];
let seq = 0;

async function newTenant(
  kind: 'AGENCY' | 'ORGANIZATION',
  agencyId: string | null = null,
  orgType: 'SME' | 'MUNICIPALITY' = 'SME',
  province: string | null = null,
  /** FB KAMU B6: a stored scorecard result, as registration writes it. */
  readiness = false
): Promise<string> {
  const n = ++seq;
  const settings = readiness ? readinessSettings(READINESS_CODE) : undefined;
  const t = await admin!.tenant.create({
    data: { name: `${RUN} secret-name-${n}`, slug: `${RUN}-${n}`, country: 'TR', kind, agencyId, orgType, province, settings },
    select: { id: true },
  });
  tenants.push(t.id);
  return t.id;
}

/** Content an agency must never see: a saved search, an opportunity with a
 *  submitted proposal (funded when `funded`), and a concept note. */
async function giveContent(tenantId: string, proposals: number, funded = false): Promise<void> {
  await withTenantOn(admin!, tenantId, async (tx) => {
    const ws = await tx.workspace.create({ data: { tenantId, name: `${RUN} ws`, slug: 'default' } });
    await tx.savedSearch.create({
      data: { tenantId, userId: `${RUN}-u`, name: `${RUN} secret search`, filters: { q: 'secret' } },
    });
    for (let i = 0; i < proposals; i++) {
      const opp = await tx.opportunity.create({
        data: {
          tenantId,
          workspaceId: ws.id,
          title: `${RUN} secret opportunity ${i}`,
          status: funded ? 'FUNDED' : 'ACTIVE',
        },
      });
      await tx.proposal.create({ data: { tenantId, opportunityId: opp.id, submittedAt: new Date() } });
      if (i === 0) {
        await tx.conceptNote.create({
          data: {
            tenantId,
            opportunityId: opp.id,
            templateId: ids.template,
            content: { summary: 'secret concept' },
            createdBy: `${RUN}-u`,
          },
        });
      }
    }
  });
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(rls, SUITE);
  const fn = await admin.$queryRaw<Array<{ n: number }>>`
    SELECT count(*)::int AS n FROM pg_proc
     WHERE proname IN ('agency_funnel_counts', 'agency_funnel_counts_by_province')`;
  if (fn[0]?.n !== 2) {
    skipReason = 'add-agency-funnel.sql / add-agency-funnel-province.sql is not applied (scripts/apply-migrations.sh)';
    skipOrFailOnMissingDbObject(SUITE, skipReason);
    return;
  }

  const tpl = await admin.conceptTemplate.create({
    data: { key: `${RUN}-tpl`, name: `${RUN} tpl`, schema: {}, version: '1' },
  });
  ids.template = tpl.id;
  ids.agencyA = await newTenant('AGENCY');
  ids.agencyB = await newTenant('AGENCY');
  for (let i = 0; i < 6; i++) {
    // TASK-MULV3JXS1AW5X: all of A's organisations are in Samsun, so the
    // province view has a number to show (a no-province remainder of 1..4
    // would, correctly, mask it).
    // B6: every one of A's organisations added its scorecard result.
    const t = await newTenant('ORGANIZATION', ids.agencyA, 'SME', 'Samsun', true);
    linkedA.push(t);
    // 6 organisations submitted, 5 funded; the first one has 3 applications (TASK-MULZATEX4G92H
    // Ö-1: 8 applications, but 6 organisations).
    await giveContent(t, i === 0 ? 3 : 1, i < 5);
  }
  for (let i = 0; i < 2; i++) linkedA.push(await newTenant('ORGANIZATION', ids.agencyA, 'MUNICIPALITY', 'Samsun', true));
  // B's organisation is busy: 10 submitted proposals and a scorecard result. None may reach A.
  ids.orgB = await newTenant('ORGANIZATION', ids.agencyB, 'SME', null, true);
  await giveContent(ids.orgB, 10, true);
  ids.orphan = await newTenant('ORGANIZATION');
  await giveContent(ids.orphan, 3);
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  if (admin && tenants.length) {
    const where = { tenantId: { in: tenants } };
    await admin.conceptNote.deleteMany({ where }).catch(() => {});
    await admin.savedSearch.deleteMany({ where }).catch(() => {});
    await admin.auditEvent.deleteMany({ where }).catch(() => {});
    await admin.tenant.deleteMany({ where: { id: { in: tenants } } }).catch(() => {});
  }
  if (admin && ids.template) await admin.conceptTemplate.delete({ where: { id: ids.template } }).catch(() => {});
  await Promise.all([rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

type Row = Record<string, unknown>;
const callAs = (tenantId: string | null) =>
  rls!.$transaction(async (tx) => {
    if (tenantId) await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    const rows = await tx.$queryRaw<Row[]>`SELECT * FROM public.agency_funnel_counts(NULL)`;
    const scope = await tx.$queryRaw<{ s: string | null }[]>`SELECT current_setting('app.system_scope', true) AS s`;
    return { rows, scopeAfter: scope[0]?.s ?? null };
  });

describe('agency_funnel_counts (fabrika_app)', () => {
  test('returns integers per organisation type and nothing that names an organisation', async () => {
    const { rows } = await callAs(ids.agencyA);
    expect(rows.map((r) => Object.keys(r).sort())).toEqual(
      rows.map(() => ['concept_note', 'org_type', 'pipeline', 'registered', 'saved_search'])
    );
    const byType = Object.fromEntries(rows.map((r) => [r.org_type, r]));
    expect(byType.SME).toEqual({ org_type: 'SME', registered: 6, saved_search: 6, pipeline: 6, concept_note: 6 });
    expect(byType.MUNICIPALITY).toEqual({
      org_type: 'MUNICIPALITY',
      registered: 2,
      saved_search: 0,
      pipeline: 0,
      concept_note: 0,
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('secret');
    for (const t of [...linkedA, ids.orgB]) expect(text).not.toContain(t);
  });

  test('the agency is the caller: B sees only its own organisation, never A’s', async () => {
    const { rows } = await callAs(ids.agencyB);
    expect(rows).toEqual([{ org_type: 'SME', registered: 1, saved_search: 1, pipeline: 1, concept_note: 1 }]);
  });

  test('an organisation, or no tenant at all, gets no rows', async () => {
    expect((await callAs(linkedA[0]!)).rows).toEqual([]);
    expect((await callAs(null)).rows).toEqual([]);
  });

  test('the system scope does not outlive the call, and the agency still reads no content', async () => {
    const { scopeAfter } = await callAs(ids.agencyA);
    expect(scopeAfter).not.toBe('on');
    const leaked = await withTenantOn(rls!, ids.agencyA, async (tx) => ({
      saved: await tx.savedSearch.count({ where: { tenantId: { in: linkedA } } }),
      opps: await tx.opportunity.count({ where: { tenantId: { in: linkedA } } }),
      notes: await tx.conceptNote.count({ where: { tenantId: { in: linkedA } } }),
    }));
    expect(leaked).toEqual({ saved: 0, opps: 0, notes: 0 });
  });
});

describe('getAgencyFunnel (fabrika_app, with B7 outcomes)', () => {
  test('A’s funnel counts A’s organisations only, masked, with B7 numbers from A’s cohort', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const f = await getAgencyFunnel(ids.agencyA, { breakdown: { dimension: 'orgType' } });
    if (f.breakdown.dimension !== 'orgType') throw new Error('no type breakdown');
    // 8 organisations (shown rounded: 10): 6 SMEs + 2 municipalities. Municipalities are a
    // group of 2 → "<5", and the total would give them away, so SME is suppressed as well.
    expect(f.all.registered).toEqual({ state: 'count', value: 10 });
    expect(f.breakdown.byOrgType.MUNICIPALITY.registered).toEqual({ state: 'small' });
    expect(f.breakdown.byOrgType.SME.registered).toEqual({ state: 'small' });
    // TASK-MULXF0AVMD8MN: 6 of 8 would give away "2 organisations with no saved search /
    // pipeline / concept note", so those steps are masked too.
    expect(f.all.savedSearch).toEqual({ state: 'small' });
    expect(f.all.pipeline).toEqual({ state: 'small' });
    expect(f.all.conceptNote).toEqual({ state: 'small' });
    // B7 in organisations (TASK-MULZATEX4G92H Ö-1): 6 applied, 5 funded — B's 10 proposals are
    // not in it. 8 − 6 = 2 did not apply and 6 − 5 = 1 has no accepted one: both masked.
    expect(f.all.submitted).toEqual({ state: 'small' });
    expect(f.all.accepted).toEqual({ state: 'small' });
    expect(f.all.rejected).toEqual({ state: 'small' });
    // B6 (TASK-MULRR8P7HIII4): all 8 of A's organisations stored a result (shown rounded: 10);
    // 8 − 8 = 0 without one, so nothing is given away. B's result is not in it.
    expect(f.all.readiness).toEqual({ state: 'count', value: 10 });
    expect(f.breakdown.byOrgType.SME.readiness).toEqual({ state: 'small' });
    const text = JSON.stringify(f);
    expect(text).not.toContain('secret');
    for (const t of [...linkedA, ids.orgB]) expect(text).not.toContain(t);
  });

  test('B’s funnel: one organisation is a small group, so nothing is shown, not B’s 10 nor A’s 6', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const f = await getAgencyFunnel(ids.agencyB);
    expect(f.all.registered).toEqual({ state: 'small' });
    expect(f.all.submitted).toEqual({ state: 'small' });
  });

  test('an organisation cannot read a funnel', async () => {
    const { getAgencyFunnel, NotAnAgencyError } = await import('@/lib/agency/funnel');
    await expect(getAgencyFunnel(linkedA[0]!)).rejects.toBeInstanceOf(NotAnAgencyError);
    await expect(getAgencyFunnel(ids.orphan)).rejects.toBeInstanceOf(NotAnAgencyError);
  });

  test('the B7 list is derived from the agency link: A never receives B’s organisation', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const seen: string[][] = [];
    const units: unknown[] = [];
    await getAgencyFunnel(ids.agencyA, {
      outcomes: async (tenantIds, _since, options) => {
        seen.push([...tenantIds]);
        units.push(options?.unit);
        return { submitted: 0, accepted: 0, rejected: 0 };
      },
    });
    const all = seen.flat();
    expect(all.sort()).toEqual([...linkedA].sort());
    expect(all).not.toContain(ids.orgB);
    expect(all).not.toContain(ids.orphan);
    // TASK-MULZATEX4G92H Ö-1: the funnel always asks for organisations.
    expect(new Set(units)).toEqual(new Set(['organisation']));
  });

  test('Ö-1: B7 in organisations counts 6 who applied where applications count 8', async () => {
    const { countApplicationOutcomes } = await import('@/lib/k5-pipeline/applicationOutcome');
    expect(await countApplicationOutcomes(linkedA)).toEqual({ submitted: 8, accepted: 7, rejected: 0 });
    expect(await countApplicationOutcomes(linkedA, undefined, { unit: 'organisation' })).toEqual({
      submitted: 6,
      accepted: 5,
      rejected: 0,
    });
  });
});

describe('one cohort, no date window (TASK-MULXF0AVMD8MN, fabrika_app)', () => {
  test('an organisation registered 400 days ago is counted like one registered today', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const old = linkedA[0]!;
    const before = await admin!.tenant.findUniqueOrThrow({ where: { id: old }, select: { createdAt: true } });
    await admin!.tenant.update({ where: { id: old }, data: { createdAt: new Date(Date.now() - 400 * 86_400_000) } });
    try {
      const seen: string[] = [];
      const f = await getAgencyFunnel(ids.agencyA, {
        outcomes: async (tenantIds) => {
          seen.push(...tenantIds);
          return { submitted: 0, accepted: 0, rejected: 0 };
        },
      });
      // Steps 1, 3-5 (SQL, since = NULL) and the B7 cohort (Prisma) both still hold it (8, shown 10).
      expect(f.all.registered).toEqual({ state: 'count', value: 10 });
      expect(seen).toContain(old);
    } finally {
      await admin!.tenant.update({ where: { id: old }, data: { createdAt: before.createdAt } });
    }
  });
});

describe('province (TASK-MULV3JXS1AW5X, fabrika_app)', () => {
  const byProvinceAs = (tenantId: string) =>
    rls!.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return tx.$queryRaw<Row[]>`SELECT * FROM public.agency_funnel_counts_by_province(NULL) ORDER BY org_type`;
    });

  test('agency_funnel_counts_by_province: integers per type and province, the caller’s own only', async () => {
    expect(await byProvinceAs(ids.agencyA)).toEqual([
      { org_type: 'MUNICIPALITY', province: 'Samsun', registered: 2, saved_search: 0, pipeline: 0, concept_note: 0 },
      { org_type: 'SME', province: 'Samsun', registered: 6, saved_search: 6, pipeline: 6, concept_note: 6 },
    ]);
    expect(await byProvinceAs(ids.agencyB)).toEqual([
      { org_type: 'SME', province: null, registered: 1, saved_search: 1, pipeline: 1, concept_note: 1 },
    ]);
    expect(await byProvinceAs(linkedA[0]!)).toEqual([]);
  });

  test('getAgencyFunnel with a province: that province over every type, masked; an empty one is all "<5"', async () => {
    const { getAgencyFunnel } = await import('@/lib/agency/funnel');
    const samsun = await getAgencyFunnel(ids.agencyA, { breakdown: { dimension: 'province', province: 'Samsun' } });
    if (samsun.breakdown.dimension !== 'province') throw new Error('no province breakdown');
    expect(samsun.breakdown.province).toBe('Samsun');
    // All 8 gave Samsun: nothing is hidden behind the province line, so Samsun shows (rounded).
    expect(samsun.breakdown.view.registered).toEqual({ state: 'count', value: 10 });
    expect(samsun.all.registered).toEqual({ state: 'count', value: 10 });
    // TASK-MULZATEX4G92H: one breakdown per response — no type inside the province view.
    expect(JSON.stringify(samsun)).not.toMatch(/byOrgType|MUNICIPALITY|SME/);
    const tokat = await getAgencyFunnel(ids.agencyA, { breakdown: { dimension: 'province', province: 'Tokat' } });
    if (tokat.breakdown.dimension !== 'province') throw new Error('no province breakdown');
    for (const s of ['registered', 'savedSearch', 'pipeline', 'conceptNote', 'submitted', 'accepted', 'rejected'] as const) {
      expect(tokat.breakdown.view[s]).toEqual({ state: 'small' });
    }
    const text = JSON.stringify(samsun);
    for (const t of [...linkedA, ids.orgB]) expect(text).not.toContain(t);
  });

  test('the database refuses a province outside TR_PROVINCES', async () => {
    await expect(
      admin!.tenant.update({ where: { id: linkedA[0]! }, data: { province: 'Samsunn' } })
    ).rejects.toThrow(/Tenant_province_check/);
  });
});
