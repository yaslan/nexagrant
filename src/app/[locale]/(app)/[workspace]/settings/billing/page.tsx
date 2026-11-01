import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { getEntitlements } from '@/lib/billing';
import { BillingClient } from './BillingClient';
import { BillingIdentityForm, type BillingIdentityValuesOnFile } from './BillingIdentityForm';
import { errorMessage } from '@/lib/errors';
import { getActiveTier } from '@/lib/billing/active-tier';
import { countLifetimeLicences, lifetimeScarcity } from '@/lib/billing/lifetime-licence';
import { effectiveTier, isQuotedOnLock, priceLockDefect, readPriceLock } from '@/lib/billing/price-lock';
import { resolvePlanId, FALLBACK_PLAN_ID, NO_DISCOUNT_TIER } from '@/lib/billing/catalog';
import { readStorefront } from '@/lib/billing/storefront';
import { pilotLastDayLabel, pilotStateOf, type PilotSubscriptionRow } from '@/lib/billing/pilot';
import { can } from '@/lib/rbac';
import { Role } from '@prisma/client';
import { maskVknTckn } from '@/lib/billing/billing-identity';
import { COUNTRY_VAT_RATES } from '@/lib/billing/vat-rates';
import {
  buildInvoiceList,
  latestBuyerIdentity,
  type InvoiceBuyerIdentity,
  type InvoiceListRecord,
  type InvoiceListRow
} from '@/lib/billing/invoice-list';

/**
 * The lifetime badge counts rows, so this page must not be served from a cache
 * — a stale "19 owners" is how the 21st licence gets sold. The page already
 * renders dynamically because `requireTenantPage` reads the session cookie;
 * this states the reason that must keep holding even if the auth call moves,
 * and matches `/[locale]/pricing`, the other panel reading the same count.
 */
export const dynamic = 'force-dynamic';

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
  subscription:
    | ({
        planId: string;
      } & {
        lockedTierCode: string | null;
        lockedPercentOff: number | null;
        lockedAmountMinor: number | null;
        lockedCurrency: string | null;
        priceLockedAt: Date | null;
      } & PilotSubscriptionRow)
    | null;
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
  const { tenantId, role } = await requireTenantPage(locale);

  // Who may see and write the buyer's fiscal identity: `manage_billing`, which
  // `src/lib/rbac.ts` grants to TENANT_OWNER alone. The gate is applied to the
  // *read* as well as the form, so a member's page never carries a VKN/TCKN in
  // its payload — a hidden section still ships the data it hides.
  const canEditIdentity = can(role as Role, 'manage_billing');

  // Null until the tenant row is actually read. It used to default to
  // "FonBridge Demo Kuruluşu", so a failed query greeted a paying customer with
  // somebody else's organisation name; the panel now falls back to the
  // workspace slug in the URL, which is at least theirs.
  let tenantName: string | null = null;
  let currentPlanId = FALLBACK_PLAN_ID;
  // The rate this tenant joined at, if it has one. Set from the same row the
  // plan comes from, so the panel can never quote a plan and a rate that
  // belong to different subscriptions.
  let priceLock: ReturnType<typeof readPriceLock> = null;
  // The free pilot, running or run out — nothing is sold to it (pilot.ts).
  let pilot: { lastDay: string; expired: boolean } | null = null;

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
        currentPlanId = resolvePlanId(tenant.subscription.planId);
      }
      const defect = priceLockDefect(tenant.subscription);
      if (defect) {
        console.warn(`[BillingSettings] price lock not honoured: ${defect}`);
      }
      priceLock = readPriceLock(tenant.subscription);
      const pilotState = pilotStateOf(tenant.subscription);
      if (pilotState.kind !== 'none') {
        pilot = { lastDay: pilotLastDayLabel(pilotState.endsAt, locale), expired: pilotState.kind === 'expired' };
      }
    }
  } catch (err) {
    console.warn(`[BillingSettings] DB query bypassed: ${errorMessage(err)}`);
  }

  // What this tenant is entitled to, or nothing.
  //
  // There is no fallback object here on purpose. This used to fall back to
  // `seats: 6, workspaces: 5, aiCreditsMonthly: 1000` — a capacity nobody sold,
  // printed as fact the moment the entitlement query failed. A quota that could
  // not be read is `null`, and the panel says it was not measured (CLAUDE.md
  // rule 7).
  let entitlements: {
    allowedModules: string[] | null;
    seats: number | null;
    usedSeats: number | null;
    workspaces: number | null;
    usedWorkspaces: number | null;
    aiCreditsMonthly: number | null;
    aiCreditsRemaining: number | null;
  } = {
    allowedModules: null,
    seats: null,
    usedSeats: null,
    workspaces: null,
    usedWorkspaces: null,
    aiCreditsMonthly: null,
    aiCreditsRemaining: null,
  };

  try {
    const dbEntitlements = await withTenant(tenantId, (tx) => getEntitlements(tenantId, tx));

    // Count active members and workspaces from the database
    const usageData = await withTenant<{
      memberCount: number;
      workspaceCount: number;
      creditsUsedThisMonth: number;
    }>(tenantId, async (tx) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [memberCount, workspaceCount, creditUsage] = await Promise.all([
        tx.membership.count({ where: { tenantId } }),
        tx.workspace.count({ where: { tenantId } }),
        tx.creditLedger.aggregate({
          where: {
            tenantId,
            createdAt: { gte: monthStart },
            reason: { startsWith: 'usage' },
          },
          _sum: { delta: true },
        }),
      ]);

      return {
        memberCount,
        workspaceCount,
        creditsUsedThisMonth: Math.abs(creditUsage._sum.delta || 0),
      };
    });

    if (dbEntitlements) {
      const aiCreditsRemaining = Math.max(
        0,
        dbEntitlements.aiCreditsMonthly - usageData.creditsUsedThisMonth
      );

      entitlements = {
        allowedModules: dbEntitlements.allowedModules,
        seats: dbEntitlements.seats,
        usedSeats: usageData.memberCount,
        workspaces: dbEntitlements.workspaces,
        usedWorkspaces: usageData.workspaceCount,
        aiCreditsMonthly: dbEntitlements.aiCreditsMonthly,
        aiCreditsRemaining,
      };
    }
  } catch (err) {
    console.warn(`[BillingSettings] Entitlements fallback: ${errorMessage(err)}`);
  }

  // The invoice history, from the invoices this tenant was actually issued.
  //
  // Two constants used to stand here — GİB document numbers, a retired "Team
  // Plan" and ₺32,220 — labelled "Demo örnek" but sitting under a column header
  // reading "GİB fatura no". `model Invoice` holds issued invoices now, so the
  // rows come from there and an empty history renders as empty
  // (TASK-MTRD91ZLKEQ3A). The query runs inside `withTenant`, so the RLS policy
  // on `Invoice` is the second lock behind the `tenantId` in the where clause.
  let invoices: InvoiceListRow[] = [];
  let buyerIdentity: InvoiceBuyerIdentity | null = null;
  // Distinguishes "this tenant has no invoices" from "the history could not be
  // read": the first is a fact, the second must not be shown as one.
  let invoicesMeasured = true;

  try {
    const records = await withTenant<InvoiceListRecord[]>(tenantId, (tx) =>
      tx.invoice.findMany({
        where: { tenantId },
        orderBy: { issuedAt: 'desc' },
        take: 24,
        select: {
          id: true,
          number: true,
          issuedAt: true,
          currency: true,
          buyerName: true,
          buyerVknTckn: true,
          buyerTaxOffice: true,
          lines: true,
          gibEnvelopeId: true,
        },
      })
    );
    invoices = buildInvoiceList(records);
    buyerIdentity = latestBuyerIdentity(records);
  } catch (err) {
    invoicesMeasured = false;
    console.warn(`[BillingSettings] invoice history unreadable: ${errorMessage(err)}`);
  }

  // The buyer's fiscal identity, read from the row `invoice-writer.ts` demands
  // before it will issue anything (TASK-MTSY71BUMBLWM). Distinct from the
  // `buyerIdentity` above: that one is copied off the newest *invoice*, so a
  // tenant that has never been invoiced has none, which is exactly the tenant
  // that needs this form.
  let identityOnFile: BillingIdentityValuesOnFile | null = null;
  if (canEditIdentity) {
    try {
      const row = await withTenant<{
        buyerName: string;
        buyerVknTckn: string;
        buyerTaxOffice: string;
        buyerAddress: string;
        buyerCity: string;
        buyerCountry: string;
      } | null>(tenantId, (tx) =>
        tx.tenantBillingIdentity.findUnique({
          where: { tenantId },
          select: {
            buyerName: true,
            buyerVknTckn: true,
            buyerTaxOffice: true,
            buyerAddress: true,
            buyerCity: true,
            buyerCountry: true,
          },
        })
      );
      if (row) {
        identityOnFile = {
          buyerName: row.buyerName,
          // Masked on the server. The stored number is never serialised into the
          // page, so it cannot be read out of the HTML or a React payload.
          buyerVknTcknMasked: maskVknTckn(row.buyerVknTckn),
          buyerTaxOffice: row.buyerTaxOffice,
          buyerAddress: row.buyerAddress,
          buyerCity: row.buyerCity,
          buyerCountry: row.buyerCountry,
        };
      }
    } catch (err) {
      console.warn(`[BillingSettings] billing identity unreadable: ${errorMessage(err)}`);
    }
  }

  // The picker offers every country the VAT table knows, flagged by whether it
  // can be invoiced today — the 27 EU rows are `regime: 'unknown'` and would
  // save happily while still producing no invoice.
  const identityCountries = COUNTRY_VAT_RATES.map((row) => ({
    code: row.country,
    invoiceable: row.regime === 'standard',
  }));

  // The limited run is a global count, not a tenant one: the same
  // `public.lifetime_licence_count()` the public pricing page reads, so both
  // panels can never disagree about how many licences are left. When it cannot
  // be read the state is `unknown` and the badge claims no number rather than
  // falling back to zero.
  const scarcity = lifetimeScarcity(await countLifetimeLicences());

  // This panel quotes *this tenant's* renewal, not the shopfront: what it shows
  // has to be the rate the tenant will actually be charged. `/[locale]/pricing`
  // deliberately keeps showing the campaign of the day — it is the page a
  // stranger buys from. The two disagreeing is the promise working, not a bug.
  const shopfrontTier = getActiveTier();
  const quotedTier = effectiveTier(priceLock, shopfrontTier);

  // The plans this tenant may actually move to, priced on the server at the
  // rate it will be charged (TASK-MTSHVKTSGC8A4).
  //
  // Two things this fixes. The panel used to list the static three-plan array,
  // so a price published in the plan studio never reached it; and it listed
  // every plan regardless of visibility, so a private plan assigned to somebody
  // else was offered here — and, until this task, could be bought. The list is
  // now the same one `/api/billing/checkout` prices against, which is what
  // makes "shown" and "buyable" the same set rather than two.
  const storefront = await readStorefront(tenantId, quotedTier, NO_DISCOUNT_TIER);

  return (
    <>
    <BillingClient
      workspace={workspace}
      locale={locale}
      tenantId={tenantId}
      tenantName={tenantName}
      currentPlanId={currentPlanId}
      activeTier={quotedTier}
      priceLocked={isQuotedOnLock(priceLock, shopfrontTier)}
      lifetimeScarcity={scarcity}
      entitlements={entitlements}
      plans={storefront.cards}
      plansMeasured={storefront.measured}
      pilot={pilot}
      invoices={invoices}
      invoicesMeasured={invoicesMeasured}
      buyerIdentity={buyerIdentity}
    />
    <div className="max-w-6xl mx-auto pb-16">
      <BillingIdentityForm
        locale={locale}
        onFile={identityOnFile}
        canEdit={canEditIdentity}
        countries={identityCountries}
      />
    </div>
    </>
  );
}
