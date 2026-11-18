import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { writeZip } from './helpers/stored-zip';
import { isGithubActions, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';

/**
 * NG-237 — a profile failure after a good import is recovered by the next run
 * with the same dump, on a real Postgres. The path under test is the monthly
 * job's own (`runK2MonthlyCordis`): real importer, real `SystemAlert` rows,
 * real alert close-out. Only two things are stubbed:
 *
 *  - the partner-profile build, which fails once on purpose (the injected fault);
 *  - the archive source: the job always downloads CORDIS, so the importer gets a
 *    fixed local dump instead (`localZipPath`). Nothing is downloaded.
 *
 * `.live`: needs a migrated throwaway database behind DATABASE_URL; refuses the
 * shared `fabrika` database outside GitHub Actions, skips locally when no
 * database answers and fails in CI. Rows are removed before and after.
 */

const SUITE = 'cordis-profile-recovery.live';

// Heap is not what this test measures; the job refuses below 6 GB, so report 8 GB.
vi.mock('node:v8', async (orig) => {
  const real = await orig<typeof import('node:v8')>();
  const getHeapStatistics = () => ({ ...real.getHeapStatistics(), heap_size_limit: 8192 * 1024 * 1024 });
  return { ...real, default: { ...real, getHeapStatistics }, getHeapStatistics };
});

// Injected fault: the first profile build fails, every later one succeeds.
const profileCalls = vi.hoisted(() => ({ failNext: true }));
vi.mock('@/lib/k2-cordis/partnerProfileJob', () => ({
  generatePartnerProfiles: vi.fn(async () => {
    if (profileCalls.failNext) {
      profileCalls.failNext = false;
      throw new Error('injected: profile build failed (NG-237 live test)');
    }
    return { success: true, updatedProfiles: 3, updatedCoParticipations: 4, durationMs: 1 };
  }),
}));

// The job calls the importer for HORIZON with no archive; point it at the fixed dump.
const localZip = vi.hoisted(() => ({ path: '' }));
vi.mock('@/lib/k2-cordis/importer', async (orig) => {
  const real = await orig<typeof import('@/lib/k2-cordis/importer')>();
  return {
    ...real,
    runCordisImport: (opts: Parameters<typeof real.runCordisImport>[0]) =>
      real.runCordisImport({ ...opts, localZipPath: localZip.path }),
  };
});

const { prisma } = await import('@/lib/db');
const { runK2MonthlyCordis } = await import('@/lib/jobs/tasks/k2-monthly-cordis');

const RUN = `T237${Date.now().toString(36)}`;
const like = `${RUN}%`;
const runIds = new Set<string>();
const startedAt = new Date();
let ready = false;

const PROJECT_FIELDS = [
  'id', 'acronym', 'status', 'title', 'startDate', 'endDate', 'totalCost', 'ecMaxContribution',
  'topics', 'ecSignatureDate', 'frameworkProgramme', 'masterCall', 'subCall', 'fundingScheme',
  'nature', 'objective', 'contentUpdateDate', 'rcn', 'grantDoi', 'keywords', 'Human-validated',
  'legalBasis',
];
const ORG_FIELDS = [
  'projectID', 'projectAcronym', 'organisationID', 'vatNumber', 'name', 'shortName', 'SME',
  'activityType', 'street', 'postCode', 'city', 'country', 'nutsCode', 'geolocation',
  'organizationURL', 'contactForm', 'contentUpdateDate', 'rcn', 'order', 'role', 'ecContribution',
  'netEcContribution', 'totalCost', 'endOfParticipation', 'active',
];
const csvLine = (fields: string[], values: Record<string, string>) =>
  fields.map((f) => `"${values[f] ?? ''}"`).join(';');

/** A two-project HORIZON dump with one participant each; `tag` makes its bytes and hash this case's own. */
function dump(tag: string): string {
  const ids = [1, 2].map((n) => `${RUN}${tag}P${n}`);
  const project = ids.map((id) =>
    csvLine(PROJECT_FIELDS, {
      id,
      acronym: `ACR-${tag}`,
      status: 'SIGNED',
      title: `Project ${id}`,
      frameworkProgramme: 'HORIZON',
      objective: `Objective of ${id}`,
    })
  );
  const org = ids.map((id, i) =>
    csvLine(ORG_FIELDS, {
      projectID: id,
      organisationID: `${RUN}${tag}O${i}`,
      name: `Org ${i}`,
      SME: 'false',
      activityType: 'HES',
      country: 'TR',
      order: '1',
      role: 'coordinator',
      ecContribution: '1000',
    })
  );
  const zip = writeZip({
    'project.csv': [csvLine(PROJECT_FIELDS, Object.fromEntries(PROJECT_FIELDS.map((f) => [f, f]))), ...project, ''].join('\n'),
    'organization.csv': [csvLine(ORG_FIELDS, Object.fromEntries(ORG_FIELDS.map((f) => [f, f]))), ...org, ''].join('\n'),
  });
  return zip;
}

async function openK2Alerts() {
  return prisma.systemAlert.findMany({
    where: { source: 'k2_monthly_cordis', resolvedAt: null },
    select: { meta: true },
  });
}

async function cleanup(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "CordisParticipation" WHERE "projectId" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisProject" WHERE "id" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisOrganization" WHERE "organisationId" LIKE ${like}`;
  if (runIds.size > 0) await prisma.cordisImportRun.deleteMany({ where: { runId: { in: [...runIds] } } });
  // The job does not return the file hash, so the archive rows of this run are found by time.
  await prisma.rawFetch.deleteMany({ where: { source: 'cordis_bulk', fetchedAt: { gte: startedAt } } });
  await prisma.systemAlert.deleteMany({
    where: { source: { in: ['k2_monthly_cordis', 'k2_cordis_import'] }, createdAt: { gte: startedAt } },
  });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    skipOrFailInCi(SUITE, `database unreachable: ${(err as Error).message.split('\n')[0]}`);
    return;
  }
  const dbName = await usedDatabaseName(prisma, prisma, SUITE);
  if (dbName === undefined) return;
  if (dbName === 'fabrika' && !isGithubActions()) {
    throw new Error(`${SUITE}: refusing to run on the shared "fabrika" database; point DATABASE_URL at a throwaway one`);
  }
  ready = true;
}, 60_000);

afterAll(async () => {
  if (ready) await cleanup();
});

describe(SUITE, () => {
  test('a failed profile build leaves an alert; the next run with the same dump rebuilds the profiles and closes it', async (ctx) => {
    if (!ready) return ctx.skip();
    localZip.path = dump('R');
    profileCalls.failNext = true;

    // 1. Import lands, the profile build fails: the job reports it and leaves its alert open.
    const first = await runK2MonthlyCordis({ month: '2026-12' });
    if (first.runId) runIds.add(first.runId);
    expect(first.success).toBe(false);
    expect(first.error).toBe('PROFILES_FAILED');
    expect(first.rowCounts?.projects).toBe(2);
    const afterFail = await openK2Alerts();
    expect(afterFail.map((a) => (a.meta as Record<string, unknown>)['alertDedupeKey'])).toContain('k2:partner-profiles-failed');

    // 2. Same dump again: the import says "Zaten güncel", but the owed profiles are rebuilt and the alert closes.
    const second = await runK2MonthlyCordis({ month: '2026-12' });
    expect(second.success).toBe(true);
    expect(second.skipped).toBe(true);
    expect(second.profiles?.updatedProfiles).toBe(3);
    expect(await openK2Alerts()).toHaveLength(0);

    // 3. A third run with nothing owed: skipped, and the profiles are not rebuilt.
    const third = await runK2MonthlyCordis({ month: '2026-12' });
    expect(third.success).toBe(true);
    expect(third.skipped).toBe(true);
    expect(third.profiles).toBeUndefined();
  });
});
