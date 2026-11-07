import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { withTenant } from '@/lib/db';
import { requireTenantApi } from '@/lib/tenant';
import { issueSecretToken } from '@/lib/secret-token';
import type { InvitationRow } from '@/types/db-rows';
import { assertSeatAvailable, SeatLimitReachedError, type SeatUsage } from '@/lib/billing/seat-limit';
import { reportMailNotConfigured, smtpMailer, type Mailer } from '@/lib/email/mailer';
import { renderInvitationEmail } from '@/lib/email/invitation-email';
import {
  INVITATION_MAIL_DAILY_LIMIT,
  INVITATION_MAIL_FAILED,
  INVITATION_MAIL_SENT,
  INVITATION_ROLE_CHANGE_BLOCKED,
  invitationMailBaseUrl,
  invitationMailSkipReason,
  lockInvitationMail,
  type InvitationMailSkip,
} from '@/lib/email/invitation-mail-policy';
import { recordAlert } from '@/lib/observability/system-alert';
import { appUrl } from '@/lib/app-url';
import { FORBIDDEN_ROLE_DIGEST } from '@/lib/forbidden-role';

/**
 * Invites a user into the caller's own tenant.
 *
 * The previous version resolved the tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` and, if the table was empty,
 * *created* a tenant called "FonBridge HQ" and invited into that. So a session
 * without a tenant could hand out membership of whichever tenant happened to be
 * seeded first. It also defaulted the caller's role to `TENANT_OWNER` and then
 * never checked it, and returned an invitation object with a fresh token when
 * the DB write failed — a link that can never be accepted.
 */

const INVITABLE_ROLES = new Set([
  'TENANT_ADMIN',
  'PIPELINE_MANAGER',
  'WRITER',
  'MEMBER',
  'GUEST_PARTNER',
]);

/**
 * The language-free `code` every refusal carries (NG-89). The members page
 * turns it into a sentence from `settings.members.page.errors`; `error` keeps
 * the Turkish sentence for callers written before the code existed.
 * FORBIDDEN_ROLE is the shared role-refusal code (src/lib/forbidden-role.ts),
 * which `useActionErrorText` already says in every locale.
 */
const INVITATION_ERROR = {
  FORBIDDEN_ROLE: FORBIDDEN_ROLE_DIGEST,
  INVALID_JSON: 'INVALID_JSON',
  INVALID_EMAIL: 'INVALID_EMAIL',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  SEAT_LIMIT_REACHED: 'SEAT_LIMIT_REACHED',
} as const;

/** What `req.json()` yields here when the request body is not JSON. */
const UNPARSABLE_BODY = Symbol('unparsable-body');

/** Roles allowed to invite into a tenant. */
const CAN_INVITE = new Set(['TENANT_OWNER', 'TENANT_ADMIN']);

export async function POST(req: Request) {
  try {
    const scope = await requireTenantApi({ write: true });
    if (!scope.ok) return scope.response;

    const { tenantId, userId, role: callerRole } = scope.scope;

    if (!CAN_INVITE.has(callerRole)) {
      return NextResponse.json(
        {
          error: 'Bu işlem için yetkiniz yok. Yalnızca kurum sahibi veya yöneticisi davet gönderebilir.',
          code: INVITATION_ERROR.FORBIDDEN_ROLE,
        },
        { status: 403 }
      );
    }

    // A body that does not parse is the caller's mistake, not ours: answer 400
    // rather than letting it fall into the catch-all 500 below (NG-94).
    // (A sentinel, not `null`: the JSON text `null` parses fine and is left to
    // the e-mail check, as before.)
    const body = await req.json().catch(() => UNPARSABLE_BODY);
    if (body === UNPARSABLE_BODY) {
      return NextResponse.json(
        { error: 'İstek gövdesi geçerli bir JSON değil.', code: INVITATION_ERROR.INVALID_JSON },
        { status: 400 }
      );
    }
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const requestedRole = typeof body?.role === 'string' ? body.role : 'MEMBER';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Geçerli bir e-posta adresi zorunludur.', code: INVITATION_ERROR.INVALID_EMAIL },
        { status: 400 }
      );
    }

    // An invite must never grant more than the roles this endpoint offers; in
    // particular TENANT_OWNER is not invitable.
    const role = INVITABLE_ROLES.has(requestedRole) ? requestedRole : 'MEMBER';

    // Only the hash goes into the database (TASK-MULQLL2T8ZJX4); the raw token
    // leaves this handler once, inside `inviteLink`, and is never stored.
    const { raw: token, hash: tokenHash } = issueSecretToken();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Whether a mail can go out at all is known before the transaction; only
    // then does it take the lock and write the row the limits count
    // (src/lib/email/invitation-mail-policy.ts).
    const mailer = smtpMailer();
    const mailBaseUrl = invitationMailBaseUrl();

    const result = await withTenant<{
      conflict: boolean;
      seatLimit: SeatUsage | null;
      invitation: InvitationRow | null;
      tenantName: string | null;
      mailSkip: InvitationMailSkip | null;
      roleChangeBlocked?: boolean;
    }>(tenantId, async (tx) => {
      const existingMembership = await tx.membership.findFirst({
        where: {
          tenantId,
          user: { email },
        },
      });

      if (existingMembership) {
        return { conflict: true, seatLimit: null, invitation: null, tenantName: null, mailSkip: null };
      }

      // The plan's seat limit (src/lib/billing/seat-limit.ts): members plus
      // pending invitations may not exceed it.
      try {
        await assertSeatAvailable(tx, tenantId, email);
      } catch (error) {
        if (error instanceof SeatLimitReachedError) {
          return { conflict: false, seatLimit: error.usage, invitation: null, tenantName: null, mailSkip: null };
        }
        throw error;
      }

      let mailSkip: InvitationMailSkip | null = null;
      if (mailer && mailBaseUrl) {
        await lockInvitationMail(tx, tenantId);
        const existing = await tx.invitation.findUnique({
          where: { email_tenantId: { email, tenantId } },
          select: { id: true, email: true, tenantId: true, role: true, expires: true },
        });
        mailSkip = await invitationMailSkipReason(tx, tenantId, existing?.id ?? null);

        // The mail that just went out names a role; within the cooldown no new
        // mail can say otherwise, so the link keeps it (İNCELEME-32 Ö-1). The
        // row is left as mailed, expiry included, and the attempt is recorded.
        if (mailSkip === 'recently_sent' && existing && existing.role !== role) {
          await tx.auditEvent.create({
            data: {
              tenantId,
              actorId: userId,
              type: INVITATION_ROLE_CHANGE_BLOCKED,
              target: existing.id,
              data: { from: existing.role, to: role },
            },
          });
          return { conflict: false, seatLimit: null, invitation: existing, tenantName: null, mailSkip, roleChangeBlocked: true };
        }
      }

      // Within the cooldown the invitee already holds a mail with a link, and no
      // new mail is going out: keep that link's token (İNCELEME-26 Ö-1). Only a
      // mail that is actually sent, or a link handed to the inviter because no
      // mail can go out at all, gets a fresh token.
      const keepToken = mailSkip === 'recently_sent';
      const invitation = await tx.invitation.upsert({
        where: { email_tenantId: { email, tenantId } },
        // A fresh token also reopens an invitation that was accepted before
        // (the member has since left): `acceptedAt` goes back to NULL with it.
        update: keepToken ? { role, expires } : { tokenHash, role, expires, acceptedAt: null },
        create: { email, tenantId, tokenHash, role, expires },
        select: { id: true, email: true, tenantId: true, role: true, expires: true },
      });

      // Written before the send, under the lock: the limits count attempts, and
      // a concurrent request must see this one. Target is the invitation id,
      // never the address.
      if (mailer && mailBaseUrl && !mailSkip) {
        await tx.auditEvent.create({
          data: { tenantId, actorId: userId, type: INVITATION_MAIL_SENT, target: invitation.id },
        });
      }

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

      return { conflict: false, seatLimit: null, invitation, tenantName: tenant?.name ?? null, mailSkip };
    });

    if (result.conflict) {
      return NextResponse.json(
        { error: 'Bu e-posta adresi zaten bu kurumun üyesidir.', code: INVITATION_ERROR.ALREADY_MEMBER },
        { status: 400 }
      );
    }

    if (result.seatLimit) {
      const { limit, members, pendingInvitations } = result.seatLimit;
      return NextResponse.json(
        {
          error:
            `Planınızın koltuk sınırına ulaşıldı (${limit} koltuk: ${members} üye, ` +
            `${pendingInvitations} bekleyen davet). Yeni davet için koltuk ekleyin ya da planınızı yükseltin.`,
          code: INVITATION_ERROR.SEAT_LIMIT_REACHED,
          seats: { limit, members, pendingInvitations },
        },
        { status: 403 }
      );
    }

    if (result.roleChangeBlocked) {
      return NextResponse.json({
        success: false,
        invitation: result.invitation,
        emailSent: false,
        reason: 'role_change_blocked',
      });
    }

    // The response link falls back through `appUrl()` (localhost only outside
    // production) so a local inviter still gets a usable link; a mail is only
    // ever built from `mailBaseUrl`.
    const acceptPath = `/tr/accept-invite?token=${token}`;
    const inviteLink = `${mailBaseUrl ?? appUrl()}${acceptPath}`;
    // The address itself is personal data; log that an invite went out, not to whom.
    console.log(`[Invitations] invitation issued for tenant ${tenantId}`);

    const invitationId = result.invitation?.id ?? null;
    const mail = await deliverInvitationEmail({
      mailer,
      mailBaseUrl,
      skip: result.mailSkip,
      tenantId,
      invitationId,
      message: {
        to: email,
        tenantName: result.tenantName,
        inviteLink: mailBaseUrl ? `${mailBaseUrl}${acceptPath}` : '',
        expires,
      },
    });

    // The link is still returned when the mail did not go out, so the inviter
    // can pass it on by hand; `emailSent` says which of the two happened and
    // `reason` why not. The exception is `recently_sent`: the token was kept, so
    // the link in the earlier mail is the valid one and `token` above was never
    // stored — returning it would hand out a dead link.
    return NextResponse.json({
      success: true,
      invitation: result.invitation,
      ...(result.mailSkip === 'recently_sent' ? {} : { inviteLink }),
      emailSent: mail.sent,
      ...(mail.sent ? {} : { reason: mail.reason }),
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    return internalError({ error: 'İç Sunucu Hatası', code: 'INTERNAL_ERROR' });
  }
}

type MailOutcome =
  | { sent: true }
  | {
      sent: false;
      reason: InvitationMailSkip | 'smtp_not_configured' | 'app_url_not_configured' | 'send_failed';
    };

/**
 * Mails the invitation (TASK-MUMLF57HOYFSB), or says why it did not. Best
 * effort: the invitation row is already written and the link is in the
 * response, so a mail that does not go out must not turn the request into an
 * error — but it is never silent either:
 *   • no SMTP → `reportMailNotConfigured`;
 *   • no usable NEXT_PUBLIC_APP_URL → an error SystemAlert, because the only
 *     link we could mail is a localhost one (TASK-MUMO2XIQEHGUD, K-3) or, in
 *     production, an http:// one or one with a query glued in (İNCELEME-39);
 *   • the tenant's daily limit → a warning SystemAlert, one open row per tenant;
 *   • a refused send → a warning SystemAlert that names the invitation by id,
 *     never by address, and an `invitation.email_failed` row that ends the
 *     cooldown so the inviter can retry.
 */
async function deliverInvitationEmail(params: {
  mailer: Mailer | null;
  mailBaseUrl: string | null;
  skip: InvitationMailSkip | null;
  tenantId: string;
  invitationId: string | null;
  message: { to: string; tenantName: string | null; inviteLink: string; expires: Date };
}): Promise<MailOutcome> {
  const { mailer, tenantId, invitationId } = params;
  if (!mailer) {
    await reportMailNotConfigured('invitations');
    return { sent: false, reason: 'smtp_not_configured' };
  }
  if (!params.mailBaseUrl) {
    console.error('[Invitations] NEXT_PUBLIC_APP_URL is not usable — invitation email not sent');
    await recordAlert({
      level: 'error',
      source: 'invitations',
      message:
        'NEXT_PUBLIC_APP_URL is not usable (unset, or in production loopback, http:// or more than an origin): invitation emails are not being sent',
      dedupeKey: 'invitation-mail-app-url-missing',
    });
    return { sent: false, reason: 'app_url_not_configured' };
  }
  if (params.skip === 'daily_limit') {
    await recordAlert({
      level: 'warn',
      source: 'invitations',
      message: `Tenant reached the daily invitation email limit (${INVITATION_MAIL_DAILY_LIMIT}); further invitation emails are skipped`,
      meta: { tenantId },
      dedupeKey: `invitation-mail-daily-limit:${tenantId}`,
    });
  }
  if (params.skip) return { sent: false, reason: params.skip };

  try {
    await mailer(renderInvitationEmail(params.message));
    return { sent: true };
  } catch (error) {
    // MailSendError's message is the SMTP codes only (see mailer.ts).
    const reason = error instanceof Error ? error.message : 'unknown_error';
    console.error(`[Invitations] invitation email failed: ${reason}`);
    await recordAlert({
      level: 'warn',
      source: 'invitations',
      message: 'Invitation email was not delivered to the SMTP server',
      meta: { invitationId, reason },
    });
    if (invitationId) {
      try {
        await withTenant(tenantId, (tx) =>
          tx.auditEvent.create({ data: { tenantId, type: INVITATION_MAIL_FAILED, target: invitationId } })
        );
      } catch {
        // Without the row the cooldown simply runs its 10 minutes. Nothing from
        // the error is logged: a connection error can carry the database URL.
        console.error('[Invitations] could not record the failed send');
      }
    }
    return { sent: false, reason: 'send_failed' };
  }
}
