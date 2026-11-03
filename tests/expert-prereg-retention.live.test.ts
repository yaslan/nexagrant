import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live expert pre-registration retention (FO-50, TASK-MVC91K7JYOWQC) — real Postgres,
 * real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * purgeOldExpertPreRegistrations() is the nightly job. It deletes by date across the
 * whole table, so on the shared local `fabrika` database it would delete other people's
 * rows. This file refuses to run there outside GitHub Actions; point DATABASE_URL_RLS_TEST at a
 * throwaway database, as tests/public-lead.live.test.ts does.
 *
 * Founder numbers are seeded above the last one given, so the file never collides with
 * the founder-number races that run on the same table (serialised by
 * acquireExpertPreRegLiveLock). The founder counter is put back after every test.
 *
 * K-568932 = A: the purge deletes the holder of the highest founder number too; the
 * number stays taken in ExpertFounderCounter, so the next verification gets the one after.
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

import { randomBytes } from 'node:crypto';
import { createDbClient, prisma } from '@/lib/db';
import { hashSecretToken } from '@/lib/secret-token';
import { EXPERT_PREREG_RETENTION_DAYS, FOUNDER_SEAT_LIMIT } from '@/lib/expert-prereg/server/constants';
import { lastFounderNumberGiven, recordFounderNumberGiven } from '@/lib/expert-prereg/server/founder-counter';
import { withSystemScope } from '@/lib/system-scope';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';
import { getRemainingFounderSeats } from '@/lib/expert-prereg/server/seats';
import { EXPERT_PREREG_PURGED, purgeOldExpertPreRegistrations } from '@/lib/expert-prereg/server/retention';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';
import { acquireExpertPreRegLiveLock, holdFounderCounter } from './helpers/expert-prereg-live-lock';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'expert pre-registration retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the purge deletes by date across the table; refusing to run on the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const STARTED = new Date(NOW.getTime() - 1000);
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const mail = (label: string) => `${label}-${RUN}@example.test`;

let releaseLock: (() => Promise<void>) | undefined;
let restoreCounter: (() => Promise<void>) | undefined;

/** Last founder number given before this file seeds anything; the file's numbers sit above it. */
let base = 0;

/**
 * A row as the form leaves it; a founder number also raises the counter, as the
 * verification does (`counter: false` leaves it behind, like a row written by hand).
 */
async function seed(
  label: string,
  createdAt: Date,
  founderNumber: number | null = null,
  opts: { counter?: boolean; tokenHash?: string } = {}
): Promise<void> {
  await admin.expertPreRegistration.create({
    data: {
      fullName: 'Seed Uzman',
      email: mail(label),
      province: '06',
      isFreelancer: false,
      expertiseAreas: [],
      roles: [],
      programmes: [],
      languages: [],
      kvkkAcceptedAt: createdAt,
      visibilityConsentAt: createdAt,
      locale: 'tr',
      status: founderNumber === null ? 'pending' : 'verified',
      founderNumber,
      verifyTokenHash: opts.tokenHash ?? null,
      verifyTokenExpiresAt: opts.tokenHash ? new Date(Date.now() + DAY) : null,
      createdAt,
    },
  });
  if (founderNumber !== null && opts.counter !== false) {
    await admin.expertFounderCounter.upsert({
      where: { id: 1 },
      create: { id: 1, lastNumber: founderNumber },
      update: { lastNumber: founderNumber },
    });
  }
}

async function counterValue(): Promise<number | undefined> {
  return (await admin.expertFounderCounter.findUnique({ where: { id: 1 } }))?.lastNumber;
}

async function counterRow() {
  return admin.expertFounderCounter.findUnique({ where: { id: 1 } });
}

async function labelsLeft(): Promise<string[]> {
  const rows = await admin.expertPreRegistration.findMany({
    where: { email: { endsWith: `-${RUN}@example.test` } },
  });
  return rows.map((r) => r.email.replace(`-${RUN}@example.test`, '')).sort();
}

async function purgeAudits() {
  return admin.auditEvent.findMany({
    where: { type: EXPERT_PREREG_PURGED, createdAt: { gte: STARTED } },
  });
}

async function cleanRows(): Promise<void> {
  await admin.expertPreRegistration.deleteMany({
    where: { email: { endsWith: `-${RUN}@example.test` } },
  });
  // Literal type, not the imported constant: tests/teardown-where-guard.test.ts.
  await admin.auditEvent.deleteMany({
    where: { type: 'expert_prereg.purged', createdAt: { gte: STARTED } },
  });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  releaseLock = await acquireExpertPreRegLiveLock();
  restoreCounter = await holdFounderCounter(admin);
  await cleanRows();
  base = await lastFounderNumberGiven(admin);
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanRows();
  await restoreCounter?.();
});

afterAll(async () => {
  if (!HAS_DB) return;
  await restoreCounter?.();
  await releaseLock?.();
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('expert pre-registration retention (live database, fabrika_app)', () => {
  test('the window is one year: the edge stays, one millisecond past it goes', async () => {
    await seed('past-edge', new Date(ago(EXPERT_PREREG_RETENTION_DAYS).getTime() - 1));
    await seed('at-edge', ago(EXPERT_PREREG_RETENTION_DAYS));
    await seed('recent-364d', ago(364));
    await seed('old-366d', ago(366));

    const result = await purgeOldExpertPreRegistrations({ now: NOW });

    expect(result).toMatchObject({ deletedCount: 2, retentionDays: 365 });
    expect(await labelsLeft()).toEqual(['at-edge', 'recent-364d']);
  });

  test('deletes verified and unverified rows alike', async () => {
    await seed('pending-old', ago(370));
    await seed('verified-old', ago(370), base + 1);
    await seed('verified-new', ago(10), base + 2);

    await purgeOldExpertPreRegistrations({ now: NOW });

    expect(await labelsLeft()).toEqual(['verified-new']);
  });

  test('deletes the row holding the highest founder number too; the number stays taken and the seats do not move', async () => {
    await seed('founder-1', ago(400), base + 1);
    await seed('founder-2', ago(400), base + 2);
    await seed('founder-top', ago(400), base + 3);
    const seatsBefore = await getRemainingFounderSeats();

    const result = await purgeOldExpertPreRegistrations({ now: NOW });

    expect(result.deletedCount).toBe(3);
    expect(await labelsLeft()).toEqual([]);
    expect(await counterValue()).toBe(base + 3);
    expect(await getRemainingFounderSeats()).toBe(seatsBefore);
    expect(seatsBefore).toBe(Math.max(0, FOUNDER_SEAT_LIMIT - (base + 3)));
  });

  test('after the top founder row is purged, a new verification gets the next number, not the freed one', async () => {
    await seed('founder-top', ago(400), base + 1);
    await purgeOldExpertPreRegistrations({ now: NOW });
    expect(await labelsLeft()).toEqual([]);

    const token = randomBytes(32).toString('hex');
    await seed('newcomer', ago(0), null, { tokenHash: hashSecretToken(token) });
    const verified = await verifyExpertPreRegistration(token);

    const expected = base + 2 <= FOUNDER_SEAT_LIMIT ? base + 2 : null;
    expect(verified).toMatchObject({ ok: true, founderNumber: expected });
    if (expected !== null) expect(await counterValue()).toBe(expected);
  });

  test('a founder number the counter missed (row written by hand) is recorded before its row goes', async () => {
    await seed('stray-top', ago(400), base + 5, { counter: false });
    expect(await counterValue()).not.toBe(base + 5);

    await purgeOldExpertPreRegistrations({ now: NOW });

    expect(await labelsLeft()).toEqual([]);
    expect(await counterValue()).toBe(base + 5);
    expect(await getRemainingFounderSeats()).toBe(Math.max(0, FOUNDER_SEAT_LIMIT - (base + 5)));
  });

  test('a purge that changes nothing leaves the counter row untouched (updatedAt too)', async () => {
    await seed('founder-top', ago(10), base + 2);
    const before = await counterRow();
    expect(before?.lastNumber).toBe(base + 2);

    await purgeOldExpertPreRegistrations({ now: NOW });
    await purgeOldExpertPreRegistrations({ now: NOW });

    expect(await counterRow()).toEqual(before);
  });

  test('the database refuses to lower the counter; the app role cannot delete it (crw-fb Ö-1)', async () => {
    await seed('founder-top', ago(10), base + 3);

    // App role, inside the system scope the real writers use: a lowering UPDATE is refused.
    await expect(
      withSystemScope('cross-tenant-job', 'test.counter-lower', (tx) =>
        tx.expertFounderCounter.update({ where: { id: 1 }, data: { lastNumber: base + 1 } })
      )
    ).rejects.toThrow(/only goes up/);
    // ... and so is a DELETE (no privilege), which would free the numbers of purged rows.
    await expect(
      withSystemScope('cross-tenant-job', 'test.counter-delete', (tx) => tx.expertFounderCounter.deleteMany({ where: { id: 1 } }))
    ).rejects.toThrow(/permission denied/);
    // The code path itself never lowers: a smaller value is a no-op.
    await withSystemScope('cross-tenant-job', 'test.counter-record', (tx) => recordFounderNumberGiven(tx, base + 1));
    // The owner is refused the lowering UPDATE too (the trigger is for every role).
    await expect(admin.expertFounderCounter.update({ where: { id: 1 }, data: { lastNumber: 0 } })).rejects.toThrow(
      /only goes up/
    );

    expect(await counterValue()).toBe(base + 3);
    expect(await getRemainingFounderSeats()).toBe(Math.max(0, FOUNDER_SEAT_LIMIT - (base + 3)));
  });

  test('writes one expert_prereg.purged audit with the count and no person; a second run changes nothing', async () => {
    await seed('a1', ago(500));
    await seed('a2', ago(370));
    await seed('keep', ago(10));

    const first = await purgeOldExpertPreRegistrations({ now: NOW });
    expect(first.deletedCount).toBe(2);
    const audits = await purgeAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ tenantId: null, actorId: null });
    expect(audits[0]!.data).toEqual({
      count: 2,
      retentionDays: 365,
      cutoff: first.cutoff,
    });
    expect(JSON.stringify(audits)).not.toContain('@example.test');

    const counterAfterFirst = await counterRow();
    const second = await purgeOldExpertPreRegistrations({ now: NOW });
    expect(second.deletedCount).toBe(0);
    // crw-fb Ö-2: the second run writes nothing to the counter, not even updatedAt.
    expect(await counterRow()).toEqual(counterAfterFirst);
    expect(await purgeAudits()).toHaveLength(1);
    expect(await labelsLeft()).toEqual(['keep']);
  });
});
