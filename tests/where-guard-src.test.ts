import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { sourceFiles, unguardedWheres } from './helpers/where-guard-scan';

const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * TASK-MUN2KUHP1BP18 — the rule of tests/teardown-where-guard.test.ts, applied
 * to production code under src/.
 *
 * A server action's arguments come from the client whatever its signature
 * says, and an `undefined` id drops out of a Prisma `where`: İNCELEME-27 B-1
 * found 12+ `updateMany` paths where one missing id rewrote every row of the
 * tenant (m11 parts and m2 notes overwritten on an isolated DB). Each of those
 * now checks the id with `isPresentId` / `requireActionId` (src/lib/required-id.ts)
 * and this test keeps the next one from shipping without it.
 *
 * KNOWN lists what the scanner cannot prove but is safe for a stated reason —
 * almost always a value read from a non-null database column a line or two
 * above. Keys are `file` + the reported text, without the line number, so an
 * unrelated edit above does not break the test. A new entry needs a reason a
 * reviewer can check; "the scanner is wrong" is not one — fix the code.
 */
const DB_ROW = 'value read from a non-null column of a row fetched just above, not client input';
const KNOWN: Record<string, string> = {
  'src/modules/m17/server/evaluate.ts updatedAt: claimedAt':
    'the claim instant: `now` that claim() set on the row in the same run (the run\'s own identity, FO-188 B3); a server Date, never client input',
  'src/modules/m17/server/evaluate.ts updatedAt: row.claimedAt': 'same claim instant, read back from the claim() result; server-side, never client input',
  'src/app/[locale]/(app)/[workspace]/pipeline/actions.ts id: opp.proposal.id': DB_ROW,
  'src/app/[locale]/(app)/[workspace]/pipeline/actions.ts id: opp.id': DB_ROW,
  'src/lib/billing/plan-repository.ts planId: draft.planId': DB_ROW,
  'src/lib/billing/public-sector-plans.ts planVersionId: version.id': 'id of the row created one statement above',
  'src/lib/billing/subscription-sync.ts sku: skuStr': 'iterates the SKUs of AddOn rows read from the database',
  'src/lib/billing/subscription-sync.ts id: existing.id': DB_ROW,
  'src/lib/jobs/tasks/users-scheduled-deletion.ts { userId } (shorthand)':
    '`const userId = user.id` over `user.findMany` rows (primary key); cron input, no client',
  'src/lib/jobs/tasks/users-scheduled-deletion.ts actorId: userId': 'same `user.id` as above',
  'src/lib/jobs/tasks/users-scheduled-deletion.ts ownerId: userId': 'same `user.id` as above',
  'src/lib/jobs/tasks/users-scheduled-deletion.ts usedByUserId: userId': 'same `user.id` as above',
  'src/lib/jobs/tasks/users-scheduled-deletion.ts ownerUserId: userId': 'same `user.id` as above',
  'src/lib/scoring/g0-compute.ts ...where':
    '`where` is `{ id, tenantId }` with both ids checked by isPresentId in persistG0 a few lines above (it returns when either is missing); the spread only adds the `updatedAt` read by findFirst on that same where (FO-384 O3)',
  'src/lib/scoring/g0-compute.ts ...scope':
    '`scope` is the constant G0_RESCORE_SCOPE (stage G0, status ACTIVE, deletedAt null): a fixed filter, never client input; the `{ id, tenantId }` it is spread onto is checked by isPresentId at the top of writeOpportunityScore (FO-384 K-577267)',
  'src/lib/scoring/g0-compute.ts id: existing.id':
    'id of the TopicMatch row findFirst just fetched (a primary key, only reached inside `if (existing)`); tenantId beside it is checked by isPresentId at the top of clearStoredG0 (NG-120)',
  'src/lib/scoring/g0-compute.ts updatedAt: current.updatedAt':
    'the `updatedAt` of the row findFirst read on the same guarded where a line above: a stored Date, never client input (FO-384 O3)',
  'src/lib/k3-topic-stats/importer.ts topicPrefix: p.topicPrefix':
    'importer rows typed `string` / `string | null` (null is a value, not a dropped key); CLI input, no client',
  'src/lib/k3-topic-stats/importer.ts topicId: p.topicId': 'importer row, as above',
  'src/lib/k3-topic-stats/importer.ts country: p.country': 'importer row, as above',
  'src/lib/k3-topic-stats/importer.ts orgType: p.orgType': 'importer row, as above',
  'src/lib/invitations/accept.ts gt: now': 'both callers pass `input.now ?? new Date()`; a Date, never undefined',
  'src/lib/expert-prereg/server/retention.ts where: purgeableExpertPreRegWhere(cutoff) (not an object literal)':
    '`purgeableExpertPreRegWhere` returns `{ createdAt: { lt: cutoff } }` and throws on an invalid cutoff; cron input, no client (FO-50)',
  'src/lib/invitations/retention.ts AND: [{ tenantId }, due]':
    '`tenantId` is a `groupBy` key of Invitation rows (non-null column); `due` comes from purgeableInvitationWhere, which throws on an invalid cutoff; cron input, no client',
  'src/lib/leads/public-lead.ts where: due (not a const object literal)':
    '`due` comes from purgeablePublicLeadWhere, which throws on an invalid cutoff and returns `{ createdAt: { lt: cutoff } }`; cron input, no client (TASK-MULR765AR5G0C)',
  'src/lib/relationships/stale-reminder.ts lastContactAt: r.lastContactAt':
    '`lastContactAt` of a row collectTenant read with `lastContactAt: { not: null }`: a Date, never undefined; `id` beside it is guarded by isPresentId; cron input, no client',
  'src/lib/notifications/store.ts in: ids':
    '`ids` is parseMarkReadTarget(target) one line above, which throws unless every element passes isPresentId; an empty list returns before the update; tenantId and userId beside it go through requireActionId (TASK-MUVR24EHWI2RA)',
  'src/app/[locale]/admin/partner-search/actions.ts in: ids':
    '`ids` are the primary keys of PartnerSearchAnnouncement rows read by `findMany` in the same transaction a few lines above; an empty list skips the update; the queue row id beside it is found first or the action refuses (FO-64)',
  'src/app/[locale]/admin/partner-search/actions.ts id: unmatched.id':
    '`unmatched` is the UnmatchedOrganization row `findUnique` read in the same transaction just above (the action refuses with not_found when it is null); `id` is its primary key, not client input (FO-148)',
  'src/modules/m1/server/partner-search/retention.ts lt: withdrawnBefore':
    '`withdrawnBefore` comes from retentionCutoffs(), which throws on an invalid date; cron input, no client (FO-65 F4)',
  'src/modules/m1/server/partner-search/retention.ts lt: closedBefore':
    '`closedBefore` comes from retentionCutoffs(), which throws on an invalid date; cron input, no client (FO-65 F4)',
  'src/modules/m17/server/evaluate.ts gt: now':
    '`now` is checked at the top of claim(), which throws on an invalid Date; both text-expiry filters read it; server clock, never client input (FO-191 B4)',
  'src/modules/m17/server/retention.ts lte: now':
    '`now` is checked at the top of purgeExpiredInterregText, which throws on an invalid Date; cron input, no client (FO-195)',
  'src/modules/m17/server/retention.ts in: ids':
    '`ids` are the primary keys of the InterregAnalysis rows the `findMany` just above returned in the same transaction; an empty list leaves the loop before any write (FO-195)',
  'src/modules/m17/server/stale-runs.ts id: r.id':
    '`r` is a row of the `findMany` re-read under the tenant lock just above (InterregAnalysis primary key); cron input, no client (FO-317)',
  'src/modules/m17/server/stale-runs.ts tenantId: r.tenantId': 'non-null `tenantId` column of the same row (FO-317)',
  'src/modules/m17/server/stale-runs.ts updatedAt: r.updatedAt':
    'non-null `updatedAt` (the claim instant) of the same row, pinning the claim that was found stale (FO-317)',
  'src/modules/m10/server/actions.ts followupDocId: existing.id': DB_ROW,
  'src/modules/m10/server/actions.ts id: existing.id': DB_ROW,
  'src/modules/m10/server/actions.ts version: existing.version':
    '`FollowupDoc.version` (Int, non-null) of the row signDocument read one statement above, pinning that revision (TASK-MUNRAQA3OEZ83)',
};

const keyOf = (finding: string) => finding.replace(/:\d+ /, ' ');

function scanSrc(): string[] {
  const files = sourceFiles(path.join(REPO_ROOT, 'src'));
  expect(files.length).toBeGreaterThan(300);
  return files.flatMap((f) => unguardedWheres(fs.readFileSync(f, 'utf8'), f));
}

describe('production updateMany/deleteMany cannot lose their filter', () => {
  it('every unguarded where under src/ is a known, explained one', () => {
    const unexplained = scanSrc().filter((f) => !(keyOf(f) in KNOWN));
    expect(unexplained).toEqual([]);
  }, 60_000);

  it('KNOWN has no stale entries', () => {
    const seen = new Set(scanSrc().map(keyOf));
    expect(Object.keys(KNOWN).filter((k) => !seen.has(k))).toEqual([]);
  }, 60_000);

  it('the B-1 shape in a server action is caught, and the guarded one passes', () => {
    const unguarded = `
      export async function saveConceptNoteDraft(noteId: string, content: unknown) {
        const { tenantId } = await requireTenantAction();
        return withTenant(tenantId, (tx) => tx.conceptNote.updateMany({ where: { id: noteId, tenantId }, data: { content } }));
      }`;
    expect(unguardedWheres(unguarded, 'src/m2.ts')).toEqual(['src/m2.ts:4 id: noteId']);

    const guarded = unguarded.replace(
      'await requireTenantAction();',
      'await requireTenantAction();\n        if (!isPresentId(noteId)) return { success: false };'
    );
    expect(unguardedWheres(guarded, 'src/m2.ts')).toEqual([]);
  });
});
