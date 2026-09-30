import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaClient, Role } from '@prisma/client';

import { skipOrFailInCi, assertRlsSubjectRole, requireRlsTestUrl, requireTestEnv } from './helpers/live-db-role';

/**
 * TASK-MUN2793A57Z9I — accepting a tenant invitation, against the database
 * under `fabrika_app` (NOBYPASSRLS): the token lookup has to go through the
 * sanctioned system scope, and every write has to satisfy the tenant policies.
 *
 * Two ways in, both covered:
 *   - an existing account presses "accept" → `acceptInvitation`;
 *   - a new account comes back from Google → the REAL Auth.js callback route
 *     with the app's own `authConfig` (signIn callback, adapter, events) and a
 *     FAKE provider, as in tests/oauth-registration.live.test.ts. It must join
 *     the inviting tenant and open no tenant of its own.
 * Plus the GET handler that moves the token out of the URL.
 *
 * Test data: every row this file creates is remembered by id and deleted by
 * that id only (never a filter over a shared table).
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

const SUITE = 'invitation-accept.live';
const RUN = `inv-${Date.now().toString(36)}`;

type Claims = Record<string, unknown> & { sub: string; email: string };
let nextClaims: Claims | null = null;
let server: Server | undefined;
let base = '';

let admin: PrismaClient | undefined;
let authConfig: typeof import('../src/lib/auth')['authConfig'] | undefined;
let NextAuthFn: typeof import('next-auth').default | undefined;
let NextRequestCtor: typeof import('next/server').NextRequest | undefined;
let lib: {
  accept: typeof import('../src/lib/invitations/accept');
  cookie: typeof import('../src/lib/invitations/accept-cookie');
  token: typeof import('../src/lib/secret-token');
  db: typeof import('../src/lib/db');
  ack: typeof import('../src/lib/legal/registration-ack-cookie');
  consent: typeof import('../src/lib/legal/consent-documents');
  seats: typeof import('../src/lib/billing/seat-limit');
  route: typeof import('../src/app/[locale]/accept-invite/route');
};

let ready = false;
let skipReason = '';
const tenantIds: string[] = [];
const userIds: string[] = [];

function email(tag: string): string {
  return `${RUN}-${tag}@example.com`;
}

async function makeTenant(tag: string, opts: { pilotEndedAt?: Date } = {}): Promise<string> {
  const t = await admin!.tenant.create({
    data: { name: `${RUN} ${tag}`, slug: `${RUN}-${tag}`, country: 'TR' },
    select: { id: true },
  });
  tenantIds.push(t.id);
  if (opts.pilotEndedAt) {
    await admin!.subscription.create({
      data: {
        tenantId: t.id,
        planId: 'free',
        status: 'TRIALING',
        provider: 'pilot',
        trialEndsAt: opts.pilotEndedAt,
      },
    });
  }
  return t.id;
}

async function makeUser(address: string): Promise<string> {
  const u = await admin!.user.create({ data: { email: address, name: 'Mevcut' }, select: { id: true } });
  userIds.push(u.id);
  return u.id;
}

async function invite(
  tenantId: string,
  address: string,
  over: { expires?: Date; acceptedAt?: Date; role?: Role } = {}
): Promise<{ id: string; raw: string }> {
  const { raw, hash } = lib.token.issueSecretToken();
  const row = await admin!.invitation.create({
    data: {
      email: address,
      tenantId,
      tokenHash: hash,
      role: over.role ?? 'WRITER',
      expires: over.expires ?? new Date(Date.now() + 7 * 86_400_000),
      acceptedAt: over.acceptedAt ?? null,
    },
    select: { id: true },
  });
  return { id: row.id, raw };
}

async function memberships(userId: string) {
  return admin!.membership.findMany({ where: { userId }, select: { tenantId: true, role: true } });
}

function fakeGoogle() {
  return {
    id: 'google',
    name: 'Fake google',
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

/** Google's redirect back: `GET /api/auth/callback/google?code=…`. */
async function callback(claims: Claims) {
  nextClaims = claims;
  const { handlers } = NextAuthFn!({ ...authConfig!, providers: [fakeGoogle()] } as never);
  const res = await handlers.GET(new NextRequestCtor!('http://localhost:3000/api/auth/callback/google?code=fake-code'));
  const setCookie = res.headers.getSetCookie?.() ?? [];
  return {
    status: res.status,
    location: res.headers.get('location'),
    sessionSet: setCookie.some((c) => c.includes('session-token=') && !c.includes('session-token=;')),
  };
}

/** What the GET handler parks, as the accept screen's Google button leaves it. */
function park(raw: string, opts: { ack?: boolean; locale?: 'tr' | 'en' } = {}) {
  jar.clear();
  jar.set(lib.cookie.INVITATION_ACCEPT_COOKIE, lib.cookie.encodeParkedInvitation({ token: raw, locale: opts.locale ?? 'tr' }));
  if (opts.ack) jar.set(lib.ack.REGISTRATION_ACK_COOKIE, lib.consent.registrationAcknowledgementToken());
}

beforeAll(async () => {
  const rlsUrl = requireRlsTestUrl(env.rls, SUITE);
  if (!env.admin) skipOrFailInCi(SUITE, 'DATABASE_URL is not set');
  // The Auth.js callback signs and verifies with it; without it the suite skips,
  // and in CI that skip was a false green of all its tests (İNCELEME-54 Y-1).
  const authSecret = requireTestEnv('AUTH_SECRET', SUITE);
  if (!rlsUrl || !env.admin || !authSecret) {
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
    accept: await import('../src/lib/invitations/accept'),
    cookie: await import('../src/lib/invitations/accept-cookie'),
    token: await import('../src/lib/secret-token'),
    db: await import('../src/lib/db'),
    ack: await import('../src/lib/legal/registration-ack-cookie'),
    consent: await import('../src/lib/legal/consent-documents'),
    seats: await import('../src/lib/billing/seat-limit'),
    route: await import('../src/app/[locale]/accept-invite/route'),
  };
  admin = lib.db.createDbClient(env.admin);
  try {
    await admin.$connect();
    const col = await admin.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'Invitation' AND column_name = 'acceptedAt'`;
    if (col[0]?.n !== 1) {
      skipReason = 'invitation-accepted-at.sql is not applied';
      skipOrFailInCi(SUITE, skipReason);
      return;
    }
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  await assertRlsSubjectRole(lib.db.prisma, SUITE);

  ({ authConfig } = await import('../src/lib/auth'));
  NextAuthFn = (await import('next-auth')).default;
  NextRequestCtor = (await import('next/server')).NextRequest;
  ready = true;
});

beforeEach((ctx) => {
  if (!ready) ctx.skip(skipReason);
  jar.clear();
});

afterAll(async () => {
  if (admin) {
    // One id at a time, and only ids this file created. Tenant rows cascade to
    // their invitations, memberships, consents and audit rows.
    for (const id of tenantIds) {
      if (id) await admin.tenant.delete({ where: { id } }).catch(() => {});
    }
    for (const id of userIds) {
      if (!id) continue;
      for (const m of await admin.membership.findMany({ where: { userId: id }, select: { tenantId: true } })) {
        // A tenant this file did not create would be a bug in the code under test; report it, never delete it.
        if (!tenantIds.includes(m.tenantId)) console.error(`[${SUITE}] user ${id} is a member of foreign tenant ${m.tenantId}`);
      }
      // Consent.userId is deliberately not a foreign key (schema.prisma), so the
      // rows the Google registration wrote do not go with the user or tenant.
      await admin.consent.deleteMany({ where: { userId: id } }).catch(() => {});
      await admin.user.delete({ where: { id } }).catch(() => {});
    }
    await admin.$disconnect().catch(() => {});
  }
  await lib?.db.prisma.$disconnect().catch(() => {});
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
});

describe('GET /[locale]/accept-invite (the e-mail link)', () => {
  test('moves the token into an httpOnly cookie and redirects to a URL without it', async () => {
    const { raw } = lib.token.issueSecretToken();
    const res = await lib.route.GET(new NextRequestCtor!(`http://localhost:3000/en/accept-invite?token=${raw}`), {
      params: Promise.resolve({ locale: 'en' }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/en/accept-invite/continue');
    expect(res.headers.get('location')).not.toContain(raw);
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${lib.cookie.INVITATION_ACCEPT_COOKIE}=`));
    expect(cookie).toContain(`=en.${raw}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Max-Age=1800/);
  });

  test('a malformed token clears an earlier cookie instead of keeping it', async () => {
    const res = await lib.route.GET(new NextRequestCtor!('http://localhost:3000/tr/accept-invite?token=nope'), {
      params: Promise.resolve({ locale: 'tr' }),
    });
    expect(res.status).toBe(303);
    const cookie = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith(`${lib.cookie.INVITATION_ACCEPT_COOKIE}=`));
    expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
  });
});

describe('an existing account accepts (acceptInvitation, fabrika_app)', () => {
  test('valid: membership with the invited role, link spent, audit row; a second accept is idempotent', async () => {
    const tenantId = await makeTenant('ok');
    const address = email('ok');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address, { role: 'PIPELINE_MANAGER' });

    const first = await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address.toUpperCase() });
    expect(first).toEqual({ ok: true, tenantId, alreadyMember: false });
    expect(await memberships(userId)).toEqual([{ tenantId, role: 'PIPELINE_MANAGER' }]);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).not.toBeNull();
    const audit = await admin!.auditEvent.findMany({
      where: { tenantId, type: lib.accept.INVITATION_ACCEPTED },
      select: { actorId: true, target: true, data: true },
    });
    expect(audit).toEqual([{ actorId: userId, target: inv.id, data: null }]);

    const again = await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address });
    expect(again).toEqual({ ok: true, tenantId, alreadyMember: true });
    expect(await memberships(userId)).toHaveLength(1);
    expect(await admin!.auditEvent.count({ where: { tenantId, type: lib.accept.INVITATION_ACCEPTED } })).toBe(1);
  });

  test('expired: refused, no membership', async () => {
    const tenantId = await makeTenant('exp');
    const address = email('exp');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address, { expires: new Date(Date.now() - 1000) });
    expect(await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address })).toEqual({
      ok: false,
      reason: 'expired',
    });
    expect(await memberships(userId)).toEqual([]);
  });

  test('used (accepted, and this account is not a member): refused', async () => {
    const tenantId = await makeTenant('used');
    const address = email('used');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address, { acceptedAt: new Date() });
    expect(await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address })).toEqual({
      ok: false,
      reason: 'used',
    });
    expect(await memberships(userId)).toEqual([]);
  });

  test('another account (the inviter holds the raw token too): email_mismatch, link stays pending', async () => {
    const tenantId = await makeTenant('mm');
    const other = email('mm-other');
    const userId = await makeUser(other);
    const inv = await invite(tenantId, email('mm-invited'));
    expect(await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: other })).toEqual({
      ok: false,
      reason: 'email_mismatch',
    });
    expect(await memberships(userId)).toEqual([]);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).toBeNull();
  });

  test('unknown token: invalid; deleted tenant: revoked', async () => {
    const userId = await makeUser(email('inv'));
    expect(
      await lib.accept.acceptInvitation({ token: lib.token.issueSecretToken().raw, userId, userEmail: email('inv') })
    ).toEqual({ ok: false, reason: 'invalid' });

    const tenantId = await makeTenant('gone');
    const inv = await invite(tenantId, email('inv'));
    await admin!.tenant.update({ where: { id: tenantId }, data: { deletedAt: new Date() } });
    expect(await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: email('inv') })).toEqual({
      ok: false,
      reason: 'revoked',
    });
    expect(await memberships(userId)).toEqual([]);
  });

  test('expired pilot: refused as a write, no membership, link stays pending', async () => {
    const tenantId = await makeTenant('pilot', { pilotEndedAt: new Date(Date.now() - 86_400_000) });
    const address = email('pilot');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address);
    expect(await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address })).toEqual({
      ok: false,
      reason: 'pilot_expired',
    });
    expect(await memberships(userId)).toEqual([]);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).toBeNull();
  });

  test('two concurrent accepts: one membership, one audit row, both land in the workspace', async () => {
    const tenantId = await makeTenant('race');
    const address = email('race');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address }))
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && !r.alreadyMember)).toHaveLength(1);
    expect(await memberships(userId)).toHaveLength(1);
    expect(await admin!.auditEvent.count({ where: { tenantId, type: lib.accept.INVITATION_ACCEPTED } })).toBe(1);
  });

  test('the core refuses a link spent after the caller looked (race window): lost, no membership', async () => {
    // acceptInvitation read the row as pending; before its transaction ran,
    // another accept spent the link and that membership was removed again.
    const tenantId = await makeTenant('lost');
    const address = email('lost');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address, { acceptedAt: new Date() });
    const result = await lib.db.withTenant(tenantId, (tx) =>
      lib.accept.acceptInvitationIn(tx, {
        invitationId: inv.id,
        tokenHash: lib.token.hashSecretToken(inv.raw),
        tenantId,
        role: 'WRITER',
        userId,
        now: new Date(),
      })
    );
    expect(result).toBe('lost');
    expect(await memberships(userId)).toEqual([]);
  });

  test('the core refuses a link rotated after the caller looked: lost, row still pending, no membership', async () => {
    // İNCELEME-34 B-2 (mutant N3): acceptInvitation read the row under the old
    // link's hash; before its transaction ran, a re-invitation gave the row a
    // new token. The spend matches on tokenHash, so the old link spends nothing
    // and the new one stays usable.
    const tenantId = await makeTenant('rot');
    const address = email('rot');
    const userId = await makeUser(address);
    const old = await invite(tenantId, address);
    const fresh = lib.token.issueSecretToken();
    await admin!.invitation.update({ where: { id: old.id }, data: { tokenHash: fresh.hash } });
    const result = await lib.db.withTenant(tenantId, (tx) =>
      lib.accept.acceptInvitationIn(tx, {
        invitationId: old.id,
        tokenHash: lib.token.hashSecretToken(old.raw),
        tenantId,
        role: 'WRITER',
        userId,
        now: new Date(),
      })
    );
    expect(result).toBe('lost');
    expect(await memberships(userId)).toEqual([]);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: old.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).toBeNull();
    expect(await admin!.auditEvent.count({ where: { tenantId, type: lib.accept.INVITATION_ACCEPTED } })).toBe(0);
  });

  test('seat limit: an accepted invitation is no longer a pending seat', async () => {
    const tenantId = await makeTenant('seat');
    const address = email('seat');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address);
    const before = await lib.db.withTenant(tenantId, (tx) => lib.seats.readSeatUsage(tx, tenantId, 'someone-else@example.com'));
    expect(before).toMatchObject({ members: 0, pendingInvitations: 1 });
    await lib.accept.acceptInvitation({ token: inv.raw, userId, userEmail: address });
    const after = await lib.db.withTenant(tenantId, (tx) => lib.seats.readSeatUsage(tx, tenantId, 'someone-else@example.com'));
    expect(after).toMatchObject({ members: 1, pendingInvitations: 0 });
  });
});

describe('a new account through Google (real Auth.js callback, fake provider)', () => {
  test('verified + matching + acknowledged: joins the inviting tenant, no tenant of its own, consent rows there', async () => {
    const tenantId = await makeTenant('g-ok');
    const address = email('g-ok');
    const inv = await invite(tenantId, address, { role: 'MEMBER' });
    park(inv.raw, { ack: true });

    const res = await callback({ sub: `${RUN}-g1`, email: address, email_verified: true, name: 'Yeni Davetli' });
    expect(res.status).toBe(302);
    expect(res.location ?? '').not.toContain('error=');
    expect(res.sessionSet).toBe(true);

    const user = await admin!.user.findUnique({ where: { email: address }, select: { id: true, accounts: true } });
    expect(user).not.toBeNull();
    userIds.push(user!.id);
    expect(user!.accounts.map((a) => a.provider)).toEqual(['google']);
    expect(await memberships(user!.id)).toEqual([{ tenantId, role: 'MEMBER' }]);
    const consents = await admin!.consent.findMany({ where: { userId: user!.id }, select: { tenantId: true, documentId: true } });
    expect(consents.map((c) => c.documentId).sort()).toEqual(['privacy-notice', 'terms-of-service']);
    expect(consents.every((c) => c.tenantId === tenantId)).toBe(true);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).not.toBeNull();
    // Spent: the acknowledgement. Kept: the invitation cookie, for the screen it returns to.
    expect(jar.has(lib.ack.REGISTRATION_ACK_COOKIE)).toBe(false);
    expect(jar.has(lib.cookie.INVITATION_ACCEPT_COOKIE)).toBe(true);
  });

  test('a different Google address: back to the accept screen, no user, link pending', async () => {
    const tenantId = await makeTenant('g-mm');
    const inv = await invite(tenantId, email('g-mm-invited'));
    const other = email('g-mm-other');
    park(inv.raw, { ack: true, locale: 'en' });
    const res = await callback({ sub: `${RUN}-g2`, email: other, email_verified: true });
    expect(res.location).toMatch(/\/en\/accept-invite\/continue\?error=email_mismatch$/);
    expect(res.sessionSet).toBe(false);
    expect(await admin!.user.findUnique({ where: { email: other } })).toBeNull();
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).toBeNull();
  });

  test('no acknowledgement: disclosure_required, no user', async () => {
    const tenantId = await makeTenant('g-ack');
    const address = email('g-ack');
    const inv = await invite(tenantId, address);
    park(inv.raw);
    const res = await callback({ sub: `${RUN}-g3`, email: address, email_verified: true });
    expect(res.location).toMatch(/\/tr\/accept-invite\/continue\?error=disclosure_required$/);
    expect(await admin!.user.findUnique({ where: { email: address } })).toBeNull();
  });

  test('address not verified by Google: email_unverified, no user', async () => {
    const tenantId = await makeTenant('g-unv');
    const address = email('g-unv');
    const inv = await invite(tenantId, address);
    park(inv.raw, { ack: true });
    const res = await callback({ sub: `${RUN}-g4`, email: address, email_verified: false });
    expect(res.location).toMatch(/\/tr\/accept-invite\/continue\?error=email_unverified$/);
    expect(await admin!.user.findUnique({ where: { email: address } })).toBeNull();
  });

  test('an expired invitation never becomes a plain registration: no user, no tenant', async () => {
    const tenantId = await makeTenant('g-exp');
    const address = email('g-exp');
    const inv = await invite(tenantId, address, { expires: new Date(Date.now() - 1000) });
    park(inv.raw, { ack: true });
    const res = await callback({ sub: `${RUN}-g5`, email: address, email_verified: true });
    expect(res.location).toMatch(/\/tr\/accept-invite\/continue$/);
    expect(await admin!.user.findUnique({ where: { email: address } })).toBeNull();
  });

  test('an existing account signs in as before; the invitation waits for its click', async () => {
    const tenantId = await makeTenant('g-existing');
    const address = email('g-existing');
    const userId = await makeUser(address);
    const inv = await invite(tenantId, address);
    park(inv.raw);
    const res = await callback({ sub: `${RUN}-g6`, email: address, email_verified: true });
    expect(res.location ?? '').not.toContain('error=');
    expect(res.sessionSet).toBe(true);
    expect(await memberships(userId)).toEqual([]);
    const row = await admin!.invitation.findUniqueOrThrow({ where: { id: inv.id }, select: { acceptedAt: true } });
    expect(row.acceptedAt).toBeNull();
  });
});
