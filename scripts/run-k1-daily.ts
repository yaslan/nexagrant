/**
 * Manual trigger for the K1 daily call sync (`pnpm jobs:k1`).
 *
 * Runs the exact code path the scheduled job runs at 02:00 UTC, so a failing
 * nightly job can be reproduced locally without waiting for the schedule.
 *
 *   pnpm jobs:k1                 fetch + persist
 *   pnpm jobs:k1 -- --dry-run    fetch + normalize only, touches no table
 *   pnpm jobs:k1 -- --max-pages 2
 *
 * Read-only for `--dry-run`; otherwise it upserts Call/Topic/Programme/RawFetch.
 * There is nothing to roll back: every write is an idempotent upsert keyed on the
 * upstream identifier, so re-running restores the same rows.
 */
import 'dotenv/config';

import { SediaAdapter } from '../src/lib/adapters/sedia';
import { EurostarsAdapter } from '../src/lib/adapters/eurostars';
import { TubitakAdapter } from '../src/lib/adapters/tubitak';
import type { AdapterResult, BaseTopic } from '../src/lib/adapters/schemas/common';
import { syncK1Topics } from '../src/lib/jobs/tasks/k1-daily-calls';

function flagValue(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const maxPagesRaw = flagValue('max-pages');
  const maxPages = maxPagesRaw ? Number(maxPagesRaw) : undefined;

  console.log(`[jobs:k1] start ${new Date().toISOString()} dryRun=${dryRun}`);

  const started = Date.now();
  const [sedia, eurostars, tubitak] = await Promise.all([
    new SediaAdapter().fetchSediaTopics(maxPages ? { maxPages } : {}),
    new EurostarsAdapter().fetchEurostarsTopics(),
    new TubitakAdapter().fetchTubitakTopics(),
  ]);
  const fetchMs = Date.now() - started;

  const sources = [sedia, eurostars, tubitak] as AdapterResult<BaseTopic>[];

  for (const s of sources) {
    console.log(
      `[jobs:k1] ${s.source.padEnd(10)} status=${s.status} topics=${s.topicsProcessed}` +
        (s.reason ? ` reason="${s.reason}"` : '') +
        (s.schemaDrift.length > 0 ? ` schemaDrift=${s.schemaDrift.length}` : '')
    );
    for (const d of s.schemaDrift.slice(0, 3)) console.log(`[jobs:k1]   drift: ${d}`);
  }

  const total = sources.reduce((n, s) => n + s.topicsProcessed, 0);
  console.log(`[jobs:k1] fetched ${total} topics in ${fetchMs}ms`);

  const sample = sedia.topics[0];
  if (sample) {
    console.log(
      `[jobs:k1] sample: ${JSON.stringify(
        {
          identifier: sample.identifier,
          status: sample.status,
          callIdentifier: sample.callIdentifier,
          isLumpSum: sample.isLumpSum,
          isTwoStage: sample.isTwoStage,
          nextDeadlineAt: sample.nextDeadlineAt,
          plannedOpeningDate: sample.plannedOpeningDate,
          ageInDays: sample.ageInDays,
          eligibility: sample.eligibility,
        },
        null,
        2
      )}`
    );
  }

  const euOnly = sources
    .flatMap((s) => s.topics)
    .filter((t) => t.eligibility.restricted === 'EU_EEA_CH_ONLY');
  console.log(`[jobs:k1] EU/EEA/CH-only topics: ${euOnly.length}`);
  console.log(
    `[jobs:k1] lumpSum=${sources.flatMap((s) => s.topics).filter((t) => t.isLumpSum).length} ` +
      `twoStage=${sources.flatMap((s) => s.topics).filter((t) => t.isTwoStage).length} ` +
      `withAge=${sources.flatMap((s) => s.topics).filter((t) => t.ageInDays !== null).length}`
  );

  if (dryRun) {
    console.log('[jobs:k1] --dry-run: skipping every database write');
    return;
  }

  const result = await syncK1Topics(sources);
  console.log(`[jobs:k1] ${JSON.stringify(result, null, 2)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[jobs:k1] FAILED', e);
    process.exit(1);
  });
