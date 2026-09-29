import type { TenantTx } from '@/lib/db';

/** The MeetingBrief columns the briefs page shows. */
export const BRIEF_LIST_SELECT = {
  id: true,
  interactionId: true,
  partnerName: true,
  content: true,
  meetingScheduledAt: true,
  meetingScheduledTz: true,
  createdAt: true,
} as const;

/**
 * The two lists /opportunities/[id]/briefs shows (ROADMAP open decision #14,
 * TASK-MULQLQIE3ES6G):
 *
 * - `linked` — briefs prepared for this opportunity;
 * - `unlinked` — the tenant's briefs linked to no opportunity, i.e. every brief
 *   written before add-meeting-brief-opportunity.sql. Shown under their own
 *   heading so an old brief is neither lost nor passed off as this
 *   opportunity's.
 *
 * Briefs of the tenant's other opportunities are in neither list. Both reads
 * are matched on `tenantId` as well as run under `withTenant`, because the app
 * connection bypasses RLS (ROADMAP open decision #16).
 */
export async function listBriefsForOpportunity(tx: TenantTx, tenantId: string, opportunityId: string) {
  const [linked, unlinked] = await Promise.all([
    tx.meetingBrief.findMany({
      select: BRIEF_LIST_SELECT,
      where: { tenantId, opportunityId },
      orderBy: { createdAt: 'desc' },
    }),
    tx.meetingBrief.findMany({
      select: BRIEF_LIST_SELECT,
      where: { tenantId, opportunityId: null },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return { linked, unlinked };
}
