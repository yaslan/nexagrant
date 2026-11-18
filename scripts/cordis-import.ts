#!/usr/bin/env tsx
import 'dotenv/config';

import { runCordisImport } from '../src/lib/k2-cordis/importer';
import { runPartnerProfileStep } from '../src/lib/k2-cordis/profileStep';

const USAGE = `Usage: pnpm exec tsx scripts/cordis-import.ts [options]

  --dataset=HORIZON|H2020  dataset to import (default HORIZON)
  --local-zip=<path>       read this archive instead of downloading it
  --limit=<n>              import only the first n projects (smoke run)
  --dry-run                read and check the archive, write no CORDIS data
  --help                   show this text

--dry-run still writes one CordisImportRun row (SUCCESS, marked dryRun) and,
when the archive changed, one RawFetch row; no project, organisation or
participation. Neither a dry run nor a --limit run makes the next full run
with the same archive skip as "Zaten güncel": only a full real run does.
A run that fails keeps the batches it already wrote; rows are upserts, so
re-running after the fix completes them.`;

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    process.exit(0);
  }
  let dataset: 'HORIZON' | 'H2020' = 'HORIZON';
  let limit: number | undefined;
  let dryRun = false;
  let localZipPath: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--dataset=')) {
      // startsWith('--dataset=') guarantees an '=' is present, so split('=')[1] exists.
      const val = arg.split('=')[1]!.toUpperCase();
      if (val === 'H2020' || val === 'HORIZON') {
        dataset = val;
      }
    } else if (arg.startsWith('--limit=')) {
      // startsWith('--limit=') guarantees an '=' is present, so split('=')[1] exists.
      limit = parseInt(arg.split('=')[1]!, 10);
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--local-zip=')) {
      localZipPath = arg.split('=')[1];
    }
  }

  return { dataset, limit, dryRun, localZipPath };
}

async function main() {
  const options = parseArgs();
  console.log(`🚀 Starting CORDIS Import Job...`);
  console.log(`   Dataset: ${options.dataset}`);
  console.log(`   Limit: ${options.limit || 'Unlimited'}`);
  console.log(
    `   Dry Run: ${options.dryRun}${options.dryRun ? ' (no CORDIS data; writes a CordisImportRun row marked dryRun)' : ''}`
  );
  if (options.localZipPath) console.log(`   Local Zip: ${options.localZipPath}`);

  const res = await runCordisImport(options);

  if (!res.success) {
    // The cause is in the importer's `[k2-cordis] import failed` line above
    // and on the CordisImportRun row.
    console.error(`❌ [CORDIS Import] ${res.errorCode} (run ${res.runId})`);
    process.exit(1);
  }

  if (res.skipped) {
    console.log(`ℹ️ [CORDIS Import] Zaten güncel (File hash unchanged for ${options.dataset}). Skipped.`);
  } else {
    console.log(`✅ [CORDIS Import] Completed successfully in ${res.durationMs}ms`);
    console.log(`   Projects: ${res.rowCounts.projects}`);
    console.log(`   Organizations: ${res.rowCounts.organizations}`);
    console.log(`   Participations: ${res.rowCounts.participations}`);
    console.log(`   Topics: ${res.rowCounts.topics}`);
    console.log(`   SciVocs: ${res.rowCounts.scivocs}`);
  }

  if (!options.dryRun) {
    // An unchanged dump rebuilds the profiles only when an earlier profile
    // build failed and its alert is still open (NG-237, shared with the job).
    // A failed build raises the profile-failure alert and throws: the CLI exits 1 through main().catch.
    const profileRes = await runPartnerProfileStep(res.skipped === true, { runId: res.runId, dataset: options.dataset });
    if (profileRes) {
      console.log(`⚙️ Generating M1 Partner Profiles & Network Graph...`);
      console.log(`✅ [M1 Partner Profile Job] Generated ${profileRes.updatedProfiles} org profiles and ${profileRes.updatedCoParticipations} co-participations in ${profileRes.durationMs}ms.`);
    } else {
      console.log(`ℹ️ [M1 Partner Profile Job] Profiles not rebuilt: the dump is unchanged and no profile failure is open.`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
