import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { COOKIE_CHOICES, type CookieChoice } from '@/lib/cookie-consent';

/**
 * NG-9 (FE-1.5) — the consent record behind the cookie banner, in our own database.
 *
 * One row per saved choice (CookieConsentRecord). Nothing that identifies a person: an
 * anonymous visitor id minted in the browser, the choice, the two optional categories,
 * the policy version and the locale. No IP, no user agent, no user id — the endpoint
 * does not read them.
 *
 * The table is RLS-on with `system_scope` only, so the write runs in the 'public-intake'
 * scope (prisma/rls.sql system_scope_open opens it for that purpose).
 */

/** Saves one visitor may record per hour. A person changes their mind a few times, not 30. */
export const COOKIE_CONSENT_HOURLY_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

const choiceSchema = z.enum(COOKIE_CHOICES as [CookieChoice, ...CookieChoice[]]);

export const cookieConsentInput = z
  .object({
    visitorId: z.string().uuid(),
    choice: choiceSchema,
    analytics: z.boolean(),
    marketing: z.boolean(),
    policyVersion: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,31}$/),
    locale: z.enum(['tr', 'en']),
  })
  .strict()
  // The choice must agree with the categories: "accept all" with a category off, or
  // "reject all" with one on, is a forged or broken request, not a consent.
  .refine((v) => v.choice !== 'accept_all' || (v.analytics && v.marketing), { path: ['choice'] })
  .refine((v) => v.choice !== 'reject_all' || (!v.analytics && !v.marketing), { path: ['choice'] });

export type CookieConsentInput = z.infer<typeof cookieConsentInput>;

export type RecordResult = { kind: 'created' } | { kind: 'invalid' } | { kind: 'rate_limited' };

export async function recordCookieConsent(body: unknown, db: PrismaClient = prisma, now: Date = new Date()): Promise<RecordResult> {
  const parsed = cookieConsentInput.safeParse(body);
  if (!parsed.success) return { kind: 'invalid' };
  const data = parsed.data;

  return withSystemScopeOn(db, 'public-intake', 'cookie-consent.record', async (tx) => {
    const recent = await tx.cookieConsentRecord.count({
      where: { visitorId: data.visitorId, createdAt: { gte: new Date(now.getTime() - HOUR_MS) } },
    });
    if (recent >= COOKIE_CONSENT_HOURLY_LIMIT) return { kind: 'rate_limited' as const };
    await tx.cookieConsentRecord.create({
      data: {
        visitorId: data.visitorId,
        choice: data.choice,
        analytics: data.analytics,
        marketing: data.marketing,
        policyVersion: data.policyVersion,
        locale: data.locale,
        createdAt: now,
      },
    });
    return { kind: 'created' as const };
  });
}
