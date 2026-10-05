import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

/**
 * ADR-0011 notification store (TASK-MUVR24EHWI2RA) — real Postgres, the
 * `fabrika_app` role (NOBYPASSRLS), real server actions.
 *
 * Two isolations, measured separately because they are enforced in different
 * places:
 *   - tenant: the `tenant_isolation` RLS policy. Measured under fabrika_app, so
 *     a missing policy (or a query outside withTenant) reads zero rows here
 *     instead of passing on a superuser that sees everything.
 *   - user: the `userId` filter of src/lib/notifications/store.ts (K-5 a). RLS
 *     does not know the user, so these tests are the only guard on it: U2 of
 *     the same tenant must neither see nor mark U1's rows.
 *
 * Every mark-read test reads `readAt` back from the table through the owner
 * role. A markNotificationsRead that answers ok and writes nothing goes red
 * (mutant in docs/agent-results/TASK-MUVR24EHWI2RA-be-fb.md).
 *
 * Only `auth()` is faked. Singleton swap as in stripe-event-retention.live:
 * the code under test runs as fabrika_app, fixtures go through the owner role.
 * Rows are tagged with this run's tenants, so the file is safe on a shared DB.
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

const s = vi.hoisted(() => ({ session: null as Record<string, unknown> | null }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => s.session) }));

import { createDbClient, prisma, withTenant } from '@/lib/db';
import { listNotifications, markNotificationsRead } from '@/actions/user/notifications';
import { recordNotification, savedSearchDedupeKey } from '@/lib/notifications/store';
import { sendSavedSearchAlerts } from '@/lib/jobs/tasks/alerts-daily';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { skipUnlessSeeded } from './helpers/seed';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'notifications live test';

const HAS_DB =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !HAS_DB) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');
if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = `notif-${Math.random().toString(36).slice(2, 10)}`;
/** Older than every Topic, so a search with this `lastRunAt` has matches. */
const LONG_AGO = new Date('2000-01-01T00:00:00Z');

type Who = 'u1' | 'u2' | 'u3';
const fx: { tenantA?: string; tenantB?: string; users: Partial<Record<Who, string>> } = { users: {} };

function as(who: Who) {
  const id = requireId(fx.users[who], who);
  const tenantId = who === 'u3' ? fx.tenantB : fx.tenantA;
  s.session = { user: { id, email: `${who}@${RUN}.test` }, tenantId, role: who === 'u1' ? 'TENANT_OWNER' : 'MEMBER' };
}

/** One notification written through the owner role (fixtures do not go through RLS). */
async function seedNotification(who: Who, label: string, createdAt?: Date) {
  const tenantId = requireId(who === 'u3' ? fx.tenantB : fx.tenantA, 'tenant');
  const row = await admin.notification.create({
    data: {
      tenantId,
      userId: requireId(fx.users[who], who),
      type: 'SAVED_SEARCH_MATCH',
      payload: { searchId: `${RUN}-${label}`, matchCount: 1 },
      dedupeKey: `${RUN}:${label}`,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  return row.id;
}

const readAtOf = (id: string) =>
  admin.notification.findUniqueOrThrow({ where: { id }, select: { readAt: true } }).then((r) => r.readAt);

describe.skipIf(!HAS_DB)('notification store (live, fabrika_app)', () => {
  beforeAll(async () => {
    const a = await admin.tenant.create({ data: { name: `${RUN} a`, slug: `${RUN}-a`, country: 'TR' } });
    const b = await admin.tenant.create({ data: { name: `${RUN} b`, slug: `${RUN}-b`, country: 'TR' } });
    fx.tenantA = a.id;
    fx.tenantB = b.id;
    for (const who of ['u1', 'u2', 'u3'] as Who[]) {
      const u = await admin.user.create({ data: { email: `${who}@${RUN}.test`, name: `${RUN} ${who}` } });
      fx.users[who] = u.id;
    }
    await admin.membership.createMany({
      data: [
        { tenantId: a.id, userId: requireId(fx.users.u1, 'u1'), role: 'TENANT_OWNER' },
        { tenantId: a.id, userId: requireId(fx.users.u2, 'u2'), role: 'MEMBER' },
        { tenantId: b.id, userId: requireId(fx.users.u3, 'u3'), role: 'TENANT_OWNER' },
      ],
    });
  });

  afterAll(async () => {
    // Notification and Membership go with the tenant (cascade); SavedSearch has no FK.
    await admin.savedSearch.deleteMany({ where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } } });
    await admin.notification.deleteMany({ where: { tenantId: { in: presentIds([fx.tenantA, fx.tenantB]) } } });
    for (const id of presentIds([fx.tenantA, fx.tenantB])) await admin.tenant.delete({ where: { id } });
    for (const id of presentIds(Object.values(fx.users))) await admin.user.delete({ where: { id } });
    await admin.$disconnect();
  });

  test('tenant isolation: tenant B neither reads nor writes tenant A rows', async () => {
    const aId = await seedNotification('u1', 'tenant-iso');
    const tenantA = requireId(fx.tenantA, 'tenantA');
    const tenantB = requireId(fx.tenantB, 'tenantB');

    // Same user id even, under B's scope: RLS hides the row.
    const seenFromB = await withTenant(tenantB, (tx) => tx.notification.findMany({ where: { id: aId } }));
    expect(seenFromB).toEqual([]);
    const seenFromA = await withTenant(tenantA, (tx) => tx.notification.findMany({ where: { id: aId } }));
    expect(seenFromA.map((n) => n.id)).toEqual([aId]);

    // Writing A's row from B's scope is refused by WITH CHECK, not misfiled.
    await expect(
      withTenant(tenantB, (tx) =>
        tx.notification.create({
          data: { tenantId: tenantA, userId: requireId(fx.users.u3, 'u3'), type: 'SAVED_SEARCH_MATCH' },
        })
      )
    ).rejects.toThrow(/row-level security/i);
    // And B's mark-read of A's id changes nothing.
    as('u3');
    expect(await markNotificationsRead([aId])).toEqual({ ok: true, updated: 0 });
    expect(await readAtOf(aId)).toBeNull();

    // The action as u3 (tenant B) lists none of A's rows.
    const list = await listNotifications();
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.notifications.map((n) => n.id)).not.toContain(aId);
  });

  test('user isolation: U2 of the same tenant neither lists nor marks U1 rows', async () => {
    const u1Row = await seedNotification('u1', 'user-iso-1');
    const u2Row = await seedNotification('u2', 'user-iso-2');

    as('u2');
    const list = await listNotifications();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const ids = list.notifications.map((n) => n.id);
    expect(ids).toContain(u2Row);
    expect(ids).not.toContain(u1Row);

    expect(await markNotificationsRead([u1Row])).toEqual({ ok: true, updated: 0 });
    expect(await readAtOf(u1Row)).toBeNull();

    // 'all' as U2 reaches U2's rows only.
    const all = await markNotificationsRead('all');
    expect(all.ok).toBe(true);
    expect(await readAtOf(u2Row)).not.toBeNull();
    expect(await readAtOf(u1Row)).toBeNull();
  });

  test('mark read writes readAt, keeps the first time, and the unread count follows', async () => {
    as('u1');
    // Start from a known state: everything of U1 read.
    await markNotificationsRead('all');
    const first = await seedNotification('u1', 'mark-1');
    const second = await seedNotification('u1', 'mark-2');

    const before = await listNotifications();
    expect(before.ok && before.unreadCount).toBe(2);
    expect(before.ok && before.notifications.find((n) => n.id === first)?.readAt).toBeNull();

    expect(await markNotificationsRead([first])).toEqual({ ok: true, updated: 1 });
    const readAt = await readAtOf(first);
    expect(readAt, 'markNotificationsRead answered ok but readAt is still NULL').not.toBeNull();
    expect(await readAtOf(second)).toBeNull();

    // Second call on the same id: nothing changes, the first readAt stays.
    expect(await markNotificationsRead([first])).toEqual({ ok: true, updated: 0 });
    expect(await readAtOf(first)).toEqual(readAt);

    const after = await listNotifications();
    expect(after.ok && after.unreadCount).toBe(1);
    expect(after.ok && after.notifications.find((n) => n.id === first)?.readAt).toBe(readAt!.toISOString());

    expect(await markNotificationsRead('all')).toEqual({ ok: true, updated: 1 });
    expect(await readAtOf(second)).not.toBeNull();
    const done = await listNotifications();
    expect(done.ok && done.unreadCount).toBe(0);
  });

  test('refuses a bad target or no session, and writes nothing', async () => {
    const row = await seedNotification('u1', 'refuse');
    as('u1');
    for (const bad of [undefined, null, 'some-id', [''], ['  '], [row, undefined], { id: row }, Array(101).fill(row)]) {
      expect(await markNotificationsRead(bad as never)).toEqual({ ok: false, error: 'invalid_ids' });
    }
    expect(await readAtOf(row)).toBeNull();

    s.session = null;
    expect(await markNotificationsRead('all')).toEqual({ ok: false, error: 'unauthorized' });
    expect(await listNotifications()).toEqual({ ok: false, error: 'unauthorized' });
    expect(await readAtOf(row)).toBeNull();
  });

  test('dedupe: the same key for the same user writes one row', async () => {
    const tenantId = requireId(fx.tenantA, 'tenantA');
    const userId = requireId(fx.users.u1, 'u1');
    const input = {
      tenantId,
      userId,
      type: 'SAVED_SEARCH_MATCH' as const,
      payload: { matchCount: 2 },
      dedupeKey: `${RUN}:dedupe`,
    };
    expect(await withTenant(tenantId, (tx) => recordNotification(tx, input))).toBe(true);
    expect(await withTenant(tenantId, (tx) => recordNotification(tx, input))).toBe(false);
    // Another user, same key: a different notification.
    expect(
      await withTenant(tenantId, (tx) => recordNotification(tx, { ...input, userId: requireId(fx.users.u2, 'u2') }))
    ).toBe(true);
    expect(await admin.notification.count({ where: { tenantId, dedupeKey: `${RUN}:dedupe` } })).toBe(2);
  });

  test("alerts-daily: notifies the search's owner, not the tenant owner, once per window, with no SMTP", async (ctx) => {
    const topics = await admin.topic.count({ where: { fetchedAt: { gt: LONG_AGO } } });
    skipUnlessSeeded(ctx, SUITE, topics > 0, 'no Topic rows, so the search has no matches');

    const tenantId = requireId(fx.tenantA, 'tenantA');
    const searcher = requireId(fx.users.u2, 'u2'); // a MEMBER; u1 is the tenant owner, who gets nothing
    const search = await admin.savedSearch.create({
      data: { tenantId, userId: searcher, name: `${RUN} search`, filters: {}, notify: true, lastRunAt: LONG_AGO },
    });
    const row = {
      id: search.id,
      tenantId,
      userId: searcher,
      name: search.name,
      filters: {},
      lastRunAt: LONG_AGO,
      createdAt: search.createdAt,
    };
    const key = savedSearchDedupeKey(search.id, LONG_AGO);

    // No mail provider: the e-mail fails as before, lastRunAt stays, the
    // notification is written anyway.
    const first = await sendSavedSearchAlerts([row], withTenant, null);
    expect(first.errors).toEqual([{ searchId: search.id, reason: 'no_mail_provider' }]);
    // The next run sees the same window again.
    const second = await sendSavedSearchAlerts([row], withTenant, null);
    expect(second.emailsFailed).toBe(1);

    const written = await admin.notification.findMany({
      where: { tenantId, dedupeKey: key },
      select: { userId: true, type: true, payload: true, workspaceId: true },
    });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ userId: searcher, type: 'SAVED_SEARCH_MATCH', workspaceId: null });
    expect(written[0]!.payload).toMatchObject({ searchId: search.id, since: LONG_AGO.toISOString() });
    expect((written[0]!.payload as { matchCount: number }).matchCount).toBeGreaterThan(0);
    expect(
      await admin.notification.count({ where: { tenantId, dedupeKey: key, userId: requireId(fx.users.u1, 'u1') } })
    ).toBe(0);
    const stored = await admin.savedSearch.findUniqueOrThrow({ where: { id: search.id }, select: { lastRunAt: true } });
    expect(stored.lastRunAt).toEqual(LONG_AGO);

    // And it reaches the searcher's bell.
    as('u2');
    const list = await listNotifications();
    expect(list.ok && list.notifications.some((n) => n.payload.searchId === search.id)).toBe(true);
  });
});
