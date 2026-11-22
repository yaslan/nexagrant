import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';
import { requireTenantPageRole } from '@/lib/page-role';
import type { ConceptNoteRow, ConceptTemplateRow } from '@/modules/m2/types';
import { loadConceptNotesIndex } from './data';

/**
 * The concept-note list (M2).
 *
 * The tenant used to come in as `session?.tenantId` and go into
 * `where: tenantId ? { tenantId } : {}` — a tenantless session listed every
 * tenant's concept notes (TASK-MTUGJTD5HZDW0). Resolution now goes through
 * `requireTenantPage`, which never returns without a tenant, and the reads live
 * in `./data.ts`, where `tenantId` is a required `string` re-checked before
 * Prisma is touched.
 */
export default async function ConceptNotesListPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId } = await requireTenantPageRole(locale, 'view_proposal');
  const locked = await moduleGate('M2', locale);
  if (locked) return locked;

  // Redirects an anonymous visitor to login and a signed-in user with no
  // membership to /no-workspace. It cannot hand back a null or empty tenant.

  let notes: ConceptNoteRow[] = [];
  let templates: ConceptTemplateRow[] = [];

  try {
    // Templates still include the platform rows (`tenantId` NULL) on purpose —
    // see the comment on `loadConceptNotesIndex`.
    ({ notes, templates } = await loadConceptNotesIndex(tenantId));
  } catch (e) {
    // Kept so an offline or unseeded database renders the empty state instead
    // of a crash. The failure mode is "no rows", never "other tenants' rows".
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

  const t = await getTranslations({ locale, namespace: 'ConceptNote' });

  const statusColors: Record<string, string> = {
    draft: 'bg-surface-hover text-ink-2',
    review: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
  };

  return (
    <div className="max-w-5xl mx-auto py-8 sm:px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold font-heading">{t('title')}</h1>
          <p className="text-muted mt-1">
            {t('list.subtitle')}
          </p>
        </div>
      </div>

      {/* Template Showcase */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-3 text-ink-2">{t('list.templates')}</h2>
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
      <h2 className="text-lg font-semibold mb-3 text-ink-2">{t('list.yourNotes')}</h2>
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
                  {t('list.noteVersion', { version: note.version })}
                </div>
                <div className="text-sm text-muted font-mono">
                  {t('list.opportunity', { id: note.opportunityId })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-semibold uppercase px-3 py-1 rounded ${statusColors[note.status] || 'bg-surface-hover'}`}
                >
                  {t.has(`status.${note.status}`) ? t(`status.${note.status}`) : note.status}
                </span>
                <span className="text-xs text-muted">
                  {new Date(note.updatedAt).toLocaleDateString(locale)}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {notes.length === 0 && (
          <div className="text-center text-muted py-12 border-2 border-dashed rounded-lg">
            {t('list.empty')}
          </div>
        )}
      </div>
    </div>
  );
}
