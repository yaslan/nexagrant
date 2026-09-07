import { CalendarEvent } from './provider';
import { createCalendarProvider } from './factory';
import type { CalendarProviderType } from './provider';
import type { TenantTx } from '@/lib/db';

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
    title: `Meeting: ${brief.partnerName}`,
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
      // Sync error: create SystemAlert instead of breaking the flow
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await tx.systemAlert.create({
        data: {
          severity: 'warning',
          type: 'calendar_sync_failed',
          message: `Calendar sync failed for provider ${conn.provider}: ${errorMessage}`,
          sourceModule: 'M9',
          metadata: {
            tenantId,
            userId,
            briefId: brief.id,
            provider: conn.provider,
            error: errorMessage,
          },
        },
      });
    }
  }
}
