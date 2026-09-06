import { prisma, withTenant } from '@/lib/db';
import { notFound } from 'next/navigation';
import { requireTenantPage } from '@/lib/tenant';
import ConceptNoteEditor from '@/modules/m2/ui/ConceptNoteEditor';

export default async function OpportunityM2Page({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>
}) {
  const { locale, workspace, id } = await params;

  // This page used to call a local `getAuth()` stub that returned a fixed
  // `mock-user-id` and then loaded the opportunity by `(id, workspace slug)`
  // with no tenant, so any visitor could open any tenant's concept note.
  const { tenantId } = await requireTenantPage(locale);

  // Find the opportunity
  const opp = await withTenant<any>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId, workspace: { slug: workspace } },
      include: { workspace: true }
    })
  );

  if (!opp) return notFound();

  // Check M2 module state
  const m2State = await withTenant<any>(tenantId, (tx) =>
    tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId: 'M2' } }
    })
  );

  if (!m2State || m2State.status === 'OFF') {
    return (
      <div className="p-8 text-center border rounded-lg bg-ground mt-10 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-2">Concept Note Modülü Kapalı</h2>
        <p className="text-ink-2">Bu modülü kullanmak için eklenti satın almalı veya planınızı yükseltmelisiniz.</p>
      </div>
    );
  }

  // Get existing note if any
  const note = await withTenant<any>(tenantId, (tx) =>
    tx.conceptNote.findFirst({
      where: { opportunityId: opp.id, tenantId }
    })
  );

  // ConceptTemplate is shared platform catalogue data, not tenant data.
  let templateId = note?.templateId;
  if (!templateId) {
    const genericTemplate = await prisma.conceptTemplate.findFirst({
      where: { key: 'generic' }
    });
    templateId = genericTemplate?.id;
  }

  if (!templateId) {
    return <div>No template found in system. Please run seed.</div>;
  }

  const template = await prisma.conceptTemplate.findUnique({
    where: { id: templateId }
  });

  return (
    <div className="p-6 max-w-4xl mx-auto mt-6 bg-surface border rounded-lg shadow-sm">
      <ConceptNoteEditor
        opportunityId={opp.id}
        templateId={templateId}
        schema={template?.schema as any}
        initialContent={(note?.content as any) || {}}
        noteId={note?.id}
      />
    </div>
  );
}
