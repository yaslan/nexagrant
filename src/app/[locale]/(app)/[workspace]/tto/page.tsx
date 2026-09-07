import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { TtoAcceleratorClient } from './client';
import { errorMessage } from '@/lib/errors';

export default async function TtoAcceleratorPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId } = await requireTenantPage(locale);

  let items: any[] = [];
  try {
    items = await withTenant(tenantId, (tx) =>
      tx.ttoPortfolioItem.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })
    );
  } catch (e) {
    console.warn(`[TtoAcceleratorPage] DB query bypassed: ${errorMessage(e)}`);
  }

  // Fallback demo items if DB is unseeded/offline
  if (items.length === 0) {
    items = [
      {
        id: 'tto-demo-1',
        title: 'Solid-State Electrolyte Micro-Sensor Array',
        trl: 5,
        patentStatus: 'granted',
        summary: 'Patented high-precision thermal monitoring sensor for EV battery packs in harsh environments.',
        keywords: ['thermal management', 'sensors', 'battery', 'solid state'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tto-demo-2',
        title: 'AI-Driven Catalyst Design for Green Hydrogen Synthesis',
        trl: 4,
        patentStatus: 'pending',
        summary: 'Machine learning guided electrocatalyst synthesis for high-efficiency water electrolysis.',
        keywords: ['green hydrogen', 'catalyst', 'electrolysis', 'machine learning'],
        createdAt: new Date().toISOString(),
      },
      {
        id: 'tto-demo-3',
        title: 'Recyclable Carbon Fiber Composite Matrix',
        trl: 6,
        patentStatus: 'licensed',
        summary: 'Bio-based epoxy matrix enabling low-energy recycling of aerospace carbon composites.',
        keywords: ['composites', 'carbon fiber', 'recycling', 'aerospace'],
        createdAt: new Date().toISOString(),
      },
    ];
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <TtoAcceleratorClient items={items} />
    </div>
  );
}
