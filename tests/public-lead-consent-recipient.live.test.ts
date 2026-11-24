import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-204 (SEC NG-203 O-A1) — the transfer consent is bound to the organisation the visitor SAW.
 *
 * The visitor ticks the transfer box under one organisation's name (the province map at that moment).
 * If the map moves before the lead is forwarded (or an unmatched lead is forwarded again after a
 * re-mapping), the lead must NOT reach an organisation the visitor never consented to: it is not
 * forwarded and is marked unmatched for the platform-admin worklist.
 *
 * Real Postgres, real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks. Submit and forward run as
 * fabrika_app; fixtures and ground-truth counts go through the owner role.
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
  // The publication gate is on for this file only: with it off no transfer consent is ever recorded.
  process.env.LEAD_TRANSFER_CONSENT_ENABLED = 'true';
  return { rlsUrl, ownerUrl };
});

import { createEventBus } from '@/core/events';
import { createDbClient, prisma } from '@/lib/db';
import { PUBLIC_LEAD_CONSENT, submitPublicLead } from '@/lib/leads/public-lead';
import { forwardPublicLead } from '@/lib/leads/public-lead-intake';
import { createLeadIntakePort } from '@/modules/m18/server/intake-repo';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { holdTestDbLock, PUBLIC_LEAD_TABLE_LOCK } from './helpers/test-db-lock';

const SUITE = 'public lead consent recipient test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const MINE = { endsWith: `-${RUN}@example.test` };
// The province this file owns (no other test uses it).
const PROVINCE = 'Kırşehir';
const T: Record<'a' | 'b', string> = { a: '', b: '' };
const nameOf = (k: keyof typeof T) => `ng204-${k}-${RUN}`;
const port = createLeadIntakePort(prisma, createEventBus());

const dealsIn = (tenantId: string) => admin.deal.count({ where: { tenantId } });
const route = async (tenantId: string) => {
  await admin.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
  await admin.provinceLeadRoute.create({ data: { province: PROVINCE, targetTenantId: tenantId, active: true } });
};

/** The visitor's submit as the form sends it: the box ticked under `shownName`. */
const submit = (key: string, shownName: string) =>
  submitPublicLead(
    {
      name: 'Ayşe Yılmaz',
      email: `${key}-${RUN}@example.test`,
      organisation: `Org ${key}`,
      province: PROVINCE,
      consent: true,
      consentVersion: PUBLIC_LEAD_CONSENT.version,
      transferConsent: true,
      transferOrgName: shownName,
      source: 'fon-hazirlik',
      locale: 'tr',
    },
    { db: prisma, secret: null },
  );
const leadOf = (key: string) => admin.publicLead.findFirstOrThrow({ where: { email: `${key}-${RUN}@example.test` } });
/** Raw read: the recipient columns are read by name so this file does not depend on the generated client. */
const recipientOf = async (id: string) =>
  (
    await admin.$queryRaw<Array<{ tenantId: string | null; orgName: string | null }>>`
      SELECT "transferConsentTenantId" AS "tenantId", "transferConsentOrgName" AS "orgName" FROM "PublicLead" WHERE id = ${id}`
  )[0];

describe.skipIf(!HAS_DB)('transfer consent is bound to the recipient the visitor saw (NG-204)', () => {
  // NG-346: forwardPublicLead writes routed PublicLead rows here; hold the shared DDL lock for the file.
  let releasePublicLeadLock: (() => Promise<void>) | undefined;
  beforeAll(async () => {
    releasePublicLeadLock = await holdTestDbLock(OWNER_URL!, PUBLIC_LEAD_TABLE_LOCK);
    for (const k of ['a', 'b'] as const) {
      const t = await admin.tenant.create({
        // NG-205: a tenant is an intake target only while its M18 is PILOT; without the row the
        // control case is refused for M18 (`tenant_ineligible`) instead of testing the consent rule.
        data: {
          name: nameOf(k), slug: nameOf(k), country: 'TR', orgType: 'CONSULTANCY', kind: 'ORGANIZATION',
          moduleStates: { create: { moduleId: 'M18', status: 'PILOT', changedBy: 'test fixture (NG-205)' } },
        },
      });
      T[k] = t.id;
    }
  });

  afterAll(async () => {
    await admin.publicLead.deleteMany({ where: { email: MINE } });
    await admin.consent.deleteMany({ where: { userId: { startsWith: 'public-lead:' }, tenantId: { in: [T.a, T.b] } } });
    await admin.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
    await admin.tenant.deleteMany({ where: { slug: { endsWith: `-${RUN}` } } });
    await admin.$disconnect();
    await prisma.$disconnect();
    await releasePublicLeadLock?.();
  });

  test('submit stores the id and name of the organisation the consent was given to', async () => {
    await route(T.a);
    expect(await submit('stored', nameOf('a'))).toEqual({ ok: true });
    const lead = await leadOf('stored');
    expect(lead.transferConsent).toBe(true);
    expect(await recipientOf(lead.id)).toEqual({ tenantId: T.a, orgName: nameOf('a') });
  });

  test('RED: map moves A→B after the consent; forwarding must NOT reach B (not forwarded, marked unmatched)', async () => {
    await route(T.a);
    expect(await submit('moved', nameOf('a'))).toEqual({ ok: true });
    const lead = await leadOf('moved');
    await route(T.b);
    const [beforeA, beforeB] = [await dealsIn(T.a), await dealsIn(T.b)];

    const result = await forwardPublicLead(lead.id, port, prisma);

    expect(await dealsIn(T.b)).toBe(beforeB);
    expect(await dealsIn(T.a)).toBe(beforeA);
    expect(result).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'consent_recipient_mismatch' });
    expect(await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({
      routeStatus: 'unmatched', routeReason: 'consent_recipient_mismatch', routedTenantId: null,
    });
  });

  test('RED: an unmatched lead forwarded again after the province is re-mapped to another organisation stays unforwarded', async () => {
    await route(T.a);
    expect(await submit('remap', nameOf('a'))).toEqual({ ok: true });
    const lead = await leadOf('remap');
    await admin.provinceLeadRoute.deleteMany({ where: { province: PROVINCE } });
    expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'province_unmapped' });
    await route(T.b);
    const beforeB = await dealsIn(T.b);

    expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'unmatched', unmatchedReason: 'consent_recipient_mismatch' });
    expect(await dealsIn(T.b)).toBe(beforeB);
  });

  test('RED: the form showed A but the map moved to B before submit: no transfer consent is recorded for B', async () => {
    await route(T.b);
    expect(await submit('stale-form', nameOf('a'))).toEqual({ ok: true });
    const lead = await leadOf('stale-form');
    expect(lead).toMatchObject({ transferConsent: false, transferConsentVersion: null, transferConsentAt: null });
    expect(await forwardPublicLead(lead.id, port, prisma)).toEqual({ status: 'skipped', reason: 'transfer_consent_off' });
  });

  test('control: map unchanged → the lead lands in the organisation the visitor consented to', async () => {
    await route(T.a);
    expect(await submit('same', nameOf('a'))).toEqual({ ok: true });
    const lead = await leadOf('same');
    const beforeA = await dealsIn(T.a);
    expect((await forwardPublicLead(lead.id, port, prisma)).status).toBe('created');
    expect(await dealsIn(T.a)).toBe(beforeA + 1);
    expect(await admin.publicLead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ routeStatus: 'routed', routedTenantId: T.a });
  });
});
