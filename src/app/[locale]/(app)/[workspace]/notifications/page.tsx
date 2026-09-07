import React from 'react';
import NotificationsClient from './client';

/**
 * TASK-MTQYXISOPUJ53 — fabricated fallbacks.
 *
 * This page used to build four notifications in code and hand them to the
 * client as `initialNotifications`: a "%92 match" on HORIZON-CL5-2026-D3, an
 * SME declaration "expiring in 15 days", "500 AI credits added to your
 * workspace" and an M4 interaction note with Fraunhofer — each with a
 * plausible relative timestamp and a working deep link. Every workspace saw the
 * same four, on every visit, forever.
 *
 * They were not a fallback for a query that failed. prisma/schema.prisma has no
 * notification model at all (`grep -n "otification" prisma/schema.prisma` is
 * empty), so there is nothing to query yet: the whole feed was invented. Two of
 * the four make claims a user would act on — an expiring compliance document
 * and a credit allocation.
 *
 * Until a notification store exists, the honest answer is an empty feed. The
 * list stays wired so the store can be dropped in here without touching the
 * client.
 */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;

  return (
    <NotificationsClient
      initialNotifications={[]}
      locale={locale}
      workspace={workspace}
    />
  );
}
