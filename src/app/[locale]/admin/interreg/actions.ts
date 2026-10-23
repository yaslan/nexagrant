'use server';

import {
  syncKeepEuData,
  aggregateKeepEuMetrics,
  type KeepEuMetrics,
  type KeepEuSyncResult,
} from '@/lib/keep-eu-sync';
import { retrieveChunks, formatRagPrompt } from '@/lib/rag';
import { requirePlatformAdmin } from '@/lib/tenant';
import { z } from 'zod';

/**
 * Server actions for the Interreg / keep.eu administrative console.
 * Strictly gated by requirePlatformAdmin() (TASK-MUMJ2ERCFP964).
 */

// Programme ids are keep.eu codes such as "INTERREG-IPA-CBC" or "2021TC16RFCB001".
const programmeIdsSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^[A-Za-z0-9_-]+(,\s*[A-Za-z0-9_-]+)*$/, 'programmeIds must be comma-separated codes');

const ragQuerySchema = z.object({
  query: z.string().trim().min(1).max(500),
  topK: z.number().int().min(1).max(20),
});

export async function handleRunKeepEuSyncAction(programmeIds?: string): Promise<KeepEuSyncResult> {
  await requirePlatformAdmin();
  const trimmed = programmeIds?.trim() ? programmeIds.trim() : undefined;
  const ids = trimmed === undefined ? undefined : programmeIdsSchema.parse(trimmed);
  return await syncKeepEuData({ programmeIds: ids });
}

export async function handleGetKeepEuMetricsAction(): Promise<KeepEuMetrics> {
  await requirePlatformAdmin();
  return await aggregateKeepEuMetrics();
}

export async function handleTestInterregRagQuery(query: string, topK: number = 3) {
  const { userId } = await requirePlatformAdmin();
  const input = ragQuerySchema.parse({ query, topK });
  // Platform scope: searches shared public corpus (Chunk.tenantId IS NULL)
  const chunks = await retrieveChunks(input.query, input.topK, undefined, { userId });
  const ragPrompt = formatRagPrompt(input.query, chunks);
  return { chunks, ragPrompt };
}
