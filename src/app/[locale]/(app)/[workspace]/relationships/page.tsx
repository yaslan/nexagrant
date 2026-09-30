import { withTenant } from '@/lib/db';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { errorMessage } from '@/lib/errors';
import type { RelationshipRow } from '@/types/db-rows';
import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';
import { isStaleRelationship } from '@/lib/relationships/stale';

/** Whole days between `d` and now, or null when there is no date. */
const daysSince = (d: Date | null) => {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 3600 * 24));
};

export default async function RelationshipsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M4', locale);
  if (locked) return locked;

  // `where: tenantId ? { tenantId } : {}` — the same TASK-MTRKV9JGY7OQY bug as
  // the detail page, one degree worse: the empty object is not a narrower query,
  // it is *no filter*, so a session without a tenant listed every relationship
  // in the database. `requireTenantPage` cannot return without a tenant, so the
  // conditional has nothing left to express and is gone.
  const { tenantId } = await requireTenantPage(locale);

  let relationships: RelationshipRow[] = [];
  try {
    relationships = await withTenant<RelationshipRow[]>(tenantId, (tx) =>
      tx.relationship.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          organizationId: true,
          partnerOrgId: true,
          kind: true,
          ownerUserId: true,
          counterpartName: true,
          counterpartEmail: true,
          warmth: true,
          lastContactAt: true,
          nextStep: true,
          nextStepDue: true,
          notes: true,
          updatedAt: true,
        },
      })
    );
  } catch (e) {
    // A database outage renders the empty state, as before. It never renders
    // somebody else's rows, which is what the removed fallback could do.
    console.warn(`[Relationships] DB query bypassed: ${errorMessage(e)}`);
  }

  const warmthColors: Record<string, string> = {
    cold: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
    warm: 'bg-amber/15 text-amber border border-amber/20',
    hot: 'bg-bad/15 text-bad border border-bad/20',
    active: 'bg-ok/15 text-ok border border-ok/20',
  };

  const isTr = locale === 'tr';

  return (
    <div className="max-w-6xl mx-auto py-8 sm:px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink">{isTr ? 'Odak Noktası CRM (M3)' : 'Focal Point CRM'}</h1>
          <p className="text-muted text-xs md:text-sm mt-1">{isTr ? 'Ortak ilişkilerini yönet ve etkileşimleri takip et.' : 'Manage partner relationships and track interactions.'}</p>
        </div>
        <Link
          href={getWorkspaceRoute('partners', locale, workspace)}
          className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-semibold hover:opacity-90 transition shadow-2xs"
        >
          {isTr ? '+ Ortak Kartından Ekle' : '+ New from Partner Card'}
        </Link>
      </div>

      <div className="space-y-4">
        {relationships.map((rel) => {
          const days = daysSince(rel.lastContactAt);
          // Same 60-day line as the daily reminder mail (src/lib/relationships/stale.ts).
          const stale = isStaleRelationship(rel.lastContactAt);

          return (
            <Link
              key={rel.id}
              href={`/${locale}/${workspace}/relationships/${rel.id}`}
              className="block group"
            >
              <div
                className={`border border-border rounded-xl p-5 bg-surface hover:border-accent transition-all shadow-2xs flex justify-between items-center ${stale ? 'border-bad/40 bg-bad/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <div className="font-bold text-base text-ink group-hover:text-accent transition-colors">
                      {rel.counterpartName || rel.organizationId || rel.partnerOrgId}
                    </div>
                    <div className="text-xs text-muted flex items-center gap-2 mt-1">
                      <span className="bg-ground text-ink-2 border border-border px-2 py-0.5 rounded text-[10px] font-medium">{rel.kind}</span>
                      {rel.counterpartEmail && (
                        <span className="text-muted">{rel.counterpartEmail}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {stale && (
                    <span className="text-[10px] bg-bad/15 text-bad border border-bad/30 px-2 py-0.5 rounded font-bold">
                      ⚠ {days}d stale
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${warmthColors[rel.warmth] || 'bg-ground text-muted border border-border'}`}
                  >
                    {rel.warmth}
                  </span>
                  {days !== null && !stale && (
                    <span className="text-[11px] text-muted font-mono">{days}d ago</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {relationships.length === 0 && (
          <div className="text-center text-muted py-12 border-2 border-dashed border-border rounded-xl bg-surface/40 text-xs">
            No relationships yet. Open one from a Partner Card.
          </div>
        )}
      </div>
    </div>
  );
}
