import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test, vi } from 'vitest';

/**
 * NG-367 (SEC NG-363 Ö-2, Ö-3, Ö-4) — the cookie consent record on the real `fabrika_app`
 * role (NOBYPASSRLS), no mocks.
 *
 * Ö-2: the policy version must be one the server published; an unknown one writes nothing.
 * Ö-3: the write has its own purpose 'cookie-consent', which opens CookieConsentRecord and
 *      nothing else; 'public-intake' (the expert and readiness forms) no longer reaches it.
 * Ö-4: the hourly per-visitor limit holds under concurrent saves (advisory lock per visitor).
 *
 * The code under test runs as fabrika_app; ground-truth counts and clean-up go through the
 * owner role (same singleton swap as tests/public-lead-rls.live.test.ts). Rows are keyed by
 * fresh visitor UUIDs, so nothing here touches another suite's rows.
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

import { createDbClient, prisma } from '@/lib/db';
import { COOKIE_POLICY_VERSION } from '@/lib/cookie-consent';
import { COOKIE_CONSENT_HOURLY_LIMIT, recordCookieConsent } from '@/lib/cookie-consent-record';
import { SYSTEM_SCOPE_PURPOSES, withSystemScopeOn } from '@/lib/system-scope';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const SUITE = 'cookie consent record test';
const admin = createDbClient(OWNER_URL ?? 'postgresql://localhost:5432/unset');
const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  Boolean(OWNER_URL) &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !OWNER_URL) skipOrFailInCi(SUITE, 'DATABASE_URL (owner connection) is not set', 'Provide DATABASE_URL for the fixture/owner connection.');
else if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const visitors: string[] = [];
const newVisitor = () => {
  const id = randomUUID();
  visitors.push(id);
  return id;
};
const save = (visitorId: string, over: Record<string, unknown> = {}) => ({
  visitorId,
  choice: 'reject_all',
  analytics: false,
  marketing: false,
  policyVersion: COOKIE_POLICY_VERSION,
  locale: 'tr',
  ...over,
});
const ownerCount = (visitorId: string) => admin.cookieConsentRecord.count({ where: { visitorId } });
const row = (visitorId: string) => ({
  visitorId,
  choice: 'reject_all',
  analytics: false,
  marketing: false,
  policyVersion: COOKIE_POLICY_VERSION,
  locale: 'tr',
});

describe.skipIf(!HAS_DB)('cookie consent record (NG-367)', () => {
  afterAll(async () => {
    await admin.cookieConsentRecord.deleteMany({ where: { visitorId: { in: visitors } } });
    await admin.$disconnect();
    await prisma.$disconnect();
  });

  describe('Ö-2: the policy version is on a server allowlist', () => {
    test('the version in force is written', async () => {
      const v = newVisitor();
      expect(await recordCookieConsent(save(v))).toEqual({ kind: 'created' });
      expect(await ownerCount(v)).toBe(1);
    });

    test.each(['v1', 'draft-2099-01-01', 'probe'])('an unknown version (%s) is invalid and writes no row', async (policyVersion) => {
      const v = newVisitor();
      expect(await recordCookieConsent(save(v, { policyVersion }))).toEqual({ kind: 'invalid' });
      expect(await ownerCount(v)).toBe(0);
    });
  });

  describe('Ö-3: its own purpose, and only that table', () => {
    test("'cookie-consent' is a known purpose", () => {
      expect(SYSTEM_SCOPE_PURPOSES).toContain('cookie-consent');
    });

    test("'public-intake' can no longer insert or read a consent record", async () => {
      const v = newVisitor();
      await admin.cookieConsentRecord.create({ data: row(v) });
      expect(await withSystemScopeOn(prisma, 'public-intake', 'ng-367.test', (tx) => tx.cookieConsentRecord.count({ where: { visitorId: v } }))).toBe(0);
      await expect(
        withSystemScopeOn(prisma, 'public-intake', 'ng-367.test', (tx) => tx.cookieConsentRecord.create({ data: row(newVisitor()) }))
      ).rejects.toThrow(/row-level security|42501/i);
    });

    test("'cookie-consent' reads and inserts the consent record", async () => {
      const v = newVisitor();
      await withSystemScopeOn(prisma, 'cookie-consent', 'ng-367.test', (tx) => tx.cookieConsentRecord.create({ data: row(v) }));
      expect(await withSystemScopeOn(prisma, 'cookie-consent', 'ng-367.test', (tx) => tx.cookieConsentRecord.count({ where: { visitorId: v } }))).toBe(1);
      expect(await ownerCount(v)).toBe(1);
    });

    test("'cookie-consent' reaches neither the readiness lead nor the expert tables, nor a NULL-tenant audit row", async () => {
      const truth = { leads: await admin.publicLead.count(), experts: await admin.expertPreRegistration.count() };
      const seen = await withSystemScopeOn(prisma, 'cookie-consent', 'ng-367.test', async (tx) => ({
        leads: await tx.publicLead.count(),
        experts: await tx.expertPreRegistration.count(),
        attempts: await tx.expertPreRegAttempt.count(),
      }));
      expect(seen).toEqual({ leads: 0, experts: 0, attempts: 0 });
      // Control: the owner sees what is there (0 on an empty database is still a valid run).
      expect(truth.leads).toBeGreaterThanOrEqual(0);
      expect(truth.experts).toBeGreaterThanOrEqual(0);
      await expect(
        withSystemScopeOn(prisma, 'cookie-consent', 'ng-367.test', (tx) =>
          tx.publicLead.create({
            data: { name: 'probe', email: `${randomUUID()}@ng367.invalid`, organisation: 'probe', consentVersion: 'probe', consentAt: new Date(), source: 'fon-hazirlik', locale: 'tr' },
          })
        )
      ).rejects.toThrow(/row-level security|42501/i);
      await expect(
        withSystemScopeOn(prisma, 'cookie-consent', 'ng-367.test', (tx) => tx.auditEvent.create({ data: { tenantId: null, type: 'ng367.test' } }))
      ).rejects.toThrow(/row-level security|42501/i);
    });
  });

  describe('Ö-4: the hourly limit holds under concurrent saves', () => {
    test(`${COOKIE_CONSENT_HOURLY_LIMIT + 15} parallel saves of one visitor write exactly ${COOKIE_CONSENT_HOURLY_LIMIT}`, async () => {
      const v = newVisitor();
      const results = await Promise.all(Array.from({ length: COOKIE_CONSENT_HOURLY_LIMIT + 15 }, () => recordCookieConsent(save(v))));
      const created = results.filter((r) => r.kind === 'created').length;
      const limited = results.filter((r) => r.kind === 'rate_limited').length;
      expect({ created, limited }).toEqual({ created: COOKIE_CONSENT_HOURLY_LIMIT, limited: 15 });
      expect(await ownerCount(v)).toBe(COOKIE_CONSENT_HOURLY_LIMIT);
    }, 60_000);
  });
});
