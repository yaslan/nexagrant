import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * scripts/k1-embeddings-unlock-rejected.ts runs `main()` only when it is the
 * process's own script (İNCELEME-108 Ö-6 / U10, İNCELEME-113). The live test
 * imports it: an `isMain` that is always true would start an unscoped dry run
 * against the whole catalogue and `$disconnect` the shared client on import;
 * one that is always false would make the documented `pnpm tsx …` command a
 * silent no-op. Both directions are pinned here, with the database mocked.
 */
const db = vi.hoisted(() => ({
  queryRaw: vi.fn(async () => []),
  findMany: vi.fn(async () => []),
  disconnect: vi.fn(async () => {}),
}));

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  prisma: { $queryRaw: db.queryRaw, $executeRaw: vi.fn(), tenant: { findMany: db.findMany }, $disconnect: db.disconnect },
  withTenant: vi.fn(),
}));

const argv = process.argv;
let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = argv;
  log.mockRestore();
});

describe('k1-embeddings-unlock-rejected: isMain', () => {
  test('imported by another file (the live test), it runs nothing and keeps the client connected', async () => {
    process.argv = [argv[0]!, '/repo/node_modules/vitest/vitest.mjs'];
    await import('../scripts/k1-embeddings-unlock-rejected');
    await new Promise((r) => setTimeout(r, 50));
    expect({ queries: db.queryRaw.mock.calls.length, tenants: db.findMany.mock.calls.length, disconnects: db.disconnect.mock.calls.length, logs: log.mock.calls.length }).toEqual({
      queries: 0,
      tenants: 0,
      disconnects: 0,
      logs: 0,
    });
  });

  test('run as `tsx scripts/k1-embeddings-unlock-rejected.ts`, it does a dry run and then disconnects', async () => {
    process.argv = [argv[0]!, '/repo/scripts/k1-embeddings-unlock-rejected.ts'];
    await import('../scripts/k1-embeddings-unlock-rejected');
    await vi.waitFor(() => expect(db.disconnect).toHaveBeenCalledTimes(1));
    expect(db.queryRaw).toHaveBeenCalledTimes(1); // markedTopics
    expect(db.findMany).toHaveBeenCalledTimes(1); // markedProfiles' tenant list
    expect(log.mock.calls[0]?.[0]).toMatch(/^DRY RUN — marked rows: topics 0, tenant profiles 0$/);
  });
});
