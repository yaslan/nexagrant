import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live expert pre-registration retention (FO-50, TASK-MVC91K7JYOWQC) — real Postgres,
 * real Prisma, the `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * purgeOldExpertPreRegistrations() is the nightly job. It deletes by date across the
 * whole table, so on the shared local `fabrika` database it would delete other people's
 * rows. This file refuses to run there outside CI; point DATABASE_URL_RLS_TEST at a
 * throwaway database, as tests/public-lead.live.test.ts does.
 *
 * Founder numbers are seeded above the current maximum, so the file never collides with
 * the founder-number races that run on the same table (serialised by
 * acquireExpertPreRegLiveLock).
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
import { EXPERT_PREREG_RETENTION_DAYS } from '@/lib/expert-prereg/server/constants';
import { getRemainingFounderSeats } from '@/lib/expert-prereg/server/seats';
import { EXPERT_PREREG_PURGED, purgeOldExpertPreRegistrations } from '@/lib/expert-prereg/server/retention';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { acquireExpertPreRegLiveLock } from './helpers/expert-prereg-live-lock';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'expert pre-registration retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) {
  console.warn(
    `${SUITE} skipped: the purge deletes by date across the table; refusing to run on the shared "fabrika" database`
  );
}
const HAS_DB = REACHABLE && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const STARTED = new Date(NOW.getTime() - 1000);
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
const mail = (label: string) => `${label}-${RUN}@example.test`;

let releaseLock: (() => Promise<void>) | undefined;

/** Highest founder number before this file seeds anything; the file's numbers sit above it. */
let base = 0;

async function seed(label: string, createdAt: Date, founderNumber: number | null = null): Promise<void> {
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
      createdAt,
    },
  });
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
  await cleanRows();
  const top = await admin.expertPreRegistration.aggregate({
    _max: { founderNumber: true },
  });
  base = top._max.founderNumber ?? 0;
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

afterAll(async () => {
  if (!HAS_DB) return;
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

  test('keeps the row holding the highest founder number, so the number is never handed out again', async () => {
    await seed('founder-1', ago(400), base + 1);
    await seed('founder-2', ago(400), base + 2);
    await seed('founder-top', ago(400), base + 3);

    await purgeOldExpertPreRegistrations({ now: NOW });

    expect(await labelsLeft()).toEqual(['founder-top']);
    const top = await admin.expertPreRegistration.aggregate({
      _max: { founderNumber: true },
    });
    expect(top._max.founderNumber).toBe(base + 3);
  });

  test('seat count is unchanged by the purge, and the next founder number is the one after the kept maximum', async () => {
    await seed('founder-1', ago(400), base + 1);
    await seed('founder-2', ago(400), base + 2);
    await seed('founder-top', ago(400), base + 3);
    const before = await getRemainingFounderSeats();

    await purgeOldExpertPreRegistrations({ now: NOW });

    expect(await getRemainingFounderSeats()).toBe(before);
    expect(before).toBe(Math.max(0, 100 - (base + 3)));
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

    const second = await purgeOldExpertPreRegistrations({ now: NOW });
    expect(second.deletedCount).toBe(0);
    expect(await purgeAudits()).toHaveLength(1);
    expect(await labelsLeft()).toEqual(['keep']);
  });
});
