import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';

/**
 * Live M4 "60 gün temassız" reminder (TASK-MULQL2NYKRGJX) — real Postgres, real
 * Prisma, the code under test running as `fabrika_app` (NOBYPASSRLS). The mail
 * provider is the only fake: it records what would have been sent.
 *
 * The run walks every live tenant, so it refuses the shared `fabrika`
 * database outside CI (same guard as tests/invitation-retention.live.test.ts)
 * and is narrowed to this file's tenants with `tenantIds`.
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

import { createDbClient, prisma, withTenant } from '@/lib/db';
import { sendStaleRelationshipReminders, STALE_REMINDER_AUDIT } from '@/lib/relationships/stale-reminder';
import { dayStartUtc, isReminderDue, isStaleRelationship } from '@/lib/relationships/stale';
import type { MailMessage } from '@/lib/email/mailer';
import { assertRlsSubjectRole, isCi, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

const admin = createDbClient(OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika');
const SUITE = 'stale relationship reminder test';

const REACHABLE =
  requireRlsTestUrl(RLS_URL, SUITE) !== undefined &&
  (await admin.$queryRaw`SELECT 1`.then(() => true).catch(() => false));
if (RLS_URL && !REACHABLE) skipOrFailInCi(SUITE, 'Postgres is unreachable (`docker compose up -d`)');

const DB_NAME = REACHABLE
  ? ((await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database()::text AS db`)[0]?.db ?? '')
  : '';
const SHARED = DB_NAME === 'fabrika' && !isCi();
if (SHARED) console.warn(`${SUITE} skipped: the run mails and stamps across tenants; refusing the shared "fabrika" database`);
const HAS_DB = REACHABLE && !SHARED;

if (HAS_DB) await assertRlsSubjectRole(prisma, SUITE);

const RUN = Math.random().toString(36).slice(2, 10);
const T = {
  on: `t-st-on-${RUN}`, // pro, M4 ON
  on2: `t-st-on2-${RUN}`, // second tenant of the same owner
  pilotModule: `t-st-pm-${RUN}`, // pro, M4 PILOT (managers only)
  off: `t-st-off-${RUN}`, // pro, M4 OFF
  noPlan: `t-st-np-${RUN}`, // no subscription (free), M4 row ON
  expired: `t-st-ex-${RUN}`, // pilot ran out, M4 ON
};
const TENANTS = Object.values(T);
const U = {
  tr: `u-st-tr-${RUN}`,
  en: `u-st-en-${RUN}`,
  gone: `u-st-gone-${RUN}`,
  member: `u-st-mem-${RUN}`,
  manager: `u-st-mgr-${RUN}`,
};
const USERS = Object.values(U);
const mail = (u: string) => `${u}@example.test`;

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const ago = (ms: number) => new Date(NOW.getTime() - ms);

const R: Record<string, string> = {};
async function rel(
  key: string,
  tenantId: string,
  owner: string | null,
  lastContactAt: Date | null,
  extra: { staleRemindedAt?: Date; staleRemindedContactAt?: Date; name?: string } = {}
) {
  const row = await admin.relationship.create({
    data: {
      tenantId,
      kind: 'partner',
      ownerUserId: owner,
      counterpartName: extra.name ?? `${key}-${RUN}`,
      lastContactAt,
      staleRemindedAt: extra.staleRemindedAt ?? null,
      staleRemindedContactAt: extra.staleRemindedContactAt ?? null,
    },
  });
  R[key] = row.id;
}

async function stampOf(key: string): Promise<Date | null> {
  const row = await admin.relationship.findUnique({ where: { id: requireId(R[key], key) }, select: { staleRemindedAt: true } });
  return row?.staleRemindedAt ?? null;
}

async function claimOf(tenantId: string, userId: string): Promise<Date | null> {
  const row = await admin.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { staleDigestOn: true } });
  return row?.staleDigestOn ?? null;
}

function fakeMailer(opts: { failFor?: string } = {}) {
  const sent: MailMessage[] = [];
  const mailer = async (m: MailMessage) => {
    if (opts.failFor && m.to === opts.failFor) throw new Error('smtp:EENVELOPE:550');
    sent.push(m);
  };
  return { sent, mailer };
}

const run = (mailer: ((m: MailMessage) => Promise<void>) | null, now: Date = NOW, runTenant?: typeof withTenant) =>
  sendStaleRelationshipReminders({ mailer, appUrl: 'https://app.example.test', now, tenantIds: TENANTS, pageSize: 2, runTenant });

async function wipe() {
  await admin.relationship.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: presentIds(TENANTS) } } });
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(TENANTS) } } });
  await admin.user.deleteMany({ where: { id: { in: presentIds(USERS) } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  for (const id of TENANTS) {
    await admin.tenant.create({ data: { id, name: id === T.on ? `Kurum <b>&${RUN}` : id, slug: id, country: 'TR' } });
    await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
  }
  for (const id of [T.on, T.on2, T.pilotModule, T.off]) {
    await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
  }
  await admin.subscription.create({
    data: { tenantId: T.expired, planId: 'public-team', status: 'TRIALING', provider: 'pilot', trialEndsAt: new Date(Date.now() - 60_000) },
  });
  const status: Record<string, 'ON' | 'PILOT' | 'OFF'> = { [T.on]: 'ON', [T.on2]: 'ON', [T.pilotModule]: 'PILOT', [T.off]: 'OFF', [T.noPlan]: 'ON', [T.expired]: 'ON' };
  for (const [tenantId, s] of Object.entries(status)) await admin.moduleState.create({ data: { tenantId, moduleId: 'M4', status: s } });

  await admin.user.create({ data: { id: U.tr, email: mail(U.tr), locale: 'tr' } });
  await admin.user.create({ data: { id: U.en, email: mail(U.en), locale: 'en' } });
  await admin.user.create({ data: { id: U.gone, email: mail(U.gone), deletionRequestedAt: new Date() } });
  await admin.user.create({ data: { id: U.member, email: mail(U.member) } });
  await admin.user.create({ data: { id: U.manager, email: mail(U.manager) } });
  const member = (tenantId: string, userId: string, role: 'MEMBER' | 'PIPELINE_MANAGER' = 'MEMBER') =>
    admin.membership.create({ data: { tenantId, userId, role } });
  await member(T.on, U.tr);
  await member(T.on, U.en);
  await member(T.on, U.gone);
  await member(T.on2, U.tr);
  await member(T.pilotModule, U.member);
  await member(T.pilotModule, U.manager, 'PIPELINE_MANAGER');
  await member(T.off, U.tr);
  await member(T.noPlan, U.tr);
  await member(T.expired, U.tr);

  // T.on, owner U.tr
  await rel('exact60', T.on, U.tr, ago(60 * DAY)); // the 60th day: stale
  await rel('justUnder', T.on, U.tr, ago(60 * DAY - 1)); // one ms short: not stale
  await rel('old90', T.on, U.tr, ago(90 * DAY), { name: '<img src=x onerror=alert(1)>' });
  await rel('never', T.on, U.tr, null);
  await rel('reminded', T.on, U.tr, ago(80 * DAY), { staleRemindedAt: ago(10 * DAY), staleRemindedContactAt: ago(80 * DAY) }); // already told
  await rel('recontact', T.on, U.tr, ago(70 * DAY), { staleRemindedAt: ago(200 * DAY), staleRemindedContactAt: ago(260 * DAY) }); // new stale period
  await rel('unassigned', T.on, null, ago(90 * DAY));
  await rel('gone', T.on, U.gone, ago(90 * DAY));
  await rel('notMember', T.on, U.member, ago(90 * DAY)); // U.member is not in T.on
  // T.on, owner U.en
  await rel('en1', T.on, U.en, ago(61 * DAY));
  // T.on2, owner U.tr — same digest as T.on
  await rel('second', T.on2, U.tr, ago(65 * DAY));
  // module-gated tenants
  await rel('pmMember', T.pilotModule, U.member, ago(90 * DAY));
  await rel('pmManager', T.pilotModule, U.manager, ago(90 * DAY));
  await rel('off', T.off, U.tr, ago(90 * DAY));
  await rel('noPlan', T.noPlan, U.tr, ago(90 * DAY));
  await rel('expired', T.expired, U.tr, ago(90 * DAY));
});

afterAll(async () => {
  if (!HAS_DB) return;
  await wipe();
  await admin.$disconnect();
});

describe('60-day rule (pure)', () => {
  test('the 60th full day is stale, a millisecond earlier is not, never-contacted is not', () => {
    const now = new Date('2026-10-01T07:00:00.000Z');
    expect(isStaleRelationship(new Date(now.getTime() - 60 * DAY), now)).toBe(true);
    expect(isStaleRelationship(new Date(now.getTime() - 60 * DAY + 1), now)).toBe(false);
    expect(isStaleRelationship(null, now)).toBe(false);
  });

  test('due again for any other contact than the one reminded about, earlier-dated included (İNCELEME-51 B-2)', () => {
    const now = new Date('2026-10-01T07:00:00.000Z');
    const c = new Date(now.getTime() - 70 * DAY);
    expect(isReminderDue({ lastContactAt: c, staleRemindedContactAt: null }, now)).toBe(true);
    expect(isReminderDue({ lastContactAt: c, staleRemindedContactAt: new Date(c) }, now)).toBe(false);
    // Reminded about an older contact; the current one is back-dated but still a new period.
    expect(isReminderDue({ lastContactAt: c, staleRemindedContactAt: new Date(c.getTime() - 30 * DAY) }, now)).toBe(true);
    // A contact dated before the one reminded about (re-dated, or logged late) is a new period too.
    expect(isReminderDue({ lastContactAt: c, staleRemindedContactAt: new Date(c.getTime() + 5 * DAY) }, now)).toBe(true);
    expect(isReminderDue({ lastContactAt: new Date(now.getTime() - 59 * DAY), staleRemindedContactAt: null }, now)).toBe(false);
  });
});

describe.skipIf(!HAS_DB)('M4 stale relationship reminder (live, fabrika_app)', () => {
  test('without a mail provider nothing is sent and nothing is stamped', async () => {
    const r = await run(null);
    expect(r.reason).toBe('no_mail_provider');
    expect(r.digestsSent).toBe(0);
    expect(r.relationshipsDue).toBe(6); // exact60, old90, recontact, en1, second, pmManager
    for (const k of Object.keys(R)) {
      if (k === 'reminded' || k === 'recontact') continue;
      expect(await stampOf(k)).toBeNull();
    }
  });

  test('one digest per user across tenants, only the due rows, module and pilot gates held', async () => {
    const { sent, mailer } = fakeMailer();
    const r = await run(mailer);
    expect(r.reason).toBeUndefined();
    expect(r.digestsSent).toBe(3); // U.tr (T.on + T.on2), U.en, U.manager
    expect(sent.map((m) => m.to).sort()).toEqual([mail(U.en), mail(U.manager), mail(U.tr)].sort());
    expect(r.tenantsModuleClosed).toBe(2); // T.off, T.noPlan
    expect(r.tenantsPilotExpired).toBe(1);
    expect(r.skippedUnassigned).toBe(1);
    expect(r.skippedRecipient).toBe(3); // gone, notMember, pmMember (MEMBER under PILOT)
    expect(r.relationshipsReminded).toBe(6);

    const tr = sent.find((m) => m.to === mail(U.tr))!;
    expect(tr.subject).toContain('4 ilişkiyle 60 gündür temas yok');
    for (const k of ['exact60', 'old90', 'recontact', 'second']) expect(tr.text).toContain(k === 'old90' ? '<img src=x onerror=alert(1)>' : `${k}-${RUN}`);
    for (const k of ['justUnder', 'never', 'reminded', 'unassigned', 'off', 'noPlan', 'expired']) expect(tr.text).not.toContain(`${k}-${RUN}`);
    // Tenant-chosen text is escaped in the HTML.
    expect(tr.html).not.toContain('<img src=x');
    expect(tr.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(tr.html).toContain(`Kurum &lt;b&gt;&amp;${RUN}`);
    expect(tr.html).toContain(`https://app.example.test/tr/ws-${T.on}/relationships`);
    expect(tr.html).toContain(`https://app.example.test/tr/ws-${T.on2}/relationships`);
    const en = sent.find((m) => m.to === mail(U.en))!;
    expect(en.subject).toContain('no contact with 1 relationships for 60 days');
    expect(en.html).toContain(`/en/ws-${T.on}/relationships`);

    for (const k of ['exact60', 'old90', 'recontact', 'en1', 'second', 'pmManager']) expect((await stampOf(k))?.getTime()).toBe(NOW.getTime());
    // The stamp records the contact it named.
    const recontact = await admin.relationship.findUnique({ where: { id: requireId(R.recontact, 'recontact') }, select: { staleRemindedContactAt: true } });
    expect(recontact?.staleRemindedContactAt?.getTime()).toBe(ago(70 * DAY).getTime());
    // The day is claimed on every membership the digest covered, and on no other.
    const today = dayStartUtc(NOW).getTime();
    expect((await claimOf(T.on, U.tr))?.getTime()).toBe(today);
    expect((await claimOf(T.on2, U.tr))?.getTime()).toBe(today);
    expect((await claimOf(T.on, U.en))?.getTime()).toBe(today);
    expect(await claimOf(T.off, U.tr)).toBeNull();
    expect(await claimOf(T.on, U.gone)).toBeNull();
    for (const k of ['justUnder', 'never', 'unassigned', 'gone', 'notMember', 'pmMember', 'off', 'noPlan', 'expired']) expect(await stampOf(k)).toBeNull();
    expect((await stampOf('reminded'))?.getTime()).toBe(ago(10 * DAY).getTime());
  });

  test('the audit rows carry counts only', async () => {
    const rows = await admin.auditEvent.findMany({ where: { tenantId: { in: TENANTS }, type: STALE_REMINDER_AUDIT } });
    expect(rows.map((a) => a.tenantId).sort()).toEqual([T.on, T.on2, T.pilotModule].sort());
    const on = rows.find((a) => a.tenantId === T.on)!.data as Record<string, unknown>;
    expect(on).toEqual({ relationships: 4, recipients: 2, staleAfterDays: 60 });
    expect(JSON.stringify(rows)).not.toContain('@');
    expect(JSON.stringify(rows)).not.toContain('exact60');
  });

  test('a second run names no relationship again', async () => {
    const { sent, mailer } = fakeMailer();
    const r = await run(mailer, new Date(NOW.getTime() + 60_000));
    expect(sent).toHaveLength(0);
    expect(r.relationshipsDue).toBe(0);
    // reminded + the six just stamped; counted once each (the page query leaves them out, İNCELEME-51 Y-1).
    expect(r.skippedAlreadyReminded).toBe(7);
  });

  test('a row that goes stale later the same day waits for tomorrow: one digest per user per day', async () => {
    await rel('lateToday', T.on, U.tr, ago(60 * DAY - 2 * 60_000)); // stale two minutes from NOW
    const later = new Date(NOW.getTime() + 5 * 60_000);
    // Stay inside NOW's UTC day for this half of the test.
    if (later.getUTCDate() === NOW.getUTCDate()) {
      const { sent, mailer } = fakeMailer();
      const r = await run(mailer, later);
      expect(sent).toHaveLength(0);
      expect(r.skippedMailedToday).toBe(1);
      expect(await stampOf('lateToday')).toBeNull();
    }
    const tomorrow = new Date(NOW.getTime() + DAY);
    const { sent, mailer } = fakeMailer();
    await run(mailer, tomorrow);
    expect(sent.map((m) => m.to)).toEqual([mail(U.tr)]);
    expect(sent[0]!.text).toContain(`lateToday-${RUN}`);
    expect(sent[0]!.text).not.toContain(`exact60-${RUN}`);
  });

  test('a rejected send stamps nothing for that user; the others still go out', async () => {
    const day3 = new Date(NOW.getTime() + 3 * DAY);
    await rel('failA', T.on, U.tr, ago(100 * DAY));
    await rel('okB', T.on, U.en, ago(100 * DAY));
    const { sent, mailer } = fakeMailer({ failFor: mail(U.tr) });
    const r = await run(mailer, day3);
    expect(r.digestsFailed).toBe(1);
    expect(sent.map((m) => m.to)).toEqual([mail(U.en)]);
    expect(await stampOf('failA')).toBeNull();
    expect((await stampOf('okB'))?.getTime()).toBe(day3.getTime());
    expect(r.errors).toEqual([{ scope: 'digest', reason: 'smtp:EENVELOPE:550' }]);
    // The rejected user's claim is given back, so a later run the same day retries.
    expect((await claimOf(T.on, U.tr))?.getTime()).not.toBe(dayStartUtc(day3).getTime());
    const retry = fakeMailer();
    const r2 = await run(retry.mailer, new Date(day3.getTime() + 60_000));
    expect(retry.sent.map((m) => m.to)).toEqual([mail(U.tr)]);
    expect(r2.digestsSent).toBe(1);
    expect((await stampOf('failA'))?.getTime()).toBe(day3.getTime() + 60_000);
  });

  test('a contact after the reminder starts a new 60-day period', async () => {
    const contact = new Date(NOW.getTime() + 2 * DAY);
    await admin.relationship.update({ where: { id: requireId(R.exact60, 'exact60') }, data: { lastContactAt: contact } });
    const { sent: early, mailer: m1 } = fakeMailer();
    await run(m1, new Date(contact.getTime() + 59 * DAY));
    expect(early.some((m) => m.text?.includes(`exact60-${RUN}`))).toBe(false);
    const { sent, mailer } = fakeMailer();
    await run(mailer, new Date(contact.getTime() + 60 * DAY));
    expect(sent.find((m) => m.to === mail(U.tr))?.text).toContain(`exact60-${RUN}`);
  });

  test('a worker killed after the send and before the stamp sends no second digest that day (İNCELEME-51 B-1)', async () => {
    const d = new Date(NOW.getTime() + 100 * DAY);
    await rel('crashA', T.on, U.tr, new Date(d.getTime() - 90 * DAY));
    await rel('crashB', T.on2, U.tr, new Date(d.getTime() - 80 * DAY));
    // The "crash": once a mail is accepted, every later database call fails —
    // nothing after the send runs, as if the process had been killed there.
    let killed = false;
    const crashing: typeof withTenant = (tenantId, fn) => (killed ? Promise.reject(new Error('worker killed')) : withTenant(tenantId, fn));
    const sent: MailMessage[] = [];
    await run(async (m) => {
      sent.push(m);
      killed = true;
    }, d, crashing);
    expect(sent.map((m) => m.to)).toEqual([mail(U.tr)]);
    expect(await stampOf('crashA')).toBeNull();
    expect(await stampOf('crashB')).toBeNull();

    // The retry the same day (graphile re-runs the job): nothing for U.tr.
    const retry = fakeMailer();
    const r = await run(retry.mailer, new Date(d.getTime() + 60_000));
    expect(retry.sent).toHaveLength(0);
    expect(r.skippedMailedToday).toBe(1);
    expect(await stampOf('crashA')).toBeNull();
    // The dry count agrees: a claimed day is not "due" either.
    const dry = await run(null, new Date(d.getTime() + 120_000));
    expect(dry.relationshipsDue).toBe(0);
    expect(dry.reason).toBeUndefined();

    // The next morning the unstamped rows go out, once.
    const next = fakeMailer();
    await run(next.mailer, new Date(d.getTime() + DAY));
    expect(next.sent.map((m) => m.to)).toEqual([mail(U.tr)]);
    expect(next.sent[0]!.text).toContain(`crashA-${RUN}`);
    expect(next.sent[0]!.text).toContain(`crashB-${RUN}`);
    expect((await stampOf('crashA'))?.getTime()).toBe(d.getTime() + DAY);
  });

  test('two runs racing for the same day send one digest (the claim is a compare-and-set)', async () => {
    const d = new Date(NOW.getTime() + 150 * DAY);
    await rel('raceA', T.on, U.tr, new Date(d.getTime() - 70 * DAY));
    const a = fakeMailer();
    const b = fakeMailer();
    await Promise.all([run(a.mailer, d), run(b.mailer, new Date(d.getTime() + 1))]);
    expect([...a.sent, ...b.sent].map((m) => m.to)).toEqual([mail(U.tr)]);
  });

  test('the claim is a compare-and-set: a run that loses the race between its read and its write sends nothing', async () => {
    const d = new Date(NOW.getTime() + 160 * DAY);
    await rel('casA', T.on, U.tr, new Date(d.getTime() - 70 * DAY));
    // Another run claims U.tr's day in the gap between this run's read of the
    // membership and its conditional update.
    let raced = false;
    const racing: typeof withTenant = (tenantId, fn) =>
      withTenant(tenantId, (tx) => {
        const membership = new Proxy(tx.membership, {
          get(target, prop, receiver) {
            if (prop !== 'updateMany' || raced) return Reflect.get(target, prop, receiver);
            return async (args: Parameters<typeof tx.membership.updateMany>[0]) => {
              raced = true;
              await admin.membership.updateMany({ where: { tenantId, userId: U.tr }, data: { staleDigestOn: dayStartUtc(d) } });
              return target.updateMany(args);
            };
          },
        });
        return fn(new Proxy(tx, { get: (t, p, r) => (p === 'membership' ? membership : Reflect.get(t, p, r)) }));
      });
    const { sent, mailer } = fakeMailer();
    const r = await run(mailer, d, racing);
    expect(raced).toBe(true);
    expect(sent).toHaveLength(0);
    expect(r.skippedMailedToday).toBe(1);
    expect(await stampOf('casA')).toBeNull();
  });

  test('a contact logged while the digest is being sent is not stamped as reminded', async () => {
    const d = new Date(NOW.getTime() + 170 * DAY);
    await rel('midRun', T.on, U.tr, new Date(d.getTime() - 75 * DAY));
    const fresh = new Date(d.getTime() - 60_000);
    const sent: MailMessage[] = [];
    await run(async (m) => {
      sent.push(m);
      await admin.relationship.update({ where: { id: requireId(R.midRun, 'midRun') }, data: { lastContactAt: fresh } });
    }, d);
    expect(sent[0]?.text).toContain(`midRun-${RUN}`);
    const row = await admin.relationship.findUnique({ where: { id: requireId(R.midRun, 'midRun') }, select: { staleRemindedAt: true, staleRemindedContactAt: true } });
    expect(row).toEqual({ staleRemindedAt: null, staleRemindedContactAt: null });
  });

  test('a contact logged after the reminder but dated before it starts a new period (İNCELEME-51 B-2)', async () => {
    const e = new Date(NOW.getTime() + 200 * DAY);
    await rel('backdated', T.on, U.tr, new Date(e.getTime() - 61 * DAY));
    const first = fakeMailer();
    await run(first.mailer, e);
    expect(first.sent[0]?.text).toContain(`backdated-${RUN}`);
    // "I called them last week": entered after the reminder, dated a week before it.
    const called = new Date(e.getTime() - 7 * DAY);
    await admin.relationship.update({ where: { id: requireId(R.backdated, 'backdated') }, data: { lastContactAt: called } });
    const early = fakeMailer();
    await run(early.mailer, new Date(called.getTime() + 59 * DAY)); // a day short; also a different UTC day from the next run
    expect(early.sent.some((m) => m.text?.includes(`backdated-${RUN}`))).toBe(false);
    const due = fakeMailer();
    await run(due.mailer, new Date(called.getTime() + 60 * DAY));
    expect(due.sent.find((m) => m.to === mail(U.tr))?.text).toContain(`backdated-${RUN}`);
  });
});
