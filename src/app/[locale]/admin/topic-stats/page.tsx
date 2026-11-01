import React from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { PRODUCT_NAME } from '@/lib/brand';
import TopicStatsImportClient, { type SourceSummary } from './client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminTopicStats' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/**
 * K3 — Horizon Dashboard base rates (TASK-MULQKV3BJT6VM). Gated by the admin layout; the upload
 * and rescore routes re-check the platform-admin role themselves.
 *
 * `TopicStat` is shared reference data (no tenantId, SYSTEM_WIDE in scripts/rls-models.ts), so
 * the summary read needs no tenant scope.
 */
export default async function AdminTopicStatsPage() {
  let sources: SourceSummary[] = [];
  let total = 0;
  let loadError = false;
  try {
    const grouped = await prisma.topicStat.groupBy({
      by: ['source'],
      _count: { _all: true },
      _max: { importedAt: true },
      orderBy: { _max: { importedAt: 'desc' } },
      take: 20,
    });
    sources = grouped.map((g) => ({
      source: g.source,
      rows: g._count._all,
      lastImportedAt: g._max.importedAt ? g._max.importedAt.toISOString() : null,
    }));
    total = await prisma.topicStat.count();
  } catch (e) {
    console.error(`[AdminTopicStatsPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <TopicStatsImportClient sources={sources} total={total} loadError={loadError} />
    </div>
  );
}
