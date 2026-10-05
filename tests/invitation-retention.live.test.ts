import { describe, test, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

/**
 * Live invitation retention (TASK-MUN2J9LLXNREG) — real Postgres, real Prisma,
 * the `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * purgeOldInvitations() deletes across EVERY tenant by date. On the shared
 * local dev database that would delete other people's old invitations, so this
 * file refuses to run on a database named `fabrika` outside CI. Locally, point
 * DATABASE_URL / DATABASE_URL_RLS_TEST at a throwaway database (see
 * docs/agent-results/TASK-MUN2J9LLXNREG-cs-fb.md for the recipe). CI's
 * database is its own container and is thrown away with the job.
 *
 * Singleton swap exactly as tests/stripe-event-retention.live.test.ts: the code
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
  INVITATION_PURGED,
  INVITATION_RETENTION_DAYS,
  purgeOldInvitations,
} from '@/lib/invitations/retention';
import { invitationCleanupTask } from '@/lib/jobs/tasks/invitation-cleanup';
import type { JobHelpers } from 'graphile-worker';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'invitation retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) {
  console.warn(`${SUITE} skipped: the purge deletes across every tenant; refusing to run on the shared "fabrika" database`);
}
const HAS_DB = REACHABLE && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const TENANT_A = `t-invret-a-${RUN}`;
const TENANT_B = `t-invret-b-${RUN}`;
const TENANTS = [TENANT_A, TENANT_B];
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let seq = 0;
async function invite(tenantId: string, label: string, expires: Date, acceptedAt: Date | null = null): Promise<string> {
  seq += 1;
  const row = await admin.invitation.create({
    data: {
      tenantId,
      email: `${label}-${RUN}@example.test`,
      tokenHash: `invret-${RUN}-${seq}`.padEnd(64, '0'),
      expires,
      acceptedAt,
      createdAt: new Date(expires.getTime() - 7 * DAY),
    },
  });
  return row.email;
}

async function emailsLeft(): Promise<string[]> {
  const rows = await admin.invitation.findMany({ where: { tenantId: { in: TENANTS } }, select: { email: true } });
  return rows.map((r) => r.email.replace(`-${RUN}@example.test`, '')).sort();
}

async function purgeAudits() {
  return admin.auditEvent.findMany({
    where: { tenantId: { in: TENANTS }, type: INVITATION_PURGED },
    orderBy: { tenantId: 'asc' },
  });
}

function helpersFor(): JobHelpers {
  const noop = () => {};
  return {
    job: { id: '1', attempts: 1, max_attempts: 5 } as unknown as JobHelpers['job'],
    logger: { info: noop, warn: noop, error: noop, debug: noop } as unknown as JobHelpers['logger'],
  } as unknown as JobHelpers;
}

async function cleanRows(): Promise<void> {
  await admin.invitation.deleteMany({ where: { tenantId: { in: TENANTS } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: TENANTS } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  await cleanRows();
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  for (const id of TENANTS) {
    await admin.tenant.create({ data: { id, name: `Invitation retention ${RUN}`, slug: id, country: 'TR' } });
  }
});

afterEach(async () => {
  if (!HAS_DB) return;
  await cleanRows();
});

afterAll(async () => {
  if (!HAS_DB) return;
  await admin.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  await admin.$disconnect();
});

describe.skipIf(!HAS_DB)('invitation retention (live database, fabrika_app)', () => {
  test('deletes used and expired invitations past the window, keeps pending and recent ones', async () => {
    await invite(TENANT_A, 'expired-31d', ago(31));
    await invite(TENANT_A, 'expired-29d', ago(29));
    await invite(TENANT_A, 'pending', new Date(NOW.getTime() + 5 * DAY));
    await invite(TENANT_A, 'accepted-31d', ago(25), ago(31));
    await invite(TENANT_A, 'accepted-29d', ago(23), ago(29));
    await invite(TENANT_B, 'b-expired-60d', ago(60));

    const result = await purgeOldInvitations({ now: NOW });

    expect(result).toMatchObject({ deletedCount: 3, tenantCount: 2, retentionDays: INVITATION_RETENTION_DAYS });
    expect(await emailsLeft()).toEqual(['accepted-29d', 'expired-29d', 'pending']);
  });

  test('an accepted row is judged by when it was accepted, not by its link expiry', async () => {
    // Accepted 10 days ago on a link that "expired" 40 days ago: recent use, kept.
    await invite(TENANT_A, 'accepted-recent-old-link', ago(40), ago(10));
    // Accepted 31 days ago on a link that expires in the future: old use, deleted.
    await invite(TENANT_A, 'accepted-old-live-link', new Date(NOW.getTime() + 2 * DAY), ago(31));

    expect((await purgeOldInvitations({ now: NOW })).deletedCount).toBe(1);
    expect(await emailsLeft()).toEqual(['accepted-recent-old-link']);
  });

  test('the cutoff is strict: a row exactly at the edge stays', async () => {
    await invite(TENANT_A, 'at-edge', ago(INVITATION_RETENTION_DAYS));
    await invite(TENANT_A, 'one-ms-past', new Date(ago(INVITATION_RETENTION_DAYS).getTime() - 1));

    expect((await purgeOldInvitations({ now: NOW })).deletedCount).toBe(1);
    expect(await emailsLeft()).toEqual(['at-edge']);
  });

  test('writes one invitation.purged audit per tenant with the count and no address; a second run changes nothing', async () => {
    await invite(TENANT_A, 'a1', ago(40));
    await invite(TENANT_A, 'a2', ago(50), ago(45));
    await invite(TENANT_B, 'b1', ago(35));
    await invite(TENANT_B, 'b-keep', ago(3));

    const first = await purgeOldInvitations({ now: NOW });
    expect(first).toMatchObject({ deletedCount: 3, tenantCount: 2 });

    const audits = await purgeAudits();
    expect(audits.map((a) => [a.tenantId, a.actorId, (a.data as { count: number }).count])).toEqual(
      [
        [TENANT_A, null, 2],
        [TENANT_B, null, 1],
      ].sort((x, y) => String(x[0]).localeCompare(String(y[0])))
    );
    for (const a of audits) {
      expect(a.data).toEqual({ count: expect.any(Number), retentionDays: 30, cutoff: first.cutoff });
      expect(JSON.stringify(a)).not.toContain('@example.test');
    }

    const second = await purgeOldInvitations({ now: NOW });
    expect(second).toMatchObject({ deletedCount: 0, tenantCount: 0 });
    expect(await purgeAudits()).toHaveLength(2);
    expect(await emailsLeft()).toEqual(['b-keep']);
  });

  test('refuses a window that would reach pending invitations, before touching the database', async () => {
    await invite(TENANT_A, 'pending', new Date(NOW.getTime() + 5 * DAY));
    await invite(TENANT_A, 'expired-1d', ago(1));

    for (const bad of [0, -1, 0.5, Number.NaN]) {
      await expect(purgeOldInvitations({ now: NOW, retentionDays: bad })).rejects.toThrow(RangeError);
    }
    await expect(purgeOldInvitations({ now: new Date('garbage') })).rejects.toThrow(RangeError);
    expect(await emailsLeft()).toEqual(['expired-1d', 'pending']);
    expect(await purgeAudits()).toHaveLength(0);
  });

  test('the job purges by its cron tick and reports the result', async () => {
    await invite(TENANT_A, 'expired-31d', ago(31));
    await invite(TENANT_A, 'pending', new Date(NOW.getTime() + 5 * DAY));

    await invitationCleanupTask({ _cron: { ts: NOW.toISOString() } }, helpersFor());

    expect(await emailsLeft()).toEqual(['pending']);
    expect(await purgeAudits()).toHaveLength(1);
  });
});
