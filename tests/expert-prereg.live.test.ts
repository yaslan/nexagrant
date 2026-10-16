import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { hashSecretToken } from '@/lib/secret-token';
import { exportExpertPreRegistrationsCsv } from '@/lib/expert-prereg/server/admin';
import { FOUNDER_SEAT_LIMIT } from '@/lib/expert-prereg/server/constants';
import { verifyExpertPreRegistration } from '@/lib/expert-prereg/server/verify';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — live founder-number race on real Postgres.
 *
 * Twenty experts verify at the same moment. Each must get a distinct number, and
 * the numbers must run on without a gap from the highest one already given. A
 * second click on each link must answer the same and move nothing. The rows the
 * test makes carry the `expertprereg-live-` prefix and are removed afterwards;
 * no other row is read for writing.
 *
 * Skipped with a reason when the database is not reachable.
 */

const PREFIX = 'expertprereg-live-';
const COUNT = 20;

// Decided before the suite is collected: skipIf reads it at definition time.
const reachable = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
const tokens = Array.from({ length: COUNT }, () => randomBytes(32).toString('hex'));
let before = 0;

beforeAll(async () => {
  if (!reachable) return;
  await prisma.expertPreRegistration.deleteMany({ where: { email: { startsWith: PREFIX } } });
  const top = await prisma.expertPreRegistration.aggregate({ _max: { founderNumber: true } });
  before = top._max.founderNumber ?? 0;

  const now = new Date();
  await prisma.expertPreRegistration.createMany({
    data: tokens.map((token, i) => ({
      fullName: `Live Expert ${i}`,
      email: `${PREFIX}${i}-${now.getTime()}@example.org`,
      province: '06',
      title: 'Araştırmacı',
      organization: 'Test Üniversitesi',
      isFreelancer: false,
      expertiseAreas: ['digital-ict'],
      roles: ['researcher'],
      programmes: ['horizon-europe-h2020'],
      languages: ['en'],
      kvkkAcceptedAt: now,
      visibilityConsentAt: now,
      locale: 'en',
      verifyTokenHash: hashSecretToken(token),
      verifyTokenExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: 'pending',
      createdAt: now,
    })),
  });
});

afterAll(async () => {
  if (!reachable) return;
  await prisma.expertPreRegistration.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe('founder number race (live Postgres)', () => {
  it.skipIf(!reachable)('gives 20 concurrent verifications distinct, gap-free numbers up to the limit, and none past it', async () => {
    const results = await Promise.all(tokens.map((token) => verifyExpertPreRegistration(token)));

    expect(results.every((r) => r.ok)).toBe(true);
    // Numbers run on from the highest one already given, up to FOUNDER_SEAT_LIMIT. The
    // rest of the 20 are verified without one: the expectation follows the room left.
    const room = Math.max(0, FOUNDER_SEAT_LIMIT - before);
    const expectedGranted = Math.min(COUNT, room);
    const granted = results.flatMap((r) => (r.ok && r.founderNumber !== null ? [r.founderNumber] : [])).sort((a, b) => a - b);
    expect(new Set(granted).size).toBe(granted.length);
    expect(granted).toEqual(Array.from({ length: expectedGranted }, (_, i) => before + 1 + i));
  });

  it.skipIf(!reachable)('answers a second click on each link the same and moves no number', async () => {
    const firsts = await Promise.all(tokens.map((token) => verifyExpertPreRegistration(token)));
    const seconds = await Promise.all(tokens.map((token) => verifyExpertPreRegistration(token)));
    expect(seconds).toEqual(firsts);
  });

  it.skipIf(!reachable)('exports the test rows as CSV with the header first and one line per row', async () => {
    const csv = await exportExpertPreRegistrationsCsv({ q: PREFIX });
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('ad,e-posta,il,alanlar,roller,programlar,durum,founderNumber,createdAt');
    expect(lines).toHaveLength(COUNT + 1);
    expect(lines[1]).toContain('Ankara');
    expect(lines.slice(1).every((line) => line.includes(',verified,'))).toBe(true);
  });
});
