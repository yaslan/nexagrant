import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import KanbanBoard from './board';
import { getInMemoryOpportunities } from '@/lib/k5-pipeline/pipelineStore';

export default async function PipelinePage({
  params
}: {
  params: Promise<{ locale: string; workspace: string }>
}) {
  const { locale, workspace } = await params;
  const session = await auth();
  let tenantId = (session as any)?.tenantId;

  let dbOpportunities: any[] = [];
  try {
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      tenantId = tenant?.id;
    }
    dbOpportunities = await prisma.opportunity.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { updatedAt: 'desc' }
    });
  } catch (e: any) {
    console.warn(`[Pipeline] DB query bypassed: ${e.message}`);
  }

  // Combine DB opportunities with in-memory store opportunities (deduplicating by ID)
  const inMemory = getInMemoryOpportunities();
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
      <KanbanBoard 
        opportunities={opportunities} 
        workspace={workspace} 
        locale={locale} 
        tenantId={tenantId}
      />
    </div>
  );
}
