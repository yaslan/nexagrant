import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import unzipper from 'unzipper';
import { parse } from 'csv-parse';
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

export interface CordisImportOptions {
  dataset: 'HORIZON' | 'H2020';
  url?: string;
  localZipPath?: string;
  limit?: number;
  dryRun?: boolean;
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
}

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
 * Parses a CSV stream into structured batch objects using csv-parse
 */
async function parseCsvStream<T>(
  stream: fs.ReadStream | NodeJS.ReadableStream,
  rowMapper: (row: RawCsvRow) => T | null,
  limit?: number
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    let count = 0;

    const parser = stream.pipe(
      parse({
        delimiter: ';',
        columns: true,
        trim: true,
        skip_empty_lines: true,
        relax_quotes: true,
        relax_column_count: true,
        escape: '"',
        quote: '"',
        skip_records_with_error: true,
      })
    );

    parser.on('data', (row: RawCsvRow) => {
      if (limit && count >= limit) return;
      const mapped = rowMapper(row);
      if (mapped) {
        results.push(mapped);
        count++;
      }
    });

    parser.on('end', () => resolve(results));
    parser.on('error', (err) => reject(err));
  });
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

    // Parse CSV datasets
    const projects = await parseCsvStream<ParsedCordisProject>(
      projectFile.stream(),
      (row) => mapProjectRow(row, dataset),
      options.limit
    );

    const orgAndPartRows = await parseCsvStream<{
      organization: ParsedCordisOrganization;
      participation: ParsedCordisParticipation;
    }>(
      orgFile.stream(),
      mapOrganizationAndParticipationRow,
      options.limit ? options.limit * 5 : undefined
    );

    // Filter orgs & participations to match parsed projects if limit is specified
    const validProjectIds = new Set(projects.map((p) => p.id));
    const filteredOrgAndPart = options.limit
      ? orgAndPartRows.filter((op) => validProjectIds.has(op.participation.projectId))
      : orgAndPartRows;

    const orgsMap = new Map<string, ParsedCordisOrganization>();
    const participations: ParsedCordisParticipation[] = [];

    for (const item of filteredOrgAndPart) {
      orgsMap.set(item.organization.organisationId, item.organization);
      participations.push(item.participation);
    }
    const organizations = Array.from(orgsMap.values());

    let topics: ParsedCordisTopic[] = [];
    if (topicFile) {
      const parsedTopics = await parseCsvStream<ParsedCordisTopic>(
        topicFile.stream(),
        mapTopicRow,
        options.limit ? options.limit * 3 : undefined
      );
      topics = options.limit
        ? parsedTopics.filter((t) => validProjectIds.has(t.projectId))
        : parsedTopics;
    }

    let scivocs: ParsedCordisSciVoc[] = [];
    if (scivocFile) {
      const parsedSciVocs = await parseCsvStream<ParsedCordisSciVoc>(
        scivocFile.stream(),
        mapSciVocRow,
        options.limit ? options.limit * 5 : undefined
      );
      scivocs = options.limit
        ? parsedSciVocs.filter((s) => validProjectIds.has(s.projectId))
        : parsedSciVocs;
    }

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
          rowCounts,
        },
      });
    }

    removeTempZip(tempZipName);

    return {
      success: true,
      runId: runRecord?.runId || 'run-success',
      fileHash,
      rowCounts,
      durationMs: Date.now() - startTime,
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

    removeTempZip(tempZipName);

    return {
      success: false,
      runId: runRecord?.runId || 'error',
      rowCounts: { projects: 0, organizations: 0, participations: 0, topics: 0, scivocs: 0 },
      durationMs: Date.now() - startTime,
      error: errorMsg,
    };
  }
}
