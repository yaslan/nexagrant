import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live public lead (TASK-MULR765AR5G0C) — real Postgres, real Prisma, the
 * `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * submitPublicLead() is the readiness result screen's contact form;
 * purgeOldPublicLeads() is the nightly retention job, which deletes by date
 * across the whole table. On the shared local dev database that would delete
 * other people's rows, so this file refuses to run on a database named
 * `fabrika` outside CI — point DATABASE_URL / DATABASE_URL_RLS_TEST at a
 * throwaway database (docs/agent-results/TASK-MULR765AR5G0C-fe-fb.md §2).
 *
 * Singleton swap exactly as tests/invitation-retention.live.test.ts: the code
 * under test runs as fabrika_app, fixtures and counts go through the owner role.
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
import {
  PUBLIC_LEAD_CONSENT,
  PUBLIC_LEAD_EMAIL_LIMIT,
  PUBLIC_LEAD_IP_LIMIT,
  PUBLIC_LEAD_PURGED,
  PUBLIC_LEAD_RETENTION_DAYS,
  clientIpFrom,
  hashClientIp,
  purgeOldPublicLeads,
  submitPublicLead,
} from '@/lib/leads/public-lead';
import { publicLeadCleanupTask } from '@/lib/jobs/tasks/public-lead-cleanup';
import type { JobHelpers } from 'graphile-worker';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'public lead test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) {
  console.warn(`${SUITE} skipped: the purge deletes by date across the table; refusing to run on the shared "fabrika" database`);
}
const HAS_DB = REACHABLE && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const SECRET = 'test-secret-for-public-lead-ip-hash-0123456789';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = new Date();
const STARTED = new Date(NOW.getTime() - 1000);
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const mail = (label: string) => `${label}-${RUN}@example.test`;

function form(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Ayşe Yılmaz',
    email: mail('valid'),
    organisation: 'İlkadım Belediyesi',
    province: 'Samsun',
    district: 'İlkadım',
    readinessCode: 'municipality.111111111111111',
    consent: true,
    consentVersion: PUBLIC_LEAD_CONSENT.version,
    source: 'fon-hazirlik',
    locale: 'tr',
    website: '',
    ...overrides,
  };
}

async function rowsFor(email: string) {
  return admin.publicLead.findMany({ where: { email }, orderBy: { createdAt: 'asc' } });
}

async function purgeAudits() {
  return admin.auditEvent.findMany({ where: { type: PUBLIC_LEAD_PURGED, createdAt: { gte: STARTED } } });
}

async function seed(label: string, createdAt: Date, extra: { email?: string; ipHash?: string | null } = {}): Promise<string> {
  const row = await admin.publicLead.create({
    data: {
      name: 'Seed',
      email: extra.email ?? mail(label),
      ipHash: extra.ipHash ?? null,
      organisation: 'Seed org',
      consentVersion: PUBLIC_LEAD_CONSENT.version,
      consentAt: createdAt,
      source: 'fon-hazirlik',
      locale: 'tr',
      createdAt,
    },
  });
  return row.email;
}

async function labelsLeft(): Promise<string[]> {
  const rows = await admin.publicLead.findMany({ where: { email: { endsWith: `-${RUN}@example.test` } } });
  return rows.map((r) => r.email.replace(`-${RUN}@example.test`, '')).sort();
}

function helpersFor(): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '1', attempts: 1, max_attempts: 5 } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

async function cleanRows(): Promise<void> {
  await admin.publicLead.deleteMany({ where: { email: { endsWith: `-${RUN}@example.test` } } });
  // Literal type, not the imported constant: tests/teardown-where-guard.test.ts.
  await admin.auditEvent.deleteMany({ where: { type: 'public_lead.purged', createdAt: { gte: STARTED } } });
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
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('public lead form (live database, fabrika_app)', () => {
  test('a valid request is stored once, with the score recomputed on the server and no raw IP', async () => {
    const result = await submitPublicLead(
      form({ email: `  ${mail('Valid').toUpperCase()}  `, readinessTotal: 100, readinessLevel: 'hazir' }),
      { ip: '203.0.113.7', now: NOW, secret: SECRET }
    );
    expect(result).toEqual({ ok: true });

    const rows = await rowsFor(mail('valid'));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({
      name: 'Ayşe Yılmaz',
      email: mail('valid'),
      organisation: 'İlkadım Belediyesi',
      province: 'Samsun',
      district: 'İlkadım',
      readinessCode: 'municipality.111111111111111',
      // All "1" = 50/100 gelişen, whatever the client claimed.
      readinessTotal: 50,
      readinessLevel: 'gelisen',
      consentVersion: PUBLIC_LEAD_CONSENT.version,
      source: 'fon-hazirlik',
      locale: 'tr',
      ipHash: hashClientIp('203.0.113.7', SECRET),
    });
    expect(row.consentAt.getTime()).toBe(NOW.getTime());
    expect(JSON.stringify(row)).not.toContain('203.0.113.7');
  });

  test('no consent, or consent to an older text, stores nothing', async () => {
    expect(await submitPublicLead(form({ email: mail('noconsent'), consent: false }), { now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'consent_required',
    });
    expect(await submitPublicLead(form({ email: mail('noconsent'), consent: 'on' }), { now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'consent_required',
    });
    expect(
      await submitPublicLead(form({ email: mail('noconsent'), consentVersion: '2020-01-01.1' }), { now: NOW, secret: SECRET })
    ).toEqual({ ok: false, error: 'consent_outdated' });
    expect(await rowsFor(mail('noconsent'))).toHaveLength(0);
  });

  test('invalid fields are named and nothing is stored', async () => {
    const result = await submitPublicLead(
      form({ name: 'A', email: 'not-an-address', organisation: '', province: 'Atlantis', district: 'x'.repeat(81) }),
      { now: NOW, secret: SECRET }
    );
    expect(result).toEqual({ ok: false, error: 'invalid', fields: ['name', 'email', 'organisation', 'province', 'district'] });
    expect(await admin.publicLead.count({ where: { email: 'not-an-address' } })).toBe(0);
  });

  test('a malformed result code is dropped, not stored', async () => {
    expect(await submitPublicLead(form({ email: mail('badcode'), readinessCode: 'municipality.9' }), { now: NOW, secret: SECRET })).toEqual({ ok: true });
    const [row] = await rowsFor(mail('badcode'));
    expect(row).toMatchObject({ readinessCode: null, readinessTotal: null, readinessLevel: null });
  });

  test('a filled honeypot answers ok and stores nothing', async () => {
    expect(await submitPublicLead(form({ email: mail('bot'), website: 'https://spam.example' }), { now: NOW, secret: SECRET })).toEqual({
      ok: true,
    });
    expect(await rowsFor(mail('bot'))).toHaveLength(0);
  });

  test(`the same address is refused after ${PUBLIC_LEAD_EMAIL_LIMIT} requests in a day, whatever the IP`, async () => {
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) {
      expect(await submitPublicLead(form({ email: mail('repeat') }), { ip: `198.51.100.${i}`, now: NOW, secret: SECRET })).toEqual({ ok: true });
    }
    expect(await submitPublicLead(form({ email: mail('REPEAT') }), { ip: '198.51.100.99', now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    expect(await rowsFor(mail('repeat'))).toHaveLength(PUBLIC_LEAD_EMAIL_LIMIT);
    // A day later the window has moved on.
    expect(
      await submitPublicLead(form({ email: mail('repeat') }), { ip: '198.51.100.99', now: new Date(NOW.getTime() + DAY + 1000), secret: SECRET })
    ).toEqual({ ok: true });
  });

  test(`one IP is refused after ${PUBLIC_LEAD_IP_LIMIT} requests in an hour, whatever the address`, async () => {
    const ip = '192.0.2.44';
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) {
      expect(await submitPublicLead(form({ email: mail(`ip${i}`) }), { ip, now: NOW, secret: SECRET })).toEqual({ ok: true });
    }
    expect(await submitPublicLead(form({ email: mail('ip-over') }), { ip, now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    expect(await rowsFor(mail('ip-over'))).toHaveLength(0);
    // Another IP is not affected.
    expect(await submitPublicLead(form({ email: mail('ip-other') }), { ip: '192.0.2.45', now: NOW, secret: SECRET })).toEqual({ ok: true });
  });

  // İNCELEME-50 Y-1: every request above ran at one instant, so shrinking either
  // window changed nothing. Earlier requests just inside and just outside each window.
  test('the address window is 24 hours: 23 h ago still counts, 25 h ago no longer', async () => {
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) await seed(`win-mail-in${i}`, new Date(NOW.getTime() - 23 * HOUR), { email: mail('win-mail') });
    expect(await submitPublicLead(form({ email: mail('win-mail') }), { ip: '192.0.2.60', now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) await seed(`win-mail-out${i}`, new Date(NOW.getTime() - 25 * HOUR), { email: mail('win-old') });
    expect(await submitPublicLead(form({ email: mail('win-old') }), { ip: '192.0.2.61', now: NOW, secret: SECRET })).toEqual({ ok: true });
  });

  test('the IP window is 1 hour: 59 min ago still counts, 61 min ago no longer', async () => {
    const inside = hashClientIp('192.0.2.70', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) await seed(`win-ip-in${i}`, new Date(NOW.getTime() - 59 * MINUTE), { ipHash: inside });
    expect(await submitPublicLead(form({ email: mail('win-ip-new') }), { ip: '192.0.2.70', now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    const outside = hashClientIp('192.0.2.71', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) await seed(`win-ip-out${i}`, new Date(NOW.getTime() - 61 * MINUTE), { ipHash: outside });
    expect(await submitPublicLead(form({ email: mail('win-ip-old') }), { ip: '192.0.2.71', now: NOW, secret: SECRET })).toEqual({ ok: true });
  });

  // İNCELEME-61 Ö-1: the exact edges, 1 ms apart, so `gte`→`gt` or a slightly longer window goes red.
  test('both windows include their exact edge and nothing 1 ms before it', async () => {
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) await seed(`edge-mail-at${i}`, new Date(NOW.getTime() - DAY), { email: mail('edge-mail-at') });
    expect(await submitPublicLead(form({ email: mail('edge-mail-at') }), { ip: '192.0.2.80', now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    for (let i = 0; i < PUBLIC_LEAD_EMAIL_LIMIT; i++) await seed(`edge-mail-before${i}`, new Date(NOW.getTime() - DAY - 1), { email: mail('edge-mail-before') });
    expect(await submitPublicLead(form({ email: mail('edge-mail-before') }), { ip: '192.0.2.81', now: NOW, secret: SECRET })).toEqual({ ok: true });

    const at = hashClientIp('192.0.2.82', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) await seed(`edge-ip-at${i}`, new Date(NOW.getTime() - HOUR), { ipHash: at });
    expect(await submitPublicLead(form({ email: mail('edge-ip-at-new') }), { ip: '192.0.2.82', now: NOW, secret: SECRET })).toEqual({
      ok: false,
      error: 'rate_limited',
    });
    const before = hashClientIp('192.0.2.83', SECRET);
    for (let i = 0; i < PUBLIC_LEAD_IP_LIMIT; i++) await seed(`edge-ip-before${i}`, new Date(NOW.getTime() - HOUR - 1), { ipHash: before });
    expect(await submitPublicLead(form({ email: mail('edge-ip-before-new') }), { ip: '192.0.2.83', now: NOW, secret: SECRET })).toEqual({
      ok: true,
    });
  });

  // İNCELEME-61 B-1: one IPv6 host rotating through its own /64 stays in one bucket.
  test('addresses rotated inside one IPv6 /64 share one IP bucket', async () => {
    const results = [];
    for (let i = 0; i <= PUBLIC_LEAD_IP_LIMIT + 1; i++) {
      const hdr = { get: (k: string) => (k.toLowerCase() === 'x-forwarded-for' ? `10.9.${i}.1, 2001:db8:61:61::${(0xb1 + i).toString(16)}` : null) };
      results.push((await submitPublicLead(form({ email: mail(`v6r${i}`) }), { ip: clientIpFrom(hdr, 1), now: NOW, secret: SECRET })).ok);
    }
    expect(results).toEqual([...Array(PUBLIC_LEAD_IP_LIMIT).fill(true), false, false]);
    const stored = await admin.publicLead.findMany({ where: { email: { startsWith: 'v6r', endsWith: `-${RUN}@example.test` } } });
    expect(new Set(stored.map((r) => r.ipHash))).toEqual(new Set([hashClientIp('2001:db8:61:61::1', SECRET)]));
    // The next /64 is another subscriber.
    expect(await submitPublicLead(form({ email: mail('v6other') }), { ip: '2001:db8:61:62::b1', now: NOW, secret: SECRET })).toEqual({ ok: true });
  });

  // İNCELEME-50 B-1, as the documented nginx delivers it: "<client-sent>, <real peer>".
  test('a forged first X-Forwarded-For hop does not open a new IP bucket', async () => {
    const real = '198.51.100.77';
    const results = [];
    for (let i = 0; i <= PUBLIC_LEAD_IP_LIMIT + 1; i++) {
      const hdr = { get: (k: string) => (k.toLowerCase() === 'x-forwarded-for' ? `10.9.${i}.1, ${real}` : null) };
      const ip = clientIpFrom(hdr, 1);
      results.push((await submitPublicLead(form({ email: mail(`xff${i}`) }), { ip, now: NOW, secret: SECRET })).ok);
    }
    // 12 requests: the first 10 pass, the 11th and 12th are refused.
    expect(results).toEqual([...Array(PUBLIC_LEAD_IP_LIMIT).fill(true), false, false]);
    const stored = await admin.publicLead.findMany({ where: { email: { startsWith: 'xff', endsWith: `-${RUN}@example.test` } } });
    expect(stored).toHaveLength(PUBLIC_LEAD_IP_LIMIT);
    expect(new Set(stored.map((r) => r.ipHash))).toEqual(new Set([hashClientIp(real, SECRET)]));
  });

  test('concurrent requests cannot both slip past the address limit', async () => {
    const results = await Promise.all(
      Array.from({ length: PUBLIC_LEAD_EMAIL_LIMIT + 3 }, (_, i) =>
        submitPublicLead(form({ email: mail('race') }), { ip: `203.0.113.${100 + i}`, now: NOW, secret: SECRET })
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(PUBLIC_LEAD_EMAIL_LIMIT);
    expect(await rowsFor(mail('race'))).toHaveLength(PUBLIC_LEAD_EMAIL_LIMIT);
  });
});

describe.skipIf(!HAS_DB)('public lead retention (live database, fabrika_app)', () => {
  test('deletes only requests older than the window; the edge stays', async () => {
    await seed('old-400d', ago(400));
    await seed('past-edge', new Date(ago(PUBLIC_LEAD_RETENTION_DAYS).getTime() - 1));
    await seed('at-edge', ago(PUBLIC_LEAD_RETENTION_DAYS));
    await seed('recent-364d', ago(364));
    await seed('today', NOW);

    const result = await purgeOldPublicLeads({ now: NOW });

    expect(result).toMatchObject({ deletedCount: 2, retentionDays: 365 });
    expect(await labelsLeft()).toEqual(['at-edge', 'recent-364d', 'today']);
  });

  test('writes one public_lead.purged audit with the count and no person; a second run changes nothing', async () => {
    await seed('a1', ago(500));
    await seed('a2', ago(370));
    await seed('keep', ago(10));

    const first = await purgeOldPublicLeads({ now: NOW });
    expect(first.deletedCount).toBe(2);
    const audits = await purgeAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ tenantId: null, actorId: null });
    expect(audits[0]!.data).toEqual({ count: 2, retentionDays: 365, cutoff: first.cutoff });
    expect(JSON.stringify(audits)).not.toContain('@example.test');

    const second = await purgeOldPublicLeads({ now: NOW });
    expect(second.deletedCount).toBe(0);
    expect(await purgeAudits()).toHaveLength(1);
    expect(await labelsLeft()).toEqual(['keep']);
  });

  test('the nightly job purges by its cron tick', async () => {
    await seed('by-tick', ago(366));
    await seed('keep-tick', ago(300));
    // A tick 100 days in the past: then, "by-tick" was only 266 days old.
    await publicLeadCleanupTask({ _cron: { ts: ago(100).toISOString() } }, helpersFor());
    expect(await labelsLeft()).toEqual(['by-tick', 'keep-tick']);
    await publicLeadCleanupTask({ _cron: { ts: NOW.toISOString() } }, helpersFor());
    expect(await labelsLeft()).toEqual(['keep-tick']);
  });
});
