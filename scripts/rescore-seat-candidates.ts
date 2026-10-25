/**
 * Backfill (FO-147): put every stored `SeatCandidate.score` on the one 0–100 seat scale.
 *
 * The column held three scales — the consortium builder's old 0–10 sum, its 0–100 weighted
 * total, and the seat matcher's raw −10…90 points — side by side in the same candidate table.
 * Each row is re-derived from its own stored breakdown through the scorer that wrote it
 * (src/lib/scoring/seat-rescore.ts), and the seat's ranks follow. A second run writes nothing.
 *
 *   pnpm jobs:seat-rescore                       # dry run, prints the diff, writes nothing
 *   pnpm jobs:seat-rescore -- --apply            # writes the scores and ranks
 *   pnpm jobs:seat-rescore -- --tenant demo-tenant --apply
 *
 * Every tenant is read and written inside its own `withTenant`, so the tenant_isolation policy
 * holds for the job as it does for a request. Not to be run against production without a
 * separate approval (FO-147).
 */

import 'dotenv/config';

import { prisma, withTenant } from '../src/lib/db';
import { consortiumWeights } from '../src/lib/scoring/consortium';
import { planSeatRescore, type StoredSeatCandidate } from '../src/lib/scoring/seat-rescore';

interface Options {
  apply: boolean;
  tenantId: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false, tenantId: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    // `pnpm jobs:seat-rescore -- --apply` forwards the bare separator; skip it rather than reject it.
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

/** Example rows printed per tenant without --verbose. */
const SAMPLE_ROWS = 5;

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const weights = consortiumWeights();

  const tenants: { id: string }[] = await prisma.tenant.findMany({
    where: { deletedAt: null, ...(opts.tenantId ? { id: opts.tenantId } : {}) },
    select: { id: true },
    orderBy: { id: 'asc' },
  });

  console.log(`${opts.apply ? 'APPLY' : 'DRY RUN'} — ${tenants.length} tenant(s)\n`);

  let read = 0;
  let changed = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const result = await withTenant(tenant.id, async (tx) => {
      const rows: StoredSeatCandidate[] = await tx.seatCandidate.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, seatId: true, score: true, rank: true, breakdown: true },
        orderBy: [{ seatId: 'asc' }, { rank: 'asc' }],
      });
      const plan = planSeatRescore(rows, weights);
      const changes = plan.rows.filter((r) => r.changed);

      if (opts.apply) {
        for (const r of changes) {
          // `updateMany` with the tenant, so a row id can only ever reach this tenant's rows.
          await tx.seatCandidate.updateMany({
            where: { id: r.id, tenantId: tenant.id },
            data: { score: r.after.score, rank: r.after.rank, breakdown: r.breakdown },
          });
        }
      }
      return { rows: rows.length, plan, changes };
    });

    read += result.rows;
    changed += result.changes.length;
    skipped += result.plan.skippedSeats.reduce((n, s) => n + s.rowIds.length, 0);
    if (!result.rows) continue;

    console.log(`  ${tenant.id}: ${result.rows} row(s), ${result.changes.length} to change`);
    for (const r of opts.verbose ? result.changes : result.changes.slice(0, SAMPLE_ROWS)) {
      console.log(
        `    ${r.id.padEnd(26)} seat ${r.seatId.padEnd(26)} ` +
          `${r.before.score.toFixed(2).padStart(7)} #${r.before.rank} → ${r.after.score.toFixed(2).padStart(6)} #${r.after.rank}`,
      );
    }
    for (const s of result.plan.skippedSeats) {
      console.log(`    SKIPPED seat ${s.seatId}: breakdown matches no scorer (${s.rowIds.join(', ')})`);
    }
  }

  console.log(
    `\n${read} row(s) read, ${changed} ${opts.apply ? 'written' : 'to change (dry run, nothing written)'}, ` +
      `${skipped} skipped.`,
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
