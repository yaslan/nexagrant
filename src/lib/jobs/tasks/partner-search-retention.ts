import { defineJob } from '../define';
import { runPartnerSearchRetention } from '@/modules/m1/server/partner-search/retention';

/**
 * Partner Search retention — 03:15 UTC nightly, after the 03:00 ingestion, on the same
 * queue so the two never touch the rows together. No-op while the flag is off.
 */
export const partnerSearchRetentionTask = defineJob('partner-search-retention', async () => {
  return runPartnerSearchRetention();
});
