import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { moduleGate } from '@/lib/modules/guard';
import { listLeads } from '@/modules/m18/server/leads-repo';
import { leadListQuerySchema } from '@/modules/m18/server/schemas';
import { SectionNav } from '../_components/section-nav';
import { LeadCreateForm } from '../_components/client-forms';

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<{ q?: string; lifecycle?: string }>;
}) {
  const { locale, workspace } = await params;
  const locked = await moduleGate('M18', locale);
  if (locked) return locked;
  const { tenantId } = await requireTenantPageRole(locale, 'client_pipeline_read');
  const t = await getTranslations({ locale, namespace: 'm18' });
  const sp = await searchParams;
  const parsed = leadListQuerySchema.safeParse({ q: sp.q, lifecycle: sp.lifecycle || undefined });
  const query = parsed.success ? parsed.data : leadListQuerySchema.parse({});

  const rows = await withTenant(tenantId, (tx) => listLeads(tx, tenantId, query));
  const base = `/${locale}/${workspace}/musteri-hatti/leads`;

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t('leads.heading')}</h1>
      <SectionNav locale={locale} workspace={workspace} active="leads" />

      <form method="get" action={base} role="search" className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          {t('leads.searchLabel')}
          <input name="q" defaultValue={query.q ?? ''} placeholder={t('leads.searchPlaceholder')} className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm font-medium">
          {t('leads.lifecycleLabel')}
          <select name="lifecycle" defaultValue={query.lifecycle ?? ''} className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">{t('leads.lifecycleAll')}</option>
            <option value="LEAD">{t('lifecycle.LEAD')}</option>
            <option value="CLIENT">{t('lifecycle.CLIENT')}</option>
            <option value="DISQUALIFIED">{t('lifecycle.DISQUALIFIED')}</option>
          </select>
        </label>
        <button type="submit" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
          {t('leads.searchLabel')}
        </button>
      </form>

      <LeadCreateForm />

      {rows.length === 0 ? (
        <p className="text-slate-600">{t('leads.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">{t('leads.heading')}</caption>
            <thead>
              <tr className="border-b border-slate-300">
                <th scope="col" className="py-2 pr-4">{t('leads.colName')}</th>
                <th scope="col" className="py-2 pr-4">{t('leads.colProvince')}</th>
                <th scope="col" className="py-2 pr-4">{t('leads.colLifecycle')}</th>
                <th scope="col" className="py-2 pr-4">{t('leads.colUpdated')}</th>
                <th scope="col" className="py-2"><span className="sr-only">{t('leads.openLead')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-medium">{row.name}</td>
                  <td className="py-2 pr-4">{row.provinceCode ?? '—'}</td>
                  <td className="py-2 pr-4">{t(`lifecycle.${row.lifecycle}`)}</td>
                  <td className="py-2 pr-4">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(row.updatedAt)}</td>
                  <td className="py-2">
                    <Link href={`${base}/${row.id}`} className="text-sky-800 underline">
                      {t('leads.openLead')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-600">{t('leads.limitNote')}</p>
        </div>
      )}
    </main>
  );
}
