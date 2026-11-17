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
// (f)-(h): more stuck leads than a (lowered) per-lead cap. Older than L.stuck, oldest = index 6.
const EXTRA: string[] = [];
const CAP = 3;
const alertsFor = (leadId: string) =>
  admin.systemAlert.findMany({ where: { source: STUCK_LEAD_ALERT_SOURCE, meta: { path: ['publicLeadId'], equals: leadId } } });
const openOfSource = () =>
  admin.systemAlert.findMany({ where: { source: STUCK_LEAD_ALERT_SOURCE, resolvedAt: null }, orderBy: { createdAt: 'asc' } });
const isSummary = (meta: unknown) => (meta as Record<string, unknown> | null)?.stuckSummary === true;
const copyOf = async (leadId: string) => {
  const org = await admin.leadOrganization.create({ data: { tenantId: T.a, name: `Heal Org ${leadId}` } });
  await admin.leadContact.create({
    data: { tenantId: T.a, organizationId: org.id, fullName: 'Ayşe Yılmaz', sourceRef: `${LEAD_INTAKE_SOURCE_REF_PREFIX}${leadId}` },
  });
};

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
    const ids = [...Object.values(L), ...EXTRA].filter(Boolean);
    for (const id of ids) {
      if (!id) continue;
      await admin.systemAlert.deleteMany({ where: { source: 'public-lead-stuck', meta: { path: ['publicLeadId'], equals: id } } });
    }
    // The summary alert names no tenant and no run; on this (non-shared) database, the ones opened since this file started are ours.
    await admin.systemAlert.deleteMany({ where: { source: 'public-lead-stuck', createdAt: { gte: NOW }, meta: { path: ['stuckSummary'], equals: true } } });
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
    expect(result).toMatchObject({ overflow: 0, summary: 'none' }); // default cap (STUCK_LEAD_ALERTS_MAX) is far above this file's leads
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

  test('(f) more stuck leads than the cap: per-lead alerts up to the cap, ONE summary for the rest; a second run opens nothing', async () => {
    for (let i = 0; i < 7; i += 1) EXTRA.push(await mkLead(`extra-${i}`, routed(T.a, MIN * 4 + i)));
    // L.stuck still holds its open alert from (c)/(d); it counts against the cap.
    const first = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma, maxLeadAlerts: CAP });
    expect(first.stuck).toBe(8); // ground truth: L.stuck + 7 extras, nothing foreign on this database
    expect(first).toMatchObject({ alreadyOpen: 1, raised: CAP - 1, resolved: 0, overflow: 8 - CAP, summary: 'opened' });

    const open = await openOfSource();
    const perLead = open.filter((a) => !isSummary(a.meta));
    const summaries = open.filter((a) => isSummary(a.meta));
    expect(perLead).toHaveLength(CAP);
    expect(summaries).toHaveLength(1);
    // Oldest first: the two free slots went to extra-6 and extra-5.
    expect(new Set(perLead.map((a) => (a.meta as Record<string, unknown>).publicLeadId))).toEqual(new Set([L.stuck, EXTRA[6], EXTRA[5]]));
    const summary = summaries[0]!;
    expect(summary).toMatchObject({ level: 'warn', resolvedAt: null });
    expect(summary.meta).toMatchObject({ count: 5, stuckTotal: 8, cap: CAP, oldestLeadIds: [EXTRA[4], EXTRA[3], EXTRA[2], EXTRA[1], EXTRA[0]] });
    // Lead ids only: no tenant id or name, no contact data.
    const blob = JSON.stringify({ message: summary.message, meta: summary.meta });
    for (const forbidden of [T.a, `stuck-a-${RUN}`, 'Ayşe', '@example.test']) expect(blob).not.toContain(forbidden);

    const second = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma, maxLeadAlerts: CAP });
    expect(second).toMatchObject({ stuck: 8, alreadyOpen: CAP, raised: 0, resolved: 0, overflow: 5, summary: 'unchanged' });
    const again = await openOfSource();
    expect(again.map((a) => a.id)).toEqual(open.map((a) => a.id));
    expect(again.map((a) => a.meta)).toEqual(open.map((a) => a.meta));
  });

  test('(g) the summary follows the count in place: same row, new count', async () => {
    const before = (await openOfSource()).filter((a) => isSummary(a.meta));
    await copyOf(EXTRA[0]!); // an uncovered lead recovers
    const r = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma, maxLeadAlerts: CAP });
    expect(r).toMatchObject({ stuck: 7, raised: 0, resolved: 0, overflow: 4, summary: 'updated' });
    const after = (await openOfSource()).filter((a) => isSummary(a.meta));
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.meta).toMatchObject({ count: 4, stuckTotal: 7, oldestLeadIds: [EXTRA[4], EXTRA[3], EXTRA[2], EXTRA[1]] });
  });

  test('(h) under the cap: recovered leads\' alerts close in one statement, the freed slots fill, the summary closes', async () => {
    const healedAlerts = [...(await alertsFor(EXTRA[6]!)), ...(await alertsFor(EXTRA[5]!))];
    expect(healedAlerts).toHaveLength(2);
    // Two alerted leads and two uncovered ones recover: left stuck = L.stuck, extra-2, extra-1 (= CAP).
    for (const i of [6, 5, 4, 3]) await copyOf(EXTRA[i]!);
    const r = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma, maxLeadAlerts: CAP });
    expect(r).toMatchObject({ stuck: CAP, alreadyOpen: 1, resolved: 2, raised: 2, overflow: 0, summary: 'resolved' });

    const closed = await admin.systemAlert.findMany({ where: { id: { in: healedAlerts.map((a) => a.id) } } });
    expect(closed).toHaveLength(2);
    for (const a of closed) expect(a.meta).toMatchObject({ alertResolvedBy: 'producer', publicLeadId: expect.any(String) });
    // One statement for the batch: one resolvedAt for both rows.
    expect(closed[0]!.resolvedAt).not.toBeNull();
    expect(closed[1]!.resolvedAt?.getTime()).toBe(closed[0]!.resolvedAt?.getTime());

    const open = await openOfSource();
    expect(open.filter((a) => isSummary(a.meta))).toHaveLength(0);
    expect(new Set(open.map((a) => (a.meta as Record<string, unknown>).publicLeadId))).toEqual(new Set([L.stuck, EXTRA[2], EXTRA[1]]));

    // Steady state: nothing more to do.
    const again = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma, maxLeadAlerts: CAP });
    expect(again).toMatchObject({ stuck: CAP, alreadyOpen: CAP, raised: 0, resolved: 0, overflow: 0, summary: 'none' });
  });

  // NG-212: a lead whose transfer consent was recorded but that was NEVER routed (routeStatus NULL: the
  // form's bridge did not run, or threw before its claim) is in no tenant and on no worklist. The alarm
  // finds it too, past the same threshold; without a recorded consent (gate off / box unticked) nothing.
  test('(i) consented but never routed (routeStatus NULL), older than the threshold → one alert; young / no consent / unmatched → none', async () => {
    const old = ago(MIN * 2);
    const NEVER: Record<'old' | 'young' | 'noConsent' | 'noVersion', string> = {
      old: await mkLead('never-old', { createdAt: old, transferConsentAt: old }),
      young: await mkLead('never-young', { createdAt: ago(MIN / 2), transferConsentAt: ago(MIN / 2) }),
      noConsent: await mkLead('never-no-consent', { createdAt: old, transferConsent: false, transferConsentVersion: null, transferConsentAt: null }),
      noVersion: await mkLead('never-no-version', { createdAt: old, transferConsentVersion: null }),
    };
    EXTRA.push(...Object.values(NEVER));
    // Ground truth: all four are unrouted.
    expect(await admin.publicLead.count({ where: { id: { in: Object.values(NEVER) }, routeStatus: null, routedTenantId: null } })).toBe(4);

    const r = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    // Left from (h): L.stuck, extra-2, extra-1 (alerts open) + the one old never-routed lead.
    expect(r).toMatchObject({ stuck: CAP + 1, alreadyOpen: CAP, raised: 1, resolved: 0, overflow: 0 });
    const raised = await alertsFor(NEVER.old);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ level: 'warn', resolvedAt: null });
    expect(raised[0]!.meta).toMatchObject({ publicLeadId: NEVER.old, neverRouted: true, olderThanMinutes: MIN });
    expect(raised[0]!.message).toContain('never routed');
    const blob = JSON.stringify({ message: raised[0]!.message, meta: raised[0]!.meta });
    for (const forbidden of ['Ayşe', '@example.test', 'Stuck Org']) expect(blob).not.toContain(forbidden);
    for (const id of [NEVER.young, NEVER.noConsent, NEVER.noVersion, L.unmatched]) expect(await alertsFor(id)).toHaveLength(0);

    // Idempotent: a second run opens nothing.
    const again = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    expect(again).toMatchObject({ stuck: CAP + 1, alreadyOpen: CAP + 1, raised: 0, resolved: 0 });
    expect(await alertsFor(NEVER.old)).toHaveLength(1);

    // The admin "Stuck (no copy)" list stays the routed-without-copy list (its rows name a routed tenant).
    const page = await listStuckRoutedLeads(prisma, { olderThanMinutes: MIN, now: NOW });
    expect(page.rows.map((r) => r.publicLeadId)).not.toContain(NEVER.old);
  });

  test('(j) the never-routed lead gets routed and its copy lands → its alert closes', async () => {
    const id = EXTRA[EXTRA.length - 4]!; // NEVER.old from (i)
    await admin.publicLead.update({ where: { id }, data: { routeStatus: 'routed', routedTenantId: T.a, routedAt: ago(MIN * 2) } });
    // Routed but still without a copy: still stuck (now as "no copy"), the same alert stays open.
    const mid = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    expect(mid).toMatchObject({ stuck: CAP + 1, alreadyOpen: CAP + 1, raised: 0, resolved: 0 });
    await copyOf(id);
    const healed = await alertStuckRoutedLeads({ olderThanMinutes: MIN, now: NOW, db: prisma });
    expect(healed).toMatchObject({ stuck: CAP, alreadyOpen: CAP, raised: 0, resolved: 1 });
    const [alert] = await alertsFor(id);
    expect(alert?.resolvedAt).not.toBeNull();
  });
});
