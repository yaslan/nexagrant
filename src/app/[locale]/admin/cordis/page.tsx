import React from 'react';
import { aggregateCordisMetrics } from '@/lib/cordis-sync';
import { handleGetK2Status } from './actions';
import { CordisRagAdminClient } from './client';

export default async function AdminCordisPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [metrics, k2Status] = await Promise.all([
    aggregateCordisMetrics(),
    handleGetK2Status(),
  ]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <CordisRagAdminClient metrics={metrics} initialK2Status={k2Status} />
    </div>
  );
}
