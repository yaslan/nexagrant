import crypto from 'node:crypto';
import type { TenantTx } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * How often POST /api/invitations may actually send mail (TASK-MUMO2XIQEHGUD,
 * B-1 of TASK-MUMMERMBJF1LM).
 *
 * Re-inviting a pending address does not take a seat (seat-limit.ts counts
 * pending invitations `NOT: { email }`), and registration hands every sign-up
 * a tenant whose name it chooses. Without a limit, anyone could loop the route
 * and have our own SMTP account and domain mail a victim without end, with a
 * subject line they wrote. Two limits close that:
 *
 *   • per invitation: no second mail within {@link INVITATION_MAIL_COOLDOWN_MS};
 *   • per tenant: at most {@link INVITATION_MAIL_DAILY_LIMIT} mails in any 24 h.
 *
 * Both are counted from `AuditEvent` rows the route writes before each send
 * (`invitation.email_sent`, target = invitation id, never the address), so no
 * schema change was needed: the table already has the (tenantId, createdAt)
 * index and a tenant-scoped RLS policy. A send the SMTP server refused gets an
 * `invitation.email_failed` row after it; that ends the cooldown (the inviter
 * may retry at once) but still counts toward the daily limit, which counts
 * attempts, not deliveries.
 *
 * Skipping the mail never blocks the invitation. On `daily_limit` the route
 * rotates the token and returns the link, with `emailSent: false` and the
 * reason. On `recently_sent` it keeps the token, so the link in the mail that
 * just went out stays valid, and returns no link (İNCELEME-26 Ö-1). If that
 * re-invite asks for another role, the row is left as mailed and the response
 * says `role_change_blocked` (İNCELEME-32 Ö-1).
 */

export const INVITATION_MAIL_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * 50 mails per tenant per rolling 24 h. The largest self-serve plan has 15
 * seats (src/lib/billing/catalog.ts); inviting all of them, then resending to
 * each one twice, is 45. A legitimate tenant does not get near 50 in a day,
 * while an abusive one is held to 50 per tenant it registers instead of an
 * unbounded stream. A tenant that hits it gets a warning SystemAlert.
 */
export const INVITATION_MAIL_DAILY_LIMIT = 50;

export const INVITATION_MAIL_SENT = 'invitation.email_sent';
export const INVITATION_MAIL_FAILED = 'invitation.email_failed';
/**
 * A re-invite within the cooldown that asked for a different role (İNCELEME-32
 * Ö-1). The mailed link keeps the role it was sent with; this row records who
 * tried to change it (actorId), on which invitation (target) and from/to which
 * role (data). Never the address. The limits above do not count it.
 */
export const INVITATION_ROLE_CHANGE_BLOCKED = 'invitation.role_change_blocked';

export type InvitationMailSkip = 'recently_sent' | 'daily_limit';

/**
 * Serialises invitation mail decisions per tenant for the rest of the
 * transaction, so two concurrent POSTs cannot both read "under the limit"
 * before either has written its row.
 */
export async function lockInvitationMail(tx: TenantTx, tenantId: string): Promise<void> {
  const key = crypto.createHash('sha256').update(`invitation-mail:${tenantId}`).digest().readBigInt64BE(0);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}

/**
 * Whether a mail may go out for this invitation now. `invitationId` is the
 * existing invitation for the address, or null for a first invitation (which
 * cannot be cooling down). Call {@link lockInvitationMail} first.
 */
export async function invitationMailSkipReason(
  tx: TenantTx,
  tenantId: string,
  invitationId: string | null,
  now: Date = new Date()
): Promise<InvitationMailSkip | null> {
  if (invitationId) {
    const latest = await tx.auditEvent.findFirst({
      where: {
        tenantId,
        target: invitationId,
        type: { in: [INVITATION_MAIL_SENT, INVITATION_MAIL_FAILED] },
        createdAt: { gt: new Date(now.getTime() - INVITATION_MAIL_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });
    if (latest?.type === INVITATION_MAIL_SENT) return 'recently_sent';
  }

  const sentToday = await tx.auditEvent.count({
    where: {
      tenantId,
      type: INVITATION_MAIL_SENT,
      createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    },
  });
  if (sentToday >= INVITATION_MAIL_DAILY_LIMIT) return 'daily_limit';

  return null;
}

/**
 * The base URL an invitation link may be mailed with, or null when there is
 * none (K-3 of TASK-MUMMERMBJF1LM). The route used to fall back to
 * `http://localhost:3000`, which in production put a dead localhost link into
 * the invitee's inbox. Now: unset or blank → null everywhere; in production a
 * loopback host is null as well. A loopback URL set on purpose in development
 * (mailpit) is allowed.
 */
export function invitationMailBaseUrl(source: Pick<typeof env, 'NODE_ENV' | 'NEXT_PUBLIC_APP_URL'> = env): string | null {
  const raw = source.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (source.NODE_ENV === 'production' && isLoopback(url.hostname)) return null;
  return raw.replace(/\/+$/, '');
}

function isLoopback(hostname: string): boolean {
  // `localhost.` (a trailing root dot) resolves like `localhost` (İNCELEME-26 Ö-3).
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h.startsWith('127.') ||
    // IPv4-mapped loopback: WHATWG URL writes [::ffff:127.0.0.1] as [::ffff:7f00:1].
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(h)
  );
}
