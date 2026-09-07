import { PrismaClient } from '@prisma/client';
import { CalendarEvent } from './provider';
import { createCalendarProvider } from './factory';
import type { CalendarProviderType } from './provider';

/**
 * Sync a meeting brief to all enabled calendar providers for a tenant user.
 * On error, creates a SystemAlert instead of throwing.
 */
export async function syncMeetingBriefToCalendar(
  tx: PrismaClient,
  tenantId: string,
  userId: string,
  brief: {
    id: string;
    partnerName: string;
    content: string;
    meetingScheduledAt: Date | null;
    meetingScheduledTz: string;
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
    } catch (error: any) {
      // Sync error: create SystemAlert instead of breaking the flow
      await tx.systemAlert.create({
        data: {
          severity: 'warning',
          type: 'calendar_sync_failed',
          message: `Calendar sync failed for provider ${conn.provider}: ${error.message}`,
          sourceModule: 'M9',
          metadata: {
            tenantId,
            userId,
            briefId: brief.id,
            provider: conn.provider,
            error: error.message,
          },
        },
      });
    }
  }
}
