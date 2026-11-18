import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { writeZip } from './helpers/stored-zip';
import { isGithubActions, skipOrFailInCi, usedDatabaseName } from './helpers/live-db-role';

/**
 * NG-224 (NG-211 §5a/§5b, NG-211-2 §3) — what one CORDIS run leaves behind for
 * the next one, measured on a real Postgres.
 *
 *  - A dry run, and a run cut short with `limit`, ended as `SUCCESS` with the
 *    archive's `fileHash`. The next full run with the same archive looked only
 *    at "the latest SUCCESS of this dataset", found that hash, said "Zaten
 *    güncel" and wrote no project at all.
 *  - The idempotency that check exists for must stay: a second full run with
 *    the same archive is skipped.
 *  - A run that fails half way keeps the batches it already committed. That is
 *    measured here, not fixed: a FAILED row never makes a later run skip, and
 *    the rows are upserts, so the next good run completes them.
 *
 * `.live`: needs a migrated throwaway database behind DATABASE_URL; refuses
 * the shared `fabrika` database outside GitHub Actions, skips locally when no
 * database answers and fails in CI. Every id and archive carries RUN, so the
 * file hashes are this run's own; rows are removed before and after.
 */

const SUITE = 'cordis-import-rerun.live';

// The alert table is not what this file measures; keep its rows out of the DB.
const alerts = vi.hoisted(() => [] as Array<{ level: string; message: string }>);
vi.mock('@/lib/observability/system-alert', () => ({
  recordAlert: vi.fn(async (a: { level: string; message: string }) => {
    alerts.push(a);
    return { id: `alert-${alerts.length}` };
  }),
}));

const { prisma } = await import('@/lib/db');
const { runCordisImport } = await import('@/lib/k2-cordis/importer');

const RUN = `T224${Date.now().toString(36)}`;
const like = `${RUN}%`;
const runIds = new Set<string>();
const hashes = new Set<string>();
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

/**
 * A three-project HORIZON dump, two participants each. `tag` makes the bytes —
 * and so the file hash — this case's own; `order` is written into every
 * participation (an Int column: 3000000000 makes the third batch fail after
 * projects and organisations are committed).
 */
function dump(tag: string, order = '1'): string {
  const ids = [1, 2, 3].map((n) => `${RUN}${tag}P${n}`);
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
  const org = ids.flatMap((id, i) =>
    [1, 2].map((k) =>
      csvLine(ORG_FIELDS, {
        projectID: id,
        organisationID: `${RUN}${tag}O${i}${k}`,
        name: `Org ${i}${k}`,
        SME: 'false',
        activityType: 'HES',
        country: k === 1 ? 'TR' : 'DE',
        order,
        role: k === 1 ? 'coordinator' : 'participant',
        ecContribution: '1000',
      })
    )
  );
  return writeZip({
    'project.csv': [csvLine(PROJECT_FIELDS, Object.fromEntries(PROJECT_FIELDS.map((f) => [f, f]))), ...project, ''].join('\n'),
    'organization.csv': [csvLine(ORG_FIELDS, Object.fromEntries(ORG_FIELDS.map((f) => [f, f]))), ...org, ''].join('\n'),
  });
}

async function run(zip: string, extra: { dryRun?: boolean; limit?: number } = {}) {
  const res = await runCordisImport({ dataset: 'HORIZON', localZipPath: zip, ...extra });
  runIds.add(res.runId);
  if (res.fileHash) hashes.add(res.fileHash);
  return res;
}

async function counts(tag: string) {
  const prefix = `${RUN}${tag}`;
  const [projects, organizations, participations] = await Promise.all([
    prisma.cordisProject.count({ where: { id: { startsWith: prefix } } }),
    prisma.cordisOrganization.count({ where: { organisationId: { startsWith: prefix } } }),
    prisma.cordisParticipation.count({ where: { projectId: { startsWith: prefix } } }),
  ]);
  return { projects, organizations, participations };
}

async function cleanup(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "CordisParticipation" WHERE "projectId" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisProject" WHERE "id" LIKE ${like}`;
  await prisma.$executeRaw`DELETE FROM "CordisOrganization" WHERE "organisationId" LIKE ${like}`;
  if (runIds.size > 0) await prisma.cordisImportRun.deleteMany({ where: { runId: { in: [...runIds] } } });
  if (hashes.size > 0) {
    await prisma.rawFetch.deleteMany({ where: { source: 'cordis_bulk', hash: { in: [...hashes] } } });
  }
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
  test('a dry run does not make the next real run with the same file skip; the second real run does', async (ctx) => {
    if (!ready) return ctx.skip();
    const zip = dump('D');

    const dry = await run(zip, { dryRun: true });
    expect(dry.success).toBe(true);
    expect(dry.rowCounts.projects).toBe(3);
    expect(await counts('D')).toEqual({ projects: 0, organizations: 0, participations: 0 });

    const first = await run(zip);
    expect(first.success).toBe(true);
    expect(first.skipped).toBeFalsy();
    expect(await counts('D')).toEqual({ projects: 3, organizations: 6, participations: 6 });

    const second = await run(zip);
    expect(second.success).toBe(true);
    expect(second.skipped).toBe(true);
    expect(await counts('D')).toEqual({ projects: 3, organizations: 6, participations: 6 });
  });

  test('a run with a limit does not make the next full run with the same file skip', async (ctx) => {
    if (!ready) return ctx.skip();
    const zip = dump('L');

    const limited = await run(zip, { limit: 1 });
    expect(limited.success).toBe(true);
    expect(await counts('L')).toEqual({ projects: 1, organizations: 2, participations: 2 });

    const full = await run(zip);
    expect(full.skipped).toBeFalsy();
    expect(await counts('L')).toEqual({ projects: 3, organizations: 6, participations: 6 });

    expect((await run(zip)).skipped).toBe(true);
  });

  test('a run that fails half way keeps its committed batches; a failed run never makes a later run skip', async (ctx) => {
    if (!ready) return ctx.skip();
    const broken = dump('F', '3000000000');

    const failed = await run(broken);
    expect(failed.success).toBe(false);
    expect(failed.errorCode).toBe('IMPORT_FAILED');
    // Measured, not fixed (NG-224 §b): batches before the failing one stay.
    expect(await counts('F')).toEqual({ projects: 3, organizations: 6, participations: 0 });
    const row = await prisma.cordisImportRun.findUnique({ where: { runId: failed.runId } });
    expect(row?.status).toBe('FAILED');

    // The same file again is tried again (it fails again), not skipped.
    const again = await run(broken);
    expect(again.skipped).toBeFalsy();
    expect(again.success).toBe(false);

    // The corrected file completes the rows the failed run left half written.
    const fixed = await run(dump('F'));
    expect(fixed.success).toBe(true);
    expect(fixed.skipped).toBeFalsy();
    expect(await counts('F')).toEqual({ projects: 3, organizations: 6, participations: 6 });
  });
});
