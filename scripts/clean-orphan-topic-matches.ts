/**
 * Delete orphaned `TopicMatch` rows (TASK-MTQWBAJ2T5XSV / F14).
 *
 * `TopicMatch` is keyed by (tenantId, topicId), not by opportunity — a real K1 match (`fitScore`
 * measured by the K1 pipeline) is legitimate evidence for that tenant/topic pair on its own, even
 * with no opportunity currently open on it. But a row this app's own G0 scorer created just to hold
 * one opportunity's score breakdown (`src/lib/scoring/g0-compute.ts`, flagged with
 * `g0ScorerPlaceholderFitScore: true` in `breakdown`) has no standing once every opportunity that
 * ever carried that topicId in that tenant is gone — CLAUDE.md §7 requires every number on screen to
 * trace to a real record, and a stale placeholder breakdown is not one.
 *
 * `Opportunity` has no relation (and no cascade) to `TopicMatch`, so nothing deletes these
 * automatically today — see the report filed as TASK-MTQZNBGENT12T.
 *
 *   pnpm tsx scripts/clean-orphan-topic-matches.ts               # dry run, prints what would delete
 *   pnpm tsx scripts/clean-orphan-topic-matches.ts -- --apply    # deletes them
 */

import { prisma } from '../src/lib/db';

const PLACEHOLDER_FLAG = 'g0ScorerPlaceholderFitScore';

interface TopicMatchRow {
  id: string;
  tenantId: string;
  topicId: string;
  breakdown: unknown;
  computedAt: Date;
}

function isPlaceholder(breakdown: unknown): boolean {
  return (
    !!breakdown &&
    typeof breakdown === 'object' &&
    (breakdown as Record<string, unknown>)[PLACEHOLDER_FLAG] === true
  );
}

async function main(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');

  const before = await prisma.topicMatch.count();
  const allRows: TopicMatchRow[] = await prisma.topicMatch.findMany({
    where: {},
    select: { id: true, tenantId: true, topicId: true, breakdown: true, computedAt: true },
  });
  const placeholders: TopicMatchRow[] = allRows.filter((r) => isPlaceholder(r.breakdown));

  const orphans: TopicMatchRow[] = [];
  for (const row of placeholders) {
    const liveOpp = await prisma.opportunity.count({
      where: { tenantId: row.tenantId, topicId: row.topicId, deletedAt: null },
    });
    if (liveOpp === 0) orphans.push(row);
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — TopicMatch rows before: ${before}`);
  console.log(`placeholder rows (g0-scorer-created): ${placeholders.length}`);
  console.log(`orphans (no live opportunity references that topic): ${orphans.length}`);
  for (const o of orphans) {
    console.log(`  ${o.id}  tenant=${o.tenantId}  topic=${o.topicId}  computedAt=${o.computedAt.toISOString()}`);
  }

  if (!apply) {
    console.log('\nNothing deleted (dry run). Re-run with -- --apply to delete the rows listed above.');
    return;
  }

  if (orphans.length > 0) {
    const result = await prisma.topicMatch.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    console.log(`\nDeleted ${result.count} orphaned TopicMatch row(s).`);
  } else {
    console.log('\nNothing to delete.');
  }

  const after = await prisma.topicMatch.count();
  console.log(`TopicMatch rows after: ${after}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect?.();
  });
