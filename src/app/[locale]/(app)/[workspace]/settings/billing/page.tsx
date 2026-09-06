import React from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getEntitlements } from '@/lib/billing';
import { BillingClient } from './BillingClient';

export default async function BillingSettingsPage({
  params
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  const session = await auth();

  let tenantId = (session as any)?.tenantId || 'demo-tenant-1';
  let tenantName = 'FonBridge Demo Kuruluşu';
  let currentPlanId = 'team';

  // Attempt to resolve real tenant from DB
  try {
    if (session?.user?.id) {
      const membership = await prisma.membership.findFirst({
        where: { userId: session.user.id },
        include: { tenant: { include: { subscription: true } } }
      });
      if (membership?.tenant) {
        tenantId = membership.tenant.id;
        tenantName = membership.tenant.name;
        if (membership.tenant.subscription?.planId) {
          currentPlanId = membership.tenant.subscription.planId;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[BillingSettings] DB query bypassed: ${err.message}`);
  }

  // Load entitlements with fallback
  let entitlements = {
    allowedModules: ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'],
    seats: 6,
    usedSeats: 3,
    workspaces: 5,
    usedWorkspaces: 1,
    aiCreditsMonthly: 1000,
    aiCreditsRemaining: 500,
  };

  try {
    const dbEntitlements = await getEntitlements(tenantId);
    if (dbEntitlements) {
      entitlements = {
        allowedModules: dbEntitlements.allowedModules.length > 0
          ? dbEntitlements.allowedModules
          : ['M1', 'M2', 'M3', 'M4', 'M5', 'M8'],
        seats: dbEntitlements.seats || 6,
        usedSeats: 3,
        workspaces: dbEntitlements.workspaces || 5,
        usedWorkspaces: 1,
        aiCreditsMonthly: dbEntitlements.aiCreditsMonthly || 1000,
        aiCreditsRemaining: 500,
      };
    }
  } catch (err: any) {
    console.warn(`[BillingSettings] Entitlements fallback: ${err.message}`);
  }

  return (
    <BillingClient
      workspace={workspace}
      locale={locale}
      tenantId={tenantId}
      tenantName={tenantName}
      currentPlanId={currentPlanId}
      entitlements={entitlements}
    />
  );
}
