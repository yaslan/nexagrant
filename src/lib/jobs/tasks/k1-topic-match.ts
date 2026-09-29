import { defineJob } from '../define';
import { env } from '@/lib/env';
import { recordAlert } from '@/lib/observability/system-alert';
import { recomputeAllTopicMatches } from '@/lib/scoring/topic-match';
import { K1TopicMatchOutputSchema, type K1TopicMatchOutput } from '../events';

/**
 * K1 TopicMatch — 02:30 UTC, after `k1-daily-calls` (02:00) has landed the
 * day's topics. Recomputes every live tenant's K1 `fitScore` rows
 * (src/lib/scoring/topic-match.ts). Idempotent: a second run the same night
 * writes nothing new and reports every pair as `unchanged`.
 *
 * A tenant that fails is counted and the run goes on; the run then writes a
 * `warn` SystemAlert with counts only (SystemAlert has no tenant isolation, so
 * no tenant id goes into it). A run that could score nothing because no topic
 * has an embedding is reported in production, where it means K1 matching is
 * off for everyone (TASK-MULQM3LFB4KRA).
 */
export const k1TopicMatchTask = defineJob('k1-topic-match', async ({ tick }): Promise<K1TopicMatchOutput> => {
  const now = tick ?? new Date();
  const r = await recomputeAllTopicMatches({ now });

  if (r.failed > 0) {
    await recordAlert({
      level: 'warn',
      source: 'k1-topic-match',
      message: `TopicMatch recompute failed for ${r.failed} of ${r.tenants} tenants`,
      meta: { failed: r.failed, tenants: r.tenants, scored: r.scored },
      dedupeKey: 'k1-topic-match:tenant-failed',
    });
  }
  if (env.NODE_ENV === 'production' && r.scored === 0 && r.topicsWithoutEmbedding > 0) {
    await recordAlert({
      level: 'warn',
      source: 'k1-topic-match',
      message: `No K1 match scored: ${r.topicsWithoutEmbedding} open topics and ${r.noProfileEmbedding} tenant profiles have no embedding`,
      meta: { topicsWithoutEmbedding: r.topicsWithoutEmbedding, noProfileEmbedding: r.noProfileEmbedding },
      dedupeKey: 'k1-topic-match:no-embeddings',
    });
  }

  // The schema strips `errors`: per-tenant messages stay out of the job log's summary.
  return K1TopicMatchOutputSchema.parse({ ...r, success: r.failed === 0 });
});
