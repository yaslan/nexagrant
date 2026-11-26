import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withSystemScopeOn } from '@/lib/system-scope';
import { COOKIE_CHOICES, COOKIE_POLICY_VERSION, type CookieChoice } from '@/lib/cookie-consent';

/**
 * NG-9 (FE-1.5) — the consent record behind the cookie banner, in our own database.
 *
 * One row per saved choice (CookieConsentRecord). Nothing that identifies a person: an
 * anonymous visitor id minted in the browser, the choice, the two optional categories,
 * the policy version and the locale. No IP, no user agent, no user id — the endpoint
 * does not read them.
 *
 * The table is RLS-on with `system_scope` only, so the write runs in its own
 * 'cookie-consent' scope (NG-367 Ö-3): prisma/rls.sql system_scope_open opens that purpose
 * for CookieConsentRecord and nothing else, and no longer opens the table for
 * 'public-intake' (the expert and readiness forms).
 */

/** Saves one visitor may record per hour. A person changes their mind a few times, not 30. */
export const COOKIE_CONSENT_HOURLY_LIMIT = 30;
const HOUR_MS = 60 * 60 * 1000;

/**
 * NG-367 Ö-2 (SEC NG-363): the policy versions a record may name. The record is the proof
 * of which text the visitor answered, so the server accepts only a version it actually
 * published, not any string that looks like one. The version in force first; when
 * COOKIE_POLICY_VERSION is bumped, keep the old value here for as long as a cached page
 * can still post it (a deploy window), so those saves are not lost as 400s.
 */
export const ACCEPTED_COOKIE_POLICY_VERSIONS: readonly [string, ...string[]] = [COOKIE_POLICY_VERSION];

const choiceSchema = z.enum(COOKIE_CHOICES as [CookieChoice, ...CookieChoice[]]);

export const cookieConsentInput = z
  .object({
    visitorId: z.string().uuid(),
    choice: choiceSchema,
    analytics: z.boolean(),
    marketing: z.boolean(),
    policyVersion: z.string().refine((v) => ACCEPTED_COOKIE_POLICY_VERSIONS.includes(v)),
    locale: z.enum(['tr', 'en']),
  })
  .strict()
  // The choice must agree with the categories: "accept all" with a category off, or
  // "reject all" with one on, is a forged or broken request, not a consent.
  .refine((v) => v.choice !== 'accept_all' || (v.analytics && v.marketing), { path: ['choice'] })
  .refine((v) => v.choice !== 'reject_all' || (!v.analytics && !v.marketing), { path: ['choice'] });

export type CookieConsentInput = z.infer<typeof cookieConsentInput>;

export type RecordResult = { kind: 'created' } | { kind: 'invalid' } | { kind: 'rate_limited' };

/** Advisory-lock key per visitor; the prefix keeps it apart from every other hashed key. */
const visitorLockKey = (visitorId: string) => `cookie-consent:${visitorId}`;

export async function recordCookieConsent(body: unknown, db: PrismaClient = prisma, now: Date = new Date()): Promise<RecordResult> {
  const parsed = cookieConsentInput.safeParse(body);
  if (!parsed.success) return { kind: 'invalid' };
  const data = parsed.data;

  return withSystemScopeOn(db, 'cookie-consent', 'cookie-consent.record', async (tx) => {
    // NG-367 Ö-4: count and insert under one per-visitor lock, so N parallel saves of one
    // visitor cannot all read "29" and all insert. Transaction-scoped: COMMIT releases it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${visitorLockKey(data.visitorId)}, 0))`;
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
