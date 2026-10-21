import React from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { withSystemScope } from '@/lib/system-scope';
import { Building2 } from 'lucide-react';
import { errorMessage } from '@/lib/errors';
import { grantsFor } from '@/lib/billing/catalog';
import { listInternalPlans } from '@/lib/billing/internal-plan';

export default async function AdminTenantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminTenants' });
  // CLAUDE.md §7: the tenant list is real rows or nothing. The previous
  // fallback rendered two invented organisations (with user counts and PIC
  // numbers) whenever the query failed or returned nothing, so an operator
  // could not tell an empty platform from an unreachable database.
  /** The Tenant columns this table renders, with the two relation counts. */
  interface TenantRow {
    id: string;
    name: string;
    slug: string;
    country: string | null;
    orgType: string;
    pic: string | null;
    _count?: { users?: number; workspaces?: number };
  }

  let tenants: TenantRow[] = [];
  // Tenants on an internal plan (TASK-MVCH26OXNVLKR), tenantId → planId.
  let internalPlans = new Map<string, string>();
  let loadError: string | null = null;
  try {
    // Tenant itself has no RLS, but both _count subqueries read RLS-scoped
    // tables (Membership, Workspace): unscoped under fabrika_app every count
    // reads back 0. The console lists every tenant, so it is a platform-admin
    // read, behind the admin layout's isPlatformAdminSession check.
    [tenants, internalPlans] = await Promise.all([
      withSystemScope('platform-admin', 'admin-tenants.list', (tx) =>
        tx.tenant.findMany({
          include: {
            _count: {
              select: { users: true, workspaces: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      ),
      listInternalPlans()
    ]);
  } catch (e) {
    console.error(`[AdminTenantsPage] DB query failed: ${errorMessage(e)}`);
    loadError = t('loadError');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-xl border shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="text-xs sm:text-sm text-muted">{t('subtitle')}</p>
        </div>
        <div className="flex items-center space-x-2 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 self-start sm:self-auto">
          <Building2 className="w-4 h-4 text-blue-600" />
          <span>{t('count', { count: tenants.length })}</span>
        </div>
      </div>

      <div className="bg-surface border rounded-xl shadow-2xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[640px]">
          <thead>
            <tr className="bg-ground border-b text-ink-2 font-semibold">
              <th className="p-4">{t('columns.name')}</th>
              <th className="p-4">{t('columns.slug')}</th>
              <th className="p-4">{t('columns.country')}</th>
              <th className="p-4">{t('columns.orgType')}</th>
              <th className="p-4">{t('columns.pic')}</th>
              <th className="p-4 text-center">{t('columns.users')}</th>
              <th className="p-4 text-center">{t('columns.workspaces')}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tn) => (
              <tr key={tn.id} className="border-b last:border-0 hover:bg-ground transition-colors">
                <td className="p-4 font-bold text-ink">
                  <Link
                    href={`/${locale}/admin/tenants/${tn.id}`}
                    className="hover:underline focus-visible:underline"
                    data-testid={`tenant-link-${tn.slug}`}
                  >
                    {tn.name}
                  </Link>
                  {internalPlans.has(tn.id) && (
                    <span
                      className="ml-2 align-middle bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded text-[11px] font-semibold"
                      data-testid={`tenant-internal-${tn.slug}`}
                    >
                      {t('internalBadge')} · {grantsFor(internalPlans.get(tn.id) ?? '')?.name}
                    </span>
                  )}
                </td>
                <td className="p-4 font-mono text-xs text-muted">{tn.slug}</td>
                <td className="p-4 font-semibold text-ink-2">{tn.country}</td>
                <td className="p-4">
                  <span className="bg-surface-hover text-ink-2 px-2 py-0.5 rounded font-mono text-xs font-semibold">
                    {tn.orgType}
                  </span>
                </td>
                <td className="p-4 font-mono text-xs text-blue-600">{tn.pic || '-'}</td>
                <td className="p-4 text-center font-bold">{tn._count?.users || 0}</td>
                <td className="p-4 text-center font-bold">{tn._count?.workspaces || 0}</td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted text-xs">
                  {loadError || t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
