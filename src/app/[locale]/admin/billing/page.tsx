import React from 'react';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { BillingSsoClient } from './client';

export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();
  const tenantId = (session as any)?.tenantId || 'demo-tenant-1';

  let tenant: any = null;
  let subscription: any = null;
  try {
    tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: true },
    });
    subscription = tenant?.subscription;
  } catch (e: any) {
    console.warn(`[AdminBillingPage] DB query bypassed: ${e.message}`);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BillingSsoClient
        tenantId={tenantId}
        tenantName={tenant?.name || 'FonBridge SME Ar-Ge Ltd.'}
        currentPlanId={subscription?.planId || 'pro'}
        currentProvider="stripe"
      />
    </div>
  );
}
