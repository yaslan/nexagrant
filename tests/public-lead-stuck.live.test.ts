import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-182 — stuck routed leads (routed, but no LeadContact / Deal copy in the routed tenant).
 * Real Postgres, real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks. The code under test
 * runs as fabrika_app; fixtures and ground truth go through the owner role (same singleton swap as
 * tests/province-lead-route.live.test.ts).
 *
 * alertStuckRoutedLeads() scans the whole PublicLead table and writes SystemAlert rows for every
 * stuck lead it finds, other people's too. On the shared local database that would open alerts for
 * leads this file does not own, so it refuses a database named `fabrika` outside GitHub Actions.
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

import { STUCK_LEAD_ALERT_SOURCE } from '@/core/contracts/lead-routing';
import { LEAD_INTAKE_SOURCE_REF_PREFIX } from '@/core/contracts/lead-intake';
import { createDbClient, prisma } from '@/lib/db';
import { publicLeadStuckAfterMinutes } from '@/lib/env';
import { alertStuckRoutedLeads, listStuckRoutedLeads } from '@/lib/leads/stuck-leads';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';

const SUITE = 'public lead stuck test';
// No fallback address: without OWNER_URL the suite skips (loudly) instead of guessing credentials.
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the alert scan writes SystemAlert rows for every stuck lead in the table; refusing to run on the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
// The threshold the job and the admin screen use (PUBLIC_LEAD_STUCK_AFTER_MINUTES); not a number of this file.
const MIN = publicLeadStuckAfterMinutes();
const NOW = new Date();
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);
const T: Record<'a' | 'b', string> = { a: '', b: '' };
const L: Record<'withContact' | 'withDeal' | 'stuck' | 'young' | 'unmatched', string> = {
  withContact: '', withDeal: '', stuck: '', young: '', unmatched: '',
};

const mkLead = (key: string, over: Record<string, unknown>) =>
  admin.publicLead
    .create({
      data: {
        name: 'Ayşe Yılmaz', email: `${key}-${RUN}@example.test`, organisation: `Stuck Org ${key} ${RUN}`, province: 'Rize', district: null,
        readinessCode: 'municipality.012012012012012', consentVersion: 'v-form', consentAt: NOW, source: 'fon-hazirlik', locale: 'tr',
        transferConsent: true, transferConsentVersion: 'v-test', transferConsentAt: NOW,
        ...over,
      },
    })
    .then((l) => l.id);
const routed = (tenantId: string, minutesAgo: number) => ({ routeStatus: 'routed', routedTenantId: tenantId, routedAt: ago(minutesAgo) });
const mine = (ids: string[]) => ids.filter((id) => Object.values(L).includes(id));
const alertsFor = (leadId: string) =>
  admin.systemAlert.findMany({ where: { source: STUCK_LEAD_ALERT_SOURCE, meta: { path: ['publicLeadId'], equals: leadId } } });

describe.skipIf(!HAS_DB)('stuck routed leads (live database, fabrika_app)', () => {
  beforeAll(async () => {
    for (const key of ['a', 'b'] as const) {
      T[key] = (
        await admin.tenant.create({ data: { name: `stuck-${key}-${RUN}`, slug: `stuck-${key}-${RUN}`, country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION' } })
      ).id;
    }
    const old = MIN * 3;
    L.withContact = await mkLead('with-contact', routed(T.a, old));
    L.withDeal = await mkLead('with-deal', routed(T.a, old));
    L.stuck = await mkLead('stuck', routed(T.a, old));
    // Younger than the threshold: the port may still be writing the copy.
    L.young = await mkLead('young', routed(T.a, MIN / 2));
    L.unmatched = await mkLead('unmatched', { routeStatus: 'unmatched', routeReason: 'province_unmapped' });

    // The copies M18 writes: LeadContact (with its organisation) and/or a Deal carrying sourceRef = public-lead:<id>.
    const org = await admin.leadOrganization.create({ data: { tenantId: T.a, name: `Copy Org ${RUN}` } });
    await admin.leadContact.create({
      data: { tenantId: T.a, organizationId: org.id, fullName: 'Ayşe Yılmaz', sourceRef: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${L.withContact}` },
    });
    await admin.deal.create({
      data: { tenantId: T.a, organizationId: org.id, title: `Deal ${RUN}`, sourceRef: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${L.withDeal}` },
    });
    // A copy of the stuck lead in the WRONG tenant does not count: only the routed tenant's copy does.
    const orgB = await admin.leadOrganization.create({ data: { tenantId: T.b, name: `Copy Org B ${RUN}` } });
    await admin.leadContact.create({
      data: { tenantId: T.b, organizationId: orgB.id, fullName: 'Ayşe Yılmaz', sourceRef: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${L.stuck}` },
    });
  });

  afterAll(async () => {
    const ids = Object.values(L).filter(Boolean);
    for (const id of ids) {
      if (!id) continue;
      await admin.systemAlert.deleteMany({ where: { source: 'public-lead-stuck', meta: { path: ['publicLeadId'], equals: id } } });
    }
    await admin.publicLead.deleteMany({ where: { email: { endsWith: `-${RUN}@example.test` } } });
    // Cascades the LeadOrganization / LeadContact / Deal copies.
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  test('(a) a routed lead whose tenant holds a copy (LeadContact or Deal) is NOT listed', async () => {
    const page = await listStuckRoutedLeads(prisma, { olderThanMinutes: MIN, now: NOW, purpose: 'platform-admin' });
    const ids = mine(page.rows.map((r) => r.publicLeadId));
    expect(ids).not.toContain(L.withContact);
    expect(ids).not.toContain(L.withDeal);
    expect(ids).not.toContain(L.unmatched);
  });

  test('(b) a routed lead with no copy in its routed tenant IS listed, with tenant, routedAt and deleted flag', async () => {
    const page = await listStuckRoutedLeads(prisma, { olderThanMinutes: MIN, now: NOW, purpose: 'cross-tenant-job' });
    const row = page.rows.find((r) => r.publicLeadId === L.stuck);
    expect(row).toBeDefined();
    expect(row).toMatchObject({ routedTenantId: T.a, routedTenantName: `stuck-a-${RUN}`, tenantDeleted: false });
    expect(row?.routedAt?.getTime()).toBe(ago(MIN * 3).getTime());
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.olderThanMinutes).toBe(MIN);
    // Without a caller threshold the reader applies PUBLIC_LEAD_STUCK_AFTER_MINUTES (the admin screen's path).
    expect((await listStuckRoutedLeads(prisma, { now: NOW })).olderThanMinutes).toBe(MIN);
  });

  test('(c) a routed, copy-less lead younger than the threshold is not listed and raises no alert', async () => {
    const page = await listStuckRoutedLeads(prisma, { olderThanMinutes: MIN, now: NOW });
    expect(mine(page.rows.map((r) => r.publicLeadId))).not.toContain(L.young);

    const result = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    expect(result.raised).toBeGreaterThanOrEqual(1);
    expect(await alertsFor(L.young)).toHaveLength(0);
    expect(await alertsFor(L.withContact)).toHaveLength(0);
    // The stuck one got exactly one alert, and the alert names the lead only: no tenant id or name.
    const raised = await alertsFor(L.stuck);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ level: 'warn', resolvedAt: null });
    const blob = JSON.stringify({ message: raised[0]!.message, meta: raised[0]!.meta });
    expect(blob).not.toContain(T.a);
    expect(blob).not.toContain(`stuck-a-${RUN}`);
  });

  test('(d) a second run opens no second alert for the same lead', async () => {
    const before = await alertsFor(L.stuck);
    expect(before).toHaveLength(1);
    const again = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    expect(again.alreadyOpen).toBeGreaterThanOrEqual(1);
    const after = await alertsFor(L.stuck);
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
    // Untouched: no repeat counter, no last-seen bump (recordAlert's fold would write both into meta).
    expect(after[0]!.meta).toEqual(before[0]!.meta);
  });

  test('(e) a tenant session (app.tenant_id of the routed tenant) reads none of it', async () => {
    // Ground truth: the rows exist.
    expect(await admin.publicLead.count({ where: { id: L.stuck, routeStatus: 'routed' } })).toBe(1);
    const seen = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T.a}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT pl.id FROM "PublicLead" pl
         WHERE pl."routeStatus" = 'routed' AND pl."routedTenantId" = ${T.a}`;
      return rows.map((r) => r.id);
    });
    expect(seen).toEqual([]);
    // Nor by setting the scope flag by hand: only the sealed withSystemScope opens it.
    const forged = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${T.a}, true)`;
      await tx.$executeRaw`SELECT set_config('app.system_scope', 'on', true)`;
      return tx.publicLead.count({ where: { id: L.stuck } });
    });
    expect(forged).toBe(0);
  });
});
