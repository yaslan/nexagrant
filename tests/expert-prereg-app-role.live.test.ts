import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDbClient, prisma } from '@/lib/db';
import type { Mailer, MailMessage } from '@/lib/email/mailer';
import { exportExpertPreRegistrationsCsv, listExpertPreRegistrations } from '@/lib/expert-prereg/server/admin';
import { FOUNDER_SEAT_LIMIT } from '@/lib/expert-prereg/server/constants';
import { registerExpertPreRegistration } from '@/lib/expert-prereg/server/register';
import { getRemainingFounderSeats } from '@/lib/expert-prereg/server/seats';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';
import { acquireExpertPreRegLiveLock } from './helpers/expert-prereg-live-lock';
import { envValue } from './helpers/dotenv';
import { assertRlsSubjectRole, requireRlsTestUrl, skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-45 (TASK-MVC6CTSCLO6LI, Ö-1) — the expert flow as the app role, under RLS.
 *
 * The other expert live files connect as `DATABASE_URL`, which is SUPERUSER +
 * BYPASSRLS, so RLS never runs there and a dropped `withSystemScopeOn` would go
 * green. This file runs register → verify → admin list → CSV → seats on a client
 * built from `DATABASE_URL_RLS_TEST` (role `fabrika_app`), and checks that the
 * same table is empty without a scope. Removing a `withSystemScopeOn` from the
 * flow turns this file red.
 *
 * Rows carry the `expertprereg-app-` prefix and are removed afterwards. Skipped
 * with a reason locally when the RLS role is not configured; in CI it fails.
 */

const SUITE = 'expert pre-registration app-role live test';
const PREFIX = 'expertprereg-app-';
const RUN = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const BASE = 'https://fonbridge.test';
const RLS_URL = requireRlsTestUrl(envValue('DATABASE_URL_RLS_TEST'), SUITE);

// Decided before the suite is collected: skipIf reads it at definition time.
const rls: PrismaClient | undefined = RLS_URL ? createDbClient(RLS_URL) : undefined;
const reachable = rls ? await rls.$queryRaw`SELECT 1`.then(() => true).catch(() => false) : false;
if (rls && !reachable) skipOrFailInCi(SUITE, 'database unavailable');
const ready = reachable;
let releaseLock: (() => Promise<void>) | null = null;

const address = `${PREFIX}${RUN}@example.org`;
const failedAddress = `${PREFIX}${RUN}-mailfail@example.org`;

const valid = {
  fullName: 'App Role Expert',
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
};

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

async function cleanup() {
  await prisma.expertPreRegistration.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeAll(async () => {
  if (!ready || !rls) return;
  // A BYPASSRLS role here would pass for the wrong reason: refuse it.
  await assertRlsSubjectRole(rls, SUITE);
  releaseLock = await acquireExpertPreRegLiveLock();
  await cleanup();
});

afterAll(async () => {
  if (ready) await cleanup();
  await rls?.$disconnect();
  await prisma.$disconnect();
  await releaseLock?.();
});

describe('expert pre-registration as fabrika_app (live Postgres, RLS on)', () => {
  it.skipIf(!ready)('registers, verifies, lists, exports and counts seats through the RLS role', async () => {
    if (!rls) throw new Error('setup did not run');
    const { sent, mailer } = recorder();
    const now = new Date();

    const registered = await registerExpertPreRegistration(valid, {
      db: rls,
      mailer,
      baseUrl: BASE,
      now,
      ip: null,
      salt: null,
    });
    expect(registered).toEqual({ kind: 'created' });
    expect(sent).toHaveLength(1);

    const verified = await verifyExpertPreRegistration(tokenFromMail(sent[0]!), { db: rls, now });
    expect(verified).toMatchObject({ ok: true, locale: 'en' });
    if (!verified.ok) throw new Error('verification failed');

    const rows = await listExpertPreRegistrations({ q: PREFIX }, { db: rls });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: address, status: 'verified', organization: 'Test Üniversitesi' });

    const csv = await exportExpertPreRegistrationsCsv({ q: PREFIX }, { db: rls });
    const lines = csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(address);

    // Without the scope the aggregate sees no row and the strip shows every seat free.
    // Other runs can only take more numbers, so this bound holds when they run alongside.
    const seats = await getRemainingFounderSeats(rls);
    expect(seats).toBeLessThanOrEqual(Math.max(0, FOUNDER_SEAT_LIMIT - (verified.founderNumber ?? FOUNDER_SEAT_LIMIT)));
  });

  it.skipIf(!ready)('removes the new row when the mail fails, through the RLS role', async () => {
    if (!rls) throw new Error('setup did not run');
    const mailer: Mailer = vi.fn(async () => {
      throw new Error('smtp down');
    });

    const result = await registerExpertPreRegistration(
      { ...valid, email: failedAddress },
      { db: rls, mailer, baseUrl: BASE, now: new Date(), ip: null, salt: null }
    );
    expect(result).toEqual({ kind: 'unavailable', error: 'mail_failed' });
    expect(mailer).toHaveBeenCalledTimes(1);

    // Counted as the owner: without the rollback's scope the app role cannot see the row to delete it.
    const left = await prisma.expertPreRegistration.count({ where: { email: failedAddress } });
    expect(left).toBe(0);
  });

  it.skipIf(!ready)('sees no row of the table without a scope, while the owner sees the row', async () => {
    if (!rls) throw new Error('setup did not run');
    const sql = `SELECT count(*)::int AS n FROM "ExpertPreRegistration" WHERE email = $1`;
    const asApp = await rls.$queryRawUnsafe<{ n: number }[]>(sql, address);
    const asOwner = await prisma.$queryRawUnsafe<{ n: number }[]>(sql, address);
    expect(asApp[0]?.n).toBe(0);
    expect(asOwner[0]?.n).toBe(1);
  });
});
