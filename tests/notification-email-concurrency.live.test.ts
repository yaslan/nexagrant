import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTranslator } from 'next-intl';
import tr from '../messages/tr.json';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';
import { holdTestDbLock, NOTIFICATION_OUTBOX_LOCK } from './helpers/test-db-lock';
import type { MailMessage } from '@/lib/email/mailer';
import type { NotificationTranslator } from '@/lib/notifications/render';

/**
 * NG-131 — single-run guarantee of the notification e-mail outbox, on a real
 * database. TWO runs start at the same moment over the same queue, with a slow
 * mailer (so each is mid-SMTP while the other reads): every recipient must get
 * ONE mail. Remove the claim in email-outbox.ts and this file goes red.
 * (Derived from notification-preferences.live.test.ts: same setup, same seams.)
 *
 * Original header of that suite — NG-43 — the notification centre's channel and frequency choice (spec §13) on
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

const SUITE = 'notification-email-concurrency.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `ng131-${Date.now().toString(36)}`;

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
let releaseLock: (() => Promise<void>) | undefined;
let ready = false;
let skipReason = '';
const tenants: string[] = [];
const users: string[] = [];
let a: Scope;
let b: Scope;
let c: Scope;
let d: Scope;

const t = createTranslator({ locale: 'tr', messages: tr, namespace: 'Notifications' }) as unknown as NotificationTranslator;

function run(mode: 'INSTANT' | 'WEEKLY', mailer: (m: MailMessage) => Promise<void>, now = new Date()) {
  return outbox.sendNotificationEmails({
    mode,
    mailer,
    now,
    translatorFor: () => t,
    systemScope: (cb) => withSystemScopeOn(state.rls!, 'cross-tenant-job', 'test.ng131', cb),
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

/** Items still owed a mail (sentAt null). A sent row stays as the dedupe record. */
async function queued(s: Scope, frequency?: 'INSTANT' | 'WEEKLY') {
  return admin!.notificationEmailItem.count({
    where: { tenantId: s.tenantId, userId: s.userId, sentAt: null, ...(frequency ? { frequency } : {}) },
  });
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(RLS_URL, SUITE);
  if (!ADMIN_URL) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !ADMIN_URL) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL not set. Run `pnpm db:rls-role`.';
    return;
  }
  releaseLock = await holdTestDbLock(ADMIN_URL, NOTIFICATION_OUTBOX_LOCK);
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
  c = await makeScope('c');
  d = await makeScope('d');
  ready = true;
});

afterAll(async () => {
  if (admin) {
    await admin.tenant.deleteMany({ where: { id: { in: presentIds(tenants) } } });
    await admin.user.deleteMany({ where: { id: { in: presentIds(users) } } });
    await admin.$disconnect();
  }
  await state.rls?.$disconnect();
  await releaseLock?.();
});


/** A mailer that is slow, like SMTP: the other run reads the queue while this one is mid-send. */
function slowInbox(ms = 150) {
  const sent: MailMessage[] = [];
  return {
    sent,
    mailer: async (m: MailMessage) => {
      await new Promise((r) => setTimeout(r, ms));
      sent.push(m);
    },
  };
}

async function queueFor(s: Scope, mode: 'INSTANT' | 'WEEKLY', n: number) {
  await setPref(s, { event: 'NEW_MATCHING_CALL', channel: 'PANEL', frequency: 'OFF' });
  await setPref(s, { event: 'NEW_MATCHING_CALL', channel: 'EMAIL', frequency: mode });
  for (let i = 0; i < n; i++) await dispatch(s, `${mode}-${i}`);
}

describe('two overlapping runs mail a recipient once (NG-131)', () => {
  test('INSTANT: two runs at once, one mail per queued item', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await queueFor(a, 'INSTANT', 2);
    await queueFor(b, 'INSTANT', 1);
    expect(await queued(a, 'INSTANT')).toBe(2);

    const one = slowInbox();
    const two = slowInbox();
    const [r1, r2] = await Promise.all([run('INSTANT', one.mailer), run('INSTANT', two.mailer)]);

    const all = [...one.sent, ...two.sent];
    console.log('INSTANT run1', JSON.stringify(r1), 'run2', JSON.stringify(r2));
    expect(mine(all, a)).toHaveLength(2);
    expect(mine(all, b)).toHaveLength(1);
    expect(await queued(a)).toBe(0);
    expect(await queued(b)).toBe(0);
  });

  test('WEEKLY: two runs at once, ONE digest per recipient', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await queueFor(c, 'WEEKLY', 3);
    await queueFor(d, 'WEEKLY', 2);

    const one = slowInbox();
    const two = slowInbox();
    const [r1, r2] = await Promise.all([run('WEEKLY', one.mailer), run('WEEKLY', two.mailer)]);

    const all = [...one.sent, ...two.sent];
    console.log('WEEKLY run1', JSON.stringify(r1), 'run2', JSON.stringify(r2));
    expect(mine(all, c)).toHaveLength(1);
    expect(mine(all, d)).toHaveLength(1);
    expect(await queued(c)).toBe(0);
  });

  test('a failed send releases the claim: the next run sends at once', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await dispatch(a, 'retry-after-fail');
    const failed = await run('INSTANT', async () => {
      throw new Error('smtp down');
    });
    expect(failed.failures).toBe(1);
    expect(await queued(a)).toBe(1);
    const retry = inbox();
    await run('INSTANT', retry.mailer);
    expect(mine(retry.sent, a)).toHaveLength(1);
  });

  test('a claim older than the lease (a dead run) is taken over', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await dispatch(a, 'dead-run');
    const tenantId = requireId(a.tenantId, 'tenantId');
    const userId = requireId(a.userId, 'userId');
    const old = new Date(Date.now() - outbox.CLAIM_LEASE_MS - 60_000);
    await admin!.notificationEmailItem.updateMany({
      where: { tenantId, userId, sentAt: null },
      data: { claimToken: 'dead', claimedAt: old },
    });
    const box = inbox();
    await run('INSTANT', box.mailer);
    expect(mine(box.sent, a)).toHaveLength(1);
  });

  test('a fresh claim of another run is respected', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    await dispatch(a, 'fresh-claim');
    const tenantId = requireId(a.tenantId, 'tenantId');
    const userId = requireId(a.userId, 'userId');
    await admin!.notificationEmailItem.updateMany({
      where: { tenantId, userId, sentAt: null },
      data: { claimToken: 'other-run', claimedAt: new Date() },
    });
    const box = inbox();
    await run('INSTANT', box.mailer);
    expect(mine(box.sent, a)).toHaveLength(0);
    expect(await queued(a)).toBe(1);
  });

  test('a lease lost between two batches: the second batch is not mailed (NG-164)', async (ctx) => {
    if (!ready) return ctx.skip(skipReason);
    const e = await makeScope('e');
    await queueFor(e, 'INSTANT', 2);
    const tenantId = requireId(e.tenantId, 'tenantId');
    const userId = requireId(e.userId, 'userId');

    // Run 1 claims both items, then mails item 1. While its SMTP call is in
    // flight, run 1's lease on item 2 expires (the clock has moved on past the
    // lease) and run 2 takes item 2 over and mails it. Run 1 must not mail item 2
    // a second time: the lease renewal before its second batch finds the claim
    // gone and skips it.
    const k1Sent: MailMessage[] = [];
    const k2 = inbox();
    let k2Result: Awaited<ReturnType<typeof run>> | undefined;
    let stolen = false;
    const k1Mailer = async (m: MailMessage) => {
      k1Sent.push(m);
      if (stolen) return;
      stolen = true;
      const [second] = await admin!.notificationEmailItem.findMany({
        where: { tenantId, userId, sentAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        skip: 1,
        take: 1,
      });
      await admin!.notificationEmailItem.updateMany({
        where: { id: requireId(second?.id, 'second item id') },
        data: { claimedAt: new Date(Date.now() - outbox.CLAIM_LEASE_MS - 60_000) },
      });
      k2Result = await run('INSTANT', k2.mailer);
    };

    const r1 = await run('INSTANT', k1Mailer);
    console.log('LEASE-LOSS run1', JSON.stringify(r1), 'run2', JSON.stringify(k2Result));

    expect(mine(k1Sent, e)).toHaveLength(1);
    expect(mine(k2.sent, e)).toHaveLength(1);
    expect(await queued(e)).toBe(0);
    expect(r1.claimLost).toBe(1);
  });
});
