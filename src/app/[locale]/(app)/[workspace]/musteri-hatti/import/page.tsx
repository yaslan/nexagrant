import { getTranslations } from 'next-intl/server';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { SectionNav } from '../_components/section-nav';
import { ImportWizard } from '../_components/import-wizard';

export default async function ImportPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  await requireTenantPageRole(locale, 'client_pipeline_read');
  const t = await getTranslations({ locale, namespace: 'm18' });

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('import.heading')}</h1>
      <SectionNav locale={locale} workspace={workspace} active="import" />
      <p className="max-w-2xl text-sm text-slate-700">{t('import.intro')}</p>
      <ImportWizard />
    </main>
  );
}
