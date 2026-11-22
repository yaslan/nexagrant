import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-106 review finding 1 (sec-gnd): scripts/seed-m6-e2e.ts writes to whatever
 * DATABASE_URL points at. These tests pin the guard: a production NODE_ENV, or a
 * DATABASE_URL that is not a local address, must refuse before any Prisma call.
 */
const prismaCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../src/lib/db', () => {
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

import { assertSeedTarget, seed, rollback } from '../../scripts/seed-m6-e2e';

const LOCAL_GATE = 'postgresql://fabrika:fabrika@127.0.0.1:5439/fabrika_gate';

describe('seed-m6-e2e target guard (NG-106 finding 1)', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    prismaCalls.count = 0;
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  test('allows the isolated gate database on 127.0.0.1', () => {
    expect(() => assertSeedTarget({ DATABASE_URL: LOCAL_GATE, NODE_ENV: 'test' })).not.toThrow();
  });

  test('allows localhost and IPv6 loopback', () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: 'postgresql://u:p@localhost:5432/fabrika_dev', NODE_ENV: 'development' }),
    ).not.toThrow();
    expect(() =>
      assertSeedTarget({ DATABASE_URL: 'postgresql://u:p@[::1]:5432/fabrika_dev', NODE_ENV: 'development' }),
    ).not.toThrow();
  });

  test('refuses a remote (production-like) database host', () => {
    expect(() =>
      assertSeedTarget({ DATABASE_URL: 'postgresql://u:p@srv1234.hstgr.io:5432/fabrika', NODE_ENV: 'test' }),
    ).toThrow(/seed-m6-e2e/);
  });

  test('refuses NODE_ENV=production even on a local database', () => {
    expect(() => assertSeedTarget({ DATABASE_URL: LOCAL_GATE, NODE_ENV: 'production' })).toThrow(/production/);
  });

  test('refuses when DATABASE_URL is missing or unparseable', () => {
    expect(() => assertSeedTarget({ NODE_ENV: 'test' })).toThrow();
    expect(() => assertSeedTarget({ DATABASE_URL: 'not a url', NODE_ENV: 'test' })).toThrow();
  });

  test('seed() writes nothing when the target is remote', async () => {
    process.env = {
      ...savedEnv,
      DATABASE_URL: 'postgresql://u:p@db.example-prod.internal:5432/fabrika',
      NODE_ENV: 'test',
    };
    await expect(seed()).rejects.toThrow(/seed-m6-e2e/);
    expect(prismaCalls.count).toBe(0);
  });

  test('rollback() writes nothing when NODE_ENV is production', async () => {
    process.env = { ...savedEnv, DATABASE_URL: LOCAL_GATE, NODE_ENV: 'production' };
    await expect(rollback()).rejects.toThrow(/production/);
    expect(prismaCalls.count).toBe(0);
  });
});
