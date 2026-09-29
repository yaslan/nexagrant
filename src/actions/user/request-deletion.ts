'use server';

import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { prisma, withTenant } from '@/lib/db';
import { withSystemScope } from '@/lib/system-scope';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * KVKK md.7 & md.11 / GDPR art.17 — right to erasure.
 *
 * A deletion request marks the account soft-deleted and starts a 30-day grace
 * period. Nothing is destroyed here: memberships and owned rows stay intact so
 * the subject can cancel within the window. The scheduled purge job
 * (`usersScheduledDeletion`) performs the irreversible delete once the window
 * closes.
 */

// Not exported: a "use server" module may only export async functions.
const DELETION_GRACE_PERIOD_DAYS = 30;

export interface DeletionRequestResult {
  success: boolean;
  /** 'pending' once the grace period has started */
  status?: 'pending';
  /** ISO-8601 timestamp of the scheduled permanent deletion */
  deletedAt?: string;
  /** Set when the subject is the only owner of a tenant that will be left without one */
  soleOwnerOf?: string[];
  error?: string;
}

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  if (!resendClient && env.RESEND_API_KEY) {
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function requestAccountDeletion(): Promise<DeletionRequestResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // `User` carries no tenantId and no policy, but `memberships` is a NESTED
    // read of the tenant-scoped Membership table — and a nested read obeys RLS
    // exactly like a top-level one. Outside a scope it comes back as `[]`, so
    // the sole-owner warning below silently stops warning. The gate cannot see
    // this shape at all: CHECK A matches on the accessor (`prisma.user.…`),
    // which names a model it does not police. See §5 of this card's report.
    const user = await withSystemScope('subject-scoped', 'request-deletion.subjectAndMemberships', (tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          deletionRequestedAt: true,
          memberships: { select: { tenantId: true, role: true } },
        },
      })
    );

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.deletionRequestedAt) {
      // Idempotent: an existing request keeps its original deadline.
      return {
        success: true,
        status: 'pending',
        deletedAt: addDays(user.deletionRequestedAt, DELETION_GRACE_PERIOD_DAYS).toISOString(),
      };
    }

    // Warn (do not block) when the subject is the last owner of a tenant. The
    // question is per-tenant but asked for EVERY tenant the subject is in, so it
    // cannot sit inside one scope. One system scope around the whole loop rather
    // than one per iteration: N tenants must not mean N transactions.
    const soleOwnerOf = await withSystemScope(
      'subject-scoped',
      'request-deletion.soleOwnerCheck',
      async (tx) => {
        const owned: string[] = [];
        for (const membership of user.memberships) {
          if (membership.role !== 'TENANT_OWNER') continue;
          const otherOwners = await tx.membership.count({
            where: {
              tenantId: membership.tenantId,
              role: 'TENANT_OWNER',
              userId: { not: userId },
            },
          });
          if (otherOwners === 0) owned.push(membership.tenantId);
        }
        return owned;
      }
    );

    const requestedAt = new Date();
    await prisma.user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: requestedAt,
        deletedAt: requestedAt,
        deletionReason: 'subject_request',
      },
    });

    const purgeAt = addDays(requestedAt, DELETION_GRACE_PERIOD_DAYS);

    await recordErasureAudit(
      userId,
      user.memberships.map((m: { tenantId: string }) => m.tenantId),
      'user.erasure.requested',
      { requestedAt: requestedAt.toISOString(), purgeAt: purgeAt.toISOString() }
    );

    await notifySubject(user.email, user.locale, purgeAt);

    const result: DeletionRequestResult = {
      success: true,
      status: 'pending',
      deletedAt: purgeAt.toISOString(),
    };
    if (soleOwnerOf.length > 0) result.soleOwnerOf = soleOwnerOf;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request deletion';
    console.error('[request-deletion]', message);
    return { success: false, error: message };
  }
}

/** Cancels a pending deletion during the grace period and restores the account. */
export async function cancelAccountDeletion(): Promise<DeletionRequestResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return { success: false, error: 'Unauthorized' };
    }

    // Lists the subject's tenants so each one can be revalidated after the
    // cancellation. Scoped by userId across all of them, so there is no single
    // tenant to run it in.
    const memberships = await withSystemScope(
      'subject-scoped',
      'cancel-deletion.subjectTenants',
      (tx) => tx.membership.findMany({ where: { userId }, select: { tenantId: true } })
    );

    await prisma.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null, deletedAt: null, deletionReason: null },
    });

    await recordErasureAudit(
      userId,
      memberships.map((m: { tenantId: string }) => m.tenantId),
      'user.erasure.cancelled',
      { cancelledAt: new Date().toISOString() }
    );

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to cancel deletion';
    console.error('[cancel-deletion]', message);
    return { success: false, error: message };
  }
}

/** Reads the current erasure state for the signed-in subject. */
export async function getDeletionStatus(): Promise<{
  pending: boolean;
  requestedAt?: string;
  purgeAt?: string;
}> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { pending: false };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deletionRequestedAt: true },
  });

  if (!user?.deletionRequestedAt) return { pending: false };

  return {
    pending: true,
    requestedAt: user.deletionRequestedAt.toISOString(),
    purgeAt: addDays(user.deletionRequestedAt, DELETION_GRACE_PERIOD_DAYS).toISOString(),
  };
}

function addDays(from: Date, days: number): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Best-effort confirmation email; delivery failure must not fail the request. */
async function notifySubject(email: string, locale: string, purgeAt: Date): Promise<void> {
  const client = getResend();
  if (!client || !env.RESEND_API_KEY) return;

  const isTr = locale === 'tr';
  const formatted = purgeAt.toISOString().split('T')[0];

  try {
    // resend v6 resolves `{ error }` on an API failure instead of throwing
    // (TASK-MUMH6NZ128QZ1), so the catch below alone never saw a refusal.
    const { error } = await client.emails.send({
      from: `${PRODUCT_NAME} <${env.NEXT_PUBLIC_SMTP_FROM_ADDRESS}>`,
      to: email,
      subject: isTr ? 'Hesap silme talebiniz alındı' : 'Your account deletion request',
      text: isTr
        ? `Hesabınız ${formatted} tarihinde kalıcı olarak silinecektir. Bu tarihe kadar giriş yapıp talebi iptal edebilirsiniz.`
        : `Your account will be permanently deleted on ${formatted}. You can sign in and cancel the request until then.`,
    });
    if (error) console.warn('[request-deletion] notification email refused:', error.name);
  } catch (error) {
    console.warn('[request-deletion] notification email failed:', error);
  }
}

/**
 * GDPR art.5(2) — an erasure request and its withdrawal both have to be
 * demonstrable. Only the completed purge used to be audited, so a request made
 * and cancelled inside the grace period left no record that the subject had
 * ever exercised the right.
 *
 * Written per tenant the subject belongs to, matching `user.erased`, and the
 * subject is referenced by `sha256(userId)` so the row that survives the later
 * purge does not re-create the erased identifier.
 *
 * Best-effort: an audit failure must not block the subject's request.
 *
 * AuditEvent is under strict tenant_isolation (TASK-MULUJ8O4JH1PF): the
 * tenant-less row belongs to NO tenant, so it is written through system scope
 * and is readable only there — never by every tenant, as it was under the
 * shared policy. The per-tenant rows are written in that tenant's scope; bare
 * `prisma` had no tenant context and the policy's WITH CHECK refused them.
 */
async function recordErasureAudit(
  userId: string,
  tenantIds: string[],
  type: 'user.erasure.requested' | 'user.erasure.cancelled',
  extra: Record<string, string>
): Promise<void> {
  try {
    const subjectRef = createHash('sha256').update(userId).digest('hex');
    const data = { subjectRef, ...extra };
    const unique = [...new Set(tenantIds)];

    if (unique.length === 0) {
      await withSystemScope('subject-scoped', 'request-deletion.erasureAudit', (tx) =>
        tx.auditEvent.create({ data: { type, target: subjectRef, data } })
      );
      return;
    }

    for (const tenantId of unique) {
      await withTenant(tenantId, (tx) =>
        tx.auditEvent.create({ data: { tenantId, type, target: subjectRef, data } })
      );
    }
  } catch (error) {
    console.warn(`[request-deletion] audit write failed for ${type}:`, error);
  }
}
