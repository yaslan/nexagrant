import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { type Mailer, mailFailureCode, reportMailNotConfigured, smtpMailer } from '@/lib/email/mailer';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { ipBucket } from '@/lib/leads/public-lead';
import { logger } from '@/lib/logger';
import { withSystemScopeOn } from '@/lib/system-scope';
import { issueSecretToken } from '@/lib/secret-token';
import { expertPreRegInputSchema } from '../schema';
import {
  ATTEMPT_RETENTION_MS,
  EXPERT_PREREG_CONSENT_VERSION,
  EXPERT_PREREG_DAILY_MAIL_LIMIT,
  EXPERT_PREREG_LOCK_KEY,
  IP_WINDOW_MS,
  MAIL_DAY_MS,
  REGISTRATION_IP_LIMIT,
  RESEND_COOLDOWN_MS,
  VERIFY_TOKEN_TTL_MS,
} from './constants';
import { renderExpertVerificationEmail } from './email';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — one public expert pre-registration, from the POST
 * to the verification mail. Validation is the shared schema (../schema.ts); the
 * rules that need the database are here: e-mail uniqueness, the per-IP window,
 * the honeypot, and the write that happens only after the mail can go out.
 *
 * Nothing here logs a name, an address, an ORCID or an IP.
 */

export interface RegisterOptions {
  /** Client address as the nearest trusted proxy saw it (clientIpFrom). Null = no IP is stored. */
  ip?: string | null;
  /** Key for the IP hash. Defaults to {@link expertPreRegIpSalt}. */
  salt?: string | null;
  now?: Date;
  /** Test seam: the database client. */
  db?: PrismaClient;
  /** Test seam: the mailer. Defaults to the SMTP mailer; null = no SMTP configured. */
  mailer?: Mailer | null;
  /** Test seam: the public origin the link is built on. Defaults to invitationMailBaseUrl(). */
  baseUrl?: string | null;
}

/**
 * What the route answers. `unavailable` is every 5xx: the route turns it into
 * internalError() with a fixed code, so no server text reaches the body.
 */
export type RegisterResult =
  | { kind: 'created' }
  | { kind: 'invalid'; errors: Record<string, string> }
  | { kind: 'duplicate' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable'; error: 'mail_unavailable' | 'mail_failed' | 'server' };

/** HMAC of the IP's bucket under the salt, so the per-IP limit works without storing the address. */
export function hashExpertIp(ip: string | null, salt: string | null | undefined): string | null {
  if (!ip || !salt) return null;
  return createHmac('sha256', salt).update(ipBucket(ip)).digest('hex');
}

/**
 * What a re-issue changes on a pending row (F6): the link, the IP, the resend
 * timestamp and the mail counters. Everything the expert typed and consented to
 * stays as it was, and so does createdAt (FO-26). This is the state the row had
 * before, so a mail that cannot go out restores all of it.
 */
interface ReissueState {
  verifyTokenHash: string | null;
  verifyTokenExpiresAt: Date | null;
  ipHash: string | null;
  lastSubmittedAt: Date | null;
  verifyMailCount: number;
  verifyMailWindowStart: Date | null;
}

/** Name and language of the row the mail is written for: the stored ones on a re-issue, the form's otherwise. */
interface MailTarget {
  fullName: string;
  locale: string;
}

/**
 * The key of the IP hash: EXPERT_PREREG_IP_SALT when set, else a key derived from
 * AUTH_SECRET, so the per-IP limit does not switch off where only the secret is set.
 * Null only when neither is set. Hashes made under the derived key do not match
 * the configured one; the window is one hour, so the change is transient.
 */
export function expertPreRegIpSalt(configured: string | undefined, secret: string | undefined): string | null {
  if (configured) return configured;
  if (!secret) return null;
  return createHmac('sha256', secret).update('expert-prereg-ip').digest('hex');
}

let warnedNoSalt = false;

/** The first error per field, as the form expects: `{ field: code }`. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    if (!(field in errors)) errors[field] = issue.message;
  }
  return errors;
}

export async function registerExpertPreRegistration(
  raw: unknown,
  options: RegisterOptions = {}
): Promise<RegisterResult> {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};

  // Honeypot first: a bot gets the same answer as a person and nothing is stored.
  if (typeof input.website === 'string' && input.website.trim() !== '') {
    logger.info('expert pre-registration dropped by honeypot');
    return { kind: 'created' };
  }

  const parsed = expertPreRegInputSchema.safeParse(input);
  if (!parsed.success) return { kind: 'invalid', errors: fieldErrors(parsed.error) };
  const data = parsed.data;

  const now = options.now ?? new Date();
  const db = options.db ?? prisma;
  const salt =
    options.salt === undefined ? expertPreRegIpSalt(env.EXPERT_PREREG_IP_SALT, process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET) : options.salt;
  if (!salt && !warnedNoSalt) {
    warnedNoSalt = true;
    logger.warn('EXPERT_PREREG_IP_SALT and AUTH_SECRET are unset: no IP is stored and the per-IP limit is off');
  }
  const ipHash = hashExpertIp(options.ip ?? null, salt);

  // Mail first, as a precondition: a registration nobody can verify is not written.
  const mailer = options.mailer === undefined ? smtpMailer() : options.mailer;
  const baseUrl = options.baseUrl === undefined ? invitationMailBaseUrl() : options.baseUrl;
  if (!mailer || !baseUrl) {
    await reportMailNotConfigured('expert-prereg', mailer ? 'app_url' : 'smtp');
    return { kind: 'unavailable', error: 'mail_unavailable' };
  }

  const { raw: token, hash: tokenHash } = issueSecretToken();
  const expires = new Date(now.getTime() + VERIFY_TOKEN_TTL_MS);

  let id: string;
  let previous: ReissueState | null = null;
  let target: MailTarget = { fullName: data.fullName, locale: data.locale };
  try {
    // FO-45: the table is RLS-on with the system_scope policy only, so every read and write here runs in the 'public-intake' scope.
    const written = await withSystemScopeOn(db, 'public-intake', 'expert-prereg.register', async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPERT_PREREG_LOCK_KEY})`;

      if (ipHash) {
        // Old attempts go first, so the table never holds more than the retention window.
        await tx.expertPreRegAttempt.deleteMany({
          where: { createdAt: { lt: new Date(now.getTime() - ATTEMPT_RETENTION_MS) } },
        });
        const windowStart = new Date(now.getTime() - IP_WINDOW_MS);
        const recent =
          (await tx.expertPreRegistration.count({ where: { ipHash, createdAt: { gte: windowStart } } })) +
          (await tx.expertPreRegAttempt.count({ where: { ipHash, createdAt: { gte: windowStart } } }));
        if (recent >= REGISTRATION_IP_LIMIT) return { status: 429 as const };
      }

      const existing = await tx.expertPreRegistration.findUnique({
        where: { email: data.email },
        select: {
          id: true,
          status: true,
          fullName: true,
          locale: true,
          verifyTokenHash: true,
          verifyTokenExpiresAt: true,
          ipHash: true,
          lastSubmittedAt: true,
          verifyMailCount: true,
          verifyMailWindowStart: true,
        },
      });
      // Verified (or disabled by an admin) is refused. The attempt still counts toward the IP window.
      if (existing && existing.status !== 'pending') {
        if (ipHash) await tx.expertPreRegAttempt.create({ data: { ipHash } });
        return { status: 409 as const };
      }

      // F5: at most EXPERT_PREREG_DAILY_MAIL_LIMIT mails to one address per day window.
      const dayOpen = existing?.verifyMailWindowStart != null && now.getTime() - existing.verifyMailWindowStart.getTime() < MAIL_DAY_MS;
      const mailsToday = dayOpen ? (existing?.verifyMailCount ?? 0) : 0;
      if (existing) {
        // Before lastSubmittedAt existed, the last issue time was VERIFY_TOKEN_TTL_MS before the link expires.
        const lastIssued =
          existing.lastSubmittedAt?.getTime() ??
          (existing.verifyTokenExpiresAt ? existing.verifyTokenExpiresAt.getTime() - VERIFY_TOKEN_TTL_MS : 0);
        if (now.getTime() - lastIssued < RESEND_COOLDOWN_MS) return { status: 429 as const };
        if (mailsToday >= EXPERT_PREREG_DAILY_MAIL_LIMIT) return { status: 429 as const };
      }
      const mailCounters = {
        verifyMailCount: mailsToday + 1,
        verifyMailWindowStart: dayOpen ? (existing?.verifyMailWindowStart ?? now) : now,
      };

      const fields = {
        fullName: data.fullName,
        email: data.email,
        province: data.province,
        title: data.title,
        organization: data.organization,
        isFreelancer: data.isFreelancer,
        expertiseAreas: data.expertiseAreas,
        roles: data.roles,
        programmes: data.programmes,
        projectCodes: data.projectCodes,
        orcid: data.orcid,
        linkedinUrl: data.linkedinUrl,
        languages: data.languages,
        referredBy: data.referredBy,
        utmSource: data.utmSource,
        utmMedium: data.utmMedium,
        utmCampaign: data.utmCampaign,
        kvkkAcceptedAt: now,
        visibilityConsentAt: now,
        // FO-144: marketingConsentAt is not written (the column stays for rows that already carry it).
        consentTextVersion: EXPERT_PREREG_CONSENT_VERSION,
        locale: data.locale,
        verifyTokenHash: tokenHash,
        verifyTokenExpiresAt: expires,
        ipHash,
        status: 'pending',
        lastSubmittedAt: now,
        ...mailCounters,
      };

      if (existing) {
        // F6: a pending row keeps the profile the expert first entered and the consent they first gave.
        // Only the link, the IP, the resend timestamp and the mail counters move. The mail goes to the stored name and language.
        const replaced: ReissueState = {
          verifyTokenHash: existing.verifyTokenHash,
          verifyTokenExpiresAt: existing.verifyTokenExpiresAt,
          ipHash: existing.ipHash,
          lastSubmittedAt: existing.lastSubmittedAt,
          verifyMailCount: existing.verifyMailCount,
          verifyMailWindowStart: existing.verifyMailWindowStart,
        };
        // The new link replaces the old one (its hash is gone, so the old link answers invalid).
        // createdAt stays: it is the first registration. This attempt is counted in ExpertPreRegAttempt.
        if (ipHash) await tx.expertPreRegAttempt.create({ data: { ipHash } });
        await tx.expertPreRegistration.update({
          where: { id: existing.id },
          data: {
            verifyTokenHash: tokenHash,
            verifyTokenExpiresAt: expires,
            ipHash,
            lastSubmittedAt: now,
            ...mailCounters,
          },
        });
        return {
          status: 201 as const,
          id: existing.id,
          previous: replaced,
          target: { fullName: existing.fullName, locale: existing.locale },
        };
      }

      const row = await tx.expertPreRegistration.create({
        data: { ...fields, createdAt: now },
        select: { id: true },
      });
      return { status: 201 as const, id: row.id, previous: null, target };
    });

    if (written.status === 429) return { kind: 'rate_limited' };
    if (written.status === 409) return { kind: 'duplicate' };
    id = written.id;
    previous = written.previous;
    target = written.target ?? target;
  } catch (error) {
    // The error's name only: a Prisma message can quote the values it failed on.
    logger.error('expert pre-registration write failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'unavailable', error: 'server' };
  }

  const link = `${baseUrl}/api/expert-preregistration/verify?token=${token}`;
  try {
    await mailer(renderExpertVerificationEmail({ to: data.email, fullName: target.fullName, link, locale: target.locale, expires }));
  } catch (error) {
    // A new row must not outlive a mail nobody got: the expert could not verify and
    // could not register again, so it is removed. A re-issued row goes back to the
    // link the expert already has, and its mail counters go back too, so a failed
    // mail does not use up the day's quota. A failure to undo is logged.
    await withSystemScopeOn(db, 'public-intake', 'expert-prereg.rollback', async (tx) => {
      if (previous) {
        await tx.expertPreRegistration.update({ where: { id }, data: previous }).catch(() => {
          logger.error('expert pre-registration link restore failed after a mail error');
        });
      } else {
        await tx.expertPreRegistration.delete({ where: { id } }).catch(() => {
          logger.error('expert pre-registration rollback failed after a mail error');
        });
      }
    }).catch(() => {
      // The scope itself failed (the connection dropped). The answer stays mail_failed, not a 500.
      logger.error('expert pre-registration rollback failed after a mail error');
    });
    logger.error('expert pre-registration mail failed', { code: mailFailureCode(error) ?? 'unknown' });
    return { kind: 'unavailable', error: 'mail_failed' };
  }

  return { kind: 'created' };
}
