import React from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { PRODUCT_NAME } from '@/lib/brand';
import { PARTNER_SEARCH_ALERT_SOURCE } from '@/lib/adapters/partner-search';
import { isPartnerSearchIngestionEnabled } from '@/modules/m1/server/partner-search/flag';
import PartnerSearchConsoleClient, { type RunRow, type UnmatchedRow } from './client';

export const dynamic = 'force-dynamic';

const MAX_RUNS = 30;
const MAX_UNMATCHED = 200;
const MAX_RESOLVED = 20;
/** Re-fetch picker suggestions; any OPEN/FORTHCOMING identifier can still be typed in. */
const MAX_TOPIC_SUGGESTIONS = 500;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminPartnerSearch' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/**
 * FO-64 / PS-K6. Every table read here is SYSTEM_WIDE (scripts/rls-models.ts): no
 * tenant rows, so no withTenant(). The route is gated by the admin layout and every
 * action re-checks the platform-admin role.
 */
export default async function AdminPartnerSearchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  let loadError = false;
  let runs: RunRow[] = [];
  let unmatched: UnmatchedRow[] = [];
  let resolved: UnmatchedRow[] = [];
  let unmatchedCount = 0;
  let topics: string[] = [];
  let openAlerts = 0;
  // The flag reader never throws: a failed read is OFF, the same answer the ingestor gets.
  const flagEnabled = await isPartnerSearchIngestionEnabled();

  try {
    const [runRows, openRows, resolvedRows, openCount, topicRows, alertCount] = await Promise.all([
      prisma.partnerSearchIngestionRun.findMany({ orderBy: { startedAt: 'desc' }, take: MAX_RUNS }),
      prisma.unmatchedOrganization.findMany({
        where: { resolvedPic: null },
        orderBy: { lastSeenAt: 'desc' },
        take: MAX_UNMATCHED,
      }),
      prisma.unmatchedOrganization.findMany({
        where: { resolvedPic: { not: null } },
        orderBy: { lastSeenAt: 'desc' },
        take: MAX_RESOLVED,
      }),
      prisma.unmatchedOrganization.count({ where: { resolvedPic: null } }),
      prisma.topic.findMany({
        where: { status: { in: ['OPEN', 'FORTHCOMING'] } },
        select: { identifier: true },
        orderBy: { identifier: 'asc' },
        take: MAX_TOPIC_SUGGESTIONS,
      }),
      prisma.systemAlert.count({ where: { source: PARTNER_SEARCH_ALERT_SOURCE, resolvedAt: null } }),
    ]);
    runs = runRows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      trigger: r.trigger,
      status: r.status,
      topicsScanned: r.topicsScanned,
      created: r.created,
      updated: r.updated,
      withdrawn: r.withdrawn,
      personAnnouncementCount: r.personAnnouncementCount,
      error: r.error,
    }));
    const toRow = (u: (typeof openRows)[number]): UnmatchedRow => ({
      id: u.id,
      name: u.name,
      country: u.country,
      pic: u.pic,
      firstSeenAt: u.firstSeenAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
      resolvedPic: u.resolvedPic,
    });
    unmatched = openRows.map(toRow);
    resolved = resolvedRows.map(toRow);
    unmatchedCount = openCount;
    topics = topicRows.map((t) => t.identifier);
    openAlerts = alertCount;
  } catch (e) {
    console.error(`[AdminPartnerSearchPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  return (
    <PartnerSearchConsoleClient
      locale={locale}
      flagEnabled={flagEnabled}
      runs={runs}
      unmatched={unmatched}
      resolved={resolved}
      unmatchedCount={unmatchedCount}
      topics={topics}
      openAlerts={openAlerts}
      loadError={loadError}
    />
  );
}
