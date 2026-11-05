import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * Live notification retention (ADR-0011 §3.4, TASK-MUVR24EHWI2RA) — real
 * Postgres, the `fabrika_app` role (NOBYPASSRLS), no mocks.
 *
 * pruneOldNotifications() deletes across EVERY tenant by date, so like
 * invitation-retention.live this file refuses to run on the shared local
 * database named `fabrika` outside GitHub Actions. CI's database is its own container.
 *
 * Singleton swap as in stripe-event-retention.live: the code under test runs as
 * fabrika_app, where an unscoped deleteMany would see no rows and report 0;
 * fixtures and counts go through the owner role.
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
import { NOTIFICATION_RETENTION_DAYS, pruneOldNotifications } from '@/lib/notifications/retention';
import { assertRlsSubjectRole, isGithubActions, requireRlsTestUrl, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'notification retention test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE ? await usedDatabaseName(prisma, admin, SUITE) : undefined;
const SHARED = DB_NAME === 'fabrika' && !isGithubActions();
if (SHARED) skipOrFailInCi(SUITE, 'the prune deletes across every tenant; refusing to run on the shared "fabrika" database');
const HAS_DB = DB_NAME !== undefined && !SHARED;
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const TENANTS = [`t-notifret-a-${RUN}`, `t-notifret-b-${RUN}`];
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe.skipIf(!HAS_DB)('notification retention (live, fabrika_app)', () => {
  beforeAll(async () => {
    for (const id of TENANTS) await admin.tenant.create({ data: { id, name: `Notif retention ${RUN}`, slug: id, country: 'TR' } });
  });

  afterAll(async () => {
    await admin.notification.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(TENANTS) } } });
    await admin.$disconnect();
  });

  test(`deletes rows older than ${NOTIFICATION_RETENTION_DAYS} days in every tenant, read or not, and keeps the rest`, async () => {
    expect(NOTIFICATION_RETENTION_DAYS).toBe(90);
    const rows = TENANTS.flatMap((tenantId) => [
      { tenantId, userId: `u-${RUN}`, type: 'SAVED_SEARCH_MATCH' as const, dedupeKey: `${tenantId}:old-unread`, createdAt: ago(91) },
      { tenantId, userId: `u-${RUN}`, type: 'SAVED_SEARCH_MATCH' as const, dedupeKey: `${tenantId}:old-read`, createdAt: ago(120), readAt: ago(100) },
      { tenantId, userId: `u-${RUN}`, type: 'SAVED_SEARCH_MATCH' as const, dedupeKey: `${tenantId}:young`, createdAt: ago(89) },
      { tenantId, userId: `u-${RUN}`, type: 'SAVED_SEARCH_MATCH' as const, dedupeKey: `${tenantId}:today`, createdAt: NOW },
    ]);
    await admin.notification.createMany({ data: rows });

    const deleted = await pruneOldNotifications(NOW);
    // At least this file's four old rows; another file's old rows would add to it.
    expect(deleted).toBeGreaterThanOrEqual(4);

    const left = await admin.notification.findMany({
      where: { tenantId: { in: TENANTS } },
      select: { dedupeKey: true },
      orderBy: { dedupeKey: 'asc' },
    });
    expect(left.map((r) => r.dedupeKey)).toEqual(
      TENANTS.flatMap((t) => [`${t}:today`, `${t}:young`]).sort()
    );

    // Idempotent: a second run finds none of this file's rows to delete.
    await pruneOldNotifications(NOW);
    expect(await admin.notification.count({ where: { tenantId: { in: TENANTS } } })).toBe(4);
  });
});
