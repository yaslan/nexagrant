import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-205 (SEC NG-203 D-A1) — two concurrent merges of the same pair in opposite directions.
 *
 * Before the fix both transactions read both organisations as live (plain `findFirst`, no row
 * lock), each moved the other's contacts and each soft-deleted its drop row: both organisations
 * ended up deleted and the contacts crossed over (cx → my, cy → mx). There was no audit row either.
 *
 * The interleaving is made deterministic: each transaction waits at its first post-read step
 * (`leadMatch.findMany`) until the other one has arrived too, or 1.5 s have passed. Without row
 * locks both arrive and the race happens every time; with them the second transaction is still
 * waiting for the first one's lock, the first proceeds after the timeout, and the second then
 * finds its drop (or keep) row deleted.
 *
 * Real Postgres, real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks; fixtures and counts
 * go through the owner role (same singleton swap as tests/m18-intake.live.test.ts).
 */
const { rlsUrl: RLS_URL, ownerUrl: OWNER_URL } = await vi.hoisted(async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const path = resolve(process.cwd(), '.env');
  const read = (key: string): string | undefined => {
    if (!existsSync(path)) return undefined;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim();
      const i = t.indexOf('=');
      if (i > 0 && t.slice(0, i) === key) return t.slice(i + 1).replace(/^["']|["']$/g, '') || undefined;
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma, withTenant, type TenantTx } from '@/lib/db';
import { mergeLeadOrganizations as mergeImpl, type MergeResult } from '@/modules/m18/server/merge-leads';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'm18 merge race test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

// RED commit only: the actor argument does not exist yet; the fix commit drops this cast.
const mergeLeadOrganizations = mergeImpl as (tx: TenantTx, tenantId: string, input: unknown, now?: Date, actorId?: string | null) => Promise<MergeResult | null>;

const RUN = Math.random().toString(36).slice(2, 10);
const ACTOR = `ng205-actor-${RUN}`;
let tenantId = '';

/** Resolves for every caller once `n` have arrived, or after `ms` for whoever is still waiting. */
function barrier(n: number, ms: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const all = new Promise<void>((r) => (release = r));
  return async () => {
    arrived += 1;
    if (arrived >= n) release();
    await Promise.race([all, new Promise<void>((r) => setTimeout(r, ms))]);
  };
}

/** `tx` whose first `leadMatch.findMany` waits at `gate` first. Everything else passes through. */
function gated(tx: TenantTx, gate: () => Promise<void>): TenantTx {
  let waited = false;
  const leadMatch = new Proxy(tx.leadMatch, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (prop === 'findMany' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          if (!waited) {
            waited = true;
            await gate();
          }
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'leadMatch') return leadMatch;
      const value: unknown = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

async function pair(label: string) {
  const mx = await admin.leadOrganization.create({ data: { tenantId, name: `NG205 ${label} X ${RUN}` }, select: { id: true } });
  const my = await admin.leadOrganization.create({ data: { tenantId, name: `NG205 ${label} Y ${RUN}` }, select: { id: true } });
  const cx = await admin.leadContact.create({ data: { tenantId, organizationId: mx.id, fullName: 'Kişi X' }, select: { id: true } });
  const cy = await admin.leadContact.create({ data: { tenantId, organizationId: my.id, fullName: 'Kişi Y' }, select: { id: true } });
  return { mx: mx.id, my: my.id, cx: cx.id, cy: cy.id };
}

describe.skipIf(!HAS_DB)('M18 merge — concurrent opposite merges (NG-205 / D-A1)', () => {
  beforeAll(async () => {
    const t = await admin.tenant.create({ data: { name: `ng205-merge-${RUN}`, slug: `ng205-merge-${RUN}`, country: 'TR', orgType: 'CONSULTANCY' } });
    tenantId = t.id;
  });

  afterAll(async () => {
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('mx←my and my←mx at once: exactly one merge wins, one organisation survives, the contacts stay together', async () => {
    const p = await pair('race');
    const gate = barrier(2, 1500);
    const run = (keepId: string, dropId: string) =>
      withTenant(tenantId, (tx) => mergeLeadOrganizations(gated(tx, gate), tenantId, { keepId, dropId }, new Date(), ACTOR), {
        timeout: 15_000,
      });

    const results: Array<MergeResult | null> = await Promise.all([run(p.mx, p.my), run(p.my, p.mx)]);

    const orgs = await admin.leadOrganization.findMany({ where: { id: { in: [p.mx, p.my] } }, select: { id: true, deletedAt: true } });
    const live = orgs.filter((o) => o.deletedAt === null).map((o) => o.id);
    expect(live).toHaveLength(1);
    expect(results.filter((r) => r !== null)).toHaveLength(1);

    const survivor = live[0]!;
    expect(results.find((r) => r !== null)?.keepId).toBe(survivor);
    const contacts = await admin.leadContact.findMany({ where: { id: { in: [p.cx, p.cy] } }, select: { organizationId: true } });
    expect(contacts.map((c) => c.organizationId)).toEqual([survivor, survivor]);

    const audits = await admin.auditEvent.findMany({ where: { tenantId, type: 'lead.merged', target: survivor } });
    expect(audits).toHaveLength(1);
  });

  test('a merge writes one lead.merged audit row: tenant, actor, both ids and the moved counts, no personal data', async () => {
    const p = await pair('audit');
    const result = await withTenant(tenantId, (tx) => mergeLeadOrganizations(tx, tenantId, { keepId: p.mx, dropId: p.my }, new Date(), ACTOR));
    expect(result?.keepId).toBe(p.mx);

    const audits = await admin.auditEvent.findMany({ where: { tenantId, type: 'lead.merged', target: p.mx } });
    expect(audits).toHaveLength(1);
    const audit = audits[0]!;
    expect(audit.actorId).toBe(ACTOR);
    expect(audit.data).toEqual({
      keepId: p.mx,
      dropId: p.my,
      moved: { contacts: 1, deals: 0, matches: 0, eligibilityReports: 0 },
      filledFields: [],
    });
    expect(JSON.stringify(audit.data)).not.toContain('NG205');
    expect(JSON.stringify(audit.data)).not.toContain('Kişi');
  });

  test('a drop row that is already merged away is refused: null, nothing moved, no audit row', async () => {
    const p = await pair('stale');
    const first = await withTenant(tenantId, (tx) => mergeLeadOrganizations(tx, tenantId, { keepId: p.mx, dropId: p.my }, new Date(), ACTOR));
    expect(first).not.toBeNull();
    const again = await withTenant(tenantId, (tx) => mergeLeadOrganizations(tx, tenantId, { keepId: p.mx, dropId: p.my }, new Date(), ACTOR));
    expect(again).toBeNull();
    expect(await admin.auditEvent.count({ where: { tenantId, type: 'lead.merged', target: p.mx } })).toBe(1);
  });
});
