#!/usr/bin/env tsx
import 'dotenv/config';

import { runCordisImport } from '../src/lib/k2-cordis/importer';
import { generatePartnerProfiles } from '../src/lib/k2-cordis/partnerProfileJob';

function parseArgs() {
  const args = process.argv.slice(2);
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
  console.log(`   Dry Run: ${options.dryRun}`);
  if (options.localZipPath) console.log(`   Local Zip: ${options.localZipPath}`);

  const res = await runCordisImport(options);

  if (res.skipped) {
    console.log(`ℹ️ [CORDIS Import] Zaten güncel (File hash unchanged for ${options.dataset}). Skipped.`);
    process.exit(0);
  }

  if (!res.success) {
    // The cause is in the importer's `[k2-cordis] import failed` line above
    // and on the CordisImportRun row.
    console.error(`❌ [CORDIS Import] ${res.errorCode} (run ${res.runId})`);
    process.exit(1);
  }

  console.log(`✅ [CORDIS Import] Completed successfully in ${res.durationMs}ms`);
  console.log(`   Projects: ${res.rowCounts.projects}`);
  console.log(`   Organizations: ${res.rowCounts.organizations}`);
  console.log(`   Participations: ${res.rowCounts.participations}`);
  console.log(`   Topics: ${res.rowCounts.topics}`);
  console.log(`   SciVocs: ${res.rowCounts.scivocs}`);

  if (!options.dryRun) {
    console.log(`⚙️ Generating M1 Partner Profiles & Network Graph...`);
    const profileRes = await generatePartnerProfiles();
    console.log(`✅ [M1 Partner Profile Job] Generated ${profileRes.updatedProfiles} org profiles and ${profileRes.updatedCoParticipations} co-participations in ${profileRes.durationMs}ms.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
