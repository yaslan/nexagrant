import { prisma } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import ConceptNoteEditor from '@/modules/m2/ui/ConceptNoteEditor';

// Mocking auth since it might not be fully implemented in the repo yet. 
// In a real scenario, we'd import { auth } from '@/lib/auth';
async function getAuth() {
  return { user: { id: 'mock-user-id' } };
}

export default async function OpportunityM2Page({
  params
}: {
  params: { workspace: string; id: string }
}) {
  const session = await getAuth();
  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  // Find the opportunity
  const opp = await prisma.opportunity.findUnique({
    where: { id: params.id, workspace: { slug: params.workspace } },
    include: { workspace: true }
  });

  if (!opp) return notFound();

  // Check M2 module state
  const m2State = await prisma.moduleState.findUnique({
    where: { tenantId_moduleId: { tenantId: opp.tenantId, moduleId: 'M2' } }
  });

  if (!m2State || m2State.status === 'OFF') {
    return (
      <div className="p-8 text-center border rounded-lg bg-ground mt-10 max-w-2xl mx-auto">
        <h2 className="text-xl font-bold mb-2">Concept Note Modülü Kapalı</h2>
        <p className="text-ink-2">Bu modülü kullanmak için eklenti satın almalı veya planınızı yükseltmelisiniz.</p>
      </div>
    );
  }

  // Get existing note if any
  const note = await prisma.conceptNote.findFirst({
    where: { opportunityId: opp.id }
  });

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
        tenantId={opp.tenantId}
        userId={session.user.id}
        opportunityId={opp.id}
        templateId={templateId}
        schema={template?.schema as any}
        initialContent={(note?.content as any) || {}}
        noteId={note?.id}
      />
    </div>
  );
}
