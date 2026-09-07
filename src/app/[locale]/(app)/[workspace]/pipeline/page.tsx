import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import KanbanBoard from './board';
import { getInMemoryOpportunities, type OpportunityItem } from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';

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

  const opportunities = Array.from(dbMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

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
