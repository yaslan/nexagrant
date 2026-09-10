import { CalendarEvent } from './provider';
import { createCalendarProvider } from './factory';
import type { CalendarProviderType } from './provider';
import type { TenantTx } from '@/lib/db';
import { recordAlert } from '@/lib/observability/system-alert';
import { encryptCalendarToken, decryptCalendarToken } from './encryption';

export { encryptCalendarToken, decryptCalendarToken } from './encryption';

/**
 * Decrypts accessToken and refreshToken from a CalendarConnection record.
 * Throws CalendarEncryptionNotConfiguredError (503) if CALENDAR_ENCRYPTION_KEY is unset and tokens exist.
 */
export function getDecryptedCalendarTokens(conn: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: conn.accessToken ? decryptCalendarToken(conn.accessToken) : null,
    refreshToken: conn.refreshToken ? decryptCalendarToken(conn.refreshToken) : null,
  };
}

/**
 * Save or update calendar tokens for a connection using AES-256-GCM encryption.
 * Encrypts accessToken and refreshToken into "fkenc1:..." envelopes before writing to DB.
 * If CALENDAR_ENCRYPTION_KEY is unset, throws CalendarEncryptionNotConfiguredError (503).
 */
export async function saveCalendarConnectionTokens(
  tx: TenantTx,
  connectionId: string,
  tokens: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
  }
): Promise<void> {
  const updateData: {
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
  } = {};

  if (tokens.accessToken !== undefined) {
    updateData.accessToken = tokens.accessToken
      ? encryptCalendarToken(tokens.accessToken)
      : null;
  }

  if (tokens.refreshToken !== undefined) {
    updateData.refreshToken = tokens.refreshToken
      ? encryptCalendarToken(tokens.refreshToken)
      : null;
  }

  if (tokens.tokenExpiresAt !== undefined) {
    updateData.tokenExpiresAt = tokens.tokenExpiresAt;
  }

  await tx.calendarConnection.update({
    where: { id: connectionId },
    data: updateData,
  });
}

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
      let decryptedAccessToken: string | null = null;
      let decryptedRefreshToken: string | null = null;

      if (conn.accessToken) {
        decryptedAccessToken = decryptCalendarToken(conn.accessToken);
      }
      if (conn.refreshToken) {
        decryptedRefreshToken = decryptCalendarToken(conn.refreshToken);
      }

      const provider = createCalendarProvider(conn.provider as CalendarProviderType, {
        accessToken: decryptedAccessToken ?? undefined,
        refreshToken: decryptedRefreshToken ?? undefined,
      });
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
        // Keyed on the connection, which is exactly where the over-folding
        // trap is avoided: `CalendarConnection` is tenant-scoped, so two
        // tenants with expired tokens stay two alerts, while one expired token
        // stops opening a row per brief it is synced into. `briefId` and the
        // provider error text are the per-occurrence halves.
        dedupeKey: `calendar-sync-failed:${conn.id}`,
      });
    }
  }
}
