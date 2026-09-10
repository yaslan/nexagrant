import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { listTenantListings } from '@/modules/marketplace/server/listings';
import { MarketplaceClient, type ApiKeyItem, type ListingItem } from './client';
import { errorMessage } from '@/lib/errors';

export default async function MarketplacePage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);

  let listings: ListingItem[] = [];
  let apiKeys: ApiKeyItem[] = [];

  try {
    // MarketplaceListing is NOT a cross-tenant catalogue: `tenantId` is non-null
    // in schema.prisma and the table carries a `tenant_isolation` policy, which
    // is why writes always went through `withTenant`. The read used to be a bare
    // `prisma.marketplaceListing.findMany` with no `where` clause, so it
    // returned every tenant's rows on the BYPASSRLS role the app connects as
    // (TASK-MTVTQTJIQ5SDB). Both halves of the scoping now live in
    // `listTenantListings`.
    listings = await listTenantListings(tenantId);
    apiKeys = await withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })
    );
  } catch (e) {
    console.warn(`[MarketplacePage] DB query bypassed: ${errorMessage(e)}`);
  }

  // Fallback demo listings if DB is unseeded/offline
  if (listings.length === 0) {
    listings = [
      {
        id: 'list-demo-1',
        kind: 'consultancy',
        title: 'Horizon Europe Proposal Coaching & ESR Pre-evaluation',
        description: 'Comprehensive ESR mock evaluation, Excellence criteria scoring, and proposal proofreading by certified EU reviewers.',
        price: '€1,800 / Proposal',
        status: 'active',
      },
      {
        id: 'list-demo-2',
        kind: 'patent_license',
        title: 'EV Solid-State Battery Thermal Sensor License',
        description: 'Patented high-precision micro-sensor technology available for Horizon Europe Consortium pilots.',
        price: '€4,500 / License',
        status: 'active',
      },
      {
        id: 'list-demo-3',
        kind: 'service',
        title: 'Cleanroom ISO 5 Pilot Batch Fabrication & Testing',
        description: 'Advanced ISO Class 5 cleanroom facility available for micro-fluidic chip manufacturing and pilot testing.',
        price: '€2,200 / Day',
        status: 'active',
      },
    ];
  }

  if (apiKeys.length === 0) {
    apiKeys = [
      {
        id: 'key-demo-1',
        name: 'ERP Enterprise Integration Key',
        prefix: 'fp_live_9a8b',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <MarketplaceClient
        tenantId={tenantId}
        userId={userId}
        listings={listings}
        apiKeys={apiKeys}
      />
    </div>
  );
}
