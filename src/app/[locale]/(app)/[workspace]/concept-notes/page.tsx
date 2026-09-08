import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import Link from 'next/link';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import type { ConceptNoteRow, ConceptTemplateRow } from '@/modules/m2/types';

export default async function ConceptNotesListPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M2', locale);
  if (locked) return locked;

  const session = await auth();
  const tenantId = session?.tenantId;

  let notes: ConceptNoteRow[] = [];
  let templates: ConceptTemplateRow[] = [];

  try {
    const rawNotes = await prisma.conceptNote.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { updatedAt: 'desc' },
    });
    notes = rawNotes as unknown as ConceptNoteRow[];

    const rawTemplates = await prisma.conceptTemplate.findMany({
      where: tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : { tenantId: null },
    });
    templates = rawTemplates as unknown as ConceptTemplateRow[];
  } catch (e) {
    console.warn(`[ConceptNotes] DB query bypassed: ${errorMessage(e)}`);
  }

  // Demo fallback templates if DB is unseeded or offline
  if (templates.length === 0) {
    templates = [
      { id: 't1', key: 'he_stage1_blind', name: 'Horizon Europe Stage 1 (Blind)', version: '1.0' },
      { id: 't2', key: 'eurostars_summary', name: 'Eurostars Project Outline', version: '1.2' },
      { id: 't3', key: 'cetp_pre', name: 'CETPartnership Pre-Proposal', version: '1.0' },
      { id: 't4', key: 'eic_step1', name: 'EIC Accelerator Step 1 Short Proposal', version: '2.0' },
    ];
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-surface-hover text-ink-2',
    review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold font-heading">Concept Notes</h1>
          <p className="text-muted mt-1">
            Draft and manage AI-assisted concept notes for your opportunities.
          </p>
        </div>
      </div>

      {/* Template Showcase */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3 text-ink-2">Available Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {templates.map((t) => (
            <div
              key={t.id || t.key}
              className="border rounded-lg p-4 bg-surface hover:border-blue-400 transition-colors"
            >
              <div className="text-xs text-muted font-mono mb-1">{t.key}</div>
              <div className="font-semibold text-sm">{t.name}</div>
              <div className="text-xs text-muted mt-1">v{t.version}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes List */}
      <h2 className="text-lg font-semibold mb-3 text-ink-2">Your Notes</h2>
      <div className="space-y-4">
        {notes.map((note) => (
          <Link
            href={`/${locale}/${workspace}/concept-notes/${note.id}`}
            key={note.id}
            className="block"
          >
            <div className="border rounded-lg p-5 bg-surface hover:border-blue-400 transition-colors flex justify-between items-center">
              <div>
                <div className="font-bold text-lg mb-1">
                  Concept Note v{note.version}
                </div>
                <div className="text-sm text-muted font-mono">
                  Opportunity: {note.opportunityId}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-semibold uppercase px-3 py-1 rounded ${statusColors[note.status] || 'bg-surface-hover'}`}
                >
                  {note.status}
                </span>
                <span className="text-xs text-muted">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {notes.length === 0 && (
          <div className="text-center text-muted py-12 border-2 border-dashed rounded-lg">
            No concept notes yet. Create one from an opportunity in your pipeline.
          </div>
        )}
      </div>
    </div>
  );
}
