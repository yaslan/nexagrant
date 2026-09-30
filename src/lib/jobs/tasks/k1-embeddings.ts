import { defineJob } from '../define';
import { env } from '@/lib/env';
import { recordAlert } from '@/lib/observability/system-alert';
import { runK1Embeddings } from '@/lib/scoring/embeddings';
import { K1EmbeddingsEventSchema, K1EmbeddingsOutputSchema, type K1EmbeddingsOutput } from '../events';

/**
 * K1 embeddings — 02:15 UTC, between `k1-daily-calls` and `k1-topic-match`
 * (src/lib/scoring/embeddings.ts). With `{ tenantId }` it embeds that tenant's
 * profile only: that is the job a profile save queues (`enqueueJob`), so no
 * request ever waits on the provider.
 *
 * Alerts carry counts only (SystemAlert has no tenant isolation). A missing
 * OpenAI key is reported in production, where it means K1 matching stays off.
 */
export const k1EmbeddingsTask = defineJob('k1-embeddings', async ({ payload, tick }): Promise<K1EmbeddingsOutput> => {
  const { tenantId } = K1EmbeddingsEventSchema.parse(payload);
  const r = await runK1Embeddings({ tenantId, now: tick ?? new Date() });

  if (r.skipped === 'no_api_key' && env.NODE_ENV === 'production') {
    await recordAlert({
      level: 'warn',
      source: 'k1-embeddings',
      message: 'K1 embeddings skipped: OPENAI_API_KEY is not set',
      dedupeKey: 'k1-embeddings:no-api-key',
    });
  }
  if (r.failed > 0 || r.aborted) {
    await recordAlert({
      level: 'warn',
      source: 'k1-embeddings',
      message: `K1 embeddings: ${r.failed} provider calls failed${r.rejected ? ` (${r.rejected} rows refused, now skipped until their text changes)` : ''}${r.aborted ? ', run stopped' : ''}`,
      meta: { failed: r.failed, rejected: r.rejected, aborted: r.aborted, topicsEmbedded: r.topicsEmbedded, profilesEmbedded: r.profilesEmbedded },
      dedupeKey: 'k1-embeddings:failed',
    });
  }
  if (r.budgetExhausted) {
    await recordAlert({
      level: 'info',
      source: 'k1-embeddings',
      message: `K1 embeddings stopped at the ${r.maxUsd} USD per-run cap; the rest follows next run`,
      meta: { estimatedUsd: r.estimatedUsd, maxUsd: r.maxUsd, topicsEmbedded: r.topicsEmbedded, profilesEmbedded: r.profilesEmbedded },
      dedupeKey: 'k1-embeddings:budget',
    });
  }

  return K1EmbeddingsOutputSchema.parse({ ...r, success: r.failed === 0 && !r.aborted });
});
