import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

// Same stubs as db-connect-timeout.test.ts: the pool and the Prisma client are
// replaced, so the test only sees what withTenantOn hands to $transaction.
vi.mock('pg', () => {
  class Pool {
    constructor(_opts: Record<string, unknown>) {}
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

const originalValue = process.env.DB_TX_MAX_WAIT_MS;

/** Re-reads env.ts with DB_TX_MAX_WAIT_MS set to `value`, or unset when undefined. */
async function loadEnv(value: string | undefined) {
  if (value === undefined) delete process.env.DB_TX_MAX_WAIT_MS;
  else process.env.DB_TX_MAX_WAIT_MS = value;
  vi.resetModules();
  return import('@/lib/env');
}

/** A fake client whose $transaction records the options it was given. */
function fakeClient() {
  const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>, _options?: unknown) =>
    cb({ $executeRaw: vi.fn(async () => 0) })
  );
  return { client: { $transaction } as unknown as PrismaClient, $transaction };
}

describe('DB_TX_MAX_WAIT_MS', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalValue === undefined) delete process.env.DB_TX_MAX_WAIT_MS;
    else process.env.DB_TX_MAX_WAIT_MS = originalValue;
  });

  it('defaults to 2000 ms when unset (live and dev, unchanged)', async () => {
    expect((await loadEnv(undefined)).dbTxMaxWaitMs).toBe(2000);
  });

  it('treats a blank value as unset', async () => {
    expect((await loadEnv('')).dbTxMaxWaitMs).toBe(2000);
  });

  it('uses the configured value (CI and gate set 10000)', async () => {
    expect((await loadEnv('10000')).dbTxMaxWaitMs).toBe(10000);
  });

  it.each(['abc', '0', '-5', '1.5', '60001'])('rejects %s at boot', async (bad) => {
    await expect(loadEnv(bad)).rejects.toThrow(/DB_TX_MAX_WAIT_MS/);
  });

  it('withTenant without options waits the configured maxWait (10000)', async () => {
    await loadEnv('10000');
    const { withTenantOn } = await import('@/lib/db');
    const { client, $transaction } = fakeClient();
    await withTenantOn(client, 'tenant-1', async () => 'ok');
    expect($transaction.mock.calls[0]?.[1]).toMatchObject({ maxWait: 10000 });
  });

  it('withTenant without options keeps the 2000 ms default when unset', async () => {
    await loadEnv(undefined);
    const { withTenantOn } = await import('@/lib/db');
    const { client, $transaction } = fakeClient();
    await withTenantOn(client, 'tenant-1', async () => 'ok');
    expect($transaction.mock.calls[0]?.[1]).toMatchObject({ maxWait: 2000 });
  });

  it('an explicit maxWait from the caller is never overridden', async () => {
    await loadEnv('10000');
    const { withTenantOn } = await import('@/lib/db');
    const { client, $transaction } = fakeClient();
    await withTenantOn(client, 'tenant-1', async () => 'ok', { maxWait: 30000, timeout: 120000 });
    expect($transaction.mock.calls[0]?.[1]).toEqual({ maxWait: 30000, timeout: 120000 });
  });

  it('an explicit undefined maxWait still gets the configured default', async () => {
    await loadEnv('10000');
    const { withTenantOn } = await import('@/lib/db');
    const { client, $transaction } = fakeClient();
    await withTenantOn(client, 'tenant-1', async () => 'ok', { maxWait: undefined });
    expect($transaction.mock.calls[0]?.[1]).toMatchObject({ maxWait: 10000 });
  });

  it('timeout is left at the Prisma default (not set by us)', async () => {
    await loadEnv('10000');
    const { withTenantOn } = await import('@/lib/db');
    const { client, $transaction } = fakeClient();
    await withTenantOn(client, 'tenant-1', async () => 'ok');
    expect($transaction.mock.calls[0]?.[1]).not.toHaveProperty('timeout');
  });
});
