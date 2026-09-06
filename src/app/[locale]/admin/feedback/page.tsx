import React from 'react';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { PRIORITY_SLA_HOURS, type FeedbackPriorityValue } from '@/lib/feedback/triage';
import type { FeedbackRecord, TenantNameRow, UserContactRow } from '@/lib/feedback/types';
import FeedbackTriageClient, { type TriageRow } from './client';

export const dynamic = 'force-dynamic';

/**
 * Explicit title: the admin console has no default one, and Lighthouse counts a
 * missing <title> as an accessibility failure — a screen reader announces the
 * URL instead of the page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminFeedback' });
  return { title: `${t('title')} · Fabrika Admin` };
}

const OPEN_STATUSES = ['NEW', 'TRIAGED', 'IN_PROGRESS'];

function isOverdue(row: { priority: string; status: string; createdAt: Date }): boolean {
  if (!OPEN_STATUSES.includes(row.status)) return false;
  const budgetMs = PRIORITY_SLA_HOURS[row.priority as FeedbackPriorityValue] * 3600_000;
  return Date.now() - row.createdAt.getTime() > budgetMs;
}

export default async function AdminFeedbackPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminFeedback' });

  // Platform admins triage across tenants, so this read is intentionally
  // cross-tenant and does not go through withTenant(). The route is gated by
  // the admin layout and each action re-checks the role.
  const rows: FeedbackRecord[] = await prisma.feedback.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const userIds = Array.from(
    new Set(rows.map((r) => r.userId).filter((id): id is string => Boolean(id)))
  );
  const users: UserContactRow[] = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map<string, { email: string | null; name: string | null }>(
    users.map((u) => [u.id, { email: u.email, name: u.name }])
  );

  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId)));
  const tenants: TenantNameRow[] = tenantIds.length
    ? await prisma.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true },
      })
    : [];
  const tenantById = new Map<string, string>(tenants.map((tn) => [tn.id, tn.name]));

  const data: TriageRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    impact: r.impact,
    priority: r.priority,
    autoPriority: r.autoPriority,
    status: r.status,
    triageReason: r.triageReason,
    triageNote: r.triageNote,
    pageUrl: r.pageUrl,
    sentryStatus: r.sentryStatus,
    sentryEventId: r.sentryEventId,
    screenshotKey: r.screenshotKey,
    tenantName: tenantById.get(r.tenantId) ?? r.tenantId,
    reporter: r.userId ? (userById.get(r.userId)?.email ?? userById.get(r.userId)?.name ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    slaHours: PRIORITY_SLA_HOURS[r.priority as FeedbackPriorityValue],
    overdue: isOverdue(r),
  }));

  return (
    <FeedbackTriageClient
      locale={locale}
      rows={data}
      sentryConnected={Boolean(env.SENTRY_DSN)}
      labels={{
        title: t('title'),
        subtitle: t('subtitle'),
        total: t('total'),
        openCount: t('openCount'),
        overdueCount: t('overdueCount'),
        empty: t('empty'),
        filterAll: t('filterAll'),
        filterPriority: t('filterPriority'),
        filterStatus: t('filterStatus'),
        colPriority: t('colPriority'),
        colTitle: t('colTitle'),
        colCategory: t('colCategory'),
        colStatus: t('colStatus'),
        colReporter: t('colReporter'),
        colCreated: t('colCreated'),
        colSentry: t('colSentry'),
        slaLabel: t('slaLabel'),
        overdue: t('overdue'),
        autoPriorityChanged: t('autoPriorityChanged', { auto: '{auto}' }),
        triageReason: t('triageReason'),
        saveChanges: t('saveChanges'),
        saving: t('saving'),
        saved: t('saved'),
        saveFailed: t('saveFailed'),
        sentrySent: t('sentrySent'),
        sentrySkipped: t('sentrySkipped'),
        sentryFailed: t('sentryFailed'),
        sentryPending: t('sentryPending'),
        sentryNotConnected: t('sentryNotConnected'),
        noteLabel: t('noteLabel'),
        notePlaceholder: t('notePlaceholder'),
        statusNEW: t('statusNEW'),
        statusTRIAGED: t('statusTRIAGED'),
        statusIN_PROGRESS: t('statusIN_PROGRESS'),
        statusRESOLVED: t('statusRESOLVED'),
        statusWONT_FIX: t('statusWONT_FIX'),
      }}
      categoryLabels={await categoryLabels(locale)}
    />
  );
}

/**
 * Reuses the partner-facing category wording so admins and partners share
 * vocabulary. Keys are spelled out rather than interpolated: scripts/i18n-check.ts
 * only sees literal `t('...')` arguments.
 */
async function categoryLabels(locale: string): Promise<Record<string, string>> {
  const t = await getTranslations({ locale, namespace: 'feedback' });
  return {
    BUG: t('categoryBUG'),
    FEATURE_REQUEST: t('categoryFEATURE_REQUEST'),
    UX: t('categoryUX'),
    PERFORMANCE: t('categoryPERFORMANCE'),
    DATA_QUALITY: t('categoryDATA_QUALITY'),
    OTHER: t('categoryOTHER'),
  };
}
