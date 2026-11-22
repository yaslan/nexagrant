import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { TtoAcceleratorClient } from './client';
import { errorMessage } from '@/lib/errors';
import type { TtoItem } from './client';
import { moduleGate } from '@/lib/modules/guard';

export default async function TtoAcceleratorPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale } = await params;
  const { tenantId } = await requireTenantPageRole(locale, 'view_proposal');
  const locked = await moduleGate('M7', locale);
  if (locked) return locked;

  let items: TtoItem[] = [];
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

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 space-y-6">
      <TtoAcceleratorClient items={items} />
    </div>
  );
}
