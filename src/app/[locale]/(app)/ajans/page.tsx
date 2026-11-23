import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenantPage } from '@/lib/tenant';
import { asRole, can } from '@/lib/rbac';
import { withTenant } from '@/lib/db';
import { getAgencyFunnel, isAgencyTenant, type FunnelBreakdown } from '@/lib/agency/funnel';
import { lastExpiryDay, listInviteCodesIn } from '@/lib/agency/codes';
import FunnelPanel from './funnel-panel';
import InviteCodesPanel from './invite-codes-panel';
import ReportsPanel from './reports-panel';
import { listAgencyReportsIn } from '@/lib/agency/report';
import CoBrandPanel from './cobrand-panel';
import { getAgencyCoBrand, toShellCoBrand } from '@/lib/agency/cobrand-store';
import { COBRAND_NAME_MAX } from '@/lib/agency/cobrand';

/**
 * TASK-MULZATEX4G92H — one breakdown per request: `?kirilim=tur` (organisation
 * types, every province). The province breakdown is not offered since NG-339
 * (HUKUK-5 5e): old `?kirilim=<il>` and `?il=` links show the totals.
 */
function parseBreakdown(kirilim: string | undefined): FunnelBreakdown {
  return kirilim === 'tur' ? { dimension: 'orgType' } : { dimension: 'none' };
}

/** Once per request, on the server; the client computes nothing from its own clock. */
function requestTime(): number {
  return Date.now();
}

/**
 * Agency dashboard (TASK-MULRQSJFB8RWJ, FB KAMU B2).
 *
 * Only members of an AGENCY tenant get past the gate; everyone else gets 403.
 * The funnel arrives already aggregated and masked (src/lib/agency/funnel.ts):
 * no organisation name, id or content is ever passed to the client.
 */
export default async function AgencyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kirilim?: string }>;
}) {
  const { locale } = await params;
  const { kirilim } = await searchParams;
  const scope = await requireTenantPage(locale);
  if (!(await isAgencyTenant(scope.tenantId))) forbidden();

  const t = await getTranslations({ locale, namespace: 'agency' });
  const breakdown = parseBreakdown(kirilim);

  const renderedAt = requestTime();
  const [funnel, codes, reports, cobrand] = await Promise.all([
    // TASK-MULXF0AVMD8MN — one cohort, no date window: an old `?gun=` link is ignored.
    getAgencyFunnel(scope.tenantId, { breakdown }),
    // B-1 (TASK-MUM17YBJVAHRR): status per code, no use count.
    withTenant(scope.tenantId, (tx) => listInviteCodesIn(tx, scope.tenantId, renderedAt)),
    // B3 (TASK-MULRR08Y9YI77): the monthly region reports, newest first.
    withTenant(scope.tenantId, (tx) => listAgencyReportsIn(tx, scope.tenantId)),
    // B4 (TASK-MULRRNIHVZM1Z): the agency's own co-brand entry.
    getAgencyCoBrand(scope.tenantId),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4 sm:py-8">
      <header>
        <h1 className="font-heading text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-ink-2">{t('intro')}</p>
      </header>

      <FunnelPanel locale={locale} funnel={funnel} />

      <ReportsPanel locale={locale} reports={reports} />

      <InviteCodesPanel
        locale={locale}
        initialCodes={codes}
        canManage={can(asRole(scope.role), 'manage_users')}
        now={renderedAt}
        maxExpiresOn={lastExpiryDay(renderedAt)}
      />

      <CoBrandPanel
        canManage={scope.role === 'TENANT_OWNER' || scope.role === 'TENANT_ADMIN'}
        initialName={cobrand?.entry?.name ?? ''}
        fallbackName={cobrand?.tenantName ?? ''}
        initialLogoSrc={toShellCoBrand(cobrand?.entry ?? null)?.logoSrc ?? null}
        nameMax={COBRAND_NAME_MAX}
      />
    </div>
  );
}
