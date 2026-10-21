'use server';

import { z } from 'zod';
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

const programmeIdsSchema = z
  .string()
  .max(200)
  .regex(/^[0-9,\s]*$/, 'programme ids must be comma-separated numbers')
  .optional();

const ragQuerySchema = z.object({
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().min(1).max(20),
});

export async function handleRunKeepEuSyncAction(programmeIds?: string): Promise<KeepEuSyncResult> {
  await requirePlatformAdmin();
  const parsed = programmeIdsSchema.parse(programmeIds);
  const ids = parsed?.trim() ? parsed.trim() : undefined;
  return await syncKeepEuData({ programmeIds: ids });
}

export async function handleGetKeepEuMetricsAction(): Promise<KeepEuMetrics> {
  await requirePlatformAdmin();
  return await aggregateKeepEuMetrics();
}

export async function handleTestInterregRagQuery(query: string, topK: number = 3) {
  await requirePlatformAdmin();
  const input = ragQuerySchema.parse({ query, topK });
  // Platform scope: searches shared public corpus (Chunk.tenantId IS NULL)
  const chunks = await retrieveChunks(input.query, input.topK);
  const ragPrompt = formatRagPrompt(input.query, chunks);
  return { chunks, ragPrompt };
}
