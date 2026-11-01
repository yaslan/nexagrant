'use server';

import { requireTenantAction } from '@/lib/tenant';
import { isPresentId } from '@/lib/required-id';
import { withTenant } from '@/lib/db';
import { CalendarProviderSchema, type CalendarProviderType } from '@/lib/calendar/provider';
import {
  calendarFailure,
  SELF_SERVE_PROVIDERS,
  type CalendarActionResult,
} from '@/lib/calendar/errors';

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
 * user downloads the file from the brief screen — while Google has no OAuth
 * client configured and no `/api/calendar/callback` route to come back to
 * (`find src/app/api -ipath '*calendar*'` returns nothing). So `ics` really
 * connects, and Google refuses with a code the UI can translate rather than
 * storing a row that claims otherwise. Outlook is not a provider at all (owner
 * decision 29.09, TASK-MUMMIHYY2F4KB) and is refused as CALENDAR_UNKNOWN_PROVIDER.
 *
 * Refusals are returned as `{ ok: false, code }`, never thrown: a production
 * build strips a thrown error's message on its way to the browser, so the code
 * the screen translates only survives as data (TASK-MUSFNYHSA49AB). The role
 * and pilot checks in `requireTenantAction` still throw — they travel by
 * `digest`, which production keeps.
 */

export async function disconnectCalendar(
  connectionId: string
): Promise<CalendarActionResult<{ success: true }>> {
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });
  if (!isPresentId(connectionId)) return calendarFailure('CALENDAR_CONNECTION_NOT_FOUND');

  return withTenant(tenantId, async (tx) => {
    const connection = await tx.calendarConnection.findUnique({
      where: { id: connectionId },
      select: { tenantId: true, userId: true },
    });

    if (!connection) {
      return calendarFailure('CALENDAR_CONNECTION_NOT_FOUND');
    }

    if (connection.tenantId !== tenantId || connection.userId !== userId) {
      return calendarFailure('CALENDAR_FORBIDDEN');
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

    return { ok: true, success: true };
  });
}

/**
 * Returns the row it created. `isConnected` is true only when the connection is
 * usable now, with no further step — never a placeholder.
 */
export async function connectCalendar(
  provider: string
): Promise<
  CalendarActionResult<{ connectionId: string; provider: CalendarProviderType; isConnected: boolean }>
> {
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const parsed = CalendarProviderSchema.safeParse(provider);
  if (!parsed.success) {
    return calendarFailure('CALENDAR_UNKNOWN_PROVIDER');
  }
  const providerType = parsed.data;

  if (!SELF_SERVE_PROVIDERS.includes(providerType)) {
    // No client id, no callback route, no token exchange. Refuse rather than
    // record a connection that will never carry an event.
    return calendarFailure('CALENDAR_OAUTH_NOT_CONFIGURED');
  }

  return withTenant(tenantId, async (tx) => {
    const existing = await tx.calendarConnection.findUnique({
      where: { tenantId_userId_provider: { tenantId, userId, provider: providerType } },
      select: { id: true },
    });

    if (existing) {
      return calendarFailure('CALENDAR_ALREADY_CONNECTED');
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
      // The row carries the OAuth tokens; this action only reports these two
      // (TASK-MUMT3KVHJTYX0, tests/secret-model-select-guard.test.ts).
      select: { id: true, isConnected: true },
    });

    return {
      ok: true,
      connectionId: connection.id,
      provider: providerType,
      isConnected: connection.isConnected,
    };
  });
}
