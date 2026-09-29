import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenantPage } from '@/lib/tenant';
import { asRole, can } from '@/lib/rbac';
import { withTenant } from '@/lib/db';
import { getAgencyFunnel, isAgencyTenant, type FunnelBreakdown } from '@/lib/agency/funnel';
import { listInviteCodesIn } from '@/lib/agency/codes';
import { parseProvince } from '@/lib/readiness/share';
import FunnelPanel from './funnel-panel';
import InviteCodesPanel from './invite-codes-panel';

/**
 * TASK-MULZATEX4G92H — one breakdown per request: `?kirilim=tur` (organisation
 * types, every province) or `?kirilim=<province>` (one province, every type).
 * An old `?il=` link still opens that province. Anything else is no breakdown.
 */
function parseBreakdown(kirilim: string | undefined, il: string | undefined): FunnelBreakdown {
  if (kirilim === 'tur') return { dimension: 'orgType' };
  const province = parseProvince(kirilim ?? il);
  return province ? { dimension: 'province', province } : { dimension: 'none' };
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
  searchParams: Promise<{ il?: string; kirilim?: string }>;
}) {
  const { locale } = await params;
  const { il, kirilim } = await searchParams;
  const scope = await requireTenantPage(locale);
  if (!(await isAgencyTenant(scope.tenantId))) forbidden();

  const t = await getTranslations({ locale, namespace: 'agency' });
  const breakdown = parseBreakdown(kirilim, il);

  const renderedAt = requestTime();
  const [funnel, codes] = await Promise.all([
    // TASK-MULXF0AVMD8MN — one cohort, no date window: an old `?gun=` link is ignored.
    getAgencyFunnel(scope.tenantId, { breakdown }),
    // B-1 (TASK-MUM17YBJVAHRR): status per code, no use count.
    withTenant(scope.tenantId, (tx) => listInviteCodesIn(tx, scope.tenantId, renderedAt)),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4 sm:py-8">
      <header>
        <h1 className="font-heading text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-ink-2">{t('intro')}</p>
      </header>

      <FunnelPanel locale={locale} funnel={funnel} />

      <InviteCodesPanel
        locale={locale}
        initialCodes={codes}
        canManage={can(asRole(scope.role), 'manage_users')}
        now={renderedAt}
      />
    </div>
  );
}
