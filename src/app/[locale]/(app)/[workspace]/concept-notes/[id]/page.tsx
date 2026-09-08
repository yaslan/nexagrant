import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import Link from 'next/link';
import ConceptNoteEditor from './editor';
import { errorMessage } from '@/lib/errors';
import type { ConceptNoteRow, ConceptTemplateRow, ConceptTemplateSchema } from '@/modules/m2/types';
import { moduleGate } from '@/lib/modules/guard';

export default async function ConceptNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const locked = await moduleGate('M2', locale);
  if (locked) return locked;
  const session = await auth();
  const tenantId = session?.tenantId;

  let note: Omit<ConceptNoteRow, 'updatedAt'> | null = null;
  let template: ConceptTemplateRow | null = null;
  let opportunity: { title: string } | null = null;

  try {
    const rawNote = await prisma.conceptNote.findFirst({
      where: tenantId ? { id, tenantId } : { id },
    });
    note = (rawNote as unknown as Omit<ConceptNoteRow, 'updatedAt'>) || null;

    if (note) {
      const rawTemplate = await prisma.conceptTemplate.findUnique({
        where: { id: note.templateId },
      });
      template = (rawTemplate as unknown as ConceptTemplateRow) || null;

      if (note.opportunityId) {
        opportunity = await prisma.opportunity.findUnique({
          where: { id: note.opportunityId },
          select: { title: true },
        });
      }
    }
  } catch (e) {
    console.warn(`[ConceptNoteDetail] DB query bypassed: ${errorMessage(e)}`);
  }

  // Fallback demo note if DB is unseeded/offline
  if (!note) {
    note = {
      id,
      templateId: 't1',
      opportunityId: 'demo-opp-1',
      version: 1,
      status: 'draft',
      content: {
        excellence: 'This concept addresses zero-emission hydrogen storage using innovative metal-organic frameworks.',
        impact: 'Reduces industrial carbon footprint by 40% across European pilot sites.',
        implementation: 'Consortium of 8 partners across 5 countries over 36 months.',
      },
    };

    template = {
      id: 't1',
      key: 'he_stage1_blind',
      name: 'Horizon Europe Stage 1 (Blind)',
      version: '1.0',
      schema: {
        sections: [
          { key: 'excellence', labelKey: 'Excellence & Innovation', maxWords: 1000 },
          { key: 'impact', labelKey: 'Expected Impact', maxWords: 800 },
          { key: 'implementation', labelKey: 'Implementation Plan', maxWords: 600 },
        ],
      },
    };

    opportunity = { title: 'HORIZON-CL5-2026-D3-01: Hydrogen Storage Systems' };
  }

  const schema = (template?.schema || {
    sections: [
      { key: 'excellence', labelKey: 'Excellence & Innovation', maxWords: 1000 },
      { key: 'impact', labelKey: 'Expected Impact', maxWords: 800 },
      { key: 'implementation', labelKey: 'Implementation Plan', maxWords: 600 },
    ],
  }) as ConceptTemplateSchema;

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/${workspace}/concept-notes`}
            className="text-muted hover:text-ink"
          >
            ← Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-heading">
              {template?.name || 'Concept Note'}
            </h1>
            <p className="text-sm text-muted">
              {opportunity?.title || note.opportunityId} — v{note.version} — {note.status}
            </p>
          </div>
        </div>
        <a
          href={`/api/concept-notes/${note.id}/export`}
          target="_blank"
          className="bg-surface hover:bg-surface-hover dark:bg-gray-800 dark:hover:bg-gray-700 text-ink border border-border px-4 py-2 rounded-md font-medium text-sm transition-colors flex items-center gap-2"
        >
          Download DOCX
        </a>
      </div>

      <ConceptNoteEditor
        noteId={note.id}
        opportunityTitle={opportunity?.title || 'Untitled Opportunity'}
        sections={schema.sections}
        initialContent={(note.content || {}) as Record<string, string>}
        status={note.status}
        version={note.version}
      />
    </div>
  );
}
