import { z } from 'zod';
import type {
  NotificationChannel,
  NotificationEvent,
  NotificationFrequency,
  NotificationType,
} from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { requireActionId } from '@/lib/required-id';
import { NOTIFICATION_EVENTS, eventOfType } from './events';
import { recordNotification, type NewNotification } from './store';

/**
 * Channel and frequency choice of the notification centre (spec §13, NG-43).
 *
 * "Kanal tercihi kullanıcı bazlı; haftalık özet ve anlık uyarı ayrı ayarlanır":
 * each §13 event has a frequency per channel. PANEL is the bell (a
 * `Notification` row): INSTANT or OFF. EMAIL is INSTANT (one mail per
 * notification), WEEKLY (one digest per user and week) or OFF. Both go through
 * the e-mail outbox (`NotificationEmailItem`, ./email-outbox.ts).
 *
 * Like ./store.ts, every function takes a `TenantTx` and carries `userId` in
 * its `where`: one member must not read or change another member's choice.
 */

export const NOTIFICATION_CHANNELS = ['PANEL', 'EMAIL'] as const satisfies readonly NotificationChannel[];

/** What each channel may be set to. Weekly is the §13 e-mail summary; the panel has no digest. */
export const CHANNEL_FREQUENCIES = {
  PANEL: ['INSTANT', 'OFF'],
  EMAIL: ['INSTANT', 'WEEKLY', 'OFF'],
} as const satisfies Record<NotificationChannel, readonly NotificationFrequency[]>;

/**
 * No row = this. The panel as before NG-43 (every notification in the bell);
 * no e-mail the user did not ask for. The saved-search mail of alerts-daily is
 * that search's own `notify` switch and is not governed here (yet).
 */
export const DEFAULT_FREQUENCY = {
  PANEL: 'INSTANT',
  EMAIL: 'OFF',
} as const satisfies Record<NotificationChannel, NotificationFrequency>;

export type Delivery = Record<NotificationChannel, NotificationFrequency>;

export interface PreferenceRow {
  event: NotificationEvent;
  channel: NotificationChannel;
  frequency: NotificationFrequency;
}

/** A user's delivery for one event: their rows over the defaults. */
export function resolveDelivery(rows: readonly PreferenceRow[], event: NotificationEvent): Delivery {
  const delivery: Delivery = { ...DEFAULT_FREQUENCY };
  for (const row of rows) {
    if (row.event === event && isAllowed(row.channel, row.frequency)) delivery[row.channel] = row.frequency;
  }
  return delivery;
}

/**
 * A stored type's delivery. A type outside §13 (credits) is not switchable:
 * panel only, whatever the rows say.
 */
export function deliveryForType(rows: readonly PreferenceRow[], type: NotificationType): Delivery {
  const event = eventOfType(type);
  if (!event) return { PANEL: 'INSTANT', EMAIL: 'OFF' };
  return resolveDelivery(rows, event);
}

function isAllowed(channel: NotificationChannel, frequency: NotificationFrequency): boolean {
  return (CHANNEL_FREQUENCIES[channel] as readonly NotificationFrequency[]).includes(frequency);
}

/** One choice, as a server action receives it (anything, from the client). */
export const PreferenceInputSchema = z
  .object({
    event: z.enum(NOTIFICATION_EVENTS),
    channel: z.enum(NOTIFICATION_CHANNELS),
    frequency: z.enum(['INSTANT', 'WEEKLY', 'OFF']),
  })
  .strict()
  .refine((p) => isAllowed(p.channel, p.frequency), {
    message: 'frequency not allowed for this channel',
    path: ['frequency'],
  });

export type PreferenceInput = z.infer<typeof PreferenceInputSchema>;

/** Every §13 event with its resolved delivery, in spec order: what a settings page shows. */
export interface PreferenceView {
  event: NotificationEvent;
  delivery: Delivery;
}

export async function listPreferenceRows(tx: TenantTx, tenantId: string, userId: string): Promise<PreferenceRow[]> {
  requireActionId(tenantId, 'tenantId');
  requireActionId(userId, 'userId');
  return tx.notificationPreference.findMany({
    where: { tenantId, userId },
    select: { event: true, channel: true, frequency: true },
  });
}

export async function getPreferencesFor(tx: TenantTx, tenantId: string, userId: string): Promise<PreferenceView[]> {
  const rows = await listPreferenceRows(tx, tenantId, userId);
  return NOTIFICATION_EVENTS.map((event) => ({ event, delivery: resolveDelivery(rows, event) }));
}

/** Sets one (event, channel) choice of the user. Throws ZodError on an invalid input. */
export async function setPreferenceFor(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  input: unknown
): Promise<PreferenceInput> {
  requireActionId(tenantId, 'tenantId');
  requireActionId(userId, 'userId');
  const p = PreferenceInputSchema.parse(input);
  await tx.notificationPreference.upsert({
    where: { tenantId_userId_event_channel: { tenantId, userId, event: p.event, channel: p.channel } },
    create: { tenantId, userId, event: p.event, channel: p.channel, frequency: p.frequency },
    update: { frequency: p.frequency },
  });
  return p;
}

export interface DispatchResult {
  /** A panel row was written (false also when it already existed: same dedupeKey). */
  panel: boolean;
  /** The e-mail outbox row's frequency, or null when none was queued. */
  email: 'INSTANT' | 'WEEKLY' | null;
}

/**
 * The one entry for a producer that respects the user's choice: the panel row
 * when PANEL is INSTANT, an outbox row when EMAIL is INSTANT or WEEKLY,
 * nothing when both are OFF. Same `dedupeKey` twice → written once per channel.
 */
export async function dispatchNotification(tx: TenantTx, input: NewNotification): Promise<DispatchResult> {
  requireActionId(input.tenantId, 'tenantId');
  requireActionId(input.userId, 'userId');
  const rows = eventOfType(input.type) ? await listPreferenceRows(tx, input.tenantId, input.userId) : [];
  const delivery = deliveryForType(rows, input.type);

  const panel = delivery.PANEL === 'INSTANT' ? await recordNotification(tx, input) : false;

  let email: DispatchResult['email'] = null;
  if (delivery.EMAIL === 'INSTANT' || delivery.EMAIL === 'WEEKLY') {
    const { count } = await tx.notificationEmailItem.createMany({
      data: [
        {
          tenantId: input.tenantId,
          userId: input.userId,
          type: input.type,
          payload: input.payload,
          frequency: delivery.EMAIL,
          dedupeKey: input.dedupeKey ?? null,
        },
      ],
      skipDuplicates: true,
    });
    if (count > 0) email = delivery.EMAIL;
  }
  return { panel, email };
}
