import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import unzipper from 'unzipper';
import { prisma } from '@/lib/db';
import {
  mapProjectRow,
  mapOrganizationAndParticipationRow,
  mapTopicRow,
  mapSciVocRow,
  ParsedCordisProject,
  ParsedCordisOrganization,
  ParsedCordisParticipation,
  ParsedCordisTopic,
  ParsedCordisSciVoc,
  RawCsvRow,
} from './cordisSchema';
import { errorMessage } from '@/lib/errors';
import { recordRawFetch } from './raw-fetch';
import { parseCordisCsv, type CordisCsvMalformed } from './csv';
import { recordAlert } from '@/lib/observability/system-alert';

export interface CordisImportOptions {
  dataset: 'HORIZON' | 'H2020';
  url?: string;
  localZipPath?: string;
  limit?: number;
  dryRun?: boolean;
  /**
   * Share of a file's records that may be unreadable or dangling before the run
   * is failed. Defaults to `MAX_SKIPPED_RATIO`.
   */
  maxSkippedRatio?: number;
}

/** Records one CSV lost, and why, so a run can never lose them quietly. */
export interface CordisFileSkips {
  file: string;
  /** Data records in the file (header excluded). */
  records: number;
  skipped: number;
  /** First few reasons, with the 1-based line when the parser knows it. */
  samples: Array<{ line?: number; reason: string }>;
}

export interface CordisImportResult {
  success: boolean;
  skipped?: boolean;
  runId: string;
  fileHash?: string;
  rowCounts: {
    projects: number;
    organizations: number;
    participations: number;
    topics: number;
    scivocs: number;
  };
  durationMs: number;
  error?: string;
  /** Per-file records that were not imported. Present whenever the files were read. */
  skippedRecords?: CordisFileSkips[];
}

/**
 * The default for `maxSkippedRatio`: 0.1 % of a file, i.e. about 23 of the
 * 23,613 HORIZON projects. The parser reads the whole real dump with nothing
 * skipped, so anything above this is a format change upstream, and importing
 * the remainder would hand M1 a quietly incomplete dataset — the run fails
 * instead and says which file and which lines (TASK-MUMH7CVD8P2J0).
 */
export const MAX_SKIPPED_RATIO = 0.001;

const SKIP_SAMPLE_LIMIT = 5;

const DATASET_URLS = {
  HORIZON: 'https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip',
  H2020: 'https://cordis.europa.eu/data/cordis-h2020projects-csv.zip',
};

/**
 * Where a downloaded archive lands, relative to the project root.
 *
 * The download path is carried around as a bare *file name* and only ever turned
 * into a real path by the two helpers below. That is not cosmetic: turbopack
 * analyses `fs` calls statically, and an `fs.existsSync(someStringVariable)` it
 * cannot bound makes it trace the **whole project** into the server bundle.
 * `next build` said so four times over, and `.next/standalone` was carrying
 * `docs/` (91 MB), `test-artifacts/` (24 MB), `tests/`, `scripts/` and every
 * source file as a result. Rebuilding the path as
 * `path.join(process.cwd(), CORDIS_TMP_DIR, name)` is the shape the analyzer can
 * bound — it is the first remedy the warning itself suggests — so the trace stops
 * at this one folder.
 */
const CORDIS_TMP_DIR = 'tmp_cordis';

/** Absolute path of `fileName` inside the CORDIS scratch folder. */
function cordisTmpPath(fileName: string): string {
  return path.join(process.cwd(), CORDIS_TMP_DIR, path.basename(fileName));
}

/**
 * Deletes a downloaded archive. A no-op when the run read a local zip instead
 * (nothing was downloaded, so there is nothing of ours to clean up) or when the
 * file is already gone.
 */
function removeTempZip(fileName: string | null): void {
  if (!fileName) return;
  const zipPath = path.join(process.cwd(), CORDIS_TMP_DIR, path.basename(fileName));
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
}

/**
 * Downloads URL or opens file stream and computes SHA256 hash
 */
async function getZipFileAndHash(options: CordisImportOptions): Promise<{
  zipPath: string;
  /** File name inside CORDIS_TMP_DIR when the archive was downloaded, else null. */
  tempFileName: string | null;
  fileHash: string;
  /** Where the bytes came from — a URL, or the local path when one was given. */
  origin: string;
  sizeBytes: number;
}> {
  if (options.localZipPath) {
    const resolvedPath = path.isAbsolute(options.localZipPath)
      ? options.localZipPath
      : path.resolve(/*turbopackIgnore: true*/ process.cwd(), options.localZipPath);

    if (fs.existsSync(resolvedPath)) {
      const fileBuffer = fs.readFileSync(resolvedPath);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      return {
        zipPath: resolvedPath,
        tempFileName: null,
        fileHash,
        origin: options.localZipPath,
        sizeBytes: fileBuffer.byteLength,
      };
    }
  }

  const url = options.url || DATASET_URLS[options.dataset];
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download CORDIS zip from ${url}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const tmpDir = path.join(process.cwd(), CORDIS_TMP_DIR);
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const tempFileName = `${options.dataset.toLowerCase()}_${Date.now()}.zip`;
  fs.writeFileSync(cordisTmpPath(tempFileName), buffer);

  return {
    zipPath: cordisTmpPath(tempFileName),
    tempFileName,
    fileHash,
    origin: url,
    sizeBytes: buffer.byteLength,
  };
}

/**
 * Reads one CSV out of the archive and maps its rows. Nothing is dropped
 * silently: a record the parser could not split into the header's columns, or
 * one the mapper refused (no id), is counted in the returned `skips`.
 */
async function readCsvEntry<T>(
  entry: unzipper.File,
  file: string,
  rowMapper: (row: RawCsvRow) => T | null
): Promise<{ items: T[]; skips: CordisFileSkips }> {
  const { rows, malformed } = parseCordisCsv((await entry.buffer()).toString('utf8'));
  const skips: CordisFileSkips = {
    file,
    records: rows.length + malformed.length,
    skipped: malformed.length,
    samples: malformed.slice(0, SKIP_SAMPLE_LIMIT).map((m: CordisCsvMalformed) => ({ ...m })),
  };

  const items: T[] = [];
  for (const row of rows) {
    const mapped = rowMapper(row);
    if (mapped) {
      items.push(mapped);
    } else {
      skips.skipped++;
      if (skips.samples.length < SKIP_SAMPLE_LIMIT) skips.samples.push({ reason: 'row has no id' });
    }
  }
  return { items, skips };
}

/**
 * Drops rows that point at a project the run did not read — they would break
 * the whole run on the participation/topic foreign key — and counts them as
 * skipped in `skips`.
 */
function keepKnownProjects<T>(
  items: T[],
  projectIdOf: (item: T) => string,
  knownProjectIds: Set<string>,
  skips: CordisFileSkips
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const projectId = projectIdOf(item);
    if (knownProjectIds.has(projectId)) {
      kept.push(item);
    } else {
      skips.skipped++;
      if (skips.samples.length < SKIP_SAMPLE_LIMIT) {
        skips.samples.push({ reason: `unknown project ${projectId}` });
      }
    }
  }
  return kept;
}

/** `{ 'project.csv': 0, … }` — the shape kept in `CordisImportRun.rowCounts`. */
function skippedByFile(skips: CordisFileSkips[]): Record<string, number> {
  return Object.fromEntries(skips.map((x) => [x.file, x.skipped]));
}

/** Throws when any file lost more records than the budget allows. */
function assertSkipBudget(skips: CordisFileSkips[], maxSkippedRatio: number): void {
  const over = skips.filter((s) => s.skipped > Math.floor(s.records * maxSkippedRatio));
  if (over.length === 0) return;
  const detail = over
    .map(
      (s) =>
        `${s.file}: ${s.skipped}/${s.records} skipped (${s.samples
          .map((x) => (x.line ? `line ${x.line}: ${x.reason}` : x.reason))
          .join('; ')})`
    )
    .join(' | ');
  throw new Error(
    `CORDIS dump rejected: skipped records over the ${maxSkippedRatio * 100}% limit — ${detail}`
  );
}

/**
 * Main ingestion function for CORDIS bulk ZIP datasets
 */
export async function runCordisImport(options: CordisImportOptions): Promise<CordisImportResult> {
  const startTime = Date.now();
  const dataset = options.dataset;

  let runRecord: { runId: string } | null = null;
  try {
    runRecord = await prisma.cordisImportRun.create({
      data: {
        dataset,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
  } catch (err) {
    if (!options.dryRun) {
      throw err;
    }
    runRecord = { runId: `dry-run-${Date.now()}` };
  }

  let tempZipName: string | null = null;
  let fileSkips: CordisFileSkips[] | undefined;

  try {
    const { zipPath, tempFileName, fileHash, origin, sizeBytes } = await getZipFileAndHash(options);
    tempZipName = tempFileName;

    // CLAUDE.md rule 6: keep the raw upstream answer before normalizing it.
    // The archive itself is far too large for a Json column, so the row records
    // what it was and where it came from, hashed on the real bytes. Keyed on
    // that hash, so re-running against an unchanged dataset writes nothing.
    await recordRawFetch({
      source: 'cordis_bulk',
      key: dataset,
      hash: fileHash,
      storageUrl: origin,
      payload: {
        dataset,
        origin,
        sizeBytes,
        contentType: 'application/zip',
        fetchedAt: new Date().toISOString(),
      },
    });

    // Hash check: check if the last successful run used the same zip hash
    let latestSuccessRun: { fileHash: string | null } | null = null;
    try {
      latestSuccessRun = await prisma.cordisImportRun.findFirst({
        where: { dataset, status: 'SUCCESS' },
        orderBy: { finishedAt: 'desc' },
      });
    } catch (_e) {
      // Ignore DB find error in dry-run/offline mode
    }

    if (latestSuccessRun && latestSuccessRun.fileHash === fileHash && !options.limit) {
      if (runRecord?.runId) {
        await prisma.cordisImportRun.update({
          where: { runId: runRecord.runId },
          data: {
            status: 'SUCCESS',
            finishedAt: new Date(),
            fileHash,
            rowCounts: { message: 'Zaten güncel (File hash unchanged)' },
          },
        });
      }

      removeTempZip(tempZipName);

      return {
        success: true,
        skipped: true,
        runId: runRecord?.runId || 'run-skipped',
        fileHash,
        rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0, scivocs: 0 },
        durationMs: Date.now() - startTime,
      };
    }

    // Extract directory in memory using unzipper
    const directory = await unzipper.Open.file(zipPath);

    const projectFile = directory.files.find((f) => f.path.endsWith('project.csv'));
    const orgFile = directory.files.find((f) => f.path.endsWith('organization.csv'));
    const topicFile = directory.files.find((f) => f.path.endsWith('topics.csv'));
    const scivocFile = directory.files.find((f) => f.path.endsWith('euroSciVoc.csv'));

    if (!projectFile || !orgFile) {
      throw new Error('Required CORDIS CSV files (project.csv, organization.csv) not found in archive');
    }

    // Parse CSV datasets. A limit keeps the first N projects (and a bounded
    // slice of the other files) for smoke runs; it never hides skipped records.
    const projectRead = await readCsvEntry<ParsedCordisProject>(projectFile, 'project.csv', (row) =>
      mapProjectRow(row, dataset)
    );
    const orgRead = await readCsvEntry<{
      organization: ParsedCordisOrganization;
      participation: ParsedCordisParticipation;
    }>(orgFile, 'organization.csv', mapOrganizationAndParticipationRow);
    const topicRead = topicFile
      ? await readCsvEntry<ParsedCordisTopic>(topicFile, 'topics.csv', mapTopicRow)
      : null;
    const scivocRead = scivocFile
      ? await readCsvEntry<ParsedCordisSciVoc>(scivocFile, 'euroSciVoc.csv', mapSciVocRow)
      : null;

    const projects = options.limit
      ? projectRead.items.slice(0, options.limit)
      : projectRead.items;
    const validProjectIds = new Set(projects.map((p) => p.id));

    // With a limit, rows of projects outside the slice are expected, not skipped.
    const scoped = <T>(items: T[], projectIdOf: (item: T) => string, skips: CordisFileSkips) =>
      options.limit
        ? items.filter((item) => validProjectIds.has(projectIdOf(item)))
        : keepKnownProjects(items, projectIdOf, validProjectIds, skips);

    const filteredOrgAndPart = scoped(
      orgRead.items,
      (op) => op.participation.projectId,
      orgRead.skips
    );

    const orgsMap = new Map<string, ParsedCordisOrganization>();
    const participations: ParsedCordisParticipation[] = [];

    for (const item of filteredOrgAndPart) {
      orgsMap.set(item.organization.organisationId, item.organization);
      participations.push(item.participation);
    }
    const organizations = Array.from(orgsMap.values());

    const topics = topicRead ? scoped(topicRead.items, (t) => t.projectId, topicRead.skips) : [];
    const scivocs = scivocRead
      ? scoped(scivocRead.items, (sv) => sv.projectId, scivocRead.skips)
      : [];

    const skips = [projectRead.skips, orgRead.skips, topicRead?.skips, scivocRead?.skips].filter(
      (x): x is CordisFileSkips => Boolean(x)
    );
    fileSkips = skips;
    // Fail before the first write: a partial dataset is worse than last month's.
    assertSkipBudget(skips, options.maxSkippedRatio ?? MAX_SKIPPED_RATIO);

    if (options.dryRun) {
      try {
        if (runRecord?.runId) {
          await prisma.cordisImportRun.update({
            where: { runId: runRecord.runId },
            data: {
              status: 'SUCCESS',
              finishedAt: new Date(),
              fileHash,
              rowCounts: {
                projects: projects.length,
                organizations: organizations.length,
                participations: participations.length,
                topics: topics.length,
                scivocs: scivocs.length,
                skipped: skippedByFile(skips),
                dryRun: true,
              },
            },
          });
        }
      } catch {
        // Ignore DB update error in dry-run mode
      }

      removeTempZip(tempZipName);

      return {
        success: true,
        runId: runRecord?.runId || 'dry-run',
        fileHash,
        rowCounts: {
          projects: projects.length,
          organizations: organizations.length,
          participations: participations.length,
          topics: topics.length,
          scivocs: scivocs.length,
        },
        durationMs: Date.now() - startTime,
        skippedRecords: skips,
      };
    }

    // ──────────────── Batch Ingestion in FK Sequence ────────────────
    const BATCH_SIZE = 1000;

    // 1. Projects
    for (let i = 0; i < projects.length; i += BATCH_SIZE) {
      const batch = projects.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((p) =>
          prisma.cordisProject.upsert({
            where: { id: p.id },
            create: {
              id: p.id,
              rcn: p.rcn,
              acronym: p.acronym,
              title: p.title,
              objective: p.objective,
              status: p.status,
              framework: p.framework,
              masterCall: p.masterCall,
              subCall: p.subCall,
              fundingScheme: p.fundingScheme,
              legalBasis: p.legalBasis,
              startDate: p.startDate,
              endDate: p.endDate,
              ecSignatureDate: p.ecSignatureDate,
              totalCost: p.totalCost,
              ecMaxContribution: p.ecMaxContribution,
              grantDoi: p.grantDoi,
              contentUpdateDate: p.contentUpdateDate,
              rawJson: p.rawJson || {},
            },
            update: {
              acronym: p.acronym,
              title: p.title,
              objective: p.objective,
              status: p.status,
              startDate: p.startDate,
              endDate: p.endDate,
              totalCost: p.totalCost,
              ecMaxContribution: p.ecMaxContribution,
              contentUpdateDate: p.contentUpdateDate,
              rawJson: p.rawJson || {},
            },
          })
        )
      );
    }

    // 2. Organizations
    for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
      const batch = organizations.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((o) =>
          prisma.cordisOrganization.upsert({
            where: { organisationId: o.organisationId },
            create: {
              organisationId: o.organisationId,
              name: o.name,
              nameNormalized: o.nameNormalized,
              shortName: o.shortName,
              vatNumber: o.vatNumber,
              activityType: o.activityType,
              sme: o.sme,
              country: o.country,
              city: o.city,
              postCode: o.postCode,
              nutsCode: o.nutsCode,
              geolocation: o.geolocation,
              url: o.url,
              isTurkish: o.isTurkish,
              rawJson: o.rawJson || {},
            },
            update: {
              name: o.name,
              nameNormalized: o.nameNormalized,
              shortName: o.shortName,
              vatNumber: o.vatNumber,
              activityType: o.activityType,
              sme: o.sme,
              country: o.country,
              city: o.city,
              isTurkish: o.isTurkish,
              rawJson: o.rawJson || {},
            },
          })
        )
      );
    }

    // 3. Participations
    for (let i = 0; i < participations.length; i += BATCH_SIZE) {
      const batch = participations.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((pt) =>
          prisma.cordisParticipation.upsert({
            where: {
              projectId_organisationId: {
                projectId: pt.projectId,
                organisationId: pt.organisationId,
              },
            },
            create: {
              projectId: pt.projectId,
              organisationId: pt.organisationId,
              role: pt.role,
              order: pt.order,
              ecContribution: pt.ecContribution,
              netEcContribution: pt.netEcContribution,
              totalCost: pt.totalCost,
              endOfParticipation: pt.endOfParticipation,
              active: pt.active,
            },
            update: {
              role: pt.role,
              order: pt.order,
              ecContribution: pt.ecContribution,
              netEcContribution: pt.netEcContribution,
              endOfParticipation: pt.endOfParticipation,
              active: pt.active,
            },
          })
        )
      );
    }

    // 4. Topics
    for (let i = 0; i < topics.length; i += BATCH_SIZE) {
      const batch = topics.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((t) =>
          prisma.cordisProjectTopic.upsert({
            where: {
              projectId_topicCode: {
                projectId: t.projectId,
                topicCode: t.topicCode,
              },
            },
            create: {
              projectId: t.projectId,
              topicCode: t.topicCode,
              topicTitle: t.topicTitle,
            },
            update: {
              topicTitle: t.topicTitle,
            },
          })
        )
      );
    }

    // 5. SciVocs
    for (let i = 0; i < scivocs.length; i += BATCH_SIZE) {
      const batch = scivocs.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map((s) =>
          prisma.cordisProjectSciVoc.upsert({
            where: {
              projectId_scivocCode: {
                projectId: s.projectId,
                scivocCode: s.scivocCode,
              },
            },
            create: {
              projectId: s.projectId,
              scivocCode: s.scivocCode,
              scivocPath: s.scivocPath,
              scivocTitle: s.scivocTitle,
            },
            update: {
              scivocPath: s.scivocPath,
              scivocTitle: s.scivocTitle,
            },
          })
        )
      );
    }

    // Complete audit log
    const rowCounts = {
      projects: projects.length,
      organizations: organizations.length,
      participations: participations.length,
      topics: topics.length,
      scivocs: scivocs.length,
    };

    if (runRecord?.runId) {
      await prisma.cordisImportRun.update({
        where: { runId: runRecord.runId },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          fileHash,
          rowCounts: { ...rowCounts, skipped: skippedByFile(skips) },
        },
      });
    }

    // Within budget but not zero: the data landed, an operator still hears of it.
    if (skips.some((x) => x.skipped > 0)) {
      await recordAlert({
        level: 'warn',
        source: 'k2_cordis_import',
        message: `CORDIS ${dataset} import skipped some records (within the limit).`,
        meta: { runId: runRecord?.runId, skipped: skips },
        dedupeKey: `k2:cordis-import-skipped:${dataset}`,
      });
    }

    removeTempZip(tempZipName);

    return {
      success: true,
      runId: runRecord?.runId || 'run-success',
      fileHash,
      rowCounts,
      durationMs: Date.now() - startTime,
      skippedRecords: skips,
    };
  } catch (error) {
    const errorMsg = errorMessage(error, String(error));
    try {
      await prisma.cordisImportRun.update({
        where: { runId: runRecord?.runId || 'unknown' },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          error: errorMsg,
        },
      });
    } catch (_e) {
      // Ignore DB update error
    }

    if (!options.dryRun) {
      await recordAlert({
        level: 'error',
        source: 'k2_cordis_import',
        message: `CORDIS ${dataset} import failed; M1 keeps the previous dataset.`,
        meta: { runId: runRecord?.runId, error: errorMsg.slice(0, 2000) },
        dedupeKey: `k2:cordis-import-failed:${dataset}`,
      });
    }

    removeTempZip(tempZipName);

    return {
      success: false,
      runId: runRecord?.runId || 'error',
      rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0, scivocs: 0 },
      durationMs: Date.now() - startTime,
      error: errorMsg,
      ...(fileSkips ? { skippedRecords: fileSkips } : {}),
    };
  }
}
