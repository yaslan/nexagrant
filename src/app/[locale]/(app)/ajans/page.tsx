import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenantPage } from '@/lib/tenant';
import { asRole, can } from '@/lib/rbac';
import { withTenant } from '@/lib/db';
import { FUNNEL_WINDOWS, getAgencyFunnel, isAgencyTenant, isFunnelWindow } from '@/lib/agency/funnel';
import { listInviteCodesIn } from '@/lib/agency/codes';
import { parseProvince } from '@/lib/readiness/share';
import FunnelPanel from './funnel-panel';
import InviteCodesPanel, { type InviteCodeRow } from './invite-codes-panel';

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
  searchParams: Promise<{ gun?: string; il?: string }>;
}) {
  const { locale } = await params;
  const { gun, il } = await searchParams;
  const scope = await requireTenantPage(locale);
  if (!(await isAgencyTenant(scope.tenantId))) forbidden();

  const t = await getTranslations({ locale, namespace: 'agency' });
  const windowDays = isFunnelWindow(gun) ? (Number(gun) as (typeof FUNNEL_WINDOWS)[number]) : 30;
  // TASK-MULV3JXS1AW5X — one of TR_PROVINCES, anything else is "all provinces".
  const province = parseProvince(il);

  const [funnel, codes] = await Promise.all([
    getAgencyFunnel(scope.tenantId, windowDays, { province }),
    withTenant(scope.tenantId, (tx) => listInviteCodesIn(tx, scope.tenantId)),
  ]);
  const renderedAt = requestTime();
  const rows: InviteCodeRow[] = codes.map((c) => ({
    id: c.id,
    hint: c.hint,
    label: c.label,
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    expiresAt: c.expiresAt.toISOString(),
    revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8 py-4 sm:py-8">
      <header>
        <h1 className="font-heading text-3xl font-bold text-ink">{t('title')}</h1>
        <p className="mt-2 max-w-3xl text-ink-2">{t('intro')}</p>
      </header>

      <FunnelPanel locale={locale} funnel={funnel} windows={[...FUNNEL_WINDOWS]} />

      <InviteCodesPanel
        locale={locale}
        initialCodes={rows}
        canManage={can(asRole(scope.role), 'manage_users')}
        now={renderedAt}
      />
    </div>
  );
}
