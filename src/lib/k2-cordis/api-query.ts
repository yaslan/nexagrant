import { z } from 'zod';

/**
 * Query validation for the public /api/cordis/* routes (TASK-MUN66T2HM4A4E O-2).
 *
 * These routes used to `parseInt` every parameter and hand the result to
 * Prisma, so `?limit=zz` became `take: NaN` and the 500 that followed quoted the
 * whole Prisma query back to an anonymous caller. A malformed parameter is now a
 * 400 before any query runs. `limit` keeps its old clamp (1–100) so existing
 * callers that ask for more still get a page, not an error.
 */

/** A base-10 integer written as digits only; anything else ("zz", "1e3", "") is refused. */
const digits = z.string().regex(/^\d{1,9}$/).transform(Number);

const page = digits.optional().transform((n) => Math.max(1, n ?? 1));
const limit = digits.optional().transform((n) => Math.min(100, Math.max(1, n ?? 20)));
const year = digits.refine((n) => n >= 1900 && n <= 2100).optional();

export const cordisOrganizationsQuerySchema = z.object({
  min_projects: digits.optional().transform((n) => n ?? 0),
  page,
  limit,
});

export const cordisProjectsQuerySchema = z.object({
  year_from: year,
  year_to: year,
  page,
  limit,
});

/** CORDIS organisation ids are numeric (PIC-like); every row in CordisOrganization matches. */
export const cordisOrganisationIdSchema = z.string().regex(/^\d{1,20}$/);

/**
 * The listed keys of `searchParams` as a plain object. An absent key stays
 * absent, and an empty value (`?limit=`) counts as absent, as the old
 * `get(...) || default` read did.
 */
export function pickQuery<K extends string>(searchParams: URLSearchParams, keys: readonly K[]): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value !== null && value !== '') out[key] = value;
  }
  return out;
}

/**
 * A CORDIS topic-code prefix such as `HORIZON-CL5-`. Upper-cased before the
 * check, so `horizon-cl5-` is accepted. Three characters minimum keeps a bare
 * `H` from matching the whole programme. The character set has no `%` or `_`,
 * so the prefix can go straight into a LIKE pattern.
 */
export const cordisTopicPrefixSchema = z
  .string()
  .max(40)
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9-]{3,40}$/));

/** GET /api/v1/partners/leaders — `topicPrefix` required, `limit` clamped to 1–50. */
export const coordinatorLeadersQuerySchema = z.object({
  topicPrefix: cordisTopicPrefixSchema,
  limit: digits.optional().transform((n) => Math.min(50, Math.max(1, n ?? 20))),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
});
