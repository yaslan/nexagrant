import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient } from '@prisma/client';

import { skipOrFailInCi, assertRlsSubjectRole, requireRlsTestUrl } from './helpers/live-db-role';
import { AGENCY_INVITE_CODE_DDL_LOCK, UNKNOWN_INVITE_COUNTER_LOCK, withTestDbLock } from './helpers/test-db-lock';

/**
 * TASK-MUM676F010E9G (ADR-0006) — an OAuth registration, end to end through the
 * REAL Auth.js callback route with the app's own `authConfig` (signIn callback,
 * adapter, events), against a FAKE provider: a local HTTP server that plays
 * Google's token and userinfo endpoints. No real Google
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
  province: typeof import('../src/lib/registration-province-cookie');
  readiness: typeof import('../src/lib/registration-readiness-cookie');
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
 * request Google would redirect the browser to.
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
function parkInvite(code: string, acknowledgement: string, now = Date.now(), locale: 'tr' | 'en' = 'tr') {
  jar.clear();
  jar.set(
    lib.cookie.REGISTRATION_INVITE_COOKIE,
    lib.cookie.encodeRegistrationInvite({ code, acknowledgement, locale }, process.env.AUTH_SECRET!, now)
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
    province: await import('../src/lib/registration-province-cookie'),
    readiness: await import('../src/lib/registration-readiness-cookie'),
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

  test('an unknown code and a revoked code get the same message, no user, the refusal is counted', async () =>
    withTestDbLock(env.admin!, UNKNOWN_INVITE_COUNTER_LOCK, async () => {
      // fix-agency-invite-rejection-audit.sql: a known code's refusal is an
      // AuditEvent under its agency; an unknown one only bumps one shared
      // SystemAlert counter. That counter is put back exactly as found, under
      // the lock tests/agency-invite.live.test.ts takes for the same row
      // (TASK-MUN7B4ZIEBJML).
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
    }));

  test('linking to an existing account: refused without a verified e-mail, linked with one; a code is ignored', async () => {
    const email = newEmail('link');
    const existing = await admin!.user.create({ data: { email, name: 'Existing' } });

    const refused = await callback('google', { sub: `${RUN}-g5`, email, email_verified: false });
    expect(refused.location).toMatch(/\/tr\/giris\?error=email_unverified$/);
    expect(await admin!.account.count({ where: { userId: existing.id } })).toBe(0);

    // Entra was removed (ADR-0006, 29.09): a login under its id links nothing.
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

/**
 * İNCELEME-12 Ö-1 (TASK-MUM74FUB1DRCM) — the province and scorecard cookies are
 * single use, and Auth.js's own sign-in page no longer starts a flow past
 * loginWithSocialAction.
 */
describe('registration choice cookies are single use (İNCELEME-12 Ö-1)', () => {
  const READINESS = 'municipality.012120201012120';

  function parkChoices() {
    jar.set(lib.province.REGISTRATION_PROVINCE_COOKIE, encodeURIComponent('Ankara'));
    jar.set(lib.readiness.REGISTRATION_READINESS_COOKIE, READINESS);
  }
  const choicesLeft = () =>
    [lib.province.REGISTRATION_PROVINCE_COOKIE, lib.readiness.REGISTRATION_READINESS_COOKIE].filter((n) => jar.has(n));

  test('shared browser: A parks a result, B registers, C registers next — only B gets it', async () => {
    // A ticked the box and gave up at Google's consent screen: the cookies
    // are parked, no account exists.
    parkChoices();

    // B registers in the same browser within 15 minutes.
    const b = newEmail('choice-b');
    jar.set(lib.ack.REGISTRATION_ACK_COOKIE, lib.consent.registrationAcknowledgementToken());
    const resB = await callback('google', { sub: `${RUN}-cb`, email: b, email_verified: true });
    expect(resB.location ?? '').not.toContain('error=');
    const tenantB = (await userByEmail(b))!.memberships[0]!.tenant;
    expect(tenantB.province).toBe('Ankara');
    expect((tenantB.settings as { readiness?: { code: string } }).readiness?.code).toBe(READINESS);
    expect(choicesLeft()).toEqual([]);

    // C registers next, without choosing anything: nothing carries over.
    const c = newEmail('choice-c');
    jar.set(lib.ack.REGISTRATION_ACK_COOKIE, lib.consent.registrationAcknowledgementToken());
    const resC = await callback('google', { sub: `${RUN}-cc`, email: c, email_verified: true });
    expect(resC.location ?? '').not.toContain('error=');
    const tenantC = (await userByEmail(c))!.memberships[0]!.tenant;
    expect(tenantC.province).toBeNull();
    expect((tenantC.settings as { readiness?: unknown }).readiness).toBeUndefined();
  });

  test('invite-code registration: the choices land on the tenant and the cookies are gone', async () => {
    const { code } = await makeCode();
    const email = newEmail('choice-invite');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));
    parkChoices();
    const res = await callback('google', { sub: `${RUN}-ci`, email, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    const tenant = (await userByEmail(email))!.memberships[0]!.tenant;
    expect(tenant.agencyId).toBe(agencyId);
    expect(tenant.province).toBe('Ankara');
    expect(choicesLeft()).toEqual([]);
  });

  test('a refused invite registration spends them too', async () => {
    const email = newEmail('choice-refused');
    parkInvite('ZZZZ-ZZZZ-ZZZZ', lib.consent.registrationAcknowledgementToken());
    parkChoices();
    // Refused in the signIn callback (no addendum): the adapter never runs.
    const res = await callback('google', { sub: `${RUN}-cr`, email, email_verified: true });
    expect(res.location).toMatch(/error=disclosure_required$/);
    expect(await userByEmail(email)).toBeNull();
    expect(choicesLeft()).toEqual([]);
  });

  test('linking to an existing account spends them', async () => {
    const email = newEmail('choice-link');
    await admin!.user.create({ data: { email, name: 'Existing' } });
    parkChoices();
    const res = await callback('google', { sub: `${RUN}-cl`, email, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    expect(choicesLeft()).toEqual([]);
  });

  test("Auth.js's own sign-in page redirects to /tr/giris", async () => {
    const { handlers } = NextAuthFn!({ ...authConfig!, providers: [fakeProvider('google')] } as never);
    const res = await handlers.GET(new NextRequestCtor!('http://localhost:3000/api/auth/signin'));
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get('location')!, 'http://localhost:3000').pathname).toBe('/tr/giris');
  });
});

/**
 * İNCELEME-13 B-1 (crw-fb, TASK-MUM74TE5F3K44) — the plain acknowledgement
 * cookie belongs to the one registration it was ticked for. It used to be only
 * set on a ticked start and only cleared by a registration, so a tick parked by
 * somebody who gave up at Google's consent screen registered the next person
 * in that browser as having read the notice.
 *
 * The starts go through the app's own server action; its `signIn` is the real
 * one and leaves for the (real, unconfigured) provider by throwing, which is
 * all these tests need from it — the cookie work happens before that.
 */
describe('acknowledgement cookie is spent by every OAuth outcome (İNCELEME-13 B-1)', () => {
  let action: typeof import('../src/lib/actions/auth');
  const ackParked = () => jar.has(lib.ack.REGISTRATION_ACK_COOKIE);
  const parkAck = () => jar.set(lib.ack.REGISTRATION_ACK_COOKIE, lib.consent.registrationAcknowledgementToken());

  beforeAll(async () => {
    if (!ready) return;
    action = await import('../src/lib/actions/auth');
  });

  test("crw-fb's scenario: A ticks and gives up, B starts unticked with a new Google account — refused, no user, no consent", async () => {
    // A: /kayit, box ticked, Google, gives up at Google's consent screen.
    await action.loginWithSocialAction('google', '/tr/dashboard', lib.consent.registrationAcknowledgementToken()).catch(() => {});
    expect(ackParked()).toBe(true);

    // B: same browser, "Giriş Yap" tab (no box), a Google account with no user yet.
    await action.loginWithSocialAction('google', '/tr/dashboard', undefined).catch(() => {});
    expect(ackParked()).toBe(false);

    const email = newEmail('b1-stale');
    const res = await callback('google', { sub: `${RUN}-b1`, email, email_verified: true });
    expect(res.location).toMatch(/\/tr\/kayit\?error=disclosure_required$/);
    expect(res.sessionSet).toBe(false);
    // No user, so nobody for a consent row to name.
    expect(await userByEmail(email)).toBeNull();
  });

  test('a returning login spends a parked tick (it was not ticked for this person)', async () => {
    const email = newEmail('b1-return');
    parkAck();
    const first = await callback('google', { sub: `${RUN}-b1r`, email, email_verified: true });
    expect(first.location ?? '').not.toContain('error=');
    expect(ackParked()).toBe(false);

    // Signs in again, having ticked the box on /kayit by mistake: allowed, tick spent.
    parkAck();
    const again = await callback('google', { sub: `${RUN}-b1r`, email, email_verified: true });
    expect(again.location ?? '').not.toContain('error=');
    expect(ackParked()).toBe(false);

    // …so the next new account in this browser is refused.
    const next = newEmail('b1-after-return');
    const res = await callback('google', { sub: `${RUN}-b1n`, email: next, email_verified: true });
    expect(res.location).toMatch(/error=disclosure_required$/);
    expect(await userByEmail(next)).toBeNull();
  });

  test('linking to an existing address spends it, and so does a refused link', async () => {
    const email = newEmail('b1-link');
    const existing = await admin!.user.create({ data: { email, name: 'Existing' } });
    parkAck();
    const refused = await callback('google', { sub: `${RUN}-b1l`, email, email_verified: false });
    expect(refused.location).toMatch(/error=email_unverified$/);
    expect(ackParked()).toBe(false);

    parkAck();
    const linked = await callback('google', { sub: `${RUN}-b1l`, email, email_verified: true });
    expect(linked.location ?? '').not.toContain('error=');
    expect(ackParked()).toBe(false);
    // The existing user got no consent rows from somebody else's tick.
    expect(await admin!.consent.count({ where: { userId: existing.id } })).toBe(0);
  });

  test('an invite registration spends a stray plain tick as well', async () => {
    const { code } = await makeCode();
    const email = newEmail('b1-invite');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }));
    parkAck();
    const res = await callback('google', { sub: `${RUN}-b1i`, email, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    expect(ackParked()).toBe(false);
  });

  test('Ö-1: an invite registration records the consent in the language it was read in', async () => {
    const { code } = await makeCode();
    const email = newEmail('b1-invite-en');
    parkInvite(code, lib.consent.registrationAcknowledgementToken({ agency: true }), Date.now(), 'en');
    const res = await callback('google', { sub: `${RUN}-b1e`, email, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    const user = await userByEmail(email);
    const rows = await admin!.consent.findMany({ where: { userId: user!.id }, select: { locale: true } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.locale === 'en')).toBe(true);
  });
});

/**
 * İNCELEME-14 Ö-1 (crw-fb, TASK-MUMAC8JELIZ5H) — the code dies between the
 * signIn probe and the adapter (revoked, expired or its agency gone in that
 * window). The signIn callback let the sign-in through, so `events.createUser`
 * never runs and only the adapter's own clear spends the choice cookies (M2).
 *
 * The race is made deterministic, not timed: a trigger bound to this one code
 * lets the first UPDATE (the probe, rolled back) through and skips the second
 * (the adapter's redeem), which then finds no usable code, exactly as a code
 * killed in between. The trigger only fires for this test's code id and is
 * dropped in `finally`, so a live test running alongside is not affected.
 */
describe("crw-fb M2: adapter throws after the signIn probe", () => {
  /** Runs `fn` while `id`'s code passes the signIn probe but is dead for the adapter. */
  async function withCodeDyingAfterProbe(
    id: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const tag = `${RUN.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${id.slice(-6).toLowerCase()}`;
    // The trigger DDL locks the whole table: tests/agency-invite.live.test.ts
    // keeps its lock_timeout test out of the way (TASK-MUN7B4ZIEBJML).
    await withTestDbLock(env.admin!, AGENCY_INVITE_CODE_DDL_LOCK, async () => {
      await admin!.$executeRawUnsafe(
        `CREATE SEQUENCE IF NOT EXISTS crw_m2_${tag}`,
      );
      await admin!
        .$executeRawUnsafe(`CREATE OR REPLACE FUNCTION crw_m2_${tag}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF nextval('crw_m2_${tag}') > 1 THEN RETURN NULL; END IF; RETURN NEW; END $$`);
      await admin!
        .$executeRawUnsafe(`CREATE TRIGGER crw_m2_${tag} BEFORE UPDATE ON "AgencyInviteCode"
        FOR EACH ROW WHEN (NEW."id" = '${id}') EXECUTE FUNCTION crw_m2_${tag}()`);
      try {
        await fn();
      } finally {
        await admin!.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS crw_m2_${tag} ON "AgencyInviteCode"`,
        );
        await admin!.$executeRawUnsafe(`DROP FUNCTION IF EXISTS crw_m2_${tag}()`);
        await admin!.$executeRawUnsafe(`DROP SEQUENCE IF EXISTS crw_m2_${tag}`);
      }
    });
  }

  /** The browser following Auth.js's error redirect to `pages.error`. */
  async function followErrorPage(location: string | null): Promise<string> {
    const url = new URL(location!, "http://localhost:3000");
    expect(url.pathname).toBe("/api/auth/hata");
    const { GET } = await import("../src/app/api/auth/hata/route");
    const res = await GET(new NextRequestCtor!(url));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get("location")!);
    return `${to.pathname}${to.search}`;
  }

  test("code dies between probe and adapter: choice cookies are spent", async () => {
    const { id, code } = await makeCode();
    await withCodeDyingAfterProbe(id, async () => {
      const email = newEmail("crw-m2");
      parkInvite(
        code,
        lib.consent.registrationAcknowledgementToken({ agency: true }),
      );
      jar.set(
        lib.province.REGISTRATION_PROVINCE_COOKIE,
        encodeURIComponent("Ankara"),
      );
      jar.set(
        lib.readiness.REGISTRATION_READINESS_COOKIE,
        "municipality.012120201012120",
      );
      const res = await callback("google", {
        sub: `${RUN}-m2`,
        email,
        email_verified: true,
      });
      expect(await userByEmail(email)).toBeNull();
      expect(
        [
          lib.province.REGISTRATION_PROVINCE_COOKIE,
          lib.readiness.REGISTRATION_READINESS_COOKIE,
        ].filter((n) => jar.has(n)),
      ).toEqual([]);
      expect(res.sessionSet).toBe(false);
    });
  });

  test("K-1: the registration that loses the race gets invite_invalid, not the Configuration page", async () => {
    for (const locale of ["tr", "en"] as const) {
      const { id, code } = await makeCode();
      await withCodeDyingAfterProbe(id, async () => {
        const email = newEmail(`k1-race-${locale}`);
        parkInvite(
          code,
          lib.consent.registrationAcknowledgementToken({ agency: true }),
          Date.now(),
          locale,
        );
        const res = await callback("google", {
          sub: `${RUN}-k1-${locale}`,
          email,
          email_verified: true,
        });
        console.log(`K-1 race (${locale}): ${res.location}`);
        expect(await userByEmail(email)).toBeNull();
        expect(await followErrorPage(res.location)).toBe(
          `/${locale}/kayit?error=invite_invalid`,
        );
        // Single use: the note is gone once the error page has read it.
        expect(jar.has(lib.cookie.REGISTRATION_REFUSAL_COOKIE)).toBe(false);
      });
    }
  });

  test("K-1: any other Auth.js error lands on the login card, not the English Configuration page", async () => {
    jar.clear();
    const { handlers } = NextAuthFn!({
      ...authConfig!,
      providers: [fakeProvider("google")],
    } as never);
    const res = await handlers.GET(
      new NextRequestCtor!(
        "http://localhost:3000/api/auth/error?error=Configuration",
      ),
    );
    expect(res.status).toBe(302);
    expect(await followErrorPage(res.headers.get("location"))).toBe(
      "/tr/giris?error=Configuration",
    );

    // A crafted code does not reach the page as text: only a plain word passes.
    expect(await followErrorPage("/api/auth/hata?error=%3Cscript%3E")).toBe(
      "/tr/giris?error=Configuration",
    );
  });
});
