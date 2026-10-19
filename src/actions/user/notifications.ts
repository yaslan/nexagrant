'use server';

import { auth } from '@/lib/auth';
import { withTenant } from '@/lib/db';
import { assertTenant, requireTenantAction, TenantScopeError } from '@/lib/tenant';
import {
  InvalidMarkReadTargetError,
  listNotificationsFor,
  markNotificationsReadFor,
  parseMarkReadTarget,
  type MarkReadTarget,
  type NotificationList,
} from '@/lib/notifications/store';

/**
 * The bell's and /notifications' server side (ADR-0011 §3.3, TASK-MUVR24EHWI2RA).
 *
 * Tenant and user come from the session, never from an argument: the tenant
 * sets `app.tenant_id` (RLS), the user is the `userId` filter in every query of
 * src/lib/notifications/store.ts. There is no client-side read state to merge;
 * `readAt` is the only truth.
 */

export type ListNotificationsResult =
  | ({ ok: true } & NotificationList)
  | { ok: false; error: 'unauthorized' | 'list_failed' };

export type MarkNotificationsReadResult =
  | { ok: true; updated: number }
  | { ok: false; error: 'unauthorized' | 'invalid_ids' | 'mark_failed' };

/** The signed-in user's newest notifications (default 50, at most 100) and unread count. */
export async function listNotifications(opts?: { limit?: number }): Promise<ListNotificationsResult> {
  let tenantId: string;
  let userId: string;
  try {
    ({ tenantId, userId } = await requireTenantAction({ readOnly: true }));
  } catch (error) {
    if (error instanceof TenantScopeError) return { ok: false, error: 'unauthorized' };
    throw error;
  }
  try {
    const list = await withTenant(tenantId, (tx) => listNotificationsFor(tx, tenantId, userId, opts?.limit));
    return { ok: true, ...list };
  } catch (error) {
    console.error('[notifications][list]', error);
    return { ok: false, error: 'list_failed' };
  }
}

/**
 * Marks the signed-in user's notifications read: the ids given, or `'all'`.
 * Ids of another user or tenant match nothing; `updated` counts what changed.
 *
 * No role check and no pilot gate (ALLOWED in tests/server-action-rbac-guard.test.ts):
 * the rows are the caller's own read state, every role has a bell, and an
 * expired pilot must still be able to clear it.
 */
export async function markNotificationsRead(ids: MarkReadTarget): Promise<MarkNotificationsReadResult> {
  let tenantId: string;
  let userId: string;
  try {
    ({ tenantId, userId } = assertTenant((await auth()) as Parameters<typeof assertTenant>[0]));
  } catch (error) {
    if (error instanceof TenantScopeError) return { ok: false, error: 'unauthorized' };
    throw error;
  }
  let target: MarkReadTarget;
  try {
    target = parseMarkReadTarget(ids);
  } catch (error) {
    if (error instanceof InvalidMarkReadTargetError) return { ok: false, error: 'invalid_ids' };
    throw error;
  }
  try {
    const updated = await withTenant(tenantId, (tx) => markNotificationsReadFor(tx, tenantId, userId, target));
    return { ok: true, updated };
  } catch (error) {
    console.error('[notifications][markRead]', error);
    return { ok: false, error: 'mark_failed' };
  }
}
