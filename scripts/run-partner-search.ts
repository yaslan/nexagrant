/**
 * Manual trigger for the Partner Search ingestor (`pnpm jobs:partner-search`).
 *
 * Runs the exact code path the 03:00 UTC job runs. The global flag
 * `partner_search_ingestion_enabled` must be ON, or the run is a no-op (prints why).
 *
 *   pnpm jobs:partner-search -- --topic HORIZON-CL4-2027-01-MAT-PROD-22   one topic
 *   pnpm jobs:partner-search                                             every OPEN/FORTHCOMING topic
 *
 * Writes PartnerSearchAnnouncement / PartnerSearchTopicStat / RawFetch /
 * UnmatchedOrganization / CordisOrganization flags and one PartnerSearchIngestionRun.
 * Nothing is deleted. To roll a bad run back, see docs/agent-results for the run id.
 */
import 'dotenv/config';

import { runPartnerSearchIngestion } from '../src/modules/m1/server/partner-search/ingestor';

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const topic = flagValue('topic');
  console.log(`[jobs:partner-search] start ${new Date().toISOString()} topic=${topic ?? '*'}`);

  const outcome = await runPartnerSearchIngestion({
    trigger: 'MANUAL',
    topicIdentifiers: topic ? [topic] : undefined,
  });

  if (outcome.kind === 'skipped') {
    console.log(`[jobs:partner-search] skipped: ${outcome.reason} (set partner_search_ingestion_enabled = true to run)`);
    return;
  }
  console.log(`[jobs:partner-search] run ${outcome.runId} status=${outcome.status}`, outcome.summary);
  if (outcome.status === 'FAILED') process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[jobs:partner-search] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/db');
    await prisma.$disconnect();
  });
