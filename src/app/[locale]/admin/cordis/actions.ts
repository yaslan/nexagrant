'use server';

import { prisma } from '@/lib/db';
import { runCordisImport } from '@/lib/k2-cordis/importer';
import { cordisImportFailureCode } from '@/lib/k2-cordis/failure-codes';
import { runPartnerProfileStep } from '@/lib/k2-cordis/profileStep';
import { syncCordisBigData, aggregateCordisMetrics } from '@/lib/cordis-sync';
import { fetchLiveCordisDelta, getCordisLiveStreamLogs } from '@/lib/cordis-delta';
import { retrieveChunks, formatRagContext } from '@/lib/rag';
import { requirePlatformAdmin } from '@/lib/tenant';

/**
 * CORDIS console actions. They start imports and syncs, read the corpus
 * counters and run paid embedding queries, so each one is platform-admin only
 * (TASK-MUMJ2ERCFP964). The admin layout 404s other users, but a server action
 * is its own HTTP entry point, so the role is checked again here.
 */

export async function handleRunCordisImportAction(dataset: 'HORIZON' | 'H2020', limit?: number) {
  await requirePlatformAdmin();
  const importRes = await runCordisImport({ dataset, limit });
  if (!importRes.success) {
    // A code only: the importer keeps the raw failure in the log, the run row
    // and the alert (İNCELEME-100 Y-1, TASK-MUOBNYACFPLPF).
    return { success: false, errorCode: cordisImportFailureCode(importRes.errorCode) };
  }

  // Null when the dump is unchanged and no profile failure is owed (NG-237).
  const profileRes = (await runPartnerProfileStep(importRes.skipped === true)) ?? {
    updatedProfiles: 0,
    updatedCoParticipations: 0,
    durationMs: 0,
  };

  return {
    success: true,
    runId: importRes.runId,
    skipped: importRes.skipped || false,
    fileHash: importRes.fileHash,
    rowCounts: importRes.rowCounts,
    importDurationMs: importRes.durationMs,
    profilesUpdated: profileRes.updatedProfiles,
  };
}

export async function handleGetK2Status() {
  await requirePlatformAdmin();
  const [lastRun, projectCount, orgCount, participationCount, profileCount] = await Promise.all([
    prisma.cordisImportRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.cordisProject.count(),
    prisma.cordisOrganization.count(),
    prisma.cordisParticipation.count(),
    prisma.cordisPartnerProfile.count(),
  ]);

  return {
    lastRun: lastRun
      ? {
          runId: lastRun.runId,
          dataset: lastRun.dataset,
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          status: lastRun.status,
          fileHash: lastRun.fileHash,
          rowCounts: lastRun.rowCounts,
          // `lastRun.error` is the importer's raw message; it stays in the DB.
        }
      : null,
    rowCounts: {
      projects: projectCount,
      organizations: orgCount,
      participations: participationCount,
      profiles: profileCount,
    },
  };
}

export async function handleRunCordisSync() {
  await requirePlatformAdmin();
  return await syncCordisBigData();
}

export async function handleGetCordisMetrics() {
  await requirePlatformAdmin();
  return await aggregateCordisMetrics();
}

export async function handleRunCordisLiveDelta(sinceDays: number = 7) {
  await requirePlatformAdmin();
  return await fetchLiveCordisDelta(sinceDays);
}

export async function handleGetCordisDeltaLogs() {
  await requirePlatformAdmin();
  return await getCordisLiveStreamLogs();
}

export async function handleTestRagQuery(query: string, topK: number = 3) {
  await requirePlatformAdmin();
  // Platform scope: this searches the shared corpus (`Chunk.tenantId IS NULL`),
  // so the embedding call is logged under PLATFORM_SCOPE_TENANT_ID rather than
  // against a tenant. See `embedText` in src/lib/llm.ts.
  const chunks = await retrieveChunks(query, topK);
  const ragPrompt = formatRagContext(chunks);
  return { chunks, ragPrompt };
}
