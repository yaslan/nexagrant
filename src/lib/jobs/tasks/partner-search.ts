import { defineJob } from '../define';
import { runPartnerSearchIngestion } from '@/modules/m1/server/partner-search/ingestor';

/**
 * Partner Search ingestion — 03:00 UTC nightly (full scan), plus the INCREMENTAL
 * run that k1-daily-calls queues when it inserts new topics. The flag
 * `partner_search_ingestion_enabled` is checked inside the ingestor: while it is
 * off this job returns `skipped` and writes nothing.
 */
export const partnerSearchTask = defineJob('partner-search', async ({ payload, tick }) => {
  const topicIdentifiers = Array.isArray(payload.topicIdentifiers)
    ? payload.topicIdentifiers.filter((t): t is string => typeof t === 'string')
    : undefined;
  const trigger = payload.trigger === 'INCREMENTAL' ? 'INCREMENTAL' : tick ? 'FULL' : 'MANUAL';
  return runPartnerSearchIngestion({ trigger, topicIdentifiers });
});
