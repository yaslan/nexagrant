'use server';

import {
  syncKeepEuData,
  aggregateKeepEuMetrics,
  type KeepEuMetrics,
  type KeepEuSyncResult,
} from '@/lib/keep-eu-sync';
import { retrieveChunks, formatRagPrompt } from '@/lib/rag';
import { requirePlatformAdmin } from '@/lib/tenant';

/**
 * Server actions for the Interreg / keep.eu administrative console.
 * Strictly gated by requirePlatformAdmin() (TASK-MUMJ2ERCFP964).
 */

export async function handleRunKeepEuSyncAction(programmeIds?: string): Promise<KeepEuSyncResult> {
  await requirePlatformAdmin();
  const ids = programmeIds?.trim() ? programmeIds.trim() : undefined;
  return await syncKeepEuData({ programmeIds: ids });
}

export async function handleGetKeepEuMetricsAction(): Promise<KeepEuMetrics> {
  await requirePlatformAdmin();
  return await aggregateKeepEuMetrics();
}

export async function handleTestInterregRagQuery(query: string, topK: number = 3) {
  await requirePlatformAdmin();
  // Platform scope: searches shared public corpus (Chunk.tenantId IS NULL)
  const chunks = await retrieveChunks(query, topK);
  const ragPrompt = formatRagPrompt(query, chunks);
  return { chunks, ragPrompt };
}
