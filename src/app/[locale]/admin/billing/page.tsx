import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { BillingSsoClient } from './client';
import { errorMessage } from '@/lib/errors';
import { getActiveTier } from '@/lib/billing/active-tier';
import { NO_DISCOUNT_TIER } from '@/lib/billing/catalog';
import { readStorefront } from '@/lib/billing/storefront';

/** The Tenant fields the billing header shows, with its subscription. */
interface TenantWithSubscription {
  id: string;
  name: string;
  subscription: { planId: string; status: string } | null;
}

export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // The billing screen shows a subscription and opens an SSO portal session, so
  // a fallback tenant here meant a broken session could manage `demo-tenant-1`'s
  // billing. No session tenant → redirect, never a placeholder.
  const { tenantId } = await requireTenantPage(locale);

  let tenant: TenantWithSubscription | null = null;
  let subscription: TenantWithSubscription['subscription'] = null;
  try {
    tenant = await withTenant<TenantWithSubscription | null>(tenantId, (tx) =>
      tx.tenant.findFirst({
        where: { id: tenantId },
        include: { subscription: true },
      })
    );
    subscription = tenant?.subscription ?? null;
  } catch (e) {
    console.warn(`[AdminBillingPage] DB query failed: ${errorMessage(e)}`);
  }

  const activeTier = getActiveTier();
  // Prices come from the published plan versions this tenant may see, under the
  // server's live tier — the same list and the same arithmetic the public
  // pricing page and `/api/billing/checkout` use.
  const storefront = await readStorefront(tenantId, activeTier, NO_DISCOUNT_TIER);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BillingSsoClient
        locale={locale}
        tenantId={tenantId}
        tenantName={tenant?.name || ''}
        currentPlanId={subscription?.planId || ''}
        currentProvider="stripe"
        activeTier={activeTier}
        plans={storefront.cards}
        plansMeasured={storefront.measured}
      />
    </div>
  );
}
