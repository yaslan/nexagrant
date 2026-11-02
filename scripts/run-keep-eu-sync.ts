#!/usr/bin/env tsx
/**
 * CLI and script runner for keep.eu Open Data synchronization.
 *
 * Fetches Interreg projects and beneficiaries for Turkish cross-border programmes:
 *   - 305: 2021–2027 Interreg VI-A IPA Bulgaria Türkiye
 *   - 387: 2021–2027 Interreg VI-B NEXT Black Sea Basin
 *   - 385: 2021–2027 Interreg VI-B NEXT Mediterranean Sea Basin (NEXT MED)
 *   - 66:  2014–2020 Interreg IPA CBC Bulgaria – Turkey
 *
 * Persists records into `CordisProject`, `CordisOrganization`, `CordisParticipation`
 * and generates 1536-dim embeddings for RAG into `Document` and `Chunk` tables.
 *
 * Usage:
 *   pnpm jobs:keep-eu
 *   pnpm jobs:keep-eu -- --limit 10
 *   pnpm jobs:keep-eu -- --dry-run
 *   pnpm jobs:keep-eu -- --skip-rag
 *   pnpm jobs:keep-eu -- --programmes 305,387
 *   pnpm jobs:keep-eu -- --source-db-only
 */
import 'dotenv/config';

import {
  syncKeepEuData,
  aggregateKeepEuMetrics,
  DEFAULT_TURKEY_PROGRAMME_IDS,
  fetchKeepEuOpenData,
  parseKeepEuResponse,
} from '../src/lib/keep-eu-sync';
import { prisma } from '../src/lib/db';
import { env } from '../src/lib/env';

interface CliOptions {
  programmes?: number[];
  dryRun: boolean;
  skipRag: boolean;
  limit?: number;
  sourceDbOnly: boolean;
  help: boolean;
}

/** Exits with code 2 on a value that is not a positive integer, instead of running with NaN. */
function parseLimit(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    console.error(`--limit expects a positive whole number, got "${raw ?? ''}"`);
    process.exit(2);
  }
  return value;
}

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    dryRun: false,
    skipRag: false,
    sourceDbOnly: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-rag') {
      options.skipRag = true;
    } else if (arg === '--source-db-only') {
      options.sourceDbOnly = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseLimit(arg.split('=')[1]);
    } else if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseLimit(args[++i]);
    } else if (arg.startsWith('--programmes=') || arg.startsWith('--ids=')) {
      const raw = arg.split('=')[1]!;
      options.programmes = raw
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    } else if ((arg === '--programmes' || arg === '--ids') && i + 1 < args.length) {
      options.programmes = args[++i]!
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
NexaGrant — keep.eu Interreg Live Synchronization CLI

Usage:
  tsx scripts/run-keep-eu-sync.ts [options]
  pnpm jobs:keep-eu [options]

Options:
  --programmes=IDS      Comma-separated programme IDs (default: 305,387,385,66)
  --limit=N             Synchronize at most N projects (for test runs)
  --dry-run             Fetch and inspect upstream payload without database or RAG writes
  --skip-rag            Sync database records only; skip OpenAI RAG embedding calls
  --source-db-only      Re-index existing INTERREG database rows into RAG
  --help, -h            Show this help message

Default Turkey-Eligible Programmes:
  - 305: 2021–2027 Interreg VI-A IPA Bulgaria Türkiye
  - 387: 2021–2027 Interreg VI-B NEXT Black Sea Basin
  - 385: 2021–2027 Interreg VI-B NEXT Mediterranean Sea Basin (NEXT MED)
  - 66:  2014–2020 Interreg IPA CBC Bulgaria – Turkey
`);
}

function formatEur(amount: number): string {
  return `€${Math.round(amount).toLocaleString('en-US')}`;
}

async function main() {
  const options = parseCliArgs();

  if (options.help) {
    printHelp();
    return;
  }

  const programmeIds = options.programmes ?? [...DEFAULT_TURKEY_PROGRAMME_IDS];

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('   NexaGrant — keep.eu Interreg Live Synchronization CLI');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`Timestamp:        ${new Date().toISOString()}`);
  console.log(`Programmes:       ${programmeIds.join(', ')}`);
  console.log(`Dry Run:          ${options.dryRun ? 'YES (no table or vector writes)' : 'NO (live sync)'}`);
  console.log(`RAG Embeddings:   ${options.skipRag ? 'SKIPPED' : 'ENABLED (OpenAI 1536-dim vector)'}`);
  if (options.limit) console.log(`Limit:            ${options.limit} projects`);
  if (options.sourceDbOnly) console.log(`Source:           DATABASE ONLY (re-index existing rows)`);
  console.log(`API Key Config:   ${env.KEEP_EU_API_KEY ? 'Configured (in environment)' : 'NOT CONFIGURED'}`);
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Dry-run mode
  if (options.dryRun) {
    console.log('Fetching live upstream data from keep.eu Open Data API...');
    const started = Date.now();
    // persist: false keeps the dry run read-only (no RawFetch row, no SystemAlert).
    const fetchRes = await fetchKeepEuOpenData({ programmeIds, persist: false });

    if (!fetchRes.ok || !fetchRes.data) {
      const httpStatus = fetchRes.status === undefined ? '' : ` (HTTP ${fetchRes.status})`;
      console.error(`❌ keep.eu fetch failed: ${fetchRes.error}${httpStatus}`);
      process.exitCode = 1;
      return;
    }

    const duration = Date.now() - started;
    console.log(`✅ Upstream API responded in ${duration}ms`);

    const parsed = await parseKeepEuResponse(fetchRes.data, { persist: false });
    console.log(`\nProgrammes returned: ${parsed.programmesCount}`);
    console.log(`Total projects parsed: ${parsed.projects.length}`);

    let totalBudget = 0;
    let totalGrant = 0;
    let totalPartners = 0;
    let turkishPartners = 0;

    for (const p of parsed.projects) {
      totalBudget += p.totalBudgetEUR ?? 0;
      totalGrant += p.euFundingEUR ?? 0;
      totalPartners += p.partners.length;
      turkishPartners += p.partners.filter((part) => part.isTurkish).length;
    }

    console.log('\n--- Upstream Payload Summary ---');
    console.log(`Total Budget:               ${formatEur(totalBudget)}`);
    console.log(`Total EU / IPA Grant:       ${formatEur(totalGrant)}`);
    console.log(`Total Beneficiaries:        ${totalPartners}`);
    console.log(`Turkish Beneficiaries:      ${turkishPartners}`);

    console.log('\nSample Project:');
    if (parsed.projects[0]) {
      const s = parsed.projects[0];
      console.log(`  ID:        ${s.projectId}`);
      console.log(`  Title:     ${s.title}`);
      console.log(`  Programme: ${s.programmeTitle}`);
      console.log(`  Budget:    ${formatEur(s.totalBudgetEUR ?? 0)}`);
      console.log(`  Grant:     ${formatEur(s.euFundingEUR ?? 0)}`);
      console.log(`  Partners:  ${s.partners.length} (TR: ${s.partners.filter((pt) => pt.isTurkish).length})`);
    }

    console.log('\n✅ [Dry Run Finished] No database or vector changes were made.');
    return;
  }

  // Live synchronization
  const started = Date.now();
  console.log('\n🚀 Starting Live Synchronization...\n');

  const syncResult = await syncKeepEuData({
    programmeIds,
    skipRag: options.skipRag,
    limit: options.limit,
    sourceFromDatabaseOnly: options.sourceDbOnly,
    onProgress: ({ current, total, project, skipped, error }) => {
      const padCurrent = String(current).padStart(3, ' ');
      const progInfo = `[${padCurrent}/${total}]`;
      const id = (project.acronym ?? project.projectId).padEnd(16, ' ').slice(0, 16);
      const titleShort = project.title.slice(0, 40).padEnd(40, ' ');
      const grant = formatEur(project.euFundingEUR ?? 0).padStart(12, ' ');
      const trCount = project.partners.filter((p) => p.isTurkish).length;
      const partInfo = `P:${String(project.partners.length).padStart(2)} (TR:${trCount})`;

      if (skipped) {
        console.warn(`⚠️  ${progInfo} ${id} ${titleShort} | ${grant} | ${partInfo} -> SKIPPED (${error ?? 'error'})`);
      } else {
        console.log(`✓  ${progInfo} ${id} ${titleShort} | ${grant} | ${partInfo}`);
      }
    },
  });

  const durationSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log('\n───────────────────────────────────────────────────────────────────────────────');
  console.log(`Sync Completed in ${durationSec}s`);
  console.log(`Upstream OK:             ${syncResult.upstreamOk ? 'YES' : 'NO (keep.eu was not read)'}`);
  console.log(`Success:                 ${syncResult.success ? 'YES' : 'PARTIAL / COMPLETED WITH SKIPS'}`);
  console.log(`Synced Projects:         ${syncResult.syncedProjectsCount}`);
  console.log(`RAG excluded (names):   ${syncResult.ragExcludedCount}`);
  if (syncResult.ragExclusionMissingCount > 0) {
    console.warn(`⚠️  RAG exclusion ids not found in upstream data: ${syncResult.ragExclusionMissingCount}`);
  }
  console.log(`Synced Partners:         ${syncResult.syncedPartnersCount}`);
  console.log(`Skipped Projects:        ${syncResult.skippedCount}`);
  console.log(`Total EU Funding (Run):  ${formatEur(syncResult.totalEuFundingEUR)}`);
  console.log(`Total Budget (Run):      ${formatEur(syncResult.totalBudgetEUR)}`);
  console.log('───────────────────────────────────────────────────────────────────────────────');

  // Database verification & aggregation (CLAUDE.md #7: real figures from database rows)
  console.log('\n📊 Database State Verification & Metrics (via aggregateKeepEuMetrics):');
  const metrics = await aggregateKeepEuMetrics();

  console.log(`Total Interreg Projects in DB:       ${metrics.totalProjectsCount}`);
  console.log(`Total Interreg Partners in DB:       ${metrics.totalPartnersCount}`);
  console.log(`Total Turkish Beneficiaries in DB:   ${metrics.turkishPartnersCount}`);
  console.log(`Total EU Funding in DB:              ${formatEur(metrics.totalEuFundingEUR)}`);
  console.log(`Total Project Budgets in DB:         ${formatEur(metrics.totalBudgetEUR)}`);
  console.log(`Average Grant Per Project:           ${formatEur(metrics.averageGrantPerProjectEUR)}`);

  console.log('\nTop Programmes in DB:');
  for (const prog of metrics.topProgrammesBreakdown) {
    console.log(`  - ${prog.programmeTitle}: ${prog.projectCount} projects (${formatEur(prog.totalGrantEUR)})`);
  }

  console.log('\nTop Beneficiary Countries in DB:');
  for (const c of metrics.topCountriesBreakdown.slice(0, 8)) {
    console.log(`  - ${c.country} (${c.name}): ${c.partnerCount} partners (${formatEur(c.totalGrantEUR)})`);
  }

  // RAG Document & Chunk Verification
  const [ragDocCount, ragChunkCount] = await Promise.all([
    prisma.document.count({ where: { kind: 'INTERREG_PROJECT' } }),
    prisma.chunk.count({ where: { document: { kind: 'INTERREG_PROJECT' } } }),
  ]);

  console.log(`\nRAG Index Status:`);
  console.log(`  - INTERREG Document Records:       ${ragDocCount}`);
  console.log(`  - Embedded Vector Chunks (1536d):  ${ragChunkCount}`);

  if (!syncResult.upstreamOk) {
    console.error('\n❌ keep.eu could not be read; nothing new was synced. See SystemAlert for the cause.');
    process.exitCode = 1;
  } else if (syncResult.skippedCount > 0) {
    console.warn(`\n⚠️ Finished with ${syncResult.skippedCount} skipped projects.`);
    process.exitCode = 1;
  } else {
    console.log('\n🎉 Live synchronization completed successfully with 0 errors.');
  }
}

// Exit code is set, not forced: `process.exit` here would skip the `finally` that closes the DB pool.
main()
  .catch((err) => {
    console.error('Fatal CLI Error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
