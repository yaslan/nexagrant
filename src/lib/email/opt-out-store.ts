import { withSystemScope } from '@/lib/system-scope';
import { emailOptOutHash, type OptOutPayload } from './opt-out';

/**
 * The record of who opted out (NG-42), in `AuditEvent`, with
 * `target` = the address hash. Never the address.
 *
 * An unsubscribe has `tenantId` NULL because it binds every tenant; a decline
 * carries the tenant it was given to. NULL-tenant rows are invisible to a
 * tenant session (prisma/rls.sql), so both directions go through the system
 * scope: the recipient has no account, and what is being looked up is that
 * data subject's own choice.
 *
 * `AuditEvent` until the outbox of DV-07 exists; no job deletes from it.
 */

export const EMAIL_UNSUBSCRIBED = 'email.unsubscribed';
export const EMAIL_DECLINED = 'email.declined';

/** Records the choice once. A second click, or the mail client's retry, adds nothing. */
export async function recordOptOut(payload: OptOutPayload): Promise<void> {
  const unsubscribe = payload.kind === 'unsubscribe';
  const type = unsubscribe ? EMAIL_UNSUBSCRIBED : EMAIL_DECLINED;
  const tenantId = unsubscribe ? null : payload.tenantId;
  try {
    await withSystemScope('subject-scoped', 'email.opt-out.record', async (tx) => {
      const existing = await tx.auditEvent.findFirst({
        where: { tenantId, type, target: payload.hash },
        select: { id: true },
      });
      if (existing) return;
      await tx.auditEvent.create({ data: { tenantId, type, target: payload.hash, data: { source: payload.source } } });
    });
  } catch (error) {
    // The organisation was deleted after the mail went out: there is no one
    // left to decline, and the recipient must not see an error for it.
    if ((error as { code?: unknown }).code === 'P2003') return;
    throw error;
  }
}

/** Whether a first message to `email` on behalf of `tenantId` must not be sent. */
export async function isEmailOptedOut(email: string, tenantId: string): Promise<boolean> {
  const target = emailOptOutHash(email);
  const row = await withSystemScope('subject-scoped', 'email.opt-out.check', (tx) =>
    tx.auditEvent.findFirst({
      where: {
        OR: [
          { tenantId: null, type: EMAIL_UNSUBSCRIBED, target },
          { tenantId, type: EMAIL_DECLINED, target },
        ],
      },
      select: { id: true },
    })
  );
  return row !== null;
}
