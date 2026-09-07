/**
 * `syncK1Topics` — the persistence half of the K1 daily job.
 *
 * The behaviour under test was found by running `pnpm jobs:k1` twice against a
 * real database on 2026-09-07: `Call` and `Topic` counts held (430 / 1288), but
 * `RawFetch` grew by 4 rows. The cause was two SEDIA identifiers arriving twice
 * in a single run with different bodies, so the change-detection hash
 * flip-flopped and stored a new payload every night, forever.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AdapterResult, BaseTopic } from '../src/lib/adapters/schemas/common';

interface StubRow {
  [key: string]: unknown;
}

const rawFetches: StubRow[] = [];
const alerts: StubRow[] = [];
const topics = new Map<string, StubRow>();
const calls = new Map<string, StubRow>();

vi.mock('@/lib/db', () => ({
  prisma: {
    systemAlert: {
      create: vi.fn(async ({ data }: { data: StubRow }) => {
        alerts.push(data);
        return data;
      }),
    },
    rawFetch: {
      findFirst: vi.fn(async ({ where }: { where: { source: string; key: string } }) => {
        const matching = rawFetches.filter(
          (r) => r.source === where.source && r.key === where.key
        );
        return matching[matching.length - 1] ?? null;
      }),
      create: vi.fn(async ({ data }: { data: StubRow }) => {
        rawFetches.push(data);
        return data;
      }),
    },
    programme: { upsert: vi.fn(async ({ create }: { create: StubRow }) => create) },
    call: {
      upsert: vi.fn(async ({ where, create }: { where: { callIdentifier: string }; create: StubRow }) => {
        const existing = calls.get(where.callIdentifier);
        if (existing) return existing;
        const row = { id: `call-${calls.size + 1}`, ...create };
        calls.set(where.callIdentifier, row);
        return row;
      }),
    },
    topic: {
      findUnique: vi.fn(async ({ where }: { where: { identifier: string } }) =>
        topics.get(where.identifier) ?? null
      ),
      create: vi.fn(async ({ data }: { data: StubRow }) => {
        const row = { id: `topic-${topics.size + 1}`, ...data };
        topics.set(String(data.identifier), row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: StubRow }) => {
        for (const [identifier, row] of topics) {
          if (row.id === where.id) {
            const merged = { ...row, ...data };
            topics.set(identifier, merged);
            return merged;
          }
        }
        throw new Error(`no topic with id ${where.id}`);
      }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { syncK1Topics } = await import('../src/lib/inngest/jobs/k1-daily-calls');

function topic(identifier: string, overrides: Partial<BaseTopic> = {}): BaseTopic {
  return {
    identifier,
    title: `Topic ${identifier}`,
    status: 'OPEN',
    callIdentifier: 'HORIZON-CL5-2026-01',
    isLumpSum: false,
    isTwoStage: false,
    deadlines: [],
    ageInDays: null,
    eligibility: { restricted: null, eligibleCountries: [], countriesExcluded: [] },
    keywords: [],
    ...overrides,
  } as BaseTopic;
}

function source(list: BaseTopic[]): AdapterResult<BaseTopic> {
  return {
    source: 'sedia',
    status: 'ok',
    topicsProcessed: list.length,
    topics: list,
    schemaDrift: [],
  } as AdapterResult<BaseTopic>;
}

beforeEach(() => {
  rawFetches.length = 0;
  alerts.length = 0;
  topics.clear();
  calls.clear();
});

describe('syncK1Topics', () => {
  it('stores one RawFetch row per topic on a first run', async () => {
    const result = await syncK1Topics([source([topic('A-1'), topic('A-2')])]);

    expect(result.inserted).toBe(2);
    expect(rawFetches).toHaveLength(2);
    expect(rawFetches[0]).toMatchObject({ source: 'sedia', key: 'A-1' });
  });

  it('adds no RawFetch row when the same payload comes back (CLAUDE.md rule 6)', async () => {
    await syncK1Topics([source([topic('A-1')])]);
    expect(rawFetches).toHaveLength(1);

    await syncK1Topics([source([topic('A-1')])]);
    expect(rawFetches).toHaveLength(1);
  });

  it('stores a new RawFetch row when the upstream body actually changed', async () => {
    await syncK1Topics([source([topic('A-1', { title: 'before' })])]);
    await syncK1Topics([source([topic('A-1', { title: 'after' })])]);

    expect(rawFetches).toHaveLength(2);
    expect(rawFetches[0]!.hash).not.toBe(rawFetches[1]!.hash);
  });

  it('keeps one record per identifier when a feed answers twice in one run', async () => {
    const result = await syncK1Topics([
      source([
        topic('DUP-1', { title: 'listing body' }),
        topic('DUP-1', { title: 'detail body' }),
        topic('OTHER', {}),
      ]),
    ]);

    expect(result.totalProcessed).toBe(2);
    expect(topics.size).toBe(2);
    expect(rawFetches.filter((r) => r.key === 'DUP-1')).toHaveLength(1);
    // Last one wins — exactly what the un-deduplicated loop already persisted.
    expect(topics.get('DUP-1')!.title).toBe('detail body');
  });

  it('does not grow RawFetch across runs when a duplicate identifier repeats', async () => {
    const run = () =>
      syncK1Topics([
        source([topic('DUP-1', { title: 'listing body' }), topic('DUP-1', { title: 'detail body' })]),
      ]);

    await run();
    const afterFirst = rawFetches.length;
    await run();

    // This is the regression: before the fix each run appended two rows because
    // the two bodies alternated the change-detection hash.
    expect(rawFetches.length).toBe(afterFirst);
  });

  it('alerts an operator about the duplicated identifiers instead of hiding them', async () => {
    await syncK1Topics([source([topic('DUP-1'), topic('DUP-1')])]);

    const alert = alerts.find((a) => String(a.message).includes('more than once'));
    expect(alert).toBeDefined();
    expect(alert!.level).toBe('warn');
    expect((alert!.meta as { duplicateIdentifiers: string[] }).duplicateIdentifiers).toEqual(['DUP-1']);
  });
});
