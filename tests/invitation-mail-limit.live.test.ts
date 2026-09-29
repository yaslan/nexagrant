import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

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
    env: new Proxy(actual.env, {
      get: (target, key) => (key in envOverride ? envOverride[key as keyof typeof envOverride] : Reflect.get(target, key)),
    }),
  };
});
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert }));

const { createDbClient } = await import('@/lib/db');
const { POST } = await import('@/app/api/invitations/route');
const { INVITATION_MAIL_DAILY_LIMIT, INVITATION_MAIL_SENT } = await import('@/lib/email/invitation-mail-policy');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let seq = 0;

type Body = { success?: boolean; emailSent?: boolean; reason?: string; inviteLink?: string; invitation?: { id: string } };

async function invite(email: string): Promise<{ status: number; body: Body }> {
  const res = await POST(
    new Request('http://localhost/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role: 'MEMBER' }),
    })
  );
  return { status: res.status, body: (await res.json()) as Body };
}

const nextEmail = () => `${RUN}-${++seq}@example.invalid`;

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
  await admin!.invitation.deleteMany({ where: { tenantId } });
  await admin!.auditEvent.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  // Cascades to the tenant's Invitation and AuditEvent rows.
  if (admin && tenantId) await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

describe('POST /api/invitations — mail limits', () => {
  test('a second invitation to the same address within 10 minutes sends no mail but still returns a link', async () => {
    const email = nextEmail();
    const first = await invite(email);
    expect(first).toMatchObject({ status: 200, body: { success: true, emailSent: true } });
    expect(first.body.reason).toBeUndefined();

    const second = await invite(email);
    expect(second).toMatchObject({ status: 200, body: { success: true, emailSent: false, reason: 'recently_sent' } });
    expect(second.body.inviteLink).toMatch(/^https:\/\/app\.example\.invalid\/tr\/accept-invite\?token=/);
    expect(second.body.inviteLink).not.toBe(first.body.inviteLink);
    expect(send).toHaveBeenCalledTimes(1);

    // The row the limit counts names the invitation, never the address.
    const rows = await admin!.auditEvent.findMany({ where: { tenantId, type: INVITATION_MAIL_SENT } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target: first.body.invitation!.id, actorId: `${RUN}-owner` });
    expect(JSON.stringify(rows)).not.toContain(email);
  });

  test('after the cooldown the same address is mailed again', async () => {
    const email = nextEmail();
    await invite(email);
    await admin!.auditEvent.updateMany({
      where: { tenantId },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const again = await invite(email);
    expect(again.body).toMatchObject({ emailSent: true });
    expect(send).toHaveBeenCalledTimes(2);
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
    for (const url of [undefined, 'http://localhost:3000']) {
      envOverride.NEXT_PUBLIC_APP_URL = url;
      recordAlert.mockClear();
      const res = await invite(nextEmail());
      expect(res).toMatchObject({ status: 200, body: { success: true, emailSent: false, reason: 'app_url_not_configured' } });
      expect(recordAlert).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'error', dedupeKey: 'invitation-mail-app-url-missing' })
      );
      await admin!.invitation.deleteMany({ where: { tenantId } });
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
