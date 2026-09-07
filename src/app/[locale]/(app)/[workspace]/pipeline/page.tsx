import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import KanbanBoard from './board';
import { getInMemoryOpportunities, type OpportunityItem } from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';

/**
 * Replaces each card's `g0Score` with the score that has a record behind it.
 *
 * `Opportunity.g0Score` is a cache of the canonical scorer's last run, and the board used to
 * draw it verbatim. Anything that ever put a number in that column — a seed literal, the old
 * `Math.random() * 15 + 80`, a hand-edited row — therefore appeared on screen as a triage
 * score, and an opportunity whose evidence cannot be scored at all wore a green "⭐ 92" here
 * while its own detail page said "Hesaplanamadı" (measured in
 * docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-denet-i-2.md).
 *
 * `TopicMatch.g0Score` is the record `persistG0` writes together with the per-criterion
 * breakdown, so it is the number CLAUDE.md §7 allows a user to read. A card with no such row
 * carries no badge — the honest state, and the one the detail page already renders as
 * "not computed" with the reasons attached.
 *
 * Two batch queries for the whole board, not one score computation per card: recomputing here
 * would be ~8 reads per opportunity on every board render.
 */
async function withEvidenceBackedScores(
  tenantId: string,
  opportunities: OpportunityItem[],
): Promise<OpportunityItem[]> {
  const topicRefs = Array.from(
    new Set(opportunities.map((o) => o.topicId).filter((t): t is string => !!t)),
  );
  if (topicRefs.length === 0) {
    return opportunities.map((o) => ({ ...o, g0Score: null }));
  }

  try {
    return await withTenant(tenantId, async (tx) => {
      // `Opportunity.topicId` is a `Topic.id` when the row was seeded and a portal identifier
      // ("HORIZON-CL5-2026-D4-01") when it came from the pipeline form, so both are resolved —
      // the same rule `loadG0Snapshot` follows.
      const topics: { id: string; identifier: string }[] = await tx.topic.findMany({
        where: { OR: [{ id: { in: topicRefs } }, { identifier: { in: topicRefs } }] },
        select: { id: true, identifier: true },
      });
      const topicIdByRef = new Map<string, string>();
      for (const topic of topics) {
        topicIdByRef.set(topic.id, topic.id);
        topicIdByRef.set(topic.identifier, topic.id);
      }

      const resolved = Array.from(new Set(topicIdByRef.values()));
      const matches: { topicId: string; g0Score: number | null }[] = resolved.length
        ? await tx.topicMatch.findMany({
            where: { tenantId, topicId: { in: resolved } },
            select: { topicId: true, g0Score: true },
          })
        : [];
      const scoreByTopicId = new Map(matches.map((m) => [m.topicId, m.g0Score ?? null]));

      return opportunities.map((o) => {
        const topicId = o.topicId ? topicIdByRef.get(o.topicId) : undefined;
        return { ...o, g0Score: topicId ? scoreByTopicId.get(topicId) ?? null : null };
      });
    });
  } catch (e) {
    // A failed lookup must not invent scores: the badge disappears, it does not fall back to
    // the column this function exists to stop trusting.
    console.warn(`[Pipeline] G0 evidence lookup bypassed: ${errorMessage(e)}`);
    return opportunities.map((o) => ({ ...o, g0Score: null }));
  }
}

export default async function PipelinePage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M5', locale);
  if (locked) return locked;

  // No `findFirst()` tenant fallback: an empty `where` on Opportunity returns
  // every tenant's pipeline, and `findFirst()` on Tenant hands the session an
  // arbitrary one.
  const { tenantId } = await requireTenantPage(locale);

  let dbOpportunities: OpportunityItem[] = [];
  try {
    dbOpportunities = await withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        // `deletedAt: null`: a soft-deleted (KVKK/GDPR erasure) opportunity must leave the board,
        // not linger on it as a card nobody can get rid of.
        where: { tenantId, deletedAt: null },
        orderBy: { updatedAt: 'desc' }
      })
    );
  } catch (e) {
    console.warn(`[Pipeline] DB query bypassed: ${errorMessage(e)}`);
  }

  // The buffer only ever holds rows the database refused (see `createOpportunity`), so in the
  // normal case this loop adds nothing. Deduplicating by id is kept as a belt-and-braces guard,
  // but it is no longer what the board relies on: ids minted by the buffer and ids minted by
  // Prisma can never match, which is exactly how every opportunity used to be drawn twice.
  const inMemory = getInMemoryOpportunities(tenantId);
  const dbMap = new Map(dbOpportunities.map((o) => [o.id, o]));

  for (const item of inMemory) {
    if (!dbMap.has(item.id)) {
      dbMap.set(item.id, item);
    }
  }

  const merged = Array.from(dbMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const opportunities = await withEvidenceBackedScores(tenantId, merged);

  return (
    <div className="max-w-[1600px] mx-auto py-8 px-4">
      {/* The board never receives a tenantId: server actions read the tenant
          from the session, so a value travelling through the client would be
          an attacker-controlled input, not a fact. */}
      <KanbanBoard
        opportunities={opportunities}
        workspace={workspace}
        locale={locale}
      />
    </div>
  );
}
