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
import { sqlStatements } from './helpers/sql-statements';

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
// İNCELEME-56 Y-1: two tenants of U.y1, pro + M4 ON, run on their own (runY1).
const Y1 = { a: `t-st-y1a-${RUN}`, b: `t-st-y1b-${RUN}` };
// İNCELEME-69 D-2: two tenants of U.d2, pro + M4 ON, each run on its own.
const D2 = { a: `t-st-d2a-${RUN}`, b: `t-st-d2b-${RUN}` };
const ALL_TENANTS = [...TENANTS, Y1.a, Y1.b, D2.a, D2.b];
const U = {
  tr: `u-st-tr-${RUN}`,
  en: `u-st-en-${RUN}`,
  gone: `u-st-gone-${RUN}`,
  member: `u-st-mem-${RUN}`,
  manager: `u-st-mgr-${RUN}`,
  y1: `u-st-y1-${RUN}`,
  d2: `u-st-d2-${RUN}`,
  d1: `u-st-d1-${RUN}`,
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

/** The UTC day `userId`'s digest was last claimed (İNCELEME-69 D-1: on the user, not a membership). */
async function claimOf(userId: string): Promise<Date | null> {
  const row = await admin.user.findUnique({ where: { id: userId }, select: { staleDigestOn: true } });
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

const runY1 = (mailer: (m: MailMessage) => Promise<void>, now: Date, runTenant?: typeof withTenant) =>
  sendStaleRelationshipReminders({ mailer, appUrl: 'https://app.example.test', now, tenantIds: [Y1.a, Y1.b], runTenant });

const run = (mailer: ((m: MailMessage) => Promise<void>) | null, now: Date = NOW, runTenant?: typeof withTenant) =>
  sendStaleRelationshipReminders({ mailer, appUrl: 'https://app.example.test', now, tenantIds: TENANTS, pageSize: 2, runTenant });

async function wipe() {
  await admin.relationship.deleteMany({ where: { tenantId: { in: presentIds(ALL_TENANTS) } } });
  await admin.auditEvent.deleteMany({ where: { tenantId: { in: presentIds(ALL_TENANTS) } } });
  await admin.tenant.deleteMany({ where: { id: { in: presentIds(ALL_TENANTS) } } });
  await admin.user.deleteMany({ where: { id: { in: presentIds(USERS) } } });
}

beforeAll(async () => {
  if (!HAS_DB) return;
  for (const id of ALL_TENANTS) {
    await admin.tenant.create({ data: { id, name: id === T.on ? `Kurum <b>&${RUN}` : id, slug: id, country: 'TR' } });
    await admin.workspace.create({ data: { tenantId: id, name: 'Ana', slug: `ws-${id}` } });
  }
  for (const id of [T.on, T.on2, T.pilotModule, T.off, Y1.a, Y1.b, D2.a, D2.b]) {
    await admin.subscription.create({ data: { tenantId: id, planId: 'pro', status: 'ACTIVE' } });
  }
  await admin.subscription.create({
    data: { tenantId: T.expired, planId: 'public-team', status: 'TRIALING', provider: 'pilot', trialEndsAt: new Date(Date.now() - 60_000) },
  });
  const status: Record<string, 'ON' | 'PILOT' | 'OFF'> = { [T.on]: 'ON', [T.on2]: 'ON', [T.pilotModule]: 'PILOT', [T.off]: 'OFF', [T.noPlan]: 'ON', [T.expired]: 'ON', [Y1.a]: 'ON', [Y1.b]: 'ON', [D2.a]: 'ON', [D2.b]: 'ON' };
  for (const [tenantId, s] of Object.entries(status)) await admin.moduleState.create({ data: { tenantId, moduleId: 'M4', status: s } });

  await admin.user.create({ data: { id: U.tr, email: mail(U.tr), locale: 'tr' } });
  await admin.user.create({ data: { id: U.en, email: mail(U.en), locale: 'en' } });
  await admin.user.create({ data: { id: U.gone, email: mail(U.gone), deletionRequestedAt: new Date() } });
  await admin.user.create({ data: { id: U.member, email: mail(U.member) } });
  await admin.user.create({ data: { id: U.manager, email: mail(U.manager) } });
  await admin.user.create({ data: { id: U.y1, email: mail(U.y1) } });
  await admin.user.create({ data: { id: U.d2, email: mail(U.d2) } });
  await admin.user.create({ data: { id: U.d1, email: mail(U.d1) } });
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
  await member(Y1.a, U.y1);
  await member(Y1.b, U.y1);
  await member(D2.a, U.d2);
  await member(D2.b, U.d2);
  await member(D2.a, U.d1);
  await member(D2.b, U.d1);

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
    // The day is claimed on each mailed user, and on no one else.
    const today = dayStartUtc(NOW).getTime();
    for (const u of [U.tr, U.en, U.manager]) expect((await claimOf(u))?.getTime()).toBe(today);
    for (const u of [U.gone, U.member]) expect(await claimOf(u)).toBeNull();
    // The retired per-membership column is neither read nor written any more.
    const legacy = await admin.membership.findMany({ where: { tenantId: { in: TENANTS } }, select: { staleDigestOn: true } });
    expect(legacy.every((m) => m.staleDigestOn === null)).toBe(true);
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
    expect((await claimOf(U.tr))?.getTime()).not.toBe(dayStartUtc(day3).getTime());
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

  test('the claim is a compare-and-set: a run that loses the race after reading the day as free sends nothing', async () => {
    const d = new Date(NOW.getTime() + 160 * DAY);
    await rel('casA', T.on, U.tr, new Date(d.getTime() - 70 * DAY));
    // Another run claims U.tr's day right after this run read the claims (the
    // findMany over users, which still sees the day free). This run's own
    // claim statement runs untouched, so only its condition can stop it.
    const read = prisma.user.findMany.bind(prisma.user);
    let raced = false;
    const spy = vi.spyOn(prisma.user, 'findMany').mockImplementation((async (args: Parameters<typeof read>[0]) => {
      const rows = await read(args);
      if (!raced && args?.where?.staleDigestOn) {
        raced = true;
        await admin.user.update({ where: { id: U.tr }, data: { staleDigestOn: dayStartUtc(d) } });
      }
      return rows;
    }) as unknown as typeof read);
    let r;
    const { sent, mailer } = fakeMailer();
    try {
      r = await run(mailer, d);
    } finally {
      spy.mockRestore();
    }
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
  // İNCELEME-56 Y-1: the day was claimed in one tenant, and on the second run
  // that tenant is skipped before its claims are read (M4 closed, pilot over,
  // or the tenant's read failing). A row that went stale in ANOTHER tenant in
  // between must still wait for tomorrow: the claim is the user's, not the tenant's.
  const y1Day = (offsetDays: number) => new Date(dayStartUtc(new Date(NOW.getTime() + offsetDays * DAY)).getTime() + 7 * 60 * 60 * 1000);
  const setM4 = (tenantId: string, status: 'ON' | 'OFF') =>
    admin.moduleState.update({ where: { tenantId_moduleId: { tenantId, moduleId: 'M4' } }, data: { status } });

  async function y1FirstDigest(d: Date, key: string) {
    await rel(`${key}First`, Y1.b, U.y1, new Date(d.getTime() - 65 * DAY));
    const first = fakeMailer();
    await runY1(first.mailer, d); // 07:00: only Y1.b has a due row for U.y1
    expect(first.sent).toHaveLength(1);
    expect(first.sent[0]!.text).toContain(`${key}First-${RUN}`);
    expect((await claimOf(U.y1))?.getTime()).toBe(dayStartUtc(d).getTime());
    // Goes stale in the OTHER tenant at 07:20.
    await rel(`${key}Late`, Y1.a, U.y1, new Date(d.getTime() + 20 * 60_000 - 60 * DAY));
  }

  async function y1NextMorning(d: Date, key: string) {
    const next = fakeMailer();
    await runY1(next.mailer, new Date(d.getTime() + DAY));
    expect(next.sent).toHaveLength(1);
    expect(next.sent[0]!.text).toContain(`${key}Late-${RUN}`);
  }

  test('a tenant skipped on the second run (M4 closed) does not hide the day claimed there: no second digest (İNCELEME-56 Y-1)', async () => {
    const d = y1Day(300);
    await y1FirstDigest(d, 'y1m');
    await setM4(Y1.b, 'OFF');
    try {
      const second = fakeMailer();
      const r = await runY1(second.mailer, new Date(d.getTime() + 22 * 60_000));
      expect(r.tenantsModuleClosed).toBe(1);
      expect(second.sent).toHaveLength(0);
      expect(await stampOf('y1mLate')).toBeNull();
      // The first run's claim stands; the second one neither took nor gave back anything.
      expect((await claimOf(U.y1))?.getTime()).toBe(dayStartUtc(d).getTime());
    } finally {
      await setM4(Y1.b, 'ON');
    }
    await y1NextMorning(d, 'y1m');
  });

  test('a tenant whose read fails on the second run does not hide the day claimed there (İNCELEME-56 Y-1)', async () => {
    const d = y1Day(310);
    await y1FirstDigest(d, 'y1f');
    const failing: typeof withTenant = (tenantId, fn) =>
      tenantId === Y1.b ? Promise.reject(new Error('tenant down')) : withTenant(tenantId, fn);
    const second = fakeMailer();
    const r = await runY1(second.mailer, new Date(d.getTime() + 22 * 60_000), failing);
    expect(r.tenantsFailed).toBe(1);
    expect(second.sent).toHaveLength(0);
    expect(await stampOf('y1fLate')).toBeNull();
    expect((await claimOf(U.y1))?.getTime()).toBe(dayStartUtc(d).getTime());
    await y1NextMorning(d, 'y1f');
  });

  // İNCELEME-69 D-2: the two properties the code only stated in comments.
  const runD2 = (mailer: (m: MailMessage) => Promise<void>, now: Date, tenantIds: readonly string[], runTenant?: typeof withTenant) =>
    sendStaleRelationshipReminders({ mailer, appUrl: 'https://app.example.test', now, tenantIds, runTenant });

  test('two runs over disjoint tenants racing for the same user send exactly one digest (İNCELEME-69 D-2, İNCELEME-56 R-1)', async () => {
    const d = y1Day(400);
    await rel('d2RaceA', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
    await rel('d2RaceB', D2.b, U.d2, new Date(d.getTime() - 65 * DAY));
    // Run A sees only D2.a and run B only D2.b. Each is parked after its
    // collection (its first call into the tenant) until the other has
    // collected too, so both read the day as free and both go for the claim.
    let arrived = 0;
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const parkedAfterCollect = (): typeof withTenant => {
      let calls = 0;
      return (async (tenantId, fn) => {
        const result = await withTenant(tenantId, fn);
        if (++calls === 1) {
          if (++arrived === 2) open();
          await gate;
        }
        return result;
      }) as typeof withTenant;
    };
    const a = fakeMailer();
    const b = fakeMailer();
    const [ra, rb] = await Promise.all([
      runD2(a.mailer, d, [D2.a], parkedAfterCollect()),
      runD2(b.mailer, d, [D2.b], parkedAfterCollect()),
    ]);
    expect(arrived).toBe(2);
    // One wins, one stands down: never two digests, and never none (R-1).
    expect([...a.sent, ...b.sent].map((m) => m.to)).toEqual([mail(U.d2)]);
    expect(ra.digestsSent + rb.digestsSent).toBe(1);
    expect(ra.skippedMailedToday + rb.skippedMailedToday).toBe(1);
    expect((await claimOf(U.d2))?.getTime()).toBe(dayStartUtc(d).getTime());
  });

  test('a failing claim sends nothing and holds no claim (İNCELEME-69 D-2)', async () => {
    const d = y1Day(410);
    await rel('d2FailA', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
    const raw = prisma.$queryRaw.bind(prisma);
    let failed = 0;
    const spy = vi.spyOn(prisma, '$queryRaw').mockImplementation(((query: TemplateStringsArray, ...values: unknown[]) => {
      if (Array.isArray(query) && query.join('?').includes('SET "staleDigestOn"')) {
        failed++;
        return Promise.reject(new Error('canceling statement due to lock timeout'));
      }
      return raw(query, ...values);
    }) as typeof prisma.$queryRaw);
    let r;
    const { sent, mailer } = fakeMailer();
    try {
      r = await runD2(mailer, d, [D2.a, D2.b]);
    } finally {
      spy.mockRestore();
    }
    expect(failed).toBe(1);
    expect(sent).toHaveLength(0);
    expect(r.digestsSent).toBe(0);
    expect(r.digestsFailed).toBe(1);
    expect(r.errors).toEqual([{ scope: 'digest', reason: 'canceling statement due to lock timeout' }]);
    expect(await stampOf('d2FailA')).toBeNull();
    expect((await claimOf(U.d2))?.getTime()).not.toBe(dayStartUtc(d).getTime());
    // Nothing held: a run later that day, with the claim working, sends.
    const retry = fakeMailer();
    await runD2(retry.mailer, new Date(d.getTime() + 60_000), [D2.a, D2.b]);
    expect(retry.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
  });

  test('a member removed from the tenant the day was claimed through gets no second digest that day (İNCELEME-69 D-1)', async () => {
    const d = y1Day(420);
    await rel('d1First', D2.b, U.d1, new Date(d.getTime() - 65 * DAY));
    const first = fakeMailer();
    await runD2(first.mailer, d, [D2.a, D2.b]);
    expect(first.sent.filter((m) => m.to === mail(U.d1))).toHaveLength(1);
    // Removed from D2.b (the membership row is hard-deleted, as a tenant
    // deletion's cascade would too), and a row in D2.a goes stale at 07:20.
    await admin.membership.delete({ where: { tenantId_userId: { tenantId: D2.b, userId: U.d1 } } });
    await rel('d1Late', D2.a, U.d1, new Date(d.getTime() + 20 * 60_000 - 60 * DAY));
    const second = fakeMailer();
    const r = await runD2(second.mailer, new Date(d.getTime() + 22 * 60_000), [D2.a, D2.b]);
    expect(second.sent.filter((m) => m.to === mail(U.d1))).toHaveLength(0);
    expect(r.skippedMailedToday).toBe(1);
    expect(await stampOf('d1Late')).toBeNull();
    const next = fakeMailer();
    await runD2(next.mailer, new Date(d.getTime() + DAY), [D2.a, D2.b]);
    const own = next.sent.filter((m) => m.to === mail(U.d1));
    expect(own).toHaveLength(1);
    expect(own[0]!.text).toContain(`d1Late-${RUN}`);
  });

  // ── TASK-MUOADTEOQVL4Z (İNCELEME-95 B-1, T-1..T-3) ─────────────────────────

  test('a claim the previous release wrote on a membership today holds; yesterday\'s does not (İNCELEME-95 B-1)', async () => {
    // Deploy day: the migration's backfill has run, then the previous release's
    // worker ticks once more and claims on the membership, not on the user.
    const d = y1Day(500);
    await rel('b1First', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
    await admin.membership.update({
      where: { tenantId_userId: { tenantId: D2.b, userId: U.d2 } },
      data: { staleDigestOn: dayStartUtc(d) },
    });
    const before = await claimOf(U.d2);
    // The claim sits on a tenant with nothing due for U.d2 now, and whose M4
    // has since closed: it is read before the tenant's gates, not after.
    await setM4(D2.b, 'OFF');
    const same = fakeMailer();
    let r;
    try {
      r = await runD2(same.mailer, new Date(d.getTime() + 22 * 60_000), [D2.a, D2.b]);
    } finally {
      await setM4(D2.b, 'ON');
    }
    expect(same.sent).toHaveLength(0);
    expect(r.skippedMailedToday).toBe(1);
    expect(r.digestsSent).toBe(0);
    expect(await stampOf('b1First')).toBeNull();
    expect(await claimOf(U.d2)).toEqual(before); // read only, the user row is not touched
    // The next day the old claim is history: the digest goes out.
    const next = fakeMailer();
    await runD2(next.mailer, new Date(d.getTime() + DAY), [D2.a, D2.b]);
    expect(next.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
  });

  test('the day is the UTC day in any process time zone: −11 sends no second digest the same UTC day (İNCELEME-95 T-1)', async () => {
    // Pago Pago is UTC−11: 07:00Z is still the previous local day, 11:30Z the
    // UTC day itself. Claiming the LOCAL day lets the 11:30 run (a retry, the
    // 6 h fill) claim "a newer day" and mail the same user twice in one UTC day.
    const tz = process.env.TZ;
    process.env.TZ = 'Pacific/Pago_Pago';
    try {
      expect(new Date(Date.UTC(2026, 0, 2, 7)).getDate()).toBe(1); // the zone took effect
      const d = y1Day(510);
      await rel('t1Due', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
      const first = fakeMailer();
      await runD2(first.mailer, d, [D2.a, D2.b]);
      expect(first.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
      expect((await claimOf(U.d2))?.getTime()).toBe(dayStartUtc(d).getTime());
      await rel('t1Late', D2.b, U.d2, new Date(d.getTime() + 4 * 60 * 60_000 - 60 * DAY));
      const second = fakeMailer();
      const r = await runD2(second.mailer, new Date(d.getTime() + 4.5 * 60 * 60_000), [D2.a, D2.b]);
      expect(second.sent).toHaveLength(0);
      expect(r.skippedMailedToday).toBe(1);
    } finally {
      process.env.TZ = tz;
      if (tz === undefined) delete process.env.TZ;
    }
  });

  test('the day is the UTC day in any process time zone: +14 claims the UTC day, and the next UTC day still sends (İNCELEME-95 T-1)', async () => {
    // Kiritimati is UTC+14: 23:30Z is already the next local day.
    const tz = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    try {
      expect(new Date(Date.UTC(2026, 0, 1, 23)).getDate()).toBe(2);
      const d = new Date(dayStartUtc(y1Day(520)).getTime() + 23.5 * 60 * 60_000);
      await rel('t1Night', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
      const first = fakeMailer();
      await runD2(first.mailer, d, [D2.a, D2.b]);
      expect(first.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
      expect((await claimOf(U.d2))?.getTime()).toBe(dayStartUtc(d).getTime());
      // 07:00Z the next UTC day, a new row due: that day's digest is not lost.
      const morning = new Date(dayStartUtc(d).getTime() + DAY + 7 * 60 * 60_000);
      await rel('t1Morning', D2.b, U.d2, new Date(morning.getTime() - 61 * DAY));
      const next = fakeMailer();
      await runD2(next.mailer, morning, [D2.a, D2.b]);
      expect(next.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
    } finally {
      process.env.TZ = tz;
      if (tz === undefined) delete process.env.TZ;
    }
  });

  test('a rejected send gives back only its own day: a later day claimed meanwhile stays (İNCELEME-95 T-2)', async () => {
    // Run A claims day D and its send hangs; run B claims D+1 and sends; then
    // A's send is rejected. A's give-back must not wipe B's claim, or a third
    // run on D+1 mails the user again.
    const d = y1Day(530);
    const d1 = new Date(d.getTime() + DAY);
    await rel('t2Row', D2.a, U.d2, new Date(d.getTime() - 65 * DAY));
    let releaseA!: () => void;
    const aMayFail = new Promise<void>((resolve) => (releaseA = resolve));
    let aInSend!: () => void;
    const aSending = new Promise<void>((resolve) => (aInSend = resolve));
    const a = sendStaleRelationshipReminders({
      appUrl: 'https://app.example.test',
      now: d,
      tenantIds: [D2.a, D2.b],
      mailer: async () => {
        aInSend();
        await aMayFail;
        throw new Error('smtp:ETIMEDOUT');
      },
    });
    await aSending;
    expect((await claimOf(U.d2))?.getTime()).toBe(dayStartUtc(d).getTime());
    const b = fakeMailer();
    await runD2(b.mailer, d1, [D2.a, D2.b]);
    expect(b.sent.map((m) => m.to)).toEqual([mail(U.d2)]);
    releaseA();
    const ra = await a;
    expect(ra.digestsFailed).toBe(1);
    expect((await claimOf(U.d2))?.getTime()).toBe(dayStartUtc(d1).getTime());
    await rel('t2Late', D2.b, U.d2, new Date(d1.getTime() + 20 * 60_000 - 60 * DAY));
    const c = fakeMailer();
    const rc = await runD2(c.mailer, new Date(d1.getTime() + 22 * 60_000), [D2.a, D2.b]);
    expect(c.sent).toHaveLength(0);
    expect(rc.skippedMailedToday).toBe(1);
  });

  test('the migration backfills the latest membership claim, never lowers one, and leaves Membership FORCEd (İNCELEME-95 T-3)', async () => {
    const d = dayStartUtc(y1Day(540));
    const day = (n: number) => new Date(d.getTime() + n * DAY);
    const forced = async () =>
      (await admin.$queryRaw<Array<{ f: boolean }>>`SELECT relforcerowsecurity AS f FROM pg_class WHERE oid = '"Membership"'::regclass`)[0]?.f;
    // CI and a `pnpm db:rls`-ed database FORCE it; the file must leave it so.
    expect(await forced()).toBe(true);
    // U.d1: no user claim, two membership claims → the later one.
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = NULL WHERE id = ${U.d1}`;
    await admin.membership.update({ where: { tenantId_userId: { tenantId: D2.a, userId: U.d1 } }, data: { staleDigestOn: day(-3) } });
    await admin.membership.update({ where: { tenantId_userId: { tenantId: D2.b, userId: U.d2 } }, data: { staleDigestOn: day(-1) } });
    await admin.membership.update({ where: { tenantId_userId: { tenantId: D2.a, userId: U.d2 } }, data: { staleDigestOn: day(-5) } });
    // U.d2: its user claim is newer than any membership's → untouched.
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = ${day(0).toISOString().slice(0, 10)}::date WHERE id = ${U.d2}`;
    // U.y1: user claim older than its membership claims → raised to the latest.
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = ${day(-9).toISOString().slice(0, 10)}::date WHERE id = ${U.y1}`;
    await admin.membership.update({ where: { tenantId_userId: { tenantId: Y1.a, userId: U.y1 } }, data: { staleDigestOn: day(-2) } });
    await admin.membership.update({ where: { tenantId_userId: { tenantId: Y1.b, userId: U.y1 } }, data: { staleDigestOn: day(-4) } });

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { default: pg } = await import('pg');
    const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/m4-stale-digest-user-claim.sql'), 'utf8');
    const client = new pg.Client({ connectionString: OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika' });
    await client.connect();
    try {
      // Statement by statement, as psql applies it in production: one implicit
      // transaction would hold "User" while waiting for "Membership" and
      // deadlock other files' requests (tests/helpers/sql-statements.ts).
      for (const statement of sqlStatements(sql)) await client.query(statement);
      for (const statement of sqlStatements(sql)) await client.query(statement); // idempotent: a second run changes nothing
    } finally {
      await client.end();
    }
    expect((await claimOf(U.d1))?.getTime()).toBe(day(-3).getTime());
    expect((await claimOf(U.d2))?.getTime()).toBe(day(0).getTime());
    expect((await claimOf(U.y1))?.getTime()).toBe(day(-2).getTime());
    expect(await forced()).toBe(true);
    await admin.membership.updateMany({ where: { userId: { in: [U.d1, U.d2, U.y1] } }, data: { staleDigestOn: null } });
  });

  test('re-running the idempotency backfill leaves a day the user already claimed off "Membership" (İNCELEME-106 Y-1)', async () => {
    // The release that claims on the user stamps with the claim's `now`. A later
    // run of the whole chain (a second deploy, a hotfix) must not copy that stamp
    // back onto the member's NULL column: RELEASE_CHECKLIST §3.1 reads any new
    // "Membership" claim as a pre-f7a6dcf5 worker still running.
    const at = y1Day(550);
    const day = dayStartUtc(at);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const membershipClaim = async (tenantId: string, userId: string) =>
      (await admin.membership.findUnique({ where: { tenantId_userId: { tenantId, userId } }, select: { staleDigestOn: true } }))?.staleDigestOn ?? null;
    await admin.membership.updateMany({ where: { userId: { in: presentIds(USERS) } }, data: { staleDigestOn: null } });
    await rel('y106d1', D2.a, U.d1, new Date(at.getTime() - 70 * DAY), { staleRemindedAt: at, staleRemindedContactAt: new Date(at.getTime() - 70 * DAY) });
    await rel('y106d2', D2.a, U.d2, new Date(at.getTime() - 70 * DAY), { staleRemindedAt: at, staleRemindedContactAt: new Date(at.getTime() - 70 * DAY) });
    await rel('y106y1', Y1.a, U.y1, new Date(at.getTime() - 70 * DAY), { staleRemindedAt: at, staleRemindedContactAt: new Date(at.getTime() - 70 * DAY) });
    // U.d1: the new release sent today's digest (user claim = stamp day) → skipped.
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = ${iso(day)}::date WHERE id = ${U.d1}`;
    // U.d2: no user claim → the backfill still does its job (a stamp from a release without claims).
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = NULL WHERE id = ${U.d2}`;
    // U.y1: user claim a day older than the stamp → not covered, filled.
    await admin.$executeRaw`UPDATE "User" SET "staleDigestOn" = ${iso(new Date(day.getTime() - DAY))}::date WHERE id = ${U.y1}`;

    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { default: pg } = await import('pg');
    const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/m4-stale-reminder-idempotency.sql'), 'utf8');
    const client = new pg.Client({ connectionString: OWNER_URL ?? 'postgresql://fabrika:fabrika@localhost:5432/fabrika' });
    await client.connect();
    try {
      for (const statement of sqlStatements(sql)) await client.query(statement);
      for (const statement of sqlStatements(sql)) await client.query(statement);
    } finally {
      await client.end();
    }
    expect(await membershipClaim(D2.a, U.d1)).toBeNull();
    expect((await membershipClaim(D2.a, U.d2))?.getTime()).toBe(day.getTime());
    expect((await membershipClaim(Y1.a, U.y1))?.getTime()).toBe(day.getTime());
    await admin.membership.updateMany({ where: { userId: { in: presentIds(USERS) } }, data: { staleDigestOn: null } });
  });
});
