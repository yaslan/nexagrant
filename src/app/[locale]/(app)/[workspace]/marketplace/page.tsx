import React from 'react';
import { prisma, withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { MarketplaceClient, type ApiKeyItem, type ListingItem } from './client';
import { errorMessage } from '@/lib/errors';

export default async function MarketplacePage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);

  let listings: ListingItem[] = [];
  let apiKeys: ApiKeyItem[] = [];

  try {
    // MarketplaceListing is a cross-tenant catalogue by design, so it stays on
    // the unscoped client; ApiKey is tenant data and goes through withTenant.
    listings = await prisma.marketplaceListing.findMany({
      orderBy: { createdAt: 'desc' },
    });
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
