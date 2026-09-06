import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { getEntitlements } from '@/lib/billing';
import { BillingClient } from './BillingClient';

/**
 * The shape this page actually reads off the tenant row.
 *
 * `withTenant`'s type parameter has to be supplied explicitly here:
 * `src/types/prisma-override.d.ts` declares `PrismaClient` with a
 * `[key: string]: any` index signature, so the delegate call inside the
 * callback carries no type and `T` collapses to `unknown` (which then narrows
 * to `{}` after the truthiness check — that was the TS2339 on `.name`).
 */
type TenantBillingRow = {
  id: string;
  name: string;
  subscription: { planId: string } | null;
};

export default async function BillingSettingsPage({
  params
}: {
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  // The tenant comes from the session and nowhere else. Re-resolving it from
  // "the first membership of this user" quietly picked a different tenant than
  // the one the session was issued for.
  const { tenantId } = await requireTenantPage(locale);

  let tenantName = 'FonBridge Demo Kuruluşu';
  let currentPlanId = 'team';

  try {
    const tenant = await withTenant<TenantBillingRow | null>(tenantId, (tx) =>
      tx.tenant.findFirst({
        where: { id: tenantId },
        include: { subscription: true }
      })
    );
    if (tenant) {
      tenantName = tenant.name;
      if (tenant.subscription?.planId) {
        currentPlanId = tenant.subscription.planId;
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
