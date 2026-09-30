import Link from 'next/link';
import { notFound } from 'next/navigation';
import ConceptNoteEditor from './editor';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { requireTenantPage } from '@/lib/tenant';
import { editorSections, loadConceptNoteDetail, type ConceptNoteDetailData } from './data';

/**
 * One concept note (M2).
 *
 * The tenant used to come in as `session?.tenantId` and go into
 * `where: tenantId ? { id, tenantId } : { id }` — with no tenant the note was
 * fetched by id alone, so one known id read another tenant's draft
 * (TASK-MTUGJTD5HZDW0). Resolution now goes through `requireTenantPage`, which
 * never returns without a tenant, and the read lives in `./data.ts`, where
 * `tenantId` is a required `string` re-checked before Prisma is touched.
 */
export default async function ConceptNoteDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const locked = await moduleGate('M2', locale);
  if (locked) return locked;
  // Redirects an anonymous visitor to login and a signed-in user with no
  // membership to /no-workspace. It cannot hand back a null or empty tenant.
  const { tenantId } = await requireTenantPage(locale);

  let data: ConceptNoteDetailData | null = null;
  try {
    data = await loadConceptNoteDetail(tenantId, id);
  } catch (e) {
    // Kept so an offline database 404s instead of crashing. The failure mode is
    // "not found", never "another tenant's note".
    console.warn(`[ConceptNoteDetail] DB query bypassed: ${errorMessage(e)}`);
  }

  // Another tenant's id and a non-existent id give the same 404 on purpose.
  if (!data) {
    notFound();
  }

  const { note, template, opportunity } = data;

  return (
    <div className="max-w-[1400px] mx-auto py-6 sm:px-4">
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
        sections={editorSections(template)}
        initialContent={(note.content || {}) as Record<string, string>}
        status={note.status}
        version={note.version}
      />
    </div>
  );
}
