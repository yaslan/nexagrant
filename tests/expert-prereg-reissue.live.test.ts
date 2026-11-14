import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { databaseReachable } from './helpers/database-availability';
import { RESEND_COOLDOWN_MS, REGISTRATION_IP_LIMIT, VERIFY_TOKEN_TTL_MS } from '@/lib/expert-prereg/server/constants';
import { hashExpertIp, registerExpertPreRegistration } from '@/lib/expert-prereg/server/register';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';
import { acquireExpertPreRegLiveLock, holdFounderCounter } from './helpers/expert-prereg-live-lock';
import type { Mailer, MailMessage } from '@/lib/email/mailer';

/**
 * FO-23 (TASK-MVBKUG4UMM342) — registration against real Postgres, end to end
 * through the server functions: a pending registration whose link has run out
 * is registered again (201), the old link stops working, the new one verifies,
 * and the per-IP limit counts the attempts. Mail is recorded, not sent. The rows
 * carry the `expertprereg-reissue-` prefix and are removed afterwards.
 *
 * Skipped with a reason when the database is not reachable.
 */

const PREFIX = 'expertprereg-reissue-';
const BASE = 'http://localhost:3000';
const SALT = `live-salt-${Math.random().toString(36).slice(2)}-0123456789abcdef`;
// A TEST-NET-2 address unique to this run, so the per-IP count sees only this run's rows.
const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
const RUN = Date.now();
const T0 = new Date(RUN);
const T_EXPIRED = new Date(RUN + VERIFY_TOKEN_TTL_MS + 60_000);

const reachable = await databaseReachable();

function email(tag: string) {
  return `${PREFIX}${tag}-${RUN}@example.org`;
}

const valid = (address: string) => ({
  fullName: 'Live Reissue',
  email: address,
  province: '06',
  title: 'Araştırmacı',
  organization: 'Test Üniversitesi',
  isFreelancer: false,
  expertiseAreas: ['digital-ict'],
  roles: ['researcher'],
  programmes: ['horizon-europe-h2020'],
  languages: ['en'],
  kvkkAccepted: true,
  visibilityConsent: true,
  locale: 'en',
});

function recorder() {
  const sent: MailMessage[] = [];
  const mailer: Mailer = vi.fn(async (message: MailMessage) => {
    sent.push(message);
  });
  return { sent, mailer };
}

function tokenFromMail(message: MailMessage): string {
  const match = message.text?.match(/token=([0-9a-f]{64})/);
  if (!match) throw new Error('no token in mail');
  return match[1]!;
}

const opts = (mailer: Mailer, now: Date, ip: string | null = null) => ({
  mailer,
  baseUrl: BASE,
  now,
  ip,
  salt: ip ? SALT : null,
});

async function cleanup() {
  await prisma.expertPreRegistration.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

// FO-45: serialised with the founder-number race file (see helpers/expert-prereg-live-lock.ts).
let releaseLock: (() => Promise<void>) | null = null;
let restoreCounter: (() => Promise<void>) | null = null;

beforeAll(async () => {
  if (!reachable) return;
  releaseLock = await acquireExpertPreRegLiveLock();
  restoreCounter = await holdFounderCounter(prisma);
  await cleanup();
});

afterAll(async () => {
  if (!reachable) return;
  await cleanup();
  await restoreCounter?.();
  await prisma.$disconnect();
  await releaseLock?.();
});

describe('registration re-issue (live Postgres)', () => {
  it.skipIf(!reachable)('registers again after the link ran out: 201, one row, old link invalid, new link verifies', async () => {
    const address = email('reissue');
    const first = recorder();
    expect(await registerExpertPreRegistration(valid(address), { ...opts(first.mailer, T0), db: prisma })).toEqual({ kind: 'created' });
    const oldToken = tokenFromMail(first.sent[0]!);

    // The link runs out: a verification after its expiry is refused and changes nothing.
    expect(await verifyExpertPreRegistration(oldToken, { db: prisma, now: T_EXPIRED })).toEqual({
      ok: false,
      error: 'expired',
      locale: 'en',
    });

    const second = recorder();
    const again = await registerExpertPreRegistration(valid(address), { ...opts(second.mailer, T_EXPIRED), db: prisma });
    expect(again).toEqual({ kind: 'created' });
    const newToken = tokenFromMail(second.sent[0]!);
    expect(newToken).not.toBe(oldToken);

    const rows = await prisma.expertPreRegistration.findMany({ where: { email: address } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');

    // The old link now answers invalid; the new one verifies.
    // An unknown token answers with the fixed locale 'tr' (verify.ts), not the row's.
    expect(await verifyExpertPreRegistration(oldToken, { db: prisma, now: T_EXPIRED })).toEqual({
      ok: false,
      error: 'invalid',
      locale: 'tr',
    });
    const verified = await verifyExpertPreRegistration(newToken, { db: prisma, now: T_EXPIRED });
    expect(verified).toMatchObject({ ok: true, locale: 'en' });
  });

  it.skipIf(!reachable)('answers 429 to a pending re-registration inside the cooldown and sends no mail', async () => {
    const address = email('cooldown');
    const first = recorder();
    await registerExpertPreRegistration(valid(address), { ...opts(first.mailer, T0), db: prisma });

    const again = recorder();
    const result = await registerExpertPreRegistration(valid(address), {
      ...opts(again.mailer, new Date(T0.getTime() + RESEND_COOLDOWN_MS - 1_000)),
      db: prisma,
    });
    expect(result).toEqual({ kind: 'rate_limited' });
    expect(again.sent).toHaveLength(0);
  });

  it.skipIf(!reachable)('stores only the keyed IP hash, and the per-IP limit counts re-issued attempts too', async () => {
    const tags = Array.from({ length: REGISTRATION_IP_LIMIT }, (_, i) => `ip-${i}`);
    const { mailer } = recorder();
    for (const tag of tags) {
      expect(await registerExpertPreRegistration(valid(email(tag)), { ...opts(mailer, T0, IP), db: prisma })).toEqual({
        kind: 'created',
      });
    }

    // The sixth registration from this IP is refused, whatever address it names.
    expect(await registerExpertPreRegistration(valid(email('ip-6')), { ...opts(mailer, T0, IP), db: prisma })).toEqual({
      kind: 'rate_limited',
    });

    const rows = await prisma.expertPreRegistration.findMany({ where: { email: { startsWith: `${PREFIX}ip-` } } });
    expect(rows).toHaveLength(REGISTRATION_IP_LIMIT);
    const hash = hashExpertIp(IP, SALT);
    expect(rows.every((row) => row.ipHash === hash)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(IP);
  });
});
