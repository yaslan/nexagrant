import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { BillingSsoClient } from './client';
import { errorMessage } from '@/lib/errors';

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

  let tenant: any = null;
  let subscription: any = null;
  try {
    tenant = await withTenant<any>(tenantId, (tx) =>
      tx.tenant.findFirst({
        where: { id: tenantId },
        include: { subscription: true },
      })
    );
    subscription = tenant?.subscription;
  } catch (e) {
    console.warn(`[AdminBillingPage] DB query failed: ${errorMessage(e)}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BillingSsoClient
        tenantId={tenantId}
        tenantName={tenant?.name || ''}
        currentPlanId={subscription?.planId || ''}
        currentProvider="stripe"
      />
    </div>
  );
}
