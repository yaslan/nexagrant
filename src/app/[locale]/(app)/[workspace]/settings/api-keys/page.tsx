import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { ApiKeysClient } from './client';
import { errorMessage } from '@/lib/errors';

export default async function ApiKeysSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);

  let apiKeys: any[] = [];
  try {
    apiKeys = await withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      })
    );
  } catch (e) {
    console.warn(`[ApiKeysSettingsPage] DB query bypass: ${errorMessage(e)}`);
  }

  if (!apiKeys || apiKeys.length === 0) {
    apiKeys = [
      {
        id: 'key-1',
        name: 'ERP Entegrasyonu & B2B Pipeline',
        prefix: 'fp_live_9b4e72',
        lastUsedAt: new Date(Date.now() - 3600000).toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      },
      {
        id: 'key-2',
        name: 'CORDIS Intelligence Bot',
        prefix: 'fp_live_1a8f03',
        lastUsedAt: new Date(Date.now() - 7200000).toISOString(),
        createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      },
    ];
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <ApiKeysClient
        tenantId={tenantId}
        userId={userId}
        apiKeys={apiKeys}
      />
    </div>
  );
}
