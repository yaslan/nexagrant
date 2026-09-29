import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';

import { skipOrFailInCi, assertRlsSubjectRole, requireRlsTestUrl } from './helpers/live-db-role';

/**
 * TASK-MUM676F010E9G (ADR-0006) — an OAuth registration, end to end through the
 * REAL Auth.js callback route with the app's own `authConfig` (signIn callback,
 * adapter, events), against a FAKE provider: a local HTTP server that plays
 * Google's / Entra's token and userinfo endpoints. No real Google or Microsoft
 * credentials are involved (TASK-MULQM3LFB4KRA); the provider id is what the
 * app's rules key on, so the fake carries the real ids.
 *
 * The whole run is on `fabrika_app` (NOBYPASSRLS): the app's `prisma`
 * singleton is pointed at DATABASE_URL_RLS_TEST before anything imports it, so
 * the registration transaction has to satisfy the policies a deployment runs
 * under. The superuser connection only builds fixtures and reads ground truth.
 *
 * `next/headers` is replaced by an in-memory jar: it is where the server action
 * parks the signed invite cookie, and where the callback reads and deletes it.
 */

const env = vi.hoisted(() => {
  const admin = process.env.DATABASE_URL;
  const rls = process.env.DATABASE_URL_RLS_TEST;
  if (rls) process.env.DATABASE_URL = rls;
  return { admin, rls };
});

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers(),
}));

const SUITE = 'oauth-registration.live';
const RUN = `oauth-${Date.now().toString(36)}`;

type Claims = Record<string, unknown> & { sub: string; email: string };
/** What the fake provider's userinfo endpoint answers next. */
let nextClaims: Claims | null = null;
let server: Server | undefined;
let base = '';

let admin: PrismaClient | undefined;
let authConfig: typeof import('../src/lib/auth')['authConfig'] | undefined;
let NextAuthFn: typeof import('next-auth').default | undefined;
let NextRequestCtor: typeof import('next/server').NextRequest | undefined;
let lib: {
  cookie: typeof import('../src/lib/agency/registration-invite-cookie');
  consent: typeof import('../src/lib/legal/consent-documents');
  codes: typeof import('../src/lib/agency/codes');
  db: typeof import('../src/lib/db');
  ack: typeof import('../src/lib/legal/registration-ack-cookie');
};

let ready = false;
let skipReason = '';
let agencyId = '';
const tenants: string[] = [];
const emails: string[] = [];

function fakeProvider(id: 'google' | 'microsoft-entra-id') {
  return {
    id,
    name: `Fake ${id}`,
    type: 'oauth' as const,
    clientId: 'fake-client',
    clientSecret: 'fake-secret',
    authorization: { url: `${base}/authorize`, params: {} },
    token: `${base}/token`,
    userinfo: `${base}/userinfo`,
    checks: ['none' as const],
    allowDangerousEmailAccountLinking: true,
    profile: (p: Claims) => ({ id: p.sub, email: p.email, name: (p.name as string) ?? null, image: null }),
  };
}

/**
 * One trip back from the provider: `GET /api/auth/callback/<id>?code=…`, the
 * request Google or Microsoft would redirect the browser to.
 */
async function callback(
  provider: 'google' | 'microsoft-entra-id',
  claims: Claims
): Promise<{ status: number; location: string | null; sessionSet: boolean }> {
  nextClaims = claims;
  const { handlers } = NextAuthFn!({ ...authConfig!, providers: [fakeProvider(provider)] } as never);
  const req = new NextRequestCtor!(`http://localhost:3000/api/auth/callback/${provider}?code=fake-code`);
  const res = await handlers.GET(req);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    location: res.headers.get('location'),
    sessionSet: setCookie.some((c) => c.includes('session-token=') && !c.includes('session-token=;')),
  };
}

function newEmail(tag: string): string {
  const e = `${RUN}-${tag}@example.com`;
  emails.push(e);
  return e;
}

/** The signed invite cookie exactly as `loginWithSocialAction` writes it. */
function parkInvite(code: string, acknowledgement: string, now = Date.now()) {
  jar.clear();
  jar.set(
    lib.cookie.REGISTRATION_INVITE_COOKIE,
    lib.cookie.encodeRegistrationInvite({ code, acknowledgement, locale: 'tr' }, process.env.AUTH_SECRET!, now)
  );
}

async function makeCode(opts: { revoked?: boolean } = {}): Promise<{ id: string; code: string }> {
  const created = await lib.db.withTenantOn(admin!, agencyId, (tx) =>
    lib.codes.createInviteCodeIn(tx, {
      tenantId: agencyId,
      createdBy: `${RUN}-staff`,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      label: RUN,
    })
  );
  if (opts.revoked) {
    await admin!.agencyInviteCode.update({ where: { id: created.id }, data: { revokedAt: new Date() } });
  }
  return created;
}

async function userByEmail(email: string) {
  return admin!.user.findUnique({
    where: { email },
    include: { memberships: { include: { tenant: true } }, accounts: true },
  });
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(env.rls, SUITE);
  if (!env.admin) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  if (!rlsUrl || !env.admin || !process.env.AUTH_SECRET) {
    skipReason = 'DATABASE_URL_RLS_TEST / DATABASE_URL / AUTH_SECRET not set';
    return;
  }

  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/token')) {
      res.end(JSON.stringify({ access_token: 'fake-access', token_type: 'bearer', expires_in: 3600 }));
      return;
    }
    if (req.url?.startsWith('/userinfo')) {
      res.end(JSON.stringify(nextClaims));
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;

  lib = {
    cookie: await import('../src/lib/agency/registration-invite-cookie'),
    consent: await import('../src/lib/legal/consent-documents'),
    codes: await import('../src/lib/agency/codes'),
    db: await import('../src/lib/db'),
    ack: await import('../src/lib/legal/registration-ack-cookie'),
  };
  admin = lib.db.createDbClient(env.admin);
  try {
    await admin.$connect();
    const fn = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'redeem_agency_invite'`;
    if (fn[0]?.n !== 1) {
      skipReason = 'add-agency-invite-code.sql is not applied';
      skipOrFailInCi(SUITE, skipReason);
      return;
    }
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }

  // The app's own client — the one the callback will use — must be the RLS subject.
  await assertRlsSubjectRole(lib.db.prisma, SUITE);

  ({ authConfig } = await import('../src/lib/auth'));
  NextAuthFn = (await import('next-auth')).default;
  NextRequestCtor = (await import('next/server')).NextRequest;

  const agency = await admin.tenant.create({
    data: { name: `${RUN} agency`, slug: `${RUN}-agency`, country: 'TR', kind: 'AGENCY' },
    select: { id: true },
  });
  agencyId = agency.id;
  tenants.push(agencyId);
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
  jar.clear();
});

afterAll(async () => {
  if (admin) {
    const users = await admin.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, memberships: { select: { tenantId: true } } },
    });
    const ownTenants = users.flatMap((u) => u.memberships.map((m) => m.tenantId));
    await admin.tenant.deleteMany({ where: { id: { in: [...ownTenants, ...tenants] } } }).catch(() => {});
    await admin.user.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    await admin.$disconnect().catch(() => {});
  }
  await lib?.db.prisma.$disconnect().catch(() => {});
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
});

describe('OAuth registration with an agency invite code (fake provider, fabrika_app)', () => {
  test('Google: a code + addendum acknowledgement opens an account linked to the agency, with 3 consent rows', async () => {
    const { id: codeId, code } = await makeCode();
    const email = newEmail('google-ok');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));

    const res = await callback('google', { sub: `${RUN}-g1`, email, email_verified: true, name: 'Kodlu Kayıt' });

    expect(res.status).toBe(302);
    expect(res.location ?? '').not.toContain('error=');
    expect(res.sessionSet).toBe(true);

    const user = await userByEmail(email);
    expect(user).not.toBeNull();
    expect(user!.accounts.map((a) => a.provider)).toEqual(['google']);
    expect(user!.memberships).toHaveLength(1);
    const tenant = user!.memberships[0]!.tenant;
    expect(tenant.agencyId).toBe(agencyId);

    const consents = await admin!.consent.findMany({
      where: { userId: user!.id },
      orderBy: { documentId: 'asc' },
      select: { documentId: true, documentVersion: true, kind: true, tenantId: true },
    });
    expect(consents.map((c) => `${c.documentId}@${c.documentVersion}`).sort()).toEqual(
      [
        `agency-channel-addendum@${lib.consent.AGENCY_CHANNEL_ADDENDUM.version}`,
        `privacy-notice@${lib.consent.PRIVACY_NOTICE.version}`,
        `terms-of-service@${lib.consent.TERMS_OF_SERVICE.version}`,
      ].sort()
    );
    expect(consents.every((c) => c.tenantId === tenant.id)).toBe(true);

    const audit = await admin!.auditEvent.count({ where: { tenantId: tenant.id, type: 'agency.invite.redeemed' } });
    expect(audit).toBe(1);
    // One use, not two: the signIn probe rolled its use back.
    const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id: codeId }, select: { usedCount: true } });
    expect(row.usedCount).toBe(1);
    // Single use: the cookie is gone after the registration.
    expect(jar.has(lib.cookie.REGISTRATION_INVITE_COOKIE)).toBe(false);
  });

  test('Entra (fake): the same flow is provider-independent', async () => {
    const { code } = await makeCode();
    const email = newEmail('entra-ok');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));

    const res = await callback('microsoft-entra-id', { sub: `${RUN}-m1`, email, name: 'Entra Kayıt' });
    expect(res.location ?? '').not.toContain('error=');

    const user = await userByEmail(email);
    expect(user?.memberships[0]?.tenant.agencyId).toBe(agencyId);
    expect(await admin!.consent.count({ where: { userId: user!.id } })).toBe(3);
  });

  test('without the addendum in the acknowledgement: refused, no user', async () => {
    const { code } = await makeCode();
    const email = newEmail('no-addendum');
    parkInvite(code, lib.consent.registrationAcknowledgementToken());

    const res = await callback('google', { sub: `${RUN}-g2`, email, email_verified: true });
    expect(res.location).toMatch(/\/tr\/kayit\?error=disclosure_required$/);
    expect(res.sessionSet).toBe(false);
    expect(await userByEmail(email)).toBeNull();
  });

  test('no acknowledgement at all (no cookie): refused, no user', async () => {
    const email = newEmail('no-ack');
    const res = await callback('google', { sub: `${RUN}-g3`, email, email_verified: true });
    expect(res.location).toMatch(/\/tr\/kayit\?error=disclosure_required$/);
    expect(await userByEmail(email)).toBeNull();
  });

  test('an expired invite cookie: the one invite message, no user, code untouched', async () => {
    const { id: codeId, code } = await makeCode();
    const email = newEmail('expired');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }), Date.now() - 16 * 60 * 1000);

    const res = await callback('google', { sub: `${RUN}-g4`, email, email_verified: true });
    expect(res.location).toMatch(/\/tr\/kayit\?error=invite_invalid$/);
    expect(await userByEmail(email)).toBeNull();
    const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id: codeId }, select: { usedCount: true } });
    expect(row.usedCount).toBe(0);
    expect(jar.has(lib.cookie.REGISTRATION_INVITE_COOKIE)).toBe(false);
  });

  test('an unknown code and a revoked code get the same message, no user, the refusal is counted', async () => {
    // fix-agency-invite-rejection-audit.sql: a known code's refusal is an
    // AuditEvent under its agency; an unknown one only bumps one shared
    // SystemAlert counter. That counter is put back exactly as found.
    const UNKNOWN_KEY = 'agency.invite.rejected.unknown';
    const counter = async () =>
      (
        await admin!.$queryRaw<Array<{ id: string; meta: Record<string, unknown> }>>`
          SELECT "id", "meta" FROM "SystemAlert"
           WHERE "level" = 'info' AND "source" = 'agency.invite' AND "resolvedAt" IS NULL
             AND "meta" ->> 'alertDedupeKey' = ${UNKNOWN_KEY}
           ORDER BY "createdAt" DESC LIMIT 1`
      )[0] ?? null;
    const repeats = (row: { meta: Record<string, unknown> } | null) =>
      row ? (typeof row.meta.alertRepeatCount === 'number' ? row.meta.alertRepeatCount : 1) : 0;

    const counterBefore = await counter();
    const agencyRejectionsBefore = await admin!.auditEvent.count({
      where: { tenantId: agencyId, type: 'agency.invite.rejected' },
    });
    const redirects: Array<string | null> = [];
    try {
      for (const [tag, code] of [
        ['unknown', 'ZZZZ-ZZZZ-ZZZZ'],
        ['revoked', (await makeCode({ revoked: true })).code],
      ] as const) {
        const email = newEmail(`bad-${tag}`);
        parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));
        const res = await callback('google', { sub: `${RUN}-bad-${tag}`, email, email_verified: true });
        redirects.push(res.location);
        expect(res.sessionSet).toBe(false);
        expect(await userByEmail(email)).toBeNull();
      }
      expect(redirects[0]).toMatch(/\/tr\/kayit\?error=invite_invalid$/);
      expect(redirects[1]).toBe(redirects[0]);
      expect(repeats(await counter())).toBe(repeats(counterBefore) + 1);
      expect(
        await admin!.auditEvent.count({ where: { tenantId: agencyId, type: 'agency.invite.rejected' } })
      ).toBe(agencyRejectionsBefore + 1);
    } finally {
      const now = await counter();
      if (now && counterBefore === null) await admin!.systemAlert.delete({ where: { id: now.id } }).catch(() => {});
      else if (now && counterBefore)
        await admin!.systemAlert
          .update({ where: { id: counterBefore.id }, data: { meta: counterBefore.meta as object } })
          .catch(() => {});
    }
  });

  test('linking to an existing account: refused without a verified e-mail, linked with one; a code is ignored', async () => {
    const email = newEmail('link');
    const existing = await admin!.user.create({ data: { email, name: 'Existing' } });

    const refused = await callback('google', { sub: `${RUN}-g5`, email, email_verified: false });
    expect(refused.location).toMatch(/\/tr\/giris\?error=email_unverified$/);
    expect(await admin!.account.count({ where: { userId: existing.id } })).toBe(0);

    const entraPlain = await callback('microsoft-entra-id', { sub: `${RUN}-m5`, email });
    expect(entraPlain.location).toMatch(/\/tr\/giris\?error=email_unverified$/);
    expect(await admin!.account.count({ where: { userId: existing.id } })).toBe(0);

    const { id: codeId, code } = await makeCode();
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));
    const linked = await callback('google', { sub: `${RUN}-g5`, email, email_verified: true });
    expect(linked.location ?? '').not.toContain('error=');
    expect(linked.sessionSet).toBe(true);
    const after = await userByEmail(email);
    expect(after!.id).toBe(existing.id);
    expect(after!.accounts.map((a) => a.provider)).toEqual(['google']);
    // No tenant made for an existing user, and the code was not used.
    expect(after!.memberships).toHaveLength(0);
    const row = await admin!.agencyInviteCode.findUniqueOrThrow({ where: { id: codeId }, select: { usedCount: true } });
    expect(row.usedCount).toBe(0);
  });

  test('without a code, a plain acknowledgement still registers (2 consent rows, no agency)', async () => {
    const email = newEmail('plain');
    jar.set(lib.ack.REGISTRATION_ACK_COOKIE, lib.consent.registrationAcknowledgementToken());
    const res = await callback('google', { sub: `${RUN}-g6`, email, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    const user = await userByEmail(email);
    expect(user?.memberships[0]?.tenant.agencyId).toBeNull();
    const docs = await admin!.consent.findMany({ where: { userId: user!.id }, select: { documentId: true } });
    expect(docs.map((d) => d.documentId).sort()).toEqual(['privacy-notice', 'terms-of-service']);
    expect(jar.has(lib.ack.REGISTRATION_ACK_COOKIE)).toBe(false);
  });
});
