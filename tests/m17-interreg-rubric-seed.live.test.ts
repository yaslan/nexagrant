import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { envValue } from './helpers/dotenv';
import { skipOrFailInCi } from './helpers/live-db-role';

/**
 * FO-186 fix (crw2 B1) — the rubric seed on a real database, as the owning role
 * it runs as. A grid already in the database is not re-scored in place: a renamed
 * criterion key or a new pass mark under the same id stops the seed with "use a
 * new id", inside a transaction, so nothing of the refused run is written. What
 * is stored is read back and checked, so a value the column rounds is caught.
 *
 * Works on a copy of the seeded grid under a test id; the real one is untouched.
 * `.live`: needs the docker-compose Postgres (`pnpm db:setup`).
 */

const SUITE = 'm17-interreg-rubric-seed.live';
const ADMIN_URL = envValue('DATABASE_URL');
const ID = `test-rubric-${Date.now().toString(36)}`;

const { createDbClient } = await import('@/lib/db');
const { seedRubric, RubricSeedError } = await import('../prisma/seed-interreg-rubrics');
const { INTERREG_RUBRICS } = await import('../prisma/seed-data/interreg-rubrics');
type Seed = (typeof INTERREG_RUBRICS)[number];

let db: PrismaClient | undefined;
let ready = false;
let skipReason = '';

const base: Seed = { ...structuredClone(INTERREG_RUBRICS[0]!), id: ID, isDefault: false };
const variant = (change: (r: Seed) => void): Seed => {
  const r = structuredClone(base);
  change(r);
  return r;
};

const stored = async () => {
  const r = await db!.interregRubric.findUniqueOrThrow({
    where: { id: ID },
    select: { passRaw: true, label: true, criteria: { select: { criterionKey: true, name: true }, orderBy: { position: 'asc' } } },
  });
  return { passRaw: Number(r.passRaw), label: r.label, keys: r.criteria.map((c) => c.criterionKey), names: r.criteria.map((c) => c.name) };
};

beforeAll(async () => {
  if (!ADMIN_URL) {
    skipReason = 'DATABASE_URL is not set';
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  db = createDbClient(ADMIN_URL);
  try {
    await db.$connect();
  } catch (e) {
    skipReason = `database unavailable: ${e instanceof Error ? e.message : String(e)}`;
    skipOrFailInCi(SUITE, skipReason);
    return;
  }
  ready = true;
});

beforeEach(async (ctx) => {
  if (!ready) ctx.skip(skipReason);
});

afterAll(async () => {
  await db?.interregRubric.deleteMany({ where: { id: ID } }).catch(() => {});
  await db?.$disconnect().catch(() => {});
});

describe('rubric seed (crw2 B1)', () => {
  test('writes the grid and a second run changes nothing', async () => {
    await seedRubric(db!, base);
    const first = await stored();
    expect(first.keys).toEqual(base.criteria.map((c) => c.criterionKey));
    expect(first.passRaw).toBe(37);
    await seedRubric(db!, base);
    expect(await stored()).toEqual(first);
  });

  test('a renamed criterion key under the same id is refused, and nothing is written', async () => {
    const before = await stored();
    const renamed = variant((r) => {
      r.criteria[0]!.criterionKey = 'renamed_key';
      r.label = 'should not be written';
    });
    await expect(seedRubric(db!, renamed)).rejects.toThrow(RubricSeedError);
    await expect(seedRubric(db!, renamed)).rejects.toThrow(/new id/);
    expect(await stored()).toEqual(before);
    expect(await db!.interregRubricCriterion.count({ where: { rubricId: ID, criterionKey: 'renamed_key' } })).toBe(0);
  });

  test('passRaw 37 → 36 under the same id is refused', async () => {
    await expect(seedRubric(db!, variant((r) => (r.passRaw = 36)))).rejects.toThrow(/different scoring.*new id/);
    expect((await stored()).passRaw).toBe(37);
  });

  test.each([
    ['allowedMarks', (r: Seed) => (r.allowedMarks = [0, 1, 2, 3, 4])],
    ['a knockout floor', (r: Seed) => (r.criteria.find((c) => c.knockoutBelow !== null)!.knockoutBelow = 2)],
    ['a dropped criterion', (r: Seed) => {
      const dropped = r.criteria.pop()!;
      r.maxRaw -= dropped.maxMark;
      r.passRaw = 30;
    }],
  ])('%s changed under the same id is refused', async (_what, change) => {
    await expect(seedRubric(db!, variant(change))).rejects.toThrow(/different scoring/);
  });

  test('a text correction under the same id is written', async () => {
    const fixed = variant((r) => {
      r.criteria[0]!.name = `${r.criteria[0]!.name} (corrected)`;
    });
    await seedRubric(db!, fixed);
    expect((await stored()).names[0]).toMatch(/\(corrected\)$/);
  });

  test('a value the column rounds is caught on read-back and rolled back', async () => {
    // Decimal(4,1) stores maxMark 4.25 as 4.3, which is not one of allowedMarks.
    const id = `${ID}-round`;
    const odd = variant((r) => {
      r.id = id;
      r.allowedMarks = [1, 2, 3, 4.25];
      r.criteria = [{ ...r.criteria[0]!, maxMark: 4.25, knockoutBelow: null }];
      r.maxRaw = 4.3;
      r.passRaw = 2;
    });
    try {
      await expect(seedRubric(db!, odd)).rejects.toThrow(/as stored.*not an allowed mark/);
      expect(await db!.interregRubric.count({ where: { id } })).toBe(0);
    } finally {
      await db!.interregRubric.deleteMany({ where: { id } });
    }
  });

  test('inconsistent data is refused before the database is touched', async () => {
    const id = `${ID}-bad`;
    await expect(seedRubric(db!, variant((r) => ((r.id = id), (r.maxRaw = 55))))).rejects.toThrow(/inconsistent.*maxRaw 55/);
    expect(await db!.interregRubric.count({ where: { id } })).toBe(0);
  });
});
