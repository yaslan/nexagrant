import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { hashSecretToken } from '@/lib/secret-token';
import { FOUNDER_SEAT_LIMIT } from './constants';
import { getRemainingFounderSeats } from './seats';
import { verifyExpertPreRegistration } from './verify';

const NOW = new Date('2026-10-17T10:00:00.000Z');
const LATER = new Date(NOW.getTime() + 25 * 60 * 60 * 1000);
const TOKEN = 'a'.repeat(64);

type Row = {
  id: string;
  locale: string;
  status: string;
  emailVerifiedAt: Date | null;
  founderNumber: number | null;
  verifyTokenHash: string | null;
  verifyTokenExpiresAt: Date | null;
};

/** In-memory stand-in for the calls verify and seats make. `counter` is ExpertFounderCounter's lastNumber (undefined = no row). */
function fakeDb(seed: Row[] = [], counter?: number) {
  const rows: Row[] = [...seed];
  const state = { counter };
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    expertFounderCounter: {
      findUnique: vi.fn(async () => (state.counter === undefined ? null : { lastNumber: state.counter })),
      upsert: vi.fn(async ({ update }: { update: { lastNumber: number } }) => {
        state.counter = update.lastNumber;
        return { id: 1, lastNumber: state.counter };
      }),
    },
    expertPreRegistration: {
      findUnique: vi.fn(async ({ where }: { where: { verifyTokenHash: string } }) => {
        const row = rows.find((r) => r.verifyTokenHash === where.verifyTokenHash);
        return row ? { ...row } : null;
      }),
      aggregate: vi.fn(async () => ({
        _max: { founderNumber: rows.reduce<number | null>((m, r) => (r.founderNumber === null ? m : Math.max(m ?? 0, r.founderNumber)), null) },
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      }),
      count: vi.fn(async ({ where }: { where: { founderNumber?: { not: null } } }) =>
        rows.filter((r) => (where.founderNumber ? r.founderNumber !== null : true)).length
      ),
    },
  };
  const db = {
    $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    expertPreRegistration: tx.expertPreRegistration,
  } as unknown as PrismaClient;
  return { db, rows, state };
}

function pending(id: string, token: string, overrides: Partial<Row> = {}): Row {
  return {
    id,
    locale: 'tr',
    status: 'pending',
    emailVerifiedAt: null,
    founderNumber: null,
    verifyTokenHash: hashSecretToken(token),
    verifyTokenExpiresAt: LATER,
    ...overrides,
  };
}

describe('verifyExpertPreRegistration', () => {
  it('verifies a pending expert and gives the next founder number', async () => {
    const { db, rows } = fakeDb([pending('a', TOKEN)]);
    const result = await verifyExpertPreRegistration(TOKEN, { db, now: NOW });
    expect(result).toEqual({ ok: true, founderNumber: 1, locale: 'tr' });
    expect(rows[0]).toMatchObject({ status: 'verified', founderNumber: 1, emailVerifiedAt: NOW });
  });

  it('numbers the experts in the order they verify, without a gap', async () => {
    const { db } = fakeDb([pending('a', TOKEN), pending('b', 'b'.repeat(64))]);
    const first = await verifyExpertPreRegistration(TOKEN, { db, now: NOW });
    const second = await verifyExpertPreRegistration('b'.repeat(64), { db, now: NOW });
    expect(first).toMatchObject({ ok: true, founderNumber: 1 });
    expect(second).toMatchObject({ ok: true, founderNumber: 2 });
  });

  it('answers the same on a second click and does not move the number', async () => {
    const { db, rows } = fakeDb([pending('a', TOKEN)]);
    const first = await verifyExpertPreRegistration(TOKEN, { db, now: NOW });
    const again = await verifyExpertPreRegistration(TOKEN, { db, now: LATER });
    expect(again).toEqual(first);
    expect(rows[0]!.founderNumber).toBe(1);
  });

  it('refuses an expired link and leaves the expert unverified', async () => {
    const { db, rows } = fakeDb([pending('a', TOKEN, { verifyTokenExpiresAt: NOW })]);
    const result = await verifyExpertPreRegistration(TOKEN, { db, now: LATER });
    expect(result).toEqual({ ok: false, error: 'expired', locale: 'tr' });
    expect(rows[0]!.status).toBe('pending');
  });

  it('refuses an unknown or malformed token as invalid', async () => {
    const { db } = fakeDb([pending('a', TOKEN)]);
    expect(await verifyExpertPreRegistration('c'.repeat(64), { db, now: NOW })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await verifyExpertPreRegistration('not-a-token', { db, now: NOW })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await verifyExpertPreRegistration(null, { db, now: NOW })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('refuses a disabled expert as invalid', async () => {
    const { db } = fakeDb([pending('a', TOKEN, { status: 'disabled' })]);
    expect(await verifyExpertPreRegistration(TOKEN, { db, now: NOW })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('numbers from the founder counter, so a number whose row was purged is not given again (FO-50)', async () => {
    // Founder 7 was the highest and its row is gone after a year; the counter still says 7.
    const { db, rows, state } = fakeDb([pending('a', TOKEN)], 7);
    const result = await verifyExpertPreRegistration(TOKEN, { db, now: NOW });
    expect(result).toMatchObject({ ok: true, founderNumber: 8 });
    expect(rows[0]!.founderNumber).toBe(8);
    expect(state.counter).toBe(8);
  });

  it('never goes below a number a row holds when the counter is behind (no start value yet)', async () => {
    const held: Row = { ...pending('old', 'f'.repeat(64)), status: 'verified', emailVerifiedAt: NOW, founderNumber: 4, verifyTokenHash: null };
    const { db, state } = fakeDb([held, pending('a', TOKEN)]);
    expect(await verifyExpertPreRegistration(TOKEN, { db, now: NOW })).toMatchObject({ ok: true, founderNumber: 5 });
    expect(state.counter).toBe(5);
  });

  it('gives no number once 100 are taken, and the expert is still verified', async () => {
    const seeded: Row[] = Array.from({ length: FOUNDER_SEAT_LIMIT }, (_, i) => ({
      id: `done-${i}`,
      locale: 'tr',
      status: 'verified',
      emailVerifiedAt: NOW,
      founderNumber: i + 1,
      verifyTokenHash: null,
      verifyTokenExpiresAt: null,
    }));
    const extra = 'e'.repeat(64);
    const { db, rows } = fakeDb([...seeded, pending('late', extra)]);
    const result = await verifyExpertPreRegistration(extra, { db, now: NOW });
    expect(result).toEqual({ ok: true, founderNumber: null, locale: 'tr' });
    expect(rows.find((r) => r.id === 'late')).toMatchObject({ status: 'verified', founderNumber: null });
  });

  it('gives no number when the counter has reached the limit, even with no founder row left', async () => {
    const { db, state } = fakeDb([pending('a', TOKEN)], FOUNDER_SEAT_LIMIT);
    expect(await verifyExpertPreRegistration(TOKEN, { db, now: NOW })).toEqual({ ok: true, founderNumber: null, locale: 'tr' });
    expect(state.counter).toBe(FOUNDER_SEAT_LIMIT);
  });
});

describe('getRemainingFounderSeats', () => {
  /** A db answering the two reads seats makes: the founder counter and the highest number on a row. */
  function seatsDb(highest: number | null, counter?: number) {
    const aggregate = vi.fn(async () => ({ _max: { founderNumber: highest } }));
    const findUnique = vi.fn(async () => (counter === undefined ? null : { lastNumber: counter }));
    const tx = { $executeRaw: vi.fn(async () => 0), expertPreRegistration: { aggregate }, expertFounderCounter: { findUnique } };
    // FO-45: the read runs inside withSystemScopeOn, so the fake answers $transaction too.
    const db = {
      $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
    } as unknown as PrismaClient;
    return { db, aggregate, findUnique };
  }

  it('counts the free seats from the founder counter, the same source the verification numbers from', async () => {
    const { db, findUnique } = seatsDb(3, 3);
    expect(await getRemainingFounderSeats(db)).toBe(FOUNDER_SEAT_LIMIT - 3);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 }, select: { lastNumber: true } });
  });

  it('does not give a seat back when the top founder row is purged: the counter decides (FO-50)', async () => {
    expect(await getRemainingFounderSeats(seatsDb(null, 9).db)).toBe(FOUNDER_SEAT_LIMIT - 9);
    expect(await getRemainingFounderSeats(seatsDb(2, 9).db)).toBe(FOUNDER_SEAT_LIMIT - 9);
  });

  it('does not count a gap as a free seat, and a row above a lagging counter still counts', async () => {
    expect(await getRemainingFounderSeats(seatsDb(5).db)).toBe(FOUNDER_SEAT_LIMIT - 5);
    expect(await getRemainingFounderSeats(seatsDb(6, 4).db)).toBe(FOUNDER_SEAT_LIMIT - 6);
  });

  it('is zero, never negative, once the limit is passed', async () => {
    expect(await getRemainingFounderSeats(seatsDb(FOUNDER_SEAT_LIMIT + 5).db)).toBe(0);
  });

  it('is the full limit before anyone is verified', async () => {
    expect(await getRemainingFounderSeats(seatsDb(null).db)).toBe(FOUNDER_SEAT_LIMIT);
  });
});
