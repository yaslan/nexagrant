import type { NotificationType } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { isPresentId, requireActionId } from '@/lib/required-id';

/**
 * The notification store (ADR-0011, TASK-MUVR24EHWI2RA).
 *
 * Every function here takes a `TenantTx`, so `app.tenant_id` is already set and
 * the `tenant_isolation` policy decides which tenant's rows exist at all. The
 * user is the application's job (K-5 a): every read and write below carries
 * `userId` in its `where`, the same way SavedSearch does. A function that took
 * a notification id without the user would let one member of a tenant read or
 * mark another member's notifications.
 */

/** Rows a bell or page asks for at most. */
export const NOTIFICATION_LIST_MAX = 100;
export const NOTIFICATION_LIST_DEFAULT = 50;
/** Ids one markNotificationsRead call may name. The bell never shows more than the list max. */
export const MARK_READ_MAX_IDS = NOTIFICATION_LIST_MAX;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  /** Ids and counts only, never text; the UI renders the text from type + payload. */
  payload: Record<string, unknown>;
  workspaceId: string | null;
  createdAt: string;
  /** ISO time the recipient read it; null = unread. */
  readAt: string | null;
}

export interface NotificationList {
  notifications: NotificationItem[];
  /** Over every unread row of the user, not only the ones in `notifications`. */
  unreadCount: number;
}

function clampLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) return NOTIFICATION_LIST_DEFAULT;
  return Math.min(limit, NOTIFICATION_LIST_MAX);
}

function asPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The user's newest notifications, newest first, and their unread count. */
export async function listNotificationsFor(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  limit?: number
): Promise<NotificationList> {
  const where = { tenantId, userId };
  const [rows, unreadCount] = await Promise.all([
    tx.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: clampLimit(limit),
      select: { id: true, type: true, payload: true, workspaceId: true, createdAt: true, readAt: true },
    }),
    tx.notification.count({ where: { ...where, readAt: null } }),
  ]);
  return {
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: asPayload(r.payload),
      workspaceId: r.workspaceId,
      createdAt: r.createdAt.toISOString(),
      readAt: r.readAt ? r.readAt.toISOString() : null,
    })),
    unreadCount,
  };
}

/** Which rows a mark-read call names: some ids, or every unread row of the user. */
export type MarkReadTarget = string[] | 'all';

/** Thrown for a target that is neither `'all'` nor a list of present ids. */
export class InvalidMarkReadTargetError extends Error {
  readonly code = 'INVALID_MARK_READ_TARGET';
  constructor(reason: string) {
    super(`markNotificationsRead: ${reason}`);
    this.name = 'InvalidMarkReadTargetError';
  }
}

/**
 * The ids, checked: a server action's argument arrives from the client whatever
 * its type says, and an `undefined` inside `{ in: [...] }` or a missing list
 * must never widen the update (src/lib/required-id.ts).
 */
export function parseMarkReadTarget(target: unknown): MarkReadTarget {
  if (target === 'all') return 'all';
  if (!Array.isArray(target)) throw new InvalidMarkReadTargetError('expected an id list or "all"');
  if (target.length > MARK_READ_MAX_IDS) throw new InvalidMarkReadTargetError(`more than ${MARK_READ_MAX_IDS} ids`);
  if (!target.every(isPresentId)) throw new InvalidMarkReadTargetError('every id must be a non-empty string');
  return [...new Set(target)];
}

/**
 * Sets `readAt` on the user's unread rows the target names and returns how many
 * changed. A row already read keeps its first `readAt`; an id that is another
 * user's, another tenant's or does not exist matches nothing and is not an
 * error (the count says so).
 */
export async function markNotificationsReadFor(
  tx: TenantTx,
  tenantId: string,
  userId: string,
  target: MarkReadTarget,
  now: Date = new Date()
): Promise<number> {
  // Both are the session's (the action's only caller), checked again here so
  // a future caller that hands an empty user cannot widen the update to the
  // whole tenant.
  requireActionId(tenantId, 'tenantId');
  requireActionId(userId, 'userId');
  if (target === 'all') {
    const all = await tx.notification.updateMany({
      where: { tenantId, userId, readAt: null },
      data: { readAt: now },
    });
    return all.count;
  }
  const ids = parseMarkReadTarget(target);
  if (ids === 'all' || ids.length === 0) return 0;
  const some = await tx.notification.updateMany({
    where: { tenantId, userId, readAt: null, id: { in: ids } },
    data: { readAt: now },
  });
  return some.count;
}

export interface NewNotification {
  tenantId: string;
  userId: string;
  type: NotificationType;
  payload: Record<string, string | number | boolean | null>;
  workspaceId?: string | null;
  /** Same key for the same recipient → the second write is skipped. */
  dedupeKey?: string | null;
}

/**
 * Writes one notification, or nothing when a row with the same
 * (tenantId, userId, dedupeKey) already exists. Returns whether it wrote.
 * `ON CONFLICT DO NOTHING` (skipDuplicates) rather than read-then-write, so two
 * concurrent runs of the same producer cannot both pass a check.
 */
export async function recordNotification(tx: TenantTx, input: NewNotification): Promise<boolean> {
  const { count } = await tx.notification.createMany({
    data: [
      {
        tenantId: input.tenantId,
        userId: input.userId,
        type: input.type,
        payload: input.payload,
        workspaceId: input.workspaceId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return count > 0;
}

/**
 * {@link recordNotification} for many rows in one `INSERT … ON CONFLICT DO
 * NOTHING`. Returns how many were written; the rest already existed. A producer
 * that writes one row per recipient and document uses this, so a large tenant is
 * one statement per page instead of one round trip per row.
 */
export async function recordNotifications(tx: TenantTx, inputs: readonly NewNotification[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const { count } = await tx.notification.createMany({
    data: inputs.map((input) => ({
      tenantId: input.tenantId,
      userId: input.userId,
      type: input.type,
      payload: input.payload,
      workspaceId: input.workspaceId ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * The saved-search alert's key: one notification per search and window start.
 * alerts-daily keeps `lastRunAt` where it was when the mail fails, so the next
 * run counts the same window again with the same `since` and writes nothing.
 */
export function savedSearchDedupeKey(searchId: string, since: Date): string {
  return `saved-search:${searchId}:${since.toISOString()}`;
}

/**
 * The evidence-expiring key: one notification per document and expiry date
 * (TASK-MUVR7HQQZVA2Z). A renewed document gets a new `validUntil`, so a new
 * key, and is warned again when the new date comes near.
 */
export function evidenceExpiringDedupeKey(evidenceId: string, validUntil: Date): string {
  return `evidence-expiring:${evidenceId}:${validUntil.toISOString()}`;
}
