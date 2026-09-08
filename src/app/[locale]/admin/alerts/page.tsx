import React from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { repeatCountOf, lastSeenAtOf } from '@/lib/observability/system-alert';
import AlertsConsoleClient, { type AlertRow } from './client';

export const dynamic = 'force-dynamic';

/** Newest first; older history stays reachable through the database. */
const MAX_ROWS = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminAlerts' });
  return { title: `${t('title')} · Fabrika Admin` };
}

/** The SystemAlert columns this screen renders. */
interface SystemAlertRecord {
  id: string;
  level: string;
  source: string;
  message: string;
  meta: unknown;
  createdAt: Date;
  resolvedAt: Date | null;
}

export default async function AdminAlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ alert?: string }>;
}) {
  const { locale } = await params;
  const { alert: highlightId } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'adminAlerts' });

  // SystemAlert is deliberately tenant-agnostic (see prisma/schema.prisma), so
  // there is no withTenant() wrapper to apply here. The route is gated by the
  // admin layout and the resolve action re-checks the platform-admin role.
  let rows: SystemAlertRecord[] = [];
  let loadError = false;
  try {
    rows = await prisma.systemAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS,
    });
  } catch (e) {
    console.error(`[AdminAlertsPage] DB query failed: ${errorMessage(e)}`);
    loadError = true;
  }

  const data: AlertRow[] = rows.map((r) => ({
    id: r.id,
    level: r.level,
    source: r.source,
    message: r.message,
    meta: isPlainObject(r.meta) ? r.meta : null,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    // A repeat updates the open row rather than adding one, so the count and
    // the last-seen stamp live in `meta` — see src/lib/observability/system-alert.ts.
    repeatCount: repeatCountOf(r.meta),
    lastSeenAt: lastSeenAtOf(r.meta),
  }));

  return (
    <AlertsConsoleClient
      locale={locale}
      rows={data}
      highlightId={highlightId ?? null}
      loadError={loadError}
      labels={{
        title: t('title'),
        subtitle: t('subtitle'),
        total: t('total'),
        openCount: t('openCount'),
        errorCount: t('errorCount'),
        empty: t('empty'),
        loadError: t('loadError'),
        filterAll: t('filterAll'),
        filterLevel: t('filterLevel'),
        filterSource: t('filterSource'),
        filterUnresolvedOnly: t('filterUnresolvedOnly'),
        colLevel: t('colLevel'),
        colSource: t('colSource'),
        colMessage: t('colMessage'),
        colCreated: t('colCreated'),
        colResolved: t('colResolved'),
        // Spelled out rather than built with `t(\`level${x}\`)`:
        // scripts/i18n-check.ts only sees a literal key argument.
        levelinfo: t('levelinfo'),
        levelwarn: t('levelwarn'),
        levelerror: t('levelerror'),
        resolve: t('resolve'),
        unresolve: t('unresolve'),
        resolvedAt: t('resolvedAt'),
        unresolvedLabel: t('unresolvedLabel'),
        saving: t('saving'),
        saveFailed: t('saveFailed'),
        metaLabel: t('metaLabel'),
        privacyNote: t('privacyNote'),
        feedbackLink: t('feedbackLink'),
        highlighted: t('highlighted'),
        repeatLabel: t('repeatLabel'),
        repeatNote: t('repeatNote'),
        lastSeen: t('lastSeen'),
      }}
    />
  );
}

/** `meta` is Json? — narrow it before it crosses into the client component. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
