import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * NG-316 review follow-up (PR #410: B2, N1a, N1b).
 *
 * Covers the paths the first guard test does not reach, with Prisma and fs mocked so
 * no database and no real backup file is touched:
 *   - B2: a backup write that fails with EEXIST must not arm the in-memory backup, so a
 *     later rollback cannot restore the wrong data and delete the real backup file;
 *   - N1a: the connection's own current_database() is checked a second time;
 *   - N1b: the restore keeps the backup when the per-table counts disagree, and a
 *     rollback with no backup is a no-op for the CORDIS tables.
 *
 * Every test pins DATABASE_URL, GITHUB_ACTIONS and CI with vi.stubEnv: on a GitHub
 * Actions runner plain `fabrika` is throwaway, so the result must not depend on the
 * shell or the runner that runs the suite.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  currentDb: 'fabrika_gate' as string,
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
          return vi.fn(async () => {
            h.calls.push(`${model}.${String(method)}`);
            if (method === 'findMany') return [];
            if (method === 'count') return 0;
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

import { seed, rollback } from '../scripts/seed-st6-empty-e2e';

const GATE_URL = 'postgresql://u:p@127.0.0.1:55401/fabrika_gate';

/** Runner env pinned off: the shared-fabrika rule must hold on a plain dev shell. */
function pinNonRunnerEnv(): void {
  vi.stubEnv('GITHUB_ACTIONS', '');
  vi.stubEnv('CI', '');
  vi.stubEnv('DATABASE_URL', GATE_URL);
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

describe('NG-316 B2 — a failed backup write does not arm the in-memory backup', () => {
  beforeEach(() => {
    pinNonRunnerEnv();
    h.calls.length = 0;
    h.currentDb = 'fabrika_gate';
    vi.clearAllMocks();
    h.fsMock.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('EEXIST on the backup write: no CORDIS delete happens and rollback keeps the real backup', async () => {
    h.fsMock.writeFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
    });

    await expect(seed()).rejects.toThrow(/EEXIST/);
    expect(cordisDeletes()).toEqual([]);

    // The real backup now exists (written by another process). Rollback must read it, not
    // the empty snapshot the failed seed never took, and must refuse to delete it.
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(1));

    await expect(rollback()).rejects.toThrow(/backup KEPT/);
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
  });
});

describe('NG-316 N1a — second current_database() guard', () => {
  beforeEach(() => {
    pinNonRunnerEnv();
    h.calls.length = 0;
    vi.clearAllMocks();
    h.fsMock.existsSync.mockReturnValue(false);
  });

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

describe('NG-316 N1b — chunked restore keeps the backup and handles a missing backup', () => {
  beforeEach(() => {
    pinNonRunnerEnv();
    h.calls.length = 0;
    h.currentDb = 'fabrika_gate';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('count mismatch after the chunked insert: the backup file is kept', async () => {
    h.fsMock.existsSync.mockReturnValue(true);
    h.fsMock.readFileSync.mockReturnValue(backupWithProjects(2));

    await expect(rollback()).rejects.toThrow(/restore count mismatch — backup KEPT/);
    // The restore did write the rows (through createMany), and the count check then refused
    // to accept the result, so the file was not removed.
    expect(h.calls).toContain('cordisProject.createMany');
    expect(h.fsMock.unlinkSync).not.toHaveBeenCalled();
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
