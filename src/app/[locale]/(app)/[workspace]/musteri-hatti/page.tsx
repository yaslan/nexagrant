import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { SectionNav } from './_components/section-nav';

export default async function ClientPipelinePanel({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  const { tenantId } = await requireTenantPageRole(locale, 'client_pipeline_read');
  const t = await getTranslations({ locale, namespace: 'm18' });
  const base = `/${locale}/${workspace}/musteri-hatti`;

  const counts = await withTenant(tenantId, async (tx) => {
    const [leads, openDeals, openTasks] = await Promise.all([
      tx.leadOrganization.count({ where: { tenantId, deletedAt: null } }),
      tx.deal.count({
        where: { tenantId, deletedAt: null, stage: { notIn: ['WON', 'REJECTED', 'LOST'] } },
      }),
      tx.dealTask.count({ where: { tenantId, deletedAt: null, doneAt: null } }),
    ]);
    return { leads, openDeals, openTasks };
  });

  const cards = [
    { label: t('panel.leadsCount'), value: counts.leads, href: `${base}/leads`, cta: t('panel.goLeads') },
    { label: t('panel.openDeals'), value: counts.openDeals, href: `${base}/pipeline`, cta: t('panel.goPipeline') },
    { label: t('panel.openTasks'), value: counts.openTasks, href: `${base}/tasks`, cta: t('panel.goTasks') },
  ];

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('panel.heading')}</h1>
      <SectionNav locale={locale} workspace={workspace} active="panel" />
      <ul className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <li key={card.href} className="rounded border border-slate-200 p-4">
            <p className="text-sm text-slate-600">{card.label}</p>
            <p className="text-3xl font-semibold tabular-nums">{card.value}</p>
            <Link href={card.href} className="mt-2 inline-block text-sm text-sky-800 underline">
              {card.cta}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
