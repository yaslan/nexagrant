import { createHmac } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { z } from 'zod';
import { invitationMailBaseUrl } from '@/lib/email/invitation-mail-policy';
import { type Mailer, mailFailureCode, reportMailNotConfigured, smtpMailer } from '@/lib/email/mailer';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { ipBucket } from '@/lib/leads/public-lead';
import { logger } from '@/lib/logger';
import { issueSecretToken } from '@/lib/secret-token';
import { expertPreRegInputSchema } from '../schema';
import {
  EXPERT_PREREG_CONSENT_VERSION,
  EXPERT_PREREG_LOCK_KEY,
  IP_WINDOW_MS,
  REGISTRATION_IP_LIMIT,
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
  /** Key for the IP hash. Defaults to EXPERT_PREREG_IP_SALT. */
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
  const salt = options.salt === undefined ? env.EXPERT_PREREG_IP_SALT : options.salt;
  if (!salt && !warnedNoSalt) {
    warnedNoSalt = true;
    logger.warn('EXPERT_PREREG_IP_SALT is unset: no IP is stored and the per-IP limit is off');
  }
  const ipHash = hashExpertIp(options.ip ?? null, salt);

  // Mail first, as a precondition: a registration nobody can verify is not written.
  const mailer = options.mailer === undefined ? smtpMailer() : options.mailer;
  const baseUrl = options.baseUrl === undefined ? invitationMailBaseUrl() : options.baseUrl;
  if (!mailer || !baseUrl) {
    await reportMailNotConfigured('expert-prereg');
    return { kind: 'unavailable', error: 'mail_unavailable' };
  }

  const { raw: token, hash: tokenHash } = issueSecretToken();
  const expires = new Date(now.getTime() + VERIFY_TOKEN_TTL_MS);

  let id: string;
  try {
    const written = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${EXPERT_PREREG_LOCK_KEY})`;

      if (ipHash) {
        const recent = await tx.expertPreRegistration.count({
          where: { ipHash, createdAt: { gte: new Date(now.getTime() - IP_WINDOW_MS) } },
        });
        if (recent >= REGISTRATION_IP_LIMIT) return { status: 429 as const };
      }

      const existing = await tx.expertPreRegistration.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing) return { status: 409 as const };

      const row = await tx.expertPreRegistration.create({
        data: {
          fullName: data.fullName,
          email: data.email,
          province: data.province,
          title: data.title,
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
          marketingConsentAt: data.marketingConsent ? now : null,
          consentTextVersion: EXPERT_PREREG_CONSENT_VERSION,
          locale: data.locale,
          verifyTokenHash: tokenHash,
          verifyTokenExpiresAt: expires,
          ipHash,
          status: 'pending',
          createdAt: now,
        },
        select: { id: true },
      });
      return { status: 201 as const, id: row.id };
    });

    if (written.status === 429) return { kind: 'rate_limited' };
    if (written.status === 409) return { kind: 'duplicate' };
    id = written.id;
  } catch (error) {
    // The error's name only: a Prisma message can quote the values it failed on.
    logger.error('expert pre-registration write failed', { error: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'unavailable', error: 'server' };
  }

  const link = `${baseUrl}/api/expert-preregistration/verify?token=${token}`;
  try {
    await mailer(renderExpertVerificationEmail({ to: data.email, fullName: data.fullName, link, locale: data.locale, expires }));
  } catch (error) {
    // The row must not outlive a mail nobody got: the expert could not verify and
    // could not register again. Removed here; a failure to remove is logged.
    await db.expertPreRegistration.delete({ where: { id } }).catch(() => {
      logger.error('expert pre-registration rollback failed after a mail error');
    });
    logger.error('expert pre-registration mail failed', { code: mailFailureCode(error) ?? 'unknown' });
    return { kind: 'unavailable', error: 'mail_failed' };
  }

  return { kind: 'created' };
}
