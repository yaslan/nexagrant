import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live cookie consent retention (NG-366, NG-363 B-1) — real Postgres, real Prisma,
 * the `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * purgeOldCookieConsents() deletes CookieConsentRecord rows by date across the
 * whole table (the table has no tenantId). On a shared database that would delete
 * other visitors' consent records, so this file refuses to run on a database named
 * `fabrika` outside GitHub Actions. Run it on the isolated gate database
 * (`pnpm gate:isolated`) or a throwaway one, the same as the other live retention tests.
 *
 * Singleton swap exactly as tests/invitation-retention.live.test.ts: the code under
 * test runs as fabrika_app, fixtures and counts go through the owner role.
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
      if (i > 0 && t.slice(0, i) === key) {
        const v = t.slice(i + 1).replace(/^["']|["']$/g, '');
        return v || undefined;
      }
    }
    return undefined;
  };
  const ownerUrl = process.env.DATABASE_URL ?? read('DATABASE_URL');
  const rlsUrl = process.env.DATABASE_URL_RLS_TEST ?? read('DATABASE_URL_RLS_TEST');
  if (rlsUrl) process.env.DATABASE_URL = rlsUrl;
  return { rlsUrl, ownerUrl };
});

import { createDbClient, prisma } from '@/lib/db';
import { COOKIE_CONSENT_RETENTION_DAYS, purgeOldCookieConsents } from '@/lib/cookie-consent-retention';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'cookie consent retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the purge deletes across every visitor; refusing to run on the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const VISITOR_PREFIX = `ccret-${RUN}-`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

async function consent(visitor: string, createdAt: Date): Promise<string> {
  const row = await admin.cookieConsentRecord.create({
    data: {
      visitorId: `${VISITOR_PREFIX}${visitor}`,
      choice: 'accept_all',
      analytics: true,
      marketing: false,
      policyVersion: 'draft-2026-11-18',
      locale: 'tr',
      createdAt,
    },
  });
  return row.id;
}

async function survivingVisitors(): Promise<string[]> {
  const rows = await admin.cookieConsentRecord.findMany({
    where: { visitorId: { startsWith: VISITOR_PREFIX } },
    select: { visitorId: true },
  });
  return rows.map((r) => r.visitorId.slice(VISITOR_PREFIX.length)).sort();
}

async function cleanRows(): Promise<void> {
  await admin.cookieConsentRecord.deleteMany({ where: { visitorId: { startsWith: VISITOR_PREFIX } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

afterAll(async () => {
  if (!HAS_DB) return;
  await cleanRows();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('cookie consent retention (live database, fabrika_app)', () => {
  test('retention is the 1095 days the patron approved (26.11.2026)', () => {
    expect(COOKIE_CONSENT_RETENTION_DAYS).toBe(1095);
  });

  test('deletes rows older than the window, keeps the rest, and reports the count', async () => {
    await consent('old-1096d', ago(1096));
    await consent('old-2000d', ago(2000));
    await consent('fresh-1094d', ago(1094));
    await consent('fresh-today', ago(0));

    const expectedDeleted = await admin.cookieConsentRecord.count({
      where: { createdAt: { lt: new Date(NOW.getTime() - COOKIE_CONSENT_RETENTION_DAYS * DAY) } },
    });
    expect(expectedDeleted).toBeGreaterThanOrEqual(2);

    const result = await purgeOldCookieConsents({ now: NOW });

    expect(result.deletedCount).toBe(expectedDeleted);
    expect(result.retentionDays).toBe(1095);
    expect(await survivingVisitors()).toEqual(['fresh-1094d', 'fresh-today']);
  });

  test('is idempotent: a second run the same day deletes nothing', async () => {
    await consent('old-1100d', ago(1100));
    await purgeOldCookieConsents({ now: NOW });

    const again = await purgeOldCookieConsents({ now: NOW });

    expect(again.deletedCount).toBe(0);
  });

  test('a renewed choice does not remove the old row of the same visitor', async () => {
    await consent('same-visitor', ago(1200));
    await consent('same-visitor', ago(10));

    await purgeOldCookieConsents({ now: NOW });

    // Per row: only the 1200-day-old row goes; the fresh renewal of the same visitor stays.
    expect(await survivingVisitors()).toEqual(['same-visitor']);
    const left = await admin.cookieConsentRecord.findMany({
      where: { visitorId: `${VISITOR_PREFIX}same-visitor` },
      select: { createdAt: true },
    });
    expect(left).toHaveLength(1);
    expect(left[0]?.createdAt.getTime()).toBeGreaterThan(NOW.getTime() - 1095 * DAY);
  });
});
