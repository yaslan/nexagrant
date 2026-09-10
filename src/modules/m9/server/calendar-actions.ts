'use server';

import { requireTenantAction } from '@/lib/tenant';
import { withTenant } from '@/lib/db';
import { CalendarProviderSchema, type CalendarProviderType } from '@/lib/calendar/provider';
import { CalendarActionError, SELF_SERVE_PROVIDERS } from '@/lib/calendar/errors';

/**
 * M9 calendar connections.
 *
 * TASK-MTQUTBH8Q9VMK — "the connect flow is never visible". Two halves of the
 * same problem:
 *
 *   • The settings screen's Connect button ran `console.log('Connecting to …')`
 *     and nothing else, so a click spun the button and left no trace.
 *   • This action, when it was called at all, created a `CalendarConnection`
 *     row with `isConnected: false`, no token and no external id, and returned
 *     `{ success: true }`. Nothing was connected; the caller was told it was.
 *
 * What is actually true today: `.ics` works without any authorisation — the
 * user downloads the file from the brief screen — while Google and Outlook have
 * no OAuth client configured and no `/api/calendar/callback` route to come back
 * to (`find src/app/api -ipath '*calendar*'` returns nothing). So `ics` really
 * connects, and the other two refuse with a code the UI can translate rather
 * than storing a row that claims otherwise.
 */

export async function disconnectCalendar(connectionId: string) {
  const { tenantId, userId } = await requireTenantAction();

  return withTenant(tenantId, async (tx) => {
    const connection = await tx.calendarConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new CalendarActionError('CALENDAR_CONNECTION_NOT_FOUND');
    }

    if (connection.tenantId !== tenantId || connection.userId !== userId) {
      throw new CalendarActionError('CALENDAR_FORBIDDEN');
    }

    // `deleteMany` with the owner in the `where`, not `delete({ where: { id } })`:
    // the check above reads the row and the delete writes it, and only the
    // predicate that travels *with the write* is enforced by the database. The
    // JS check stays — it is what produces the translatable CALENDAR_FORBIDDEN
    // the screen shows — but it is no longer the only thing standing between a
    // foreign `connectionId` and a deleted row (TASK-MTSZ0AL4QP2CT §3.9).
    const { count } = await tx.calendarConnection.deleteMany({
      where: { id: connectionId, tenantId, userId },
    });

    if (count === 0) {
      // Reachable only if the row was removed between the read and the write,
      // which is exactly when `delete({ where: { id } })` used to raise Prisma
      // P2025. That error carried no CALENDAR_* code, so `calendarErrorCode`
      // returned null and the screen showed `errors.unknown`. This message
      // carries no code either, so the user-visible outcome is unchanged.
      throw new Error('Calendar connection delete matched no row');
    }

    return { success: true };
  });
}

/**
 * Returns the row it created. `isConnected` is true only when the connection is
 * usable now, with no further step — never a placeholder.
 */
export async function connectCalendar(
  provider: string
): Promise<{ connectionId: string; provider: CalendarProviderType; isConnected: boolean }> {
  const { tenantId, userId } = await requireTenantAction();

  const parsed = CalendarProviderSchema.safeParse(provider);
  if (!parsed.success) {
    throw new CalendarActionError('CALENDAR_UNKNOWN_PROVIDER');
  }
  const providerType = parsed.data;

  if (!SELF_SERVE_PROVIDERS.includes(providerType)) {
    // No client id, no callback route, no token exchange. Refuse rather than
    // record a connection that will never carry an event.
    throw new CalendarActionError('CALENDAR_OAUTH_NOT_CONFIGURED');
  }

  return withTenant(tenantId, async (tx) => {
    const existing = await tx.calendarConnection.findUnique({
      where: { tenantId_userId_provider: { tenantId, userId, provider: providerType } },
    });

    if (existing) {
      throw new CalendarActionError('CALENDAR_ALREADY_CONNECTED');
    }

    const connection = await tx.calendarConnection.create({
      data: {
        tenantId,
        userId,
        provider: providerType,
        // `.ics` needs no authorisation step, so this row is true the moment it
        // is written. It used to be `false` under a `{ success: true }`.
        isConnected: true,
        externalId: null,
        accessToken: null,
        refreshToken: null,
      },
    });

    return {
      connectionId: connection.id,
      provider: providerType,
      isConnected: connection.isConnected,
    };
  });
}
