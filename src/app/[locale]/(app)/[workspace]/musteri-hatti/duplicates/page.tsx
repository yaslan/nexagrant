import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { asRole, can } from '@/lib/rbac';
import { findCandidatePairs } from '@/modules/m18/server/duplicate-pairs';
import { SectionNav } from '../_components/section-nav';
import { MergePairForm } from '../_components/merge-form';

/** Possible duplicate organisations, strongest first. Nothing is merged until a user picks one. */
export default async function DuplicatesPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, role } = await requireTenantPageRole(locale, 'client_pipeline_read');
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  const canWrite = can(asRole(role), 'client_pipeline_write');
  const t = await getTranslations({ locale, namespace: 'm18' });

  const orgs = await withTenant(tenantId, (tx) =>
    tx.leadOrganization.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, provinceCode: true, dedupeKey: true },
      take: 5000,
    }),
  );
  const pairs = await findCandidatePairs(orgs);
  const names = new Map(orgs.map((o) => [o.id, o.name]));

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('duplicates.heading')}</h1>
      <SectionNav locale={locale} workspace={workspace} active="duplicates" />
      <p className="max-w-2xl text-sm text-slate-700">{t('duplicates.intro')}</p>

      {pairs.length === 0 ? (
        <p className="text-slate-600">{t('duplicates.empty')}</p>
      ) : (
        <ul className="space-y-4" aria-label={t('duplicates.heading')}>
          {pairs.map((pair) => (
            <li key={`${pair.aId}|${pair.bId}`} className="rounded border border-slate-200 p-4">
              <p className="mb-1 text-xs text-slate-600">
                {t(`duplicates.reason.${pair.reason}`)} · {t(`duplicates.strength.${pair.strength}`)} ·{' '}
                {t('duplicates.similarity', { percent: Math.round(pair.similarity * 100) })}
              </p>
              {canWrite ? (
                <MergePairForm
                  aId={pair.aId}
                  aName={names.get(pair.aId) ?? ''}
                  bId={pair.bId}
                  bName={names.get(pair.bId) ?? ''}
                />
              ) : (
                <p className="text-sm">
                  {names.get(pair.aId)} / {names.get(pair.bId)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
