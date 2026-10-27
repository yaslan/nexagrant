import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { getWorkspaceRoute } from '@/lib/routes';
import { moduleGate } from '@/lib/modules/guard';
import { PARTNER_RESOURCES } from './resources';

export default async function PartnerResourcesPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { workspace, locale } = await params;
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;
  const t = await getTranslations('PartnerResources');

  return (
    <div className="max-w-6xl mx-auto py-8 sm:px-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbDashboard')}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('partners', locale, workspace)} className="hover:text-ink transition-colors">
          {t('breadcrumbPartners')}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{t('breadcrumbResources')}</span>
      </div>

      <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-3">{t('title')}</h1>
      <p className="mb-6 text-xs md:text-sm text-muted max-w-3xl leading-relaxed">{t('intro')}</p>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="partner-resources-grid">
        {PARTNER_RESOURCES.map(({ id, href, icon: Icon }) => (
          <li key={id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              data-testid={`partner-resource-${id}`}
              className="group flex h-full items-start gap-3 rounded-2xl border border-border bg-surface p-5 shadow-xs transition-all hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-ink" aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-bold text-sm text-ink group-hover:text-accent transition-colors">
                  {t(`items.${id}.name`)}
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                </span>
                <span className="mt-1 block text-xs text-ink-2 leading-relaxed">{t(`items.${id}.description`)}</span>
                <span className="sr-only">{t('opensInNewTab')}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
