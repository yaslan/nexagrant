import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The pg Pool constructor arguments are the only thing this test needs to see,
// so Pool, the Prisma adapter and the client are replaced by recording stubs.
const poolArgs = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('pg', () => {
  class Pool {
    constructor(opts: Record<string, unknown>) {
      poolArgs.push(opts);
    }
  }
  return { default: { Pool } };
});
vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: class {
    constructor(_pool: unknown) {}
  },
}));
vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor(_opts: unknown) {}
    $extends() {
      return this;
    }
  },
}));

const URL = 'postgresql://user:pass@127.0.0.1:1/db';
const originalValue = process.env.DB_CONNECT_TIMEOUT_MS;

/** Re-reads env.ts (and db.ts) with DB_CONNECT_TIMEOUT_MS set to `value`, or unset when undefined. */
async function load(value: string | undefined) {
  if (value === undefined) delete process.env.DB_CONNECT_TIMEOUT_MS;
  else process.env.DB_CONNECT_TIMEOUT_MS = value;
  vi.resetModules();
  poolArgs.length = 0;
  return import('@/lib/db');
}

describe('DB_CONNECT_TIMEOUT_MS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalValue === undefined) delete process.env.DB_CONNECT_TIMEOUT_MS;
    else process.env.DB_CONNECT_TIMEOUT_MS = originalValue;
  });

  it('defaults to 1000 ms when unset', async () => {
    const db = await load(undefined);
    expect((await import('@/lib/env')).dbConnectTimeoutMs).toBe(1000);
    db.createDbClient(URL);
    expect(poolArgs[0]?.connectionTimeoutMillis).toBe(1000);
  });

  it('treats a blank value as unset', async () => {
    await load('');
    expect((await import('@/lib/env')).dbConnectTimeoutMs).toBe(1000);
  });

  it('uses the configured value for new pools', async () => {
    const db = await load('10000');
    expect((await import('@/lib/env')).dbConnectTimeoutMs).toBe(10000);
    db.createDbClient(URL);
    expect(poolArgs[0]?.connectionTimeoutMillis).toBe(10000);
  });

  it('lets an explicit poolOptions value win over the environment', async () => {
    const db = await load('10000');
    db.createDbClient(URL, { connectionTimeoutMillis: 250 });
    expect(poolArgs[0]?.connectionTimeoutMillis).toBe(250);
  });

  it.each(['abc', '0', '-5', '1.5', '60001'])('rejects %s at boot', async (bad) => {
    await expect(load(bad)).rejects.toThrow(/DB_CONNECT_TIMEOUT_MS/);
  });
});
