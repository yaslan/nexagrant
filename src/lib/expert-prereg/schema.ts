import { z } from 'zod';
import {
  EXPERTISE_AREAS,
  LANGUAGES,
  PROGRAMMES,
  PROVINCES,
  ROLES,
} from './options';

/**
 * FO-19 (TASK-MVBIXPP33UK1B) — the one validation schema the form and the API
 * share. No server import, so the browser runs the same rules before it sends.
 *
 * Errors are CODES, never text: every message is one of the strings below, and
 * the form turns it into a translated sentence (kural 8). The codes are part of
 * the API contract: `400 { errors: { <field>: <code> } }`.
 *
 * Consent is sent as two booleans; the server stamps the time it received them
 * (see ./server/). A stale form cannot send a consent version, because the text
 * version is a constant on the server, not a field the client chooses.
 */

const PROVINCE_CODES = PROVINCES.map((p) => p.value) as [string, ...string[]];

/** A missing value is `required`; a present but wrong one gets `code`. */
const orRequired = (code: string) => ({
  error: (issue: { input?: unknown }) => (issue.input === undefined ? 'required' : code),
});

/** Optional free text: blank = absent, stored as null. */
const optionalText = (max: number) =>
  z
    .string({ error: 'invalid' })
    .trim()
    .max(max, { error: 'too_long' })
    .optional()
    .transform((value) => (value ? value : null));

/**
 * Structural check of an ORCID iD: four blocks of four digits, the last one
 * allowing a check character X, and the ISO 7064 MOD 11-2 check digit.
 */
export function isValidOrcid(value: string): boolean {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(value)) return false;
  const digits = value.replace(/-/g, '');
  let total = 0;
  for (const char of digits.slice(0, 15)) total = (total + Number(char)) * 2;
  const remainder = total % 11;
  const check = (12 - remainder) % 11;
  return digits.charAt(15) === (check === 10 ? 'X' : String(check));
}

/** A https URL whose host is linkedin.com or one of its subdomains. */
export function isLinkedInUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

const slugList = (values: readonly string[], max: number) =>
  z
    .array(z.enum(values as [string, ...string[]], { error: 'unknown_slug' }), { error: 'required' })
    .min(1, { error: 'required' })
    .max(max, { error: 'too_many' });

/** Optional list: absent or empty is fine (`[]`); a present value must be in the closed list. */
const optionalSlugList = (values: readonly string[], max: number) =>
  z
    .array(z.enum(values as [string, ...string[]], { error: 'unknown_slug' }), { error: 'invalid' })
    .max(max, { error: 'too_many' })
    .default([]);

/** Required free text: missing or blank is `required`, one character is `too_short`. */
const requiredText = (max: number) =>
  z
    .string({ error: 'required' })
    .trim()
    .min(1, { error: 'required' })
    .min(2, { error: 'too_short' })
    .max(max, { error: 'too_long' });

export const expertPreRegInputSchema = z.object({
  fullName: z.string({ error: 'required' }).trim().min(2, { error: 'too_short' }).max(120, { error: 'too_long' }),
  email: z
    .string({ error: 'required' })
    .trim()
    .toLowerCase()
    .max(254, { error: 'too_long' })
    .pipe(z.email({ error: 'invalid_email' })),
  province: z.enum(PROVINCE_CODES, orRequired('unknown_slug')),
  /** FO-25 (K-516717): Unvan and Kurum are required; Diller is optional. */
  title: requiredText(120),
  organization: requiredText(200),
  isFreelancer: z.boolean(orRequired('invalid')),
  expertiseAreas: slugList(EXPERTISE_AREAS, 8),
  roles: slugList(ROLES, 5),
  programmes: slugList(PROGRAMMES, 6),
  projectCodes: optionalText(200),
  orcid: z
    .string({ error: 'invalid' })
    .trim()
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine((value) => value === null || isValidOrcid(value), { error: 'invalid_orcid' }),
  linkedinUrl: z
    .string({ error: 'invalid' })
    .trim()
    .max(300, { error: 'too_long' })
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || isLinkedInUrl(value), { error: 'invalid_url' }),
  languages: optionalSlugList(LANGUAGES, 7),
  referredBy: optionalText(120),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(100),
  /** Must be literally true: an unticked box is a refusal, not a default. */
  kvkkAccepted: z.literal(true, { error: 'consent_required' }),
  /** Must be literally true: the expert is listed in the public count only with this. */
  visibilityConsent: z.literal(true, { error: 'consent_required' }),
  marketingConsent: z.boolean({ error: 'invalid' }).optional().default(false),
  /** The UI language the form was shown in: the verification mail and the redirect follow it. */
  locale: z.enum(['tr', 'en'], orRequired('unknown_slug')).default('tr'),
});

export type ExpertPreRegInput = z.input<typeof expertPreRegInputSchema>;
export type ExpertPreRegParsed = z.output<typeof expertPreRegInputSchema>;

/** The error codes a field can carry, for the form's translation table. */
export const EXPERT_PREREG_ERROR_CODES = [
  'required',
  'invalid',
  'too_short',
  'too_long',
  'too_many',
  'invalid_email',
  'unknown_slug',
  'invalid_orcid',
  'invalid_url',
  'consent_required',
  'already_registered',
] as const;

export type ExpertPreRegErrorCode = (typeof EXPERT_PREREG_ERROR_CODES)[number];
