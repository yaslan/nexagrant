import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';
import { requireId } from './helpers/teardown-guard';

/**
 * TASK-MUPUH481FBGUP (QA Y-2) — concurrent POST /api/invitations must not grow a
 * tenant past its seat limit. The route handler runs for real against Postgres
 * over `fabrika_app` (NOBYPASSRLS, asserted); only the session, the SMTP
 * transport and SystemAlert are replaced. The barrier holds every request just
 * before its `invitation.upsert` until all of them have counted: without the
 * tenant seat lock they all see the one free seat and all write (measured
 * before the fix: every request 200); with it the later ones wait on the lock,
 * never reach the barrier together, and see the seat taken.
 *
 * Run with SMTP on (the mail lock was the only lock) and off (`mailer` null:
 * the count ran with no lock at all, the QA run's path).
 *
 * `.live`: needs the docker-compose Postgres and `pnpm db:rls-role`.
 */

const SUITE = 'invitation-seat-race.live';
const RLS_URL = envValue('DATABASE_URL_RLS_TEST');
const ADMIN_URL = envValue('DATABASE_URL');
const RUN = `sr-${Date.now().toString(36)}`;

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
const mailMode = vi.hoisted(() => ({ on: true }));
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
  return { ...actual, smtpMailer: () => (mailMode.on ? send : null) };
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

let admin: PrismaClient | undefined;
let ready = false;
let skipReason = '';
let tenantId = '';
let seq = 0;
const SEATS = 6;

type Body = { success?: boolean; code?: string; seats?: { limit: number; members: number; pendingInvitations: number } };

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
    // Plan "Belediye Ekip" sells 6 seats; the plan id is the one the pilot seeds.
    await admin.subscription.create({
      data: {
        tenantId,
        planId: 'free',
        status: 'TRIALING',
        provider: 'pilot',
        trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
        seatsExtra: SEATS - 1,
      },
    });
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
  mailMode.on = true;
  state.barrier = null;
  await admin!.invitation.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
  await admin!.auditEvent.deleteMany({ where: { tenantId: requireId(tenantId, 'tenantId') } });
});

afterAll(async () => {
  // Cascades to the tenant's Subscription, Invitation and AuditEvent rows.
  if (admin && tenantId) await admin.tenant.delete({ where: { id: tenantId } }).catch(() => {});
  await Promise.all([state.rls, admin].map((c) => c?.$disconnect().catch(() => {})));
});

/** Pending invitations that leave exactly one seat free. */
async function fillAllButOneSeat(): Promise<void> {
  for (let i = 0; i < SEATS - 1; i++) {
    await admin!.invitation.create({
      data: {
        email: nextEmail(),
        tenantId,
        tokenHash: `${RUN}-fill-${i}`.padEnd(64, '0'),
        role: 'MEMBER',
        expires: new Date(Date.now() + 86_400_000),
      },
    });
  }
}

async function race(n: number) {
  state.barrier = { size: n, ms: 400, waiting: [] };
  return Promise.all(Array.from({ length: n }, () => invite(nextEmail())));
}

describe('POST /api/invitations — seat limit under concurrency (QA Y-2)', () => {
  test.each([
    ['SMTP on', true],
    ['SMTP off (no mail lock)', false],
  ])('%s: one free seat, 8 simultaneous invitations → exactly one 200, the rest SEAT_LIMIT_REACHED', async (_label, mailOn) => {
    mailMode.on = mailOn;
    await fillAllButOneSeat();

    const results = await race(8);

    const ok = results.filter((r) => r.status === 200);
    const refused = results.filter((r) => r.status === 403);
    expect({ ok: ok.length, refused: refused.length }).toEqual({ ok: 1, refused: 7 });
    expect(refused.every((r) => r.body.code === 'SEAT_LIMIT_REACHED')).toBe(true);
    expect(refused[0]!.body.seats).toMatchObject({ limit: SEATS });
    // The database agrees: members + pending never passed the limit.
    expect(await admin!.invitation.count({ where: { tenantId } })).toBe(SEATS);
  });

  test('three free seats, 8 simultaneous invitations → exactly three succeed', async () => {
    for (let i = 0; i < SEATS - 3; i++) {
      await admin!.invitation.create({
        data: {
          email: nextEmail(),
          tenantId,
          tokenHash: `${RUN}-fill3-${i}`.padEnd(64, '0'),
          role: 'MEMBER',
          expires: new Date(Date.now() + 86_400_000),
        },
      });
    }
    const results = await race(8);
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 403)).toHaveLength(5);
    expect(await admin!.invitation.count({ where: { tenantId } })).toBe(SEATS);
  });
});
