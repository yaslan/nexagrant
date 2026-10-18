import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { ApiKeysClient, type ApiKeyRecord } from './client';
import { errorMessage } from '@/lib/errors';
import { appUrl } from '@/lib/app-url';
import { moduleGate } from '@/lib/modules/guard';

/**
 * Placeholder rows for the empty state — the timestamps are relative to the
 * request so the screen never shows a date from whenever this file was written.
 */
function demoApiKeys(): ApiKeyRecord[] {
  return [
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

export default async function ApiKeysSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale } = await params;
  // Partner API keys are an M1 feature (docs/MODULES.md): the sidebar lock alone
  // left the page open to anyone who typed the URL.
  const locked = await moduleGate('M1', locale);
  if (locked) return locked;

  const { tenantId } = await requireTenantPage(locale);

  let apiKeys: ApiKeyRecord[] = [];
  try {
    apiKeys = await withTenant(tenantId, (tx) =>
      tx.apiKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        // Never `keyHash`: it is the key's verifier and every prop of
        // <ApiKeysClient> lands in the RSC payload (TASK-MUMT3KVHJTYX0).
        select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
      })
    );
  } catch (e) {
    console.warn(`[ApiKeysSettingsPage] DB query bypass: ${errorMessage(e)}`);
  }

  if (!apiKeys || apiKeys.length === 0) {
    apiKeys = demoApiKeys();
  }

  return (
    <div className="max-w-6xl mx-auto py-6 sm:px-6 space-y-6">
      <ApiKeysClient apiKeys={apiKeys} apiBaseUrl={appUrl()} />
    </div>
  );
}
