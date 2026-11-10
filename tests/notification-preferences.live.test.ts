import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTranslator } from 'next-intl';
import tr from '../messages/tr.json';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds } from './helpers/teardown-guard';
import type { MailMessage } from '@/lib/email/mailer';
import type { NotificationTranslator } from '@/lib/notifications/render';

/**
 * NG-43 — the notification centre's channel and frequency choice (spec §13) on
 * a real database, over `fabrika_app` (NOBYPASSRLS, asserted). Nothing is
 * mocked but the mailer (an array) and the routing of `withTenant` /
 * `withSystemScope` to that client.
 *
 *  - no preference: the bell gets the notification, no mail is queued;
 *  - the user switches the event to e-mail: the same producer call now queues a
 *    mail and writes no bell row; the instant run sends it, once;
 *  - weekly: several notifications, nothing on the instant run, ONE digest mail
 *    on the weekly run, nothing on a second weekly run;
 *  - a failed send keeps the items for the next run;
 *  - another tenant can neither read nor change the user's choice (RLS).
 *
 * `.live`: needs the docker-compose Postgres, `pnpm db:setup` and `pnpm db:rls-role`.
 */

const SUITE = 'notification-preferences.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng43-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({ rls: undefined as PrismaClient | undefined }));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, cb),
  };
});

const { createDbClient, withTenantOn } = await import('@/lib/db');
const { withSystemScopeOn } = await import('@/lib/system-scope');
const prefs = await import('@/lib/notifications/preferences');
const outbox = await import('@/lib/notifications/email-outbox');

type Scope = { tenantId: string; userId: string; email: string };

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];
let a: Scope;
let b: Scope;

const t = createTranslator({ locale: 'tr', messages: tr, namespace: 'Notifications' }) as unknown as NotificationTranslator;

function run(mode: 'INSTANT' | 'WEEKLY', mailer: (m: MailMessage) => Promise<void>, now = new Date()) {
  return outbox.sendNotificationEmails({
    mode,
    mailer,
    now,
    translatorFor: () => t,
    systemScope: (cb) => withSystemScopeOn(state.rls!, 'cross-tenant-job', 'test.ng43', cb),
    runTenant: (tenantId, cb) => withTenantOn(state.rls!, tenantId, cb),
  });
}

function inbox() {
  const sent: MailMessage[] = [];
  return { sent, mailer: async (m: MailMessage) => void sent.push(m) };
}

/** Only this suite's mails: the outbox is cross-tenant, other suites may queue too. */
function mine(sent: MailMessage[], s: Scope) {
  return sent.filter((m) => m.to === s.email);
}

async function makeScope(key: string): Promise<Scope> {
  const tenant = await admin!.tenant.create({
    data: { name: `${RUN} ${key}`, slug: `${RUN}-${key}`, country: 'TR', kind: 'ORGANIZATION' },
    select: { id: true },
  });
  tenants.push(tenant.id);
  const email = `${RUN}-${key}@example.com`;
  const user = await admin!.user.create({ data: { email, name: key } });
  users.push(user.id);
  await admin!.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'TENANT_OWNER' } });
  return { tenantId: tenant.id, userId: user.id, email };
}

function match(s: Scope, key: string) {
  return {
    tenantId: s.tenantId,
    userId: s.userId,
    type: 'SAVED_SEARCH_MATCH' as const,
    payload: { searchId: `${RUN}-s`, searchName: 'Horizon Sağlık', matchCount: 2 },
    dedupeKey: `${RUN}:${key}`,
  };
}

function dispatch(s: Scope, key: string) {
  return withTenantOn(state.rls!, s.tenantId, (tx) => prefs.dispatchNotification(tx, match(s, key)));
}

function setPref(s: Scope, input: unknown) {
  return withTenantOn(state.rls!, s.tenantId, (tx) => prefs.setPreferenceFor(tx, s.tenantId, s.userId, input));
}

async function bellRows(s: Scope) {
  return admin!.notification.count({ where: { tenantId: s.tenantId, userId: s.userId } });
}

async function queued(s: Scope, frequency?: 'INSTANT' | 'WEEKLY') {
  return admin!.notificationEmailItem.count({ where: { tenantId: s.tenantId, userId: s.userId, ...(frequency ? { frequency } : {}) } });
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  state.rls = createDbClient(rlsUrl);
  admin = createDbClient(ADMIN_URL);
  try {
    await state.rls.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(state.rls, SUITE);
  a = await makeScope('a');
  b = await makeScope('b');
  ready = true;
});

afterAll(async () => {
  if (admin) {
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenants) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } });
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
});

describe('a changed preference changes the channel', () => {
  test('no preference: bell row, no mail queued', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect(await dispatch(a, 'default')).toEqual({ panel: true, email: null });
    expect(await bellRows(a)).toBe(1);
    expect(await queued(a)).toBe(0);
  });

  test('switched to e-mail INSTANT, panel OFF: queued mail, no bell row; the instant run sends it once', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await setPref(a, { event: 'NEW_MATCHING_CALL', channel: 'PANEL', frequency: 'OFF' });
    await setPref(a, { event: 'NEW_MATCHING_CALL', channel: 'EMAIL', frequency: 'INSTANT' });

    const views = await withTenantOn(state.rls!, a.tenantId, (tx) => prefs.getPreferencesFor(tx, a.tenantId, a.userId));
    expect(views.find((v) => v.event === 'NEW_MATCHING_CALL')?.delivery).toEqual({ PANEL: 'OFF', EMAIL: 'INSTANT' });
    expect(views).toHaveLength(9);

    expect(await dispatch(a, 'instant')).toEqual({ panel: false, email: 'INSTANT' });
    expect(await bellRows(a)).toBe(1); // still only the first one
    expect(await queued(a, 'INSTANT')).toBe(1);

    const box = inbox();
    await run('INSTANT', box.mailer);
    expect(mine(box.sent, a)).toHaveLength(1);
    expect(mine(box.sent, a)[0]?.subject).toBe('Yeni eşleşme bulundu');
    expect(mine(box.sent, a)[0]?.text ?? '').toContain('Horizon Sağlık');
    expect(await queued(a)).toBe(0);

    const again = inbox();
    await run('INSTANT', again.mailer);
    expect(mine(again.sent, a)).toHaveLength(0);
  });

  test('the same dedupeKey twice is queued once', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    expect((await dispatch(a, 'dup')).email).toBe('INSTANT');
    expect((await dispatch(a, 'dup')).email).toBeNull();
    expect(await queued(a)).toBe(1);
    await run('INSTANT', inbox().mailer);
  });
});

describe('weekly batch', () => {
  test('three notifications, nothing on the instant run, one digest on the weekly run, nothing after', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await setPref(a, { event: 'NEW_MATCHING_CALL', channel: 'EMAIL', frequency: 'WEEKLY' });
    for (const k of ['w1', 'w2', 'w3']) expect((await dispatch(a, k)).email).toBe('WEEKLY');
    expect(await queued(a, 'WEEKLY')).toBe(3);

    const instant = inbox();
    await run('INSTANT', instant.mailer);
    expect(mine(instant.sent, a)).toHaveLength(0);
    expect(await queued(a, 'WEEKLY')).toBe(3);

    const weekly = inbox();
    await run('WEEKLY', weekly.mailer);
    const digest = mine(weekly.sent, a);
    expect(digest).toHaveLength(1);
    expect(digest[0]?.subject).toBe('Haftalık bildirim özeti: 3 bildirim');
    expect(digest[0]?.text?.match(/Yeni eşleşme bulundu/g) ?? []).toHaveLength(3);
    expect(await queued(a)).toBe(0);

    const second = inbox();
    await run('WEEKLY', second.mailer);
    expect(mine(second.sent, a)).toHaveLength(0);
  });

  test('a failed send keeps the items for the next run', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await dispatch(a, 'fail');
    const failing = async (m: MailMessage) => {
      if (m.to === a.email) throw new Error('smtp down');
    };
    const result = await run('WEEKLY', failing);
    expect(result.failures).toBeGreaterThanOrEqual(1);
    expect(await queued(a, 'WEEKLY')).toBe(1);

    const ok = inbox();
    await run('WEEKLY', ok.mailer);
    expect(mine(ok.sent, a)).toHaveLength(1);
    expect(await queued(a)).toBe(0);
  });

  test('a recipient who left the tenant gets no mail; the items are dropped', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await setPref(b, { event: 'NEW_MATCHING_CALL', channel: 'EMAIL', frequency: 'WEEKLY' });
    await dispatch(b, 'left');
    await admin!.membership.deleteMany({ where: { tenantId: b.tenantId, userId: b.userId } });
    const box = inbox();
    const result = await run('WEEKLY', box.mailer);
    expect(mine(box.sent, b)).toHaveLength(0);
    expect(result.itemsDropped).toBeGreaterThanOrEqual(1);
    expect(await queued(b)).toBe(0);
    await admin!.membership.create({ data: { tenantId: b.tenantId, userId: b.userId, role: 'TENANT_OWNER' } });
  });
});

describe('tenant isolation', () => {
  test("another tenant's scope sees and changes none of the user's preferences", async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const seen = await withTenantOn(state.rls!, b.tenantId, (tx) =>
      tx.notificationPreference.findMany({ where: { userId: a.userId } })
    );
    expect(seen).toHaveLength(0);
    // Writing a's tenant id from b's scope: WITH CHECK refuses it.
    await expect(
      withTenantOn(state.rls!, b.tenantId, (tx) =>
        prefs.setPreferenceFor(tx, a.tenantId, a.userId, { event: 'REPORT_DUE', channel: 'EMAIL', frequency: 'INSTANT' })
      )
    ).rejects.toThrow();
    expect(await admin!.notificationPreference.count({ where: { tenantId: a.tenantId, event: 'REPORT_DUE' } })).toBe(0);
  });
});
