import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUMO2XIQEHGUD (B-1 of TASK-MUMMERMBJF1LM) — POST /api/invitations must
 * not mail the same address again within 10 minutes, nor more than
 * INVITATION_MAIL_DAILY_LIMIT times per tenant per day. The route handler runs
 * for real against the database, over `fabrika_app` (NOBYPASSRLS, asserted), so
 * the AuditEvent rows the limits count are written and read under the same
 * tenant policy as in production. Only the session, the SMTP transport and
 * SystemAlert are replaced.
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`. Locally a
 * missing database skips the file; in CI it fails (tests/helpers/live-db-role.ts).
 */

const SUITE = 'invitation-mail-limit.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `im-${Date.now().toString(36)}`;

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  /**
   * When set, every transaction waits before its `invitation.upsert` until
   * `barrier.size` transactions have arrived there (or `barrier.ms` passed).
   * Two requests racing without the advisory lock both arrive and pass the
   * limit check together; with the lock the second never gets there while the
   * first holds it, so the first goes on after the timeout.
   */
  barrier: null as null | { size: number; ms: number; waiting: Array<() => void> },
  scope: { tenantId: '', userId: '', role: 'TENANT_OWNER', workspaceIds: [] as string[], isPlatformAdmin: false },
}));
const send = vi.hoisted(() => vi.fn(async (_message: { to: string; subject: string; text?: string }) => {}));
const envOverride = vi.hoisted(() => ({
  NODE_ENV: 'production',
  NEXT_PUBLIC_APP_URL: 'https://app.example.invalid' as string | undefined,
}));
const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));

vi.mock('@/lib/tenant', () => ({
  requireTenantApi: async () => ({ ok: true, scope: state.scope }),
}));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    withTenant: (tenantId: string, cb: Parameters<typeof actual.withTenant>[1]) =>
      actual.withTenantOn(state.rls!, tenantId, (tx) => {
        const barrier = state.barrier;
        if (!barrier) return cb(tx);
        const upsert = tx.invitation.upsert.bind(tx.invitation);
        const gated = new Proxy(tx.invitation, {
          get: (target, key, receiver) =>
            key === 'upsert'
              ? async (...args: Parameters<typeof upsert>) => {
                  await new Promise<void>((resolve) => {
                    barrier.waiting.push(resolve);
                    if (barrier.waiting.length >= barrier.size) barrier.waiting.splice(0).forEach((r) => r());
                    else setTimeout(resolve, barrier.ms);
                  });
                  return upsert(...args);
                }
              : Reflect.get(target, key, receiver),
        });
        return cb(new Proxy(tx, { get: (t, k, r) => (k === 'invitation' ? gated : Reflect.get(t, k, r)) }));
      }),
  };
});
vi.mock('@/lib/email/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/mailer')>();
  return { ...actual, smtpMailer: () => send };
});
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverride ? envOverride[key as keyof typeof envOverride] : Reflect.get(target, key)),
    }),
  };
});
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert }));

const { createDbClient } = await import('@/lib/db');
const { POST } = await import('@/app/api/invitations/route');
const { INVITATION_MAIL_DAILY_LIMIT, INVITATION_MAIL_SENT, INVITATION_ROLE_CHANGE_BLOCKED } = await import(
  '@/lib/email/invitation-mail-policy'
);
const { hashSecretToken } = await import('@/lib/secret-token');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let seq = 0;

type Body = {
  success?: boolean;
  emailSent?: boolean;
  reason?: string;
  inviteLink?: string;
  invitation?: { id: string; role: string };
};

async function invite(email: string, role = 'MEMBER'): Promise<{ status: number; body: Body }> {
  const res = await POST(
    new Request('http://localhost/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role }),
    })
  );
  return { status: res.status, body: (await res.json()) as Body };
}

const nextEmail = () => `${RUN}-${++seq}@example.invalid`;

/** The token in the n-th mailed link (0-based). */
function mailedToken(n: number): string {
  const text = send.mock.calls[n]![0].text ?? '';
  const token = /accept-invite\?token=([0-9a-f]{64})/.exec(text)?.[1];
  if (!token) throw new Error(`mail ${n} carries no invitation link`);
  return token;
}

/** Whether `token` is the one the invitation row for `email` currently accepts. */
async function tokenIsCurrent(email: string, token: string): Promise<boolean> {
  const row = await admin!.invitation.findUnique({
    where: { email_tenantId: { email, tenantId } },
    select: { tokenHash: true },
  });
  return row?.tokenHash === hashSecretToken(token);
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
  try {
    const t = await admin.tenant.create({
      data: { name: `${RUN} Kurum`, slug: RUN, country: 'TR', kind: 'ORGANIZATION' },
      select: { id: true },
    });
    tenantId = t.id;
    state.scope = { ...state.scope, tenantId, userId: `${RUN}-owner` };
    ready = true;
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
  }
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  send.mockReset();
  send.mockImplementation(async () => {});
  recordAlert.mockClear();
  envOverride.NEXT_PUBLIC_APP_URL = 'https://app.example.invalid';
  // One pending invitation at a time keeps every test inside the seat limit.
  await admin!.invitation.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
  await admin!.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
});

afterAll(async () => {
  // Cascades to the tenant's Invitation and AuditEvent rows.
  if (admin && tenantId) await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('POST /api/invitations — mail limits', () => {
  test('a second invitation to the same address within 10 minutes sends no mail and keeps the mailed link valid', async () => {
    const email = nextEmail();
    const first = await invite(email);
    expect(first).toMatchObject({ status: 200, body: { success: true, emailSent: true } });
    expect(first.body.reason).toBeUndefined();
    const mailed = mailedToken(0);
    expect(first.body.inviteLink).toContain(mailed);

    // İNCELEME-26 Ö-1: the double click neither rotates the token the mail
    // holds nor hands the inviter a link; the expiry still updates.
    const before = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });
    const second = await invite(email);
    expect(second).toMatchObject({ status: 200, body: { success: true, emailSent: false, reason: 'recently_sent' } });
    expect(second.body).not.toHaveProperty('inviteLink');
    expect(send).toHaveBeenCalledTimes(1);
    expect(await tokenIsCurrent(email, mailed)).toBe(true);
    const after = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });
    expect(after).toMatchObject({ id: before!.id, role: 'MEMBER' });
    expect(after!.expires.getTime()).toBeGreaterThanOrEqual(before!.expires.getTime());

    // The row the limit counts names the invitation, never the address.
    const rows = await admin!.auditEvent.findMany({ where: { tenantId, type: INVITATION_MAIL_SENT } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target: first.body.invitation!.id, actorId: `${RUN}-owner` });
    expect(JSON.stringify(rows)).not.toContain(email);
  });

  test('within the cooldown a re-invite with another role leaves the mailed invitation as it is and is recorded', async () => {
    // İNCELEME-32 Ö-1: an OWNER mails MEMBER, an ADMIN re-invites as
    // TENANT_ADMIN 5 minutes later; the link in the mail must still make a MEMBER.
    const email = nextEmail();
    const first = await invite(email, 'MEMBER');
    const mailed = mailedToken(0);
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });
    const before = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });

    state.scope = { ...state.scope, userId: `${RUN}-admin`, role: 'TENANT_ADMIN' };
    let second;
    try {
      second = await invite(email, 'TENANT_ADMIN');
    } finally {
      state.scope = { ...state.scope, userId: `${RUN}-owner`, role: 'TENANT_OWNER' };
    }
    expect(second).toMatchObject({
      status: 200,
      body: { success: false, emailSent: false, reason: 'role_change_blocked', invitation: { id: first.body.invitation!.id, role: 'MEMBER' } },
    });
    expect(second.body).not.toHaveProperty('inviteLink');
    expect(send).toHaveBeenCalledTimes(1);

    // Role, token and expiry are exactly as mailed.
    const after = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });
    expect(after).toEqual(before);
    expect(await tokenIsCurrent(email, mailed)).toBe(true);

    const blocked = await admin!.auditEvent.findMany({ where: { tenantId, type: INVITATION_ROLE_CHANGE_BLOCKED } });
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({
      actorId: `${RUN}-admin`,
      target: first.body.invitation!.id,
      data: { from: 'MEMBER', to: 'TENANT_ADMIN' },
    });
    expect(JSON.stringify(blocked)).not.toContain(email);
    // The blocked attempt sent nothing, so it does not count toward the limits.
    expect(await admin!.auditEvent.count({ where: { tenantId, type: INVITATION_MAIL_SENT } })).toBe(1);

    // After the cooldown the role change goes through, with a fresh mail.
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const third = await invite(email, 'TENANT_ADMIN');
    expect(third.body).toMatchObject({ success: true, emailSent: true, invitation: { role: 'TENANT_ADMIN' } });
    expect(await tokenIsCurrent(email, mailedToken(1))).toBe(true);
  });

  test('within the cooldown a re-invite with the same role pushes the expiry out and keeps the token', async () => {
    // İNCELEME-32 Ö-3 (mutant Y3): the kept-token update still sets `expires`.
    const email = nextEmail();
    await invite(email, 'WRITER');
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    await admin!.invitation.update({ where: { email_tenantId: { email, tenantId } }, data: { expires: soon } });

    const again = await invite(email, 'WRITER');
    expect(again.body).toMatchObject({ success: true, emailSent: false, reason: 'recently_sent' });
    const row = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });
    expect(row!.role).toBe('WRITER');
    // A fresh 7 days, not the hour left on the row.
    expect(row!.expires.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(true);
  });

  test('an address inside its cooldown is recently_sent even when the tenant is at the daily limit', async () => {
    // İNCELEME-32 Ö-2 (mutant Y11): the cooldown is checked before the daily
    // limit. The other way round this re-invite reads daily_limit, rotates the
    // token and kills the link mailed 2 minutes ago.
    const email = nextEmail();
    await invite(email);
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 1000) },
    });
    await admin!.auditEvent.createMany({
      data: Array.from({ length: INVITATION_MAIL_DAILY_LIMIT - 1 }, (_, i) => ({
        tenantId,
        type: INVITATION_MAIL_SENT,
        target: `${RUN}-both-${i}`,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      })),
    });
    const res = await invite(email);
    expect(res.body).toMatchObject({ emailSent: false, reason: 'recently_sent' });
    expect(res.body).not.toHaveProperty('inviteLink');
    expect(send).toHaveBeenCalledTimes(1);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(true);
  });

  test('after the cooldown the same address is mailed again', async () => {
    const email = nextEmail();
    await invite(email);
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const again = await invite(email);
    expect(again.body).toMatchObject({ emailSent: true });
    expect(send).toHaveBeenCalledTimes(2);
    // A new mail carries a new token; that one is valid, the old one is not.
    expect(mailedToken(1)).not.toBe(mailedToken(0));
    expect(await tokenIsCurrent(email, mailedToken(1))).toBe(true);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(false);
  });

  test('re-inviting an address whose earlier invitation was accepted reopens it with a fresh link', async () => {
    // İNCELEME-34 B-3 (mutant N1): the person was a member and has left (no
    // membership now). A new link without `acceptedAt: null` would open on
    // "this invitation was already used" and never let them rejoin.
    const email = nextEmail();
    await invite(email);
    await admin!.invitation.update({
      where: { email_tenantId: { email, tenantId } },
      data: { acceptedAt: new Date() },
    });
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const again = await invite(email);
    expect(again).toMatchObject({ status: 200, body: { success: true, emailSent: true } });
    const row = await admin!.invitation.findUniqueOrThrow({
      where: { email_tenantId: { email, tenantId } },
      select: { acceptedAt: true },
    });
    expect(row.acceptedAt).toBeNull();
    expect(await tokenIsCurrent(email, mailedToken(1))).toBe(true);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(false);
  });

  test('9 minutes after a mail the same address is still cooling down', async () => {
    // Pins the 10-minute constant from below (İNCELEME-26 Ö-2, mutant X2).
    const email = nextEmail();
    await invite(email);
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 9 * 60 * 1000) },
    });
    const again = await invite(email);
    expect(again.body).toMatchObject({ emailSent: false, reason: 'recently_sent' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(true);
  });

  test('a send the SMTP server refused does not start a cooldown', async () => {
    const email = nextEmail();
    send.mockRejectedValueOnce(new Error('smtp:ECONNECTION'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await invite(email);
    expect(failed.body).toMatchObject({ emailSent: false, reason: 'send_failed' });

    const retry = await invite(email);
    expect(retry.body).toMatchObject({ emailSent: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('two concurrent invitations to one address send one mail', async () => {
    const email = nextEmail();
    state.barrier = { size: 2, ms: 500, waiting: [] };
    const [a, b] = await Promise.all([invite(email), invite(email)]).finally(() => {
      state.barrier = null;
    });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.emailSent, b.body.emailSent].sort()).toEqual([false, true]);
    expect(send).toHaveBeenCalledTimes(1);
    // The request that lost the race must not rotate the token just mailed.
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(true);
  });

  test('two concurrent invitations with different roles leave the mailed role in place', async () => {
    // İNCELEME-32 §2.4: the request that lost the race used to write its role
    // last, under the winner's mailed link.
    const email = nextEmail();
    state.barrier = { size: 2, ms: 500, waiting: [] };
    const [a, b] = await Promise.all([invite(email, 'MEMBER'), invite(email, 'WRITER')]).finally(() => {
      state.barrier = null;
    });
    const [won, lost] = a.body.emailSent ? [a, b] : [b, a];
    expect(won.body.emailSent).toBe(true);
    expect(lost.body).toMatchObject({ emailSent: false, reason: 'role_change_blocked' });
    expect(send).toHaveBeenCalledTimes(1);
    const row = await admin!.invitation.findUnique({ where: { email_tenantId: { email, tenantId } } });
    expect(row!.role).toBe(won.body.invitation!.role);
    expect(await tokenIsCurrent(email, mailedToken(0))).toBe(true);
  });

  test('past the daily limit no mail is sent, the invitation is still issued, and a warning is raised', async () => {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await admin!.auditEvent.createMany({
      data: Array.from({ length: INVITATION_MAIL_DAILY_LIMIT }, (_, i) => ({
        tenantId,
        type: INVITATION_MAIL_SENT,
        target: `${RUN}-old-${i}`,
        createdAt: hourAgo,
      })),
    });
    const res = await invite(nextEmail());
    expect(res).toMatchObject({ status: 200, body: { success: true, emailSent: false, reason: 'daily_limit' } });
    expect(res.body.inviteLink).toContain('/tr/accept-invite?token=');
    expect(send).not.toHaveBeenCalled();
    expect(recordAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', dedupeKey: `invitation-mail-daily-limit:${tenantId}` })
    );
  });

  test('past the daily limit a re-invitation still gets a fresh link that works', async () => {
    // Only `recently_sent` keeps the token; with no mail going out at all the
    // inviter's link is the only one, so it must be the stored one.
    const email = nextEmail();
    await invite(email);
    await admin!.auditEvent.updateMany({
      where: { tenantId: requireId(tenantId, 'tenantId') },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    await admin!.auditEvent.createMany({
      data: Array.from({ length: INVITATION_MAIL_DAILY_LIMIT }, (_, i) => ({
        tenantId,
        type: INVITATION_MAIL_SENT,
        target: `${RUN}-full-${i}`,
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      })),
    });
    const res = await invite(email);
    expect(res.body).toMatchObject({ emailSent: false, reason: 'daily_limit' });
    const token = /token=([0-9a-f]{64})$/.exec(res.body.inviteLink ?? '')?.[1];
    expect(token).toBeDefined();
    expect(token).not.toBe(mailedToken(0));
    expect(await tokenIsCurrent(email, token!)).toBe(true);
  });

  test('rows 23 hours old still count toward the daily limit', async () => {
    // Pins the 24-hour window from below (İNCELEME-26 Ö-2, mutant X6).
    await admin!.auditEvent.createMany({
      data: Array.from({ length: INVITATION_MAIL_DAILY_LIMIT }, (_, i) => ({
        tenantId,
        type: INVITATION_MAIL_SENT,
        target: `${RUN}-day-${i}`,
        createdAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
      })),
    });
    const res = await invite(nextEmail());
    expect(res.body).toMatchObject({ emailSent: false, reason: 'daily_limit' });
    expect(send).not.toHaveBeenCalled();
  });

  test('rows older than 24 hours do not count toward the daily limit', async () => {
    await admin!.auditEvent.createMany({
      data: Array.from({ length: INVITATION_MAIL_DAILY_LIMIT }, (_, i) => ({
        tenantId,
        type: INVITATION_MAIL_SENT,
        target: `${RUN}-older-${i}`,
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      })),
    });
    const res = await invite(nextEmail());
    expect(res.body).toMatchObject({ emailSent: true });
  });

  test('without a usable NEXT_PUBLIC_APP_URL in production nothing is mailed and an error alert is raised', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // http:// and a query in production: İNCELEME-39 B-1/B-3, the docs promise
    // mails stay off for them rather than carry the token over http.
    for (const url of [undefined, 'http://localhost:3000', 'http://app.example.invalid', 'https://app.example.invalid/?x=1']) {
      envOverride.NEXT_PUBLIC_APP_URL = url;
      recordAlert.mockClear();
      const res = await invite(nextEmail());
      expect(res).toMatchObject({ status: 200, body: { success: true, emailSent: false, reason: 'app_url_not_configured' } });
      expect(recordAlert).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', dedupeKey: 'invitation-mail-app-url-missing' })
      );
      // The inviter still gets a link to pass on by hand, never an http:// one.
      expect(res.body.inviteLink).toMatch(/^https:\/\/nexagrant\.com\/tr\/accept-invite\?token=/);
      await admin!.invitation.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
    }
    expect(send).not.toHaveBeenCalled();
    // Nothing was attempted, so nothing counts toward the limits.
    expect(await admin!.auditEvent.count({ where: { tenantId, type: INVITATION_MAIL_SENT } })).toBe(0);
  });

  test('the mailed link is built from NEXT_PUBLIC_APP_URL and the subject carries a cut tenant name', async () => {
    await admin!.tenant.update({ where: { id: tenantId }, data: { name: `${'A'.repeat(200)}` } });
    try {
      const res = await invite(nextEmail());
      expect(res.body.emailSent).toBe(true);
      const mail = send.mock.calls[0]![0];
      expect(mail.text).toContain(res.body.inviteLink);
      expect(mail.text).not.toContain('localhost');
      expect(Array.from(mail.subject.split(' — ')[0]!)).toHaveLength(80);
    } finally {
      await admin!.tenant.update({ where: { id: tenantId }, data: { name: `${RUN} Kurum` } });
    }
  });
});
