import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { presentIds, requireId } from './helpers/teardown-guard';

/**
 * NG-42 — the opt-out link and the delivery record. The route handlers run for
 * real against the database over `fabrika_app` (NOBYPASSRLS, asserted), because
 * a NULL-tenant AuditEvent row is only reachable through the system scope and
 * a mock could not tell. Only the session, the SMTP transport and SystemAlert
 * are replaced.
 */

const SUITE = 'email-opt-out.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `oo-${Date.now().toString(36)}`;
const SECRET = 'live-test-secret-at-least-thirty-two-chars';

const state = vi.hoisted(() => ({
  rls: undefined as PrismaClient | undefined,
  scope: { tenantId: '', userId: '', role: 'TENANT_OWNER', workspaceIds: [] as string[], isPlatformAdmin: false },
}));
const send = vi.hoisted(() =>
  vi.fn(async (_message: { to: string; subject: string; text?: string; listUnsubscribe?: string }) => ({
    messageId: '<m1@example.invalid>',
  }))
);
const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));

vi.mock('@/lib/tenant', () => ({ requireTenantApi: async () => ({ ok: true, scope: state.scope }) }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual, withTenant: (id: string, cb: Parameters<typeof actual.withTenant>[1]) => actual.withTenantOn(state.rls!, id, cb) };
});
vi.mock('@/lib/system-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/system-scope')>();
  return {
    ...actual,
    withSystemScope: (p: Parameters<typeof actual.withSystemScope>[0], c: string, cb: Parameters<typeof actual.withSystemScope>[2]) =>
      actual.withSystemScopeOn(state.rls!, p, c, cb),
  };
});
vi.mock('@/lib/email/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/mailer')>();
  return { ...actual, smtpMailer: () => send };
});
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  const override: Record<string, unknown> = { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://app.example.invalid' };
  return {
    ...actual,
    emailOptOutSecret: () => SECRET,
    env: new Proxy(actual.env, { get: (t, k) => (typeof k === 'string' && k in override ? override[k] : Reflect.get(t, k)) }),
  };
});
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert }));

const { createDbClient } = await import('@/lib/db');
const invitations = await import('@/app/api/invitations/route');
const optOut = await import('@/app/api/email/opt-out/route');
const { emailOptOutHash, signOptOutToken } = await import('@/lib/email/opt-out');
const { EMAIL_UNSUBSCRIBED, EMAIL_DECLINED } = await import('@/lib/email/opt-out-store');
const { INVITATION_MAIL_ACCEPTED, INVITATION_MAIL_FAILED } = await import('@/lib/email/invitation-mail-policy');
const { MailSendError } = await import('@/lib/email/mailer');
const { NextRequest } = await import('next/server');

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let otherTenantId = '';
let seq = 0;
const nextEmail = () => `${RUN}-${++seq}@example.invalid`;

async function invite(email: string): Promise<{ status: number; body: { emailSent?: boolean; reason?: string; inviteLink?: string; invitation?: { id: string } } }> {
  const res = await invitations.POST(
    new Request('http://localhost/api/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, role: 'MEMBER' }),
    })
  );
  return { status: res.status, body: await res.json() };
}

function token(email: string, kind: 'unsubscribe' | 'decline', tenant: string = tenantId) {
  return signOptOutToken({ kind, hash: emailOptOutHash(email), source: 'invitation', tenantId: tenant }, SECRET);
}

const req = (t: string, init?: { method?: string; body?: string; lang?: string }) =>
  new NextRequest(`http://localhost/api/email/opt-out?t=${encodeURIComponent(t)}`, {
    method: init?.method ?? 'GET',
    ...(init?.body ? { body: init.body, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
  });
const oneClick = (t: string) => optOut.POST(req(t, { method: 'POST', body: 'List-Unsubscribe=One-Click' }));
const confirm = (t: string) => optOut.POST(req(t, { method: 'POST', body: 'confirm=1' }));

const rows = (type: string, email: string) => admin!.auditEvent.count({ where: { type, target: emailOptOutHash(email) } });

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
  tenantId = (await admin.tenant.create({ data: { name: `${RUN} A`, slug: `${RUN}-a`, country: 'TR', kind: 'ORGANIZATION' }, select: { id: true } })).id;
  otherTenantId = (await admin.tenant.create({ data: { name: `${RUN} B`, slug: `${RUN}-b`, country: 'TR', kind: 'ORGANIZATION' }, select: { id: true } })).id;
  state.scope = { ...state.scope, tenantId, userId: `${RUN}-owner` };
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
  // One pending invitation at a time keeps every test inside the free plan's seat.
  await admin!.invitation.deleteMany({
    where: { tenantId: { in: [requireId(tenantId, 'tenantId'), requireId(otherTenantId, 'otherTenantId')] } },
  });
  send.mockClear();
  send.mockImplementation(async () => ({ messageId: '<m1@example.invalid>' }));
  state.scope = { ...state.scope, tenantId };
});

afterAll(async () => {
  if (admin && tenantId) {
    await admin.auditEvent.deleteMany({ where: { tenantId: null, type: requireId(EMAIL_UNSUBSCRIBED, 'type'), target: { in: presentIds(Array.from({ length: seq }, (_, i) => emailOptOutHash(`${RUN}-${i + 1}@example.invalid`))) } } });
    await admin.tenant.deleteMany({ where: { id: { in: [requireId(tenantId, 'tenantId'), requireId(otherTenantId, 'otherTenantId')] } } });
  }
  await state.rls?.$disconnect();
  await admin?.$disconnect();
});

describe('opt-out link', () => {
  test('GET changes nothing: a mail scanner following the link must not unsubscribe anyone', async () => {
    const email = nextEmail();
    const res = await optOut.GET(req(token(email, 'unsubscribe')));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/tr/email-opt-out?t=');
    expect(await rows(EMAIL_UNSUBSCRIBED, email)).toBe(0);
  });

  test('the one-click POST records an account-less address once, with no tenant and no address', async () => {
    const email = nextEmail();
    expect(await rows(EMAIL_UNSUBSCRIBED, email)).toBe(0);
    expect((await oneClick(token(email, 'unsubscribe'))).status).toBe(200);
    expect((await oneClick(token(email, 'unsubscribe'))).status).toBe(200);
    expect(await rows(EMAIL_UNSUBSCRIBED, email)).toBe(1);
    const row = await admin!.auditEvent.findFirstOrThrow({ where: { type: EMAIL_UNSUBSCRIBED, target: emailOptOutHash(email) } });
    expect(row.tenantId).toBeNull();
    expect(JSON.stringify(row)).not.toContain('@');
  });

  test('the confirm form redirects to the done page', async () => {
    const email = nextEmail();
    const res = await confirm(token(email, 'decline'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/\/tr\/email-opt-out\?status=done&k=decline$/);
    expect(await rows(EMAIL_DECLINED, email)).toBe(1);
  });

  test('a POST that is neither form nor one-click records nothing', async () => {
    const email = nextEmail();
    const res = await optOut.POST(req(token(email, 'unsubscribe'), { method: 'POST', body: 'x=1' }));
    expect(res.status).toBe(400);
    expect(await rows(EMAIL_UNSUBSCRIBED, email)).toBe(0);
  });

  test('a forged token records nothing', async () => {
    const email = nextEmail();
    const forged = signOptOutToken({ kind: 'unsubscribe', hash: emailOptOutHash(email), source: 'invitation', tenantId }, 'another-secret-another-secret-another');
    expect((await oneClick(forged)).status).toBe(400);
    expect(await rows(EMAIL_UNSUBSCRIBED, email)).toBe(0);
  });
});

describe('POST /api/invitations and the opt-out', () => {
  test('a first invitation carries the header and is recorded as accepted by SMTP', async () => {
    const email = nextEmail();
    const { body } = await invite(email);
    expect(body.emailSent).toBe(true);
    expect(send.mock.calls[0]![0].listUnsubscribe).toContain('/api/email/opt-out?t=');
    expect(send.mock.calls[0]![0].text).toContain('/api/email/opt-out?t=');
    const accepted = await admin!.auditEvent.findFirstOrThrow({ where: { tenantId, type: INVITATION_MAIL_ACCEPTED, target: body.invitation!.id } });
    expect(accepted.data).toMatchObject({ messageId: '<m1@example.invalid>' });
    expect(JSON.stringify(accepted)).not.toContain(email);
  });

  test('a refusal keeps the SMTP code on the failed row', async () => {
    send.mockImplementationOnce(async () => {
      throw new MailSendError('EENVELOPE', 550);
    });
    const { body } = await invite(nextEmail());
    expect(body.reason).toBe('send_failed');
    const failed = await admin!.auditEvent.findFirstOrThrow({ where: { tenantId, type: INVITATION_MAIL_FAILED, target: body.invitation!.id } });
    expect(failed.data).toMatchObject({ code: 'smtp:EENVELOPE:550' });
  });

  test('an unsubscribed address gets no mail from any tenant; the link still comes back', async () => {
    const email = nextEmail();
    await oneClick(token(email, 'unsubscribe'));
    state.scope = { ...state.scope, tenantId: otherTenantId };
    const { body } = await invite(email);
    expect(send).not.toHaveBeenCalled();
    expect(body).toMatchObject({ emailSent: false, reason: 'opted_out' });
    expect(body.inviteLink).toContain('accept-invite');
  });

  test('a decline holds only for the tenant it was given to', async () => {
    const email = nextEmail();
    await confirm(token(email, 'decline'));
    expect((await invite(email)).body).toMatchObject({ emailSent: false, reason: 'opted_out' });
    expect(send).not.toHaveBeenCalled();
    state.scope = { ...state.scope, tenantId: otherTenantId };
    expect((await invite(email)).body).toMatchObject({ emailSent: true });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
