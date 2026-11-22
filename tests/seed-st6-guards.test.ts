import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-316 — scripts/seed-st6-empty-e2e.ts used to back up and DELETE the CORDIS
 * tables of whatever database DATABASE_URL pointed at (the shared `fabrika`), and
 * its restore wrote 1,1 M rows in one createMany and failed (NG-313: 1.105.839 -> 0).
 *
 * These tests pin the guards added for it:
 *   1. a non-throwaway database is refused before ANY Prisma call (URL check first,
 *      then the database name the connection reports);
 *   2. the restore writes in chunks sized under the bind-parameter cap;
 *   3. the restore counts per table against the backup (see countMismatches).
 */
const prismaCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/lib/db', () => {
  const handler: ProxyHandler<object> = {
    get: (_target, prop) => {
      // Not thenable: `await prisma.x` must not hang on a proxied `then`.
      if (prop === 'then') return undefined;
      prismaCalls.count += 1;
      return new Proxy(() => undefined, handler);
    },
    apply: () => {
      prismaCalls.count += 1;
      return new Proxy(() => undefined, handler);
    },
  };
  return { prisma: new Proxy({}, handler) };
});

import { seed, rollback } from '../scripts/seed-st6-empty-e2e';
import {
  assertThrowawayDatabase,
  chunkRows,
  countMismatches,
  databaseNameFromUrl,
  rowsPerChunk,
  RESTORE_MAX_PARAMS,
  RESTORE_MAX_ROWS,
} from '../scripts/st6-seed-guard';

const FACTORY = 'postgresql://fabrika:secret@127.0.0.1:5433/fabrika';

describe('databaseNameFromUrl', () => {
  test('reads the database name from the path', () => {
    expect(databaseNameFromUrl(FACTORY)).toBe('fabrika');
    expect(databaseNameFromUrl('postgresql://u:p@h:55401/fabrika_gate')).toBe('fabrika_gate');
    expect(databaseNameFromUrl('postgresql://u:p@h:5432/fabrika_test_ng12?sslmode=disable')).toBe('fabrika_test_ng12');
  });

  test('is undefined when there is no URL or no database name', () => {
    expect(databaseNameFromUrl(undefined)).toBeUndefined();
    expect(databaseNameFromUrl('postgresql://u:p@h:5432/')).toBeUndefined();
    expect(databaseNameFromUrl('not a url')).toBeUndefined();
  });
});

describe('assertThrowawayDatabase (same rule as jobs-enqueue-force.live)', () => {
  const local = {};

  test.each(['fabrika_gate', 'fabrika_test', 'fabrika_test_ng12'])('accepts %s', (name) => {
    expect(() => assertThrowawayDatabase(name, local)).not.toThrow();
  });

  test.each(['fabrika', 'fabrika_prod', 'fabrika_test_ng', 'postgres', 'fabrika_test_x'])('refuses %s', (name) => {
    expect(() => assertThrowawayDatabase(name, local)).toThrow(/refusing to write on database/);
  });

  test('accepts plain fabrika only on a GitHub Actions runner (CI and GITHUB_ACTIONS both true)', () => {
    expect(() => assertThrowawayDatabase('fabrika', { GITHUB_ACTIONS: 'true', CI: 'true' })).not.toThrow();
    expect(() => assertThrowawayDatabase('fabrika', { GITHUB_ACTIONS: 'true' })).toThrow();
  });

  test('refuses a missing name', () => {
    expect(() => assertThrowawayDatabase(undefined, local)).toThrow(/no database name/);
  });
});

describe('restore chunking', () => {
  test('rowsPerChunk stays under the bind-parameter cap for wide tables', () => {
    const size = rowsPerChunk(30);
    expect(size * 30).toBeLessThanOrEqual(RESTORE_MAX_PARAMS);
    expect(size).toBeGreaterThan(0);
  });

  test('rowsPerChunk never exceeds RESTORE_MAX_ROWS for narrow tables', () => {
    expect(rowsPerChunk(2)).toBe(RESTORE_MAX_ROWS);
    expect(rowsPerChunk(0)).toBeLessThanOrEqual(RESTORE_MAX_ROWS);
  });

  test('chunkRows splits in order and keeps every row exactly once', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const parts = chunkRows(rows, 10);
    expect(parts.map((p) => p.length)).toEqual([10, 10, 5]);
    expect(parts.flat()).toEqual(rows);
  });

  test('chunkRows of nothing is nothing (no empty createMany call)', () => {
    expect(chunkRows([], 10)).toEqual([]);
  });

  test('a 1.1 M row table becomes 111 inserts of at most 10 000', () => {
    const parts = chunkRows(new Array(1_105_839).fill(0), RESTORE_MAX_ROWS);
    expect(parts.length).toBe(111);
    expect(parts[0]!.length).toBe(RESTORE_MAX_ROWS);
    expect(parts.at(-1)!.length).toBe(1_105_839 - 110 * RESTORE_MAX_ROWS);
  });
});

describe('countMismatches (backup is kept unless every table matches)', () => {
  test('empty when every table matches', () => {
    expect(countMismatches({ A: 3, B: 0 }, { A: 3, B: 0 })).toEqual([]);
  });

  test('names each short table with both numbers', () => {
    expect(countMismatches({ A: 3, B: 5 }, { A: 3, B: 4 })).toEqual(['B: yedek 5, geri yüklenen 4']);
  });

  test('a missing table counts as a mismatch', () => {
    expect(countMismatches({ A: 1 }, {})).toEqual(['A: yedek 1, geri yüklenen yok']);
  });
});

describe('seed / rollback refuse a non-throwaway database before any Prisma call', () => {
  let savedUrl: string | undefined;

  beforeEach(() => {
    savedUrl = process.env.DATABASE_URL;
    prismaCalls.count = 0;
  });

  afterEach(() => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
  });

  test('seed() on the shared fabrika database throws and makes zero DB calls', async () => {
    process.env.DATABASE_URL = FACTORY;
    await expect(seed()).rejects.toThrow(/refusing to write on database "fabrika"/);
    expect(prismaCalls.count).toBe(0);
  });

  test('rollback() on the shared fabrika database throws and makes zero DB calls', async () => {
    process.env.DATABASE_URL = FACTORY;
    await expect(rollback()).rejects.toThrow(/refusing to write on database "fabrika"/);
    expect(prismaCalls.count).toBe(0);
  });
});
