import React from 'react';
import { aggregateKeepEuMetrics } from '@/lib/keep-eu-sync';
import { KeepEuAdminClient } from './client';

export default async function AdminInterregPage() {
  const metrics = await aggregateKeepEuMetrics();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <KeepEuAdminClient initialMetrics={metrics} />
    </div>
  );
}
