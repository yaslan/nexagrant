import { withTenant } from '@/lib/db';
import { notFound } from 'next/navigation';
import { requireTenantPage } from '@/lib/tenant';
import ConceptNoteEditor from '@/modules/m2/ui/ConceptNoteEditor';
import type { ModuleStateRow } from '@/types/db-rows';
import { moduleGate } from '@/lib/modules/guard';
import {
  findAccessibleTemplate,
  findAccessibleTemplateByKey,
  templateSections,
} from '@/modules/m2/server/templates';

export default async function OpportunityM2Page({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>
}) {
  const { locale, workspace, id } = await params;
  const locked = await moduleGate('M2', locale);
  if (locked) return locked;

  // This page used to call a local `getAuth()` stub that returned a fixed
  // `mock-user-id` and then loaded the opportunity by `(id, workspace slug)`
  // with no tenant, so any visitor could open any tenant's concept note.
  const { tenantId } = await requireTenantPage(locale);

  // Find the opportunity
  const opp = await withTenant<{ id: string; title: string } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId, workspace: { slug: workspace } },
      include: { workspace: true }
    })
  );

  if (!opp) return notFound();

  // Check M2 module state
  const m2State = await withTenant<ModuleStateRow | null>(tenantId, (tx) =>
    tx.moduleState.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId: 'M2' } }
    })
  );

  if (!m2State || m2State.status === 'OFF') {
    return (
      <div className="p-4 sm:p-8 text-center border rounded-lg bg-ground mt-10 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-2">Concept Note Modülü Kapalı</h2>
        <p className="text-ink-2">Bu modülü kullanmak için eklenti satın almalı veya planınızı yükseltmelisiniz.</p>
      </div>
    );
  }

  // Get existing note if any
  const note = await withTenant(tenantId, (tx) =>
    tx.conceptNote.findFirst({
      where: { opportunityId: opp.id, tenantId }
    })
  );

  // `ConceptTemplate` is half platform catalogue: `tenantId` NULL means a
  // platform template, a non-NULL row belongs to one tenant. Both lookups below
  // used to ignore that, so tenant B's `generic` template could be handed to
  // tenant A (TASK-MTVTU103F11XJ).
  let templateId = note?.templateId;
  if (!templateId) {
    const genericTemplate = await findAccessibleTemplateByKey('generic', tenantId);
    templateId = genericTemplate?.id;
  }

  if (!templateId) {
    return <div>No template found in system. Please run seed.</div>;
  }

  const template = await findAccessibleTemplate(templateId, tenantId);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto mt-6 bg-surface border rounded-lg shadow-sm">
      <ConceptNoteEditor
        opportunityId={opp.id}
        templateId={templateId}
        schema={templateSections(template?.schema) as Parameters<typeof ConceptNoteEditor>[0]['schema']}
        initialContent={(note?.content as unknown as Record<string, string>) || {}}
        noteId={note?.id}
      />
    </div>
  );
}
