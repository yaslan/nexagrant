import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import KanbanBoard from './board';
import { getInMemoryOpportunities } from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';

export default async function PipelinePage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { locale, workspace } = await params;
  // No `findFirst()` tenant fallback: an empty `where` on Opportunity returns
  // every tenant's pipeline, and `findFirst()` on Tenant hands the session an
  // arbitrary one.
  const { tenantId } = await requireTenantPage(locale);

  let dbOpportunities: any[] = [];
  try {
    dbOpportunities = await withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' }
      })
    );
  } catch (e) {
    console.warn(`[Pipeline] DB query bypassed: ${errorMessage(e)}`);
  }

  // Combine DB opportunities with in-memory store opportunities (deduplicating by ID)
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
