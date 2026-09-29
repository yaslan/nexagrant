/**
 * Backfill: recompute every opportunity's G0 score from stored evidence.
 *
 * The `Opportunity.g0Score` column was never computed. Rows written before this script exist carry
 * a seed literal (75, 82, 85, 88, 92) or a `Math.random() * 15 + 80` from the pipeline form, and
 * the gate engine has been deciding on those. This walks the tenants and re-derives each score
 * through the canonical path (`src/lib/scoring/g0-compute.ts`), storing the per-feature breakdown
 * alongside it so every number on screen has a record behind it (CLAUDE.md §7).
 *
 *   pnpm jobs:g0-rescore                    # dry run, prints the diff, writes nothing
 *   pnpm jobs:g0-rescore -- --apply         # writes the scores and the evidence rows
 *   pnpm jobs:g0-rescore -- --tenant demo-tenant --apply
 *
 * The score is an internal pre-assessment, not an official evaluation.
 */

import 'dotenv/config';

import { prisma, type TenantTx } from '../src/lib/db';
import { computeG0ForOpportunity, persistG0 } from '../src/lib/scoring/g0-compute';

/**
 * `scripts/esr-calibration.ts` writes this tenant's opportunities from a sample file, and their
 * scores *are* already produced by `decideG0` — from features carried in the fixture rather than
 * from rows in this database. Rescoring them here would read empty tables and wipe the calibration
 * set, so the backfill skips it unless it is named explicitly with --tenant.
 */
const CALIBRATION_TENANT_ID = 'esr-calibration';

interface Options {
  apply: boolean;
  tenantId: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false, tenantId: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // `pnpm jobs:g0-rescore -- --apply` forwards the bare separator; skip it rather than reject it.
    if (arg === '--') continue;
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--dry-run') opts.apply = false;
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--tenant') opts.tenantId = argv[++i] ?? null;
    else if (arg.startsWith('--tenant=')) opts.tenantId = arg.slice('--tenant='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const opportunities: { id: string; tenantId: string; title: string; g0Score: number | null }[] =
    await prisma.opportunity.findMany({
      where: {
        deletedAt: null,
        ...(opts.tenantId
          ? { tenantId: opts.tenantId }
          : { tenantId: { not: CALIBRATION_TENANT_ID } }),
      },
      select: { id: true, tenantId: true, title: true, g0Score: true },
      orderBy: { createdAt: 'asc' },
    });

  console.log(
    `${opts.apply ? 'APPLY' : 'DRY RUN'} — rescoring ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}\n`,
  );

  let changed = 0;
  let unscorable = 0;

  for (const opp of opportunities) {
    // This backfill script runs as an admin job with app.tenant_id not set
    // (no RLS enforcement on this connection). The tenant scoping comes from the
    // tenantId argument passed to computeG0ForOpportunity. Nominal type brand
    // expects a transaction opened inside withTenantOn; we bypass RLS here and
    // prove tenantId correctness manually, so cast is justified.
    const computation = await computeG0ForOpportunity(
      prisma as unknown as TenantTx, // admin script, RLS bypassed, tenant passed explicitly
      opp.tenantId,
      opp.id,
    );
    if (!computation) {
      console.log(`  ${opp.id}  SKIPPED (not readable under tenant ${opp.tenantId})`);
      continue;
    }

    const before = opp.g0Score === null ? '—' : opp.g0Score.toFixed(2);
    const after = computation.score === null ? '— (no evidence)' : computation.score.toFixed(2);
    const coverage = `${Math.round(computation.coverage * 100)}% evidence`;
    const title = opp.title.length > 44 ? `${opp.title.slice(0, 41)}...` : opp.title;

    console.log(`  ${opp.id.padEnd(24)} ${before.padStart(7)} → ${after.padEnd(16)} ${coverage.padEnd(14)} ${title}`);

    if (opts.verbose) {
      for (const source of computation.sources) {
        console.log(`      ${source.status === 'measured' ? '✓' : '·'} ${String(source.feature).padEnd(20)} ${String(source.value).padEnd(8)} ${source.source} — ${source.note}`);
      }
    }

    if (computation.score === null) {
      unscorable++;
      continue;
    }
    if (opts.apply) {
      // Same as computeG0ForOpportunity call above: admin backfill, RLS bypassed.
      await persistG0(prisma as unknown as TenantTx, computation);
      changed++;
    }
  }

  console.log(
    `\n${opts.apply ? `Wrote ${changed} score(s) with their breakdown.` : 'Nothing written (dry run).'}` +
      ` ${unscorable} opportunit${unscorable === 1 ? 'y has' : 'ies have'} no evidence to score on.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect?.();
  });
