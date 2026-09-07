import { CalendarEvent } from './provider';
import { createCalendarProvider } from './factory';
import type { CalendarProviderType } from './provider';
import type { TenantTx } from '@/lib/db';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * Sync a meeting brief to all enabled calendar providers for a tenant user.
 * On error, creates a SystemAlert instead of throwing.
 */
export async function syncMeetingBriefToCalendar(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  // partnerName and meetingScheduledTz are nullable columns on MeetingBrief;
  // the parameter used to claim otherwise while the caller passed `any`.
  brief: {
    id: string;
    partnerName: string | null;
    content: string;
    meetingScheduledAt: Date | null;
    meetingScheduledTz: string | null;
  }
): Promise<void> {
  if (!brief.meetingScheduledAt) {
    // No meeting scheduled; skip sync
    return;
  }

  const connections = await tx.calendarConnection.findMany({
    where: {
      tenantId,
      userId,
      isConnected: true,
    },
  });

  if (!connections.length) {
    // No connected calendars; nothing to sync
    return;
  }

  const event: CalendarEvent = {
    // partnerName is nullable; an unnamed partner produced the title
    // "Meeting: null" on the user's calendar.
    title: brief.partnerName ? `Meeting: ${brief.partnerName}` : 'Meeting',
    description: brief.content.slice(0, 500), // Truncate for calendar description
    start: brief.meetingScheduledAt,
    end: new Date(brief.meetingScheduledAt.getTime() + 60 * 60 * 1000), // 1-hour meeting
    externalId: `fabrika-brief-${brief.id}`,
  };

  for (const conn of connections) {
    try {
      const provider = createCalendarProvider(conn.provider as CalendarProviderType);
      const result = await provider.createEvent(event);

      // Update connection metadata
      await tx.calendarConnection.update({
        where: { id: conn.id },
        data: {
          externalId: result.externalId,
          lastSyncAt: new Date(),
        },
      });
    } catch (error) {
      // Sync error: record a SystemAlert instead of breaking the flow.
      //
      // This used to write `tx.systemAlert.create({ severity, type,
      // sourceModule, metadata })`. `SystemAlert` has none of those columns —
      // it is `level, source, message, meta` — so Prisma rejected every one of
      // these writes with a PrismaClientValidationError, which then escaped the
      // catch block. No calendar failure was ever recorded. The mocked unit
      // test could not see it; only the real client can.
      //
      // `recordAlert` writes on the singleton, not `tx`, on purpose: the caller
      // runs this inside a transaction, and an alert about a failure must not
      // disappear when that transaction rolls back. It never throws.
      //
      // No tenantId or userId in `meta` — `SystemAlert` has no RLS policy (see
      // system-alert.ts). The brief and connection ids are the tenant-scoped
      // handles a platform admin can join back.
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await recordAlert({
        level: 'warn',
        source: 'calendar_sync_failed',
        message: `Calendar sync failed for provider ${conn.provider}: ${errorMessage}`,
        meta: {
          module: 'M9',
          briefId: brief.id,
          connectionId: conn.id,
          provider: conn.provider,
        },
      });
    }
  }
}
