/**
 * TASK-MTSJH8NMAXPRM — point every existing subscription at the plan version it
 * is living under.
 *
 * `Subscription.planVersionId` has been in the schema since the plan studio's
 * first phase and was never written by anything, so every subscription ever
 * sold carries `NULL`. `getEntitlements` treats `NULL` as "the compiled
 * catalogue answers", which is today's behaviour and deliberately preserved —
 * a row nobody migrated is not silently re-entitled from a version it was never
 * pointed at. This script is that migration, run once and deliberately.
 *
 * What it writes: for each subscription with no version, the version its plan
 * sells right now. It is behaviour-preserving on this database — measured
 * 2026-09-08, every `PlanVersion` v1 was created by
 * prisma/migrations/add-plan-versioning/migration.sql as a copy of the `Plan`
 * row, and `prisma/seed.ts` writes `Plan` from `PLAN_GRANTS` — so the figures a
 * backfilled subscription reads are the figures it read before. The script
 * proves that per row rather than assuming it: `--dry-run` prints the catalogue
 * grant beside the version grant and marks any row where they differ.
 *
 * What it will not do:
 *   • Touch a subscription that already has a version. Publishing owns that.
 *   • Invent a version for a plan that has published none. Such a row is
 *     reported and left `NULL`, still served by the catalogue.
 *   • Move a CANCELED or PAUSED subscription. It is not entitled to anything;
 *     writing a version onto it would only misstate history.
 *
 * Usage:
 *   pnpm db:backfill-plan-version -- --dry-run   # report, write nothing
 *   pnpm db:backfill-plan-version                # write
 */
import 'dotenv/config';

import { prisma } from '@/lib/db';
import { grantsFor, resolvePlanId } from '@/lib/billing/catalog';
import { publishedVersionIdFor } from '@/lib/billing/plan-repository';

/** Subscription states that mean the tenant is actually living on the plan. */
const LIVE_STATUSES = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

interface SubscriptionRow {
  tenantId: string;
  planId: string;
  status: string;
  planVersionId: string | null;
}

interface VersionRow {
  id: string;
  seats: number;
  workspaces: number;
  aiCreditsMonthly: number;
  modules: string[];
}

/** Same figures from both sides, so "behaviour-preserving" is measured. */
function sameGrant(version: VersionRow, planId: string): boolean {
  const grant = grantsFor(planId);
  if (!grant) return false;
  const versionModules = [...version.modules].sort().join(',');
  const grantModules = [...grant.moduleIds].sort().join(',');
  return (
    version.seats === grant.seats &&
    version.workspaces === grant.workspaces &&
    version.aiCreditsMonthly === grant.aiCreditsMonthly &&
    versionModules === grantModules
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const rows: SubscriptionRow[] = await prisma.$queryRawUnsafe(
    `SELECT "tenantId", "planId", status::text AS status, "planVersionId"
       FROM "Subscription"
      WHERE "planVersionId" IS NULL
      ORDER BY "tenantId"`
  );

  console.log(
    `${dryRun ? '[dry run] ' : ''}${rows.length} subscription(s) carry no plan version.`
  );

  let written = 0;
  let skippedNotLive = 0;
  let skippedNoVersion = 0;
  const drifted: string[] = [];

  for (const row of rows) {
    if (!LIVE_STATUSES.includes(row.status)) {
      skippedNotLive += 1;
      console.log(`  · ${row.tenantId}: status ${row.status} — not live, left NULL`);
      continue;
    }

    const planId = resolvePlanId(row.planId);
    const versionId = await publishedVersionIdFor(planId);
    if (!versionId) {
      skippedNoVersion += 1;
      console.log(
        `  ! ${row.tenantId}: plan ${row.planId}` +
          `${planId === row.planId ? '' : ` (→ ${planId})`} has no published version — left NULL`
      );
      continue;
    }

    const version: VersionRow | null = await prisma.planVersion.findUnique({
      where: { id: versionId },
      select: { id: true, seats: true, workspaces: true, aiCreditsMonthly: true, modules: true },
    });
    if (!version) {
      skippedNoVersion += 1;
      console.log(`  ! ${row.tenantId}: version ${versionId} vanished between reads — left NULL`);
      continue;
    }

    const preserves = sameGrant(version, planId);
    if (!preserves) {
      const grant = grantsFor(planId);
      drifted.push(row.tenantId);
      console.log(
        `  ~ ${row.tenantId}: plan ${planId} CHANGES on backfill — ` +
          `catalogue seats=${grant?.seats} ws=${grant?.workspaces} credits=${grant?.aiCreditsMonthly}` +
          ` → version seats=${version.seats} ws=${version.workspaces} credits=${version.aiCreditsMonthly}`
      );
    }

    if (!dryRun) {
      // Guarded on NULL so a publish that landed between the read and this
      // write is not overwritten with an older version.
      const result = await prisma.subscription.updateMany({
        where: { tenantId: row.tenantId, planVersionId: null },
        data: { planVersionId: versionId },
      });
      if (result.count === 0) {
        console.log(`  · ${row.tenantId}: acquired a version between read and write — left alone`);
        continue;
      }
    }
    written += 1;
    console.log(
      `  ${dryRun ? '·' : '✓'} ${row.tenantId}: ${row.planId} → ${versionId}` +
        `${preserves ? ' (same grant)' : ' (GRANT CHANGES)'}`
    );
  }

  console.log(
    `\n${dryRun ? 'would write' : 'wrote'} ${written} · not live ${skippedNotLive} · no published version ${skippedNoVersion}`
  );
  if (drifted.length > 0) {
    console.log(
      `WARNING: ${drifted.length} subscription(s) get different limits than the catalogue gave them: ${drifted.join(', ')}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
