import { z } from 'zod';
import type { TenantTx } from '@/lib/db';
import { isPresentId } from '@/lib/required-id';
import { separatedPrompt } from '@/lib/ai/prompts';
import { generateCompletion, type LlmCompletion, type LlmGenerateOptions } from '@/lib/llm';
import { assertM18Balance, attemptPurpose, withM18Reservation, type M18CreditDeps } from './ai-credits';
import { fetchOrganizationSite, type SiteFetchDeps, type SiteFetchResult } from './site-fetch';

/**
 * M18-F5 (NG-136) — organisation enrichment from its own website.
 *
 * Two steps, and only the second writes:
 *  1. `proposeEnrichment` checks the balance covers the price (read-only; NG-202 B2), reads ≤5 pages (site-fetch.ts, robots.txt obeyed), reserves the price of
 *     M18:enrich-organization (ai-credits.ts, the M17 pattern), asks the model through `src/lib/llm.ts`
 *     (the free M18:enrich-organization-attempt — AiUsageLog row), and returns a PROPOSAL. Nothing is
 *     stored. No page fetched → no reservation, no model call, no charge. An answer with no usable
 *     JSON (BAD_ANSWER) or a failed model call gives the reservation back (NG-136, K-582507 = A).
 *  2. `applyEnrichment` writes only the fields the user ticked, after reading the proposal on screen.
 */

export const ENRICHMENT_MODULE = 'M18';
export const ENRICHMENT_PURPOSE = 'enrich-organization';

const SIZE_BANDS = ['MICRO', 'SMALL', 'MEDIUM', 'LARGE'] as const;
const NACE_RE = /^[A-U](\d{2}(\.\d{1,2})?)?$/;

export type EnrichmentSubject = {
  id: string;
  name: string;
  legalName: string | null;
  district: string | null;
  provinceCode: string | null;
  website: string | null;
  sizeBand: string | null;
  themes: string[];
  sectorCodes: string[];
};

export type EnrichmentProposal = {
  legalName: string | null;
  district: string | null;
  sizeBand: (typeof SIZE_BANDS)[number] | null;
  themes: string[];
  sectorCodes: string[];
  sources: string[];
};

export type ProposeEnrichmentResult =
  | { ok: true; proposal: EnrichmentProposal; fetchedUrls: string[]; credits: number }
  | { ok: false; code: 'NO_WEBSITE' | 'SITE_UNAVAILABLE' | 'BAD_ANSWER'; reason?: string };

export async function loadEnrichmentSubject(tx: TenantTx, tenantId: string, organizationId: string): Promise<EnrichmentSubject | null> {
  return tx.leadOrganization.findFirst({
    where: { id: organizationId, tenantId, deletedAt: null },
    select: {
      id: true,
      name: true,
      legalName: true,
      district: true,
      provinceCode: true,
      website: true,
      sizeBand: true,
      themes: true,
      sectorCodes: true,
    },
  });
}

const cleanText = (max: number) =>
  z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''))
    .transform((v) => (v ? v : null));

const cleanList = (max: number, itemMax: number) =>
  z.unknown().transform((v) =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.replace(/\s+/g, ' ').trim().slice(0, itemMax)).filter(Boolean))].slice(0, max)
      : [],
  );

const answerSchema = z.object({
  legalName: cleanText(200),
  district: cleanText(80),
  sizeBand: z.unknown().transform((v) => (typeof v === 'string' && (SIZE_BANDS as readonly string[]).includes(v.toUpperCase()) ? (v.toUpperCase() as EnrichmentProposal['sizeBand']) : null)),
  themes: cleanList(8, 60),
  sectorCodes: cleanList(5, 10),
  sources: cleanList(5, 500),
});

/**
 * The model's JSON, made safe: unknown keys dropped, every field normalised on its own (one bad
 * field does not lose the rest), NACE codes shape-checked, sources limited to pages we fetched.
 * Null when the answer holds no JSON object at all.
 */
export function parseEnrichmentAnswer(text: string, fetchedUrls: string[]): EnrichmentProposal | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const parsed = answerSchema.parse({ legalName: null, district: null, sizeBand: null, themes: [], sectorCodes: [], sources: [], ...raw });
  const fetched = new Set(fetchedUrls);
  return {
    ...parsed,
    sectorCodes: parsed.sectorCodes.map((c) => c.toUpperCase()).filter((c) => NACE_RE.test(c)),
    sources: parsed.sources.filter((s) => fetched.has(s)),
  };
}

/** What the model sees about the organisation: the record as it stands, no personal data. */
export function describeSubject(org: EnrichmentSubject): string {
  return [
    `name: ${org.name}`,
    `legalName: ${org.legalName ?? '-'}`,
    `provinceCode: ${org.provinceCode ?? '-'}`,
    `district: ${org.district ?? '-'}`,
    `sizeBand: ${org.sizeBand ?? '-'}`,
    `themes: ${org.themes.join(', ') || '-'}`,
    `sectorCodes: ${org.sectorCodes.join(', ') || '-'}`,
  ].join('\n');
}

export type EnrichmentDeps = {
  fetchSite?: (url: string, deps?: SiteFetchDeps) => Promise<SiteFetchResult>;
  generate?: (options: LlmGenerateOptions) => Promise<LlmCompletion>;
  credits?: M18CreditDeps;
};

export async function proposeEnrichment(
  input: { tenantId: string; userId: string; org: EnrichmentSubject; locale: string },
  deps: EnrichmentDeps = {},
): Promise<ProposeEnrichmentResult> {
  const { org } = input;
  if (!org.website) return { ok: false, code: 'NO_WEBSITE' };
  // NG-202 (B2): the site is read before the price is reserved (no page → no charge), so a tenant that
  // cannot pay is turned away here, before any request leaves for the third-party site.
  await (deps.credits?.precheck ?? assertM18Balance)(input.tenantId, ENRICHMENT_PURPOSE);
  const site = await (deps.fetchSite ?? fetchOrganizationSite)(org.website);
  if (!site.ok) return { ok: false, code: 'SITE_UNAVAILABLE', reason: site.reason };
  if (site.pages.length === 0) return { ok: false, code: 'SITE_UNAVAILABLE', reason: 'no_html' };

  const fetchedUrls = site.pages.map((p) => p.url);
  const request = separatedPrompt(
    'm18/enrich-organization',
    {},
    {
      organization: describeSubject(org),
      pages: site.pages.map((p) => `URL: ${p.url}\n${p.text}`).join('\n\n---\n\n'),
    },
    input.locale,
  );
  return withM18Reservation<ProposeEnrichmentResult>(
    input.tenantId,
    ENRICHMENT_PURPOSE,
    async ({ credits }) => {
      const completion = await (deps.generate ?? generateCompletion)({
        tenantId: input.tenantId,
        userId: input.userId,
        module: ENRICHMENT_MODULE,
        purpose: attemptPurpose(ENRICHMENT_PURPOSE),
        // The price was reserved above; llm.ts logs this call at 0 credits and debits nothing.
        creditsReserved: true,
        ...request,
      });
      const proposal = parseEnrichmentAnswer(completion.text, fetchedUrls);
      if (!proposal) return { keep: false, value: { ok: false, code: 'BAD_ANSWER' } };
      return { keep: true, value: { ok: true, proposal, fetchedUrls, credits } };
    },
    deps.credits,
  );
}

/** The user's choice: only the ticked fields arrive, each re-validated as if typed by hand. */
export const applyEnrichmentSchema = z
  .object({
    organizationId: z.string().min(1).max(64),
    legalName: z.string().trim().min(1).max(200).optional(),
    district: z.string().trim().min(1).max(80).optional(),
    sizeBand: z.enum(SIZE_BANDS).optional(),
    themes: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
    sectorCodes: z.array(z.string().trim().toUpperCase().regex(NACE_RE)).max(5).optional(),
  })
  .strict();

export type ApplyEnrichmentInput = z.infer<typeof applyEnrichmentSchema>;

/** Writes the approved fields. Returns false when the organisation is gone or not this tenant's. */
export async function applyEnrichment(tx: TenantTx, tenantId: string, rawInput: unknown): Promise<boolean> {
  const { organizationId, ...fields } = applyEnrichmentSchema.parse(rawInput);
  if (!isPresentId(tenantId) || !isPresentId(organizationId)) return false;
  const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(data).length === 0) throw new z.ZodError([{ code: 'custom', message: 'nothing selected', path: [] }]);
  const res = await tx.leadOrganization.updateMany({ where: { id: organizationId, tenantId, deletedAt: null }, data });
  return res.count === 1;
}
