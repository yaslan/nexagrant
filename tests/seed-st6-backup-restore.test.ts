import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-316 review follow-up (PR #410: B2, N1a, N1b) and NG-320 (PR #410 review: N-a, N-b, N-c).
 *
 * Covers the paths the first guard test does not reach, with Prisma and fs mocked so
 * no database and no real backup file is touched:
 *   - B2: a backup write that fails with EEXIST must not arm the in-memory backup;
 *   - N-a: a seed run that did not write the backup (EEXIST or an existing file) makes the
 *     rollback of that same run a warning-only exit: no restore, no delete, no fixture rows;
 *   - N1a: the connection's own current_database() is checked a second time;
 *   - N1b / N-b: the restore keeps the backup when the per-table counts disagree, deletes it
 *     when every count matches, writes in slices no larger than rowsPerChunk, and a rollback
 *     with no backup is a no-op for the CORDIS tables;
 *   - N-c: module state is reset between tests (resetSt6SeedStateForTests), so no test
 *     depends on what an earlier test left in memory.
 *
 * Every test pins DATABASE_URL, GITHUB_ACTIONS and CI with vi.stubEnv: on a GitHub
 * Actions runner plain `fabrika` is throwaway, so the result must not depend on the
 * shell or the runner that runs the suite.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  currentDb: 'fabrika_gate' as string,
  /** Row count per prisma delegate, returned by `count()`; absent delegates count 0. */
  counts: {} as Record<string, number>,
  /** Length of each `createMany` slice, per delegate, in call order. */
  createManySizes: [] as { model: string; rows: number }[],
  fsMock: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const mocked = { ...actual, ...h.fsMock };
  return { ...mocked, default: mocked };
});

vi.mock('../src/lib/db', () => {
  const delegate = (model: string) =>
    new Proxy(
      {},
      {
        get: (_target, method) => {
          if (method === 'then') return undefined;
          return vi.fn(async (...args: unknown[]) => {
            h.calls.push(`${model}.${String(method)}`);
            if (method === 'findMany') return [];
            if (method === 'count') return h.counts[model] ?? 0;
            if (method === 'createMany') {
              const data = (args[0] as { data?: unknown[] } | undefined)?.data ?? [];
              h.createManySizes.push({ model, rows: data.length });
            }
            return { count: 0 };
          });
        },
      },
    );
  const prisma = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === '$queryRaw') {
          return vi.fn(async () => {
            h.calls.push('$queryRaw');
            return [{ name: h.currentDb }];
          });
        }
        return delegate(String(prop));
      },
    },
  );
  return { prisma };
});

import { seed, rollback, resetSt6SeedStateForTests } from '../scripts/seed-st6-empty-e2e';
import { rowsPerChunk } from '../scripts/st6-seed-guard';

const GATE_URL = 'postgresql://u:p@127.0.0.1:55401/fabrika_gate';

/** Runner env pinned off: the shared-fabrika rule must hold on a plain dev shell. */
function pinNonRunnerEnv(): void {
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.stubEnv('CI', '');
  vi.stubEnv('DATABASE_URL', GATE_URL);
}

/** Every per-test reset: env, mock call logs, mock return values, and module state (N-c). */
function resetAll(currentDb: string): void {
  pinNonRunnerEnv();
  resetSt6SeedStateForTests();
  h.calls.length = 0;
  h.createManySizes.length = 0;
  h.counts = {};
  h.currentDb = currentDb;
  vi.clearAllMocks();
  h.fsMock.existsSync.mockReset().mockReturnValue(false);
  h.fsMock.readFileSync.mockReset();
  h.fsMock.writeFileSync.mockReset();
  h.fsMock.unlinkSync.mockReset();
}

function backupWithProjects(n: number): string {
  const project = {
    rawJson: null,
    startDate: null,
    endDate: null,
    ecSignatureDate: null,
    contentUpdateDate: null,
    importedAt: null,
  };
  return JSON.stringify({
    cordisCoParticipations: [],
    cordisPartnerProfiles: [],
    cordisParticipations: [],
    cordisProjectTopics: [],
    cordisProjectSciVocs: [],
    cordisOrganizations: [],
    cordisImportRuns: [],
    cordisProjects: Array.from({ length: n }, (_, i) => ({ ...project, id: `p${i}` })),
  });
}

// Mock call names are `<prisma delegate>.<method>` (camelCase, e.g. cordisProject.deleteMany).
// Only the CORDIS deleteMany calls count as deletes; findMany reads are fine.
const CORDIS_DELEGATES = ['cordisCoParticipation', 'cordisPartnerProfile', 'cordisParticipation', 'cordisProjectTopic', 'cordisProjectSciVoc', 'cordisOrganization', 'cordisProject', 'cordisImportRun'];
const cordisDeletes = () => h.calls.filter((c) => c.endsWith('.deleteMany') && CORDIS_DELEGATES.some((d) => c.startsWith(`${d}.`)));

describe('NG-316 B2 / NG-320 N-a — a seed run that did not write the backup cannot restore or delete it', () => {
  beforeEach(() => resetAll('fabrika_gate'));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('EEXIST on the backup write: seed refuses, and rollback of the same run touches nothing', async () => {
    h.fsMock.writeFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
    });

    await expect(seed()).rejects.toThrow(/EEXIST/);
    expect(cordisDeletes()).toEqual([]);

    // The real backup belongs to another run. This run never cleared the tables, so its
    // rollback must not load that file into the database, must not delete it, and must not
    // touch the fixture rows (they may be the other run's).
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(1));

    await expect(rollback()).resolves.toBeUndefined();
    expect(h.fsMock.readFileSync).not.toHaveBeenCalled();
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(cordisDeletes()).toEqual([]);
    expect(h.calls.filter((c) => c.includes('createMany'))).toEqual([]);
    expect(h.calls.filter((c) => c.startsWith('tenant.') && c.endsWith('deleteMany'))).toEqual([]);
  });

  test('backup already present before this run: seed refuses without writing, and rollback of this run is a warning-only exit', async () => {
    h.fsMock.existsSync.mockReturnValue(true);

    await expect(seed()).rejects.toThrow(/already exists/);
    expect(h.fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(cordisDeletes()).toEqual([]);

    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(1));
    await expect(rollback()).resolves.toBeUndefined();
    expect(h.fsMock.readFileSync).not.toHaveBeenCalled();
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
    expect(cordisDeletes()).toEqual([]);
  });
});

describe('NG-316 N1a — second current_database() guard', () => {
  beforeEach(() => resetAll('fabrika_gate'));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('URL says fabrika_gate but the connection answers fabrika: refused before any backup or delete', async () => {
    h.currentDb = 'fabrika';

    await expect(seed()).rejects.toThrow(/refusing to write on database "fabrika"/);
    expect(h.calls).toEqual(['$queryRaw']);
    expect(h.fsMock.writeFileSync).not.toHaveBeenCalled();
  });
});

describe('NG-316 N1b / NG-320 N-b — chunked restore: counts decide the backup, slices stay bounded', () => {
  beforeEach(() => resetAll('fabrika_gate'));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('count mismatch after the chunked insert: the backup file is kept', async () => {
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(2));
    // The restore wrote only one of the two backed-up projects.
    h.counts = { cordisProject: 1 };

    await expect(rollback()).rejects.toThrow(/restore count mismatch — backup KEPT/);
    // The restore did write the rows (through createMany), and the count check then refused
    // to accept the result, so the file was not removed.
    expect(h.calls).toContain('cordisProject.createMany');
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
  });

  test('every count matches the backup: the restore is accepted and the backup file is removed', async () => {
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(2));
    h.counts = { cordisProject: 2 };

    await expect(rollback()).resolves.toBeUndefined();
    expect(h.fsMock.unlinkSync).toHaveBeenCalledTimes(1);
    expect(h.fsMock.unlinkSync.mock.calls[0]?.[0]).toMatch(/\.st6-cordis-backup\.json$/);
  });

  test('a large backup is written in slices: none above rowsPerChunk, and no row is lost', async () => {
    // CordisProject rows map to 7 columns (id + the six nullable fields), see rollback's build.
    const size = rowsPerChunk(7);
    const n = size * 2 + 3;
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(n));
    h.counts = { cordisProject: n };

    await expect(rollback()).resolves.toBeUndefined();

    const projectSlices = h.createManySizes.filter((c) => c.model === 'cordisProject').map((c) => c.rows);
    expect(projectSlices).toEqual([size, size, 3]);
    expect(projectSlices.every((rows) => rows <= size)).toBe(true);
    expect(projectSlices.reduce((a, b) => a + b, 0)).toBe(n);
    expect(h.fsMock.unlinkSync).toHaveBeenCalledTimes(1);
  });

  test('no backup anywhere: rollback leaves CORDIS untouched (no-op)', async () => {
    h.fsMock.existsSync.mockReturnValue(false);

    await expect(rollback()).resolves.toBeUndefined();
    expect(cordisDeletes()).toEqual([]);
    expect(h.calls.filter((c) => c.includes('createMany'))).toEqual([]);
    expect(h.fsMock.readFileSync).not.toHaveBeenCalled();
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
  });
});

describe('NG-320 N-c — module state does not leak between runs', () => {
  beforeEach(() => resetAll('fabrika_gate'));

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('a successful seed followed by a reset: a later rollback with no backup is a no-op', async () => {
    // Successful seed: the backup is written and armed in memory.
    await expect(seed()).resolves.toBeUndefined();
    expect(h.fsMock.writeFileSync).toHaveBeenCalledTimes(1);

    // Without the reset the in-memory backup from the seed above would be restored here.
    resetSt6SeedStateForTests();
    h.calls.length = 0;
    h.fsMock.existsSync.mockReturnValue(false);

    await expect(rollback()).resolves.toBeUndefined();
    expect(cordisDeletes()).toEqual([]);
    expect(h.calls.filter((c) => c.includes('createMany'))).toEqual([]);
  });
});
