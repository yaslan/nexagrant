/**
 * keep.eu ingestion and synchronization adapter.
 *
 * Keep.eu is the comprehensive official database for European Union
 * Interreg, Interreg IPA CBC, ENI/NEXT, and cross-border cooperation
 * programmes, projects, and beneficiaries across Europe and neighbouring
 * partner countries (notably Türkiye, Bulgaria, Greece, etc.).
 *
 * Rules this file is bound by (CLAUDE.md):
 *   #6  K1/K2 external fetch discipline: raw upstream payload is recorded in
 *       `RawFetch`, schema/field drift raises a `SystemAlert` and does NOT break the job.
 *   #7  Every figure shown to a user comes from a database row, never a literal.
 *   #9  Money is stored as whole EUR in `BigInt` columns, matching `CordisProject`.
 *   #52 All environment variable reads go through `env` in `src/lib/env.ts`.
 */

import { createHash } from 'node:crypto';
import { prisma } from './db';
import { ingestDocument, splitText } from './rag';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { recordAlert } from '@/lib/observability/system-alert';
import { recordRawFetch } from '@/lib/k2-cordis/raw-fetch';
import type { Prisma } from '@prisma/client';

/** Stable `SystemAlert.source` for everything this module reports. */
export const KEEP_EU_SYNC_ALERT_SOURCE = 'keep-eu-sync';

/**
 * Key Interreg & cross-border programmes eligible for Turkish beneficiaries:
 *   - 305: 2021–2027 Interreg VI-A IPA Bulgaria Türkiye
 *   - 387: 2021–2027 Interreg VI-B NEXT Black Sea Basin
 *   - 385: 2021–2027 Interreg VI-B NEXT Mediterranean Sea Basin (NEXT MED)
 *   - 66:  2014–2020 Interreg IPA CBC Bulgaria – Turkey
 */
export const DEFAULT_TURKEY_PROGRAMME_IDS: readonly number[] = [305, 387, 385, 66];

/**
 * Honest client identification. We do not impersonate a browser: keep.eu may refuse
 * bot traffic with HTTP 403, and in that case we alert and stop instead of retrying
 * under a different identity. Access must be agreed with Interact (keep.support@interact.eu).
 * The product token stays `FonBridge` on purpose after the NexaGrant rename (K-574984 = A):
 * an access arrangement with Interact may be tied to this exact User-Agent. Do not rename it
 * without a new decision; the other adapters may say NexaGrant.
 */
export const KEEP_EU_HTTP_USER_AGENT = 'FonBridge/1.0 (+https://nexagrant.com/contact)';

/** Upper bound for one keep.eu request; a hung upstream must not block a job or admin action. */
export const KEEP_EU_FETCH_TIMEOUT_MS = 30_000;

export const KEEP_EU_API_BASE_URL = 'https://keep.eu/api/open-data';

/** Namespace prefix for keep.eu-only project and organisation ids (never a CORDIS id). */
const KEEP_EU_KEY_PREFIX = 'KEU:';

/** Maps a stored id back to keep.eu terms: keep.eu-only keys become beneficiary ids, CORDIS PICs stay PICs. */
function splitKeepEuKey(storedId: string): { pic: string | null; beneficiaryId: string | null } {
  if (storedId.startsWith(KEEP_EU_KEY_PREFIX)) {
    return { pic: null, beneficiaryId: storedId.slice(KEEP_EU_KEY_PREFIX.length) };
  }
  return { pic: storedId, beneficiaryId: null };
}

/** How many already-imported projects a no-argument sync mirrors into RAG. */
const DEFAULT_DATABASE_BATCH = 200;

/**
 * keep.eu projects whose text must not reach OpenAI: each names a real person (K-575447 = C, FO-363).
 * Auto-detection missed 2 of 5 such cases, so the list is hand-verified and is a code constant on
 * purpose: the default is always "exclude", so a forgotten flag can never re-enable embedding.
 * These projects stay in the database; only the RAG embedding step skips them.
 */
export const RAG_EXCLUDED_PROJECT_IDS: readonly string[] = [
  'BGTR0300118',
  'BGTR0300121',
  'BGTR0300153',
  'BGTR0300155',
  'BGTR0300162',
];

export interface KeepEuPartnerRecord {
  partnerName: string;
  partnerTranslatedName?: string | null;
  country: string | null; // ISO-2 alpha code (e.g. 'TR', 'BG')
  countryName?: string | null;
  town?: string | null;
  pic?: string | null;
  beneficiaryId?: string | null;
  role: 'lead' | 'partner';
  legalStatus?: string | null;
  isTurkish: boolean;
  totalBudgetEUR?: number | null;
  euFundingEUR?: number | null;
  nuts?: Record<string, unknown> | null;
}

export interface KeepEuProjectRecord {
  projectId: string; // e.g. 'BGTR0200037' or keep internal id
  internalId?: number | null;
  acronym?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  interventionType?: string | null;
  programmeId: number | string;
  programmeTitle?: string | null;
  framework?: string; // 'INTERREG' default
  themes?: string[];
  totalBudgetEUR?: number | null;
  euFundingEUR?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  leadPartner?: KeepEuPartnerRecord | null;
  partners: KeepEuPartnerRecord[];
  rawJson?: Record<string, unknown>;
}

/**
 * Why keep.eu could not be read. A fixed code, never the upstream or exception text:
 * the detail goes to SystemAlert, and the admin UI maps the code to a translated message.
 */
export type KeepEuFetchErrorCode = 'missing_api_key' | 'forbidden' | 'upstream_error' | 'timeout' | 'network_error';

export interface KeepEuSyncResult {
  success: boolean;
  /** False when keep.eu could not be read; `source:'database'` figures are then stale re-indexes. */
  upstreamOk: boolean;
  /** Set exactly when `upstreamOk` is false. */
  upstreamError?: KeepEuFetchErrorCode;
  source: 'api' | 'input' | 'database';
  syncedProjectsCount: number;
  syncedPartnersCount: number;
  skippedCount: number;
  totalEuFundingEUR: number;
  totalBudgetEUR: number;
  programmesCount: number;
  /** Projects whose RAG document was (re)embedded this run. */
  ragEmbeddedCount: number;
  /** Projects whose stored RAG chunks already matched the record, so nothing was embedded. */
  ragUnchangedCount: number;
  /** Synced projects kept out of the RAG step by the personal-name exclusion list. */
  ragExcludedCount: number;
  /** Excluded ids that the upstream data did not contain (checked before any --limit cut). */
  ragExclusionMissingCount: number;
  syncedAt: string;
}

export interface KeepEuProgrammeBreakdown {
  programmeTitle: string;
  projectCount: number;
  totalGrantEUR: number;
}

export interface KeepEuCountryBreakdown {
  country: string;
  name: string;
  partnerCount: number;
  totalGrantEUR: number;
}

export interface KeepEuMetrics {
  totalProjectsCount: number;
  totalPartnersCount: number;
  turkishPartnersCount: number;
  totalEuFundingEUR: number;
  totalBudgetEUR: number;
  averageGrantPerProjectEUR: number;
  topProgrammesBreakdown: KeepEuProgrammeBreakdown[];
  topCountriesBreakdown: KeepEuCountryBreakdown[];
  lastSyncTimestamp: string;
}

/** Fields on the keep.eu project JSON that this importer explicitly recognizes. */
const KNOWN_KEEP_EU_PROJECT_FIELDS: ReadonlySet<string> = new Set([
  'acronym',
  'project_id',
  'keep_eu_internal_id',
  'translations',
  'themes',
  'call',
  'documents',
  'status',
  'relevant_mentions_and_prizes',
  'relevant_precedent_projects',
  'relevant_subsequent_projects',
  'relevant_linked_projects',
  'project_outputs',
  'website',
  'priority',
  'priority_policy_objective',
  'priority_specific_objective',
  'programme_common_output_indicator',
  'programme_output_indicator',
  'programme_common_result_indicator',
  'programme_result_indicator',
  'intervention_type',
  'infrastructure_investment_fields',
  'start_date',
  'end_date',
  'total_budget',
  'eu_funding',
  'union_co_financing_rate',
  'co_financing_sources',
  'erdf',
  'erdf_budget',
  'erdf_contribution_rate',
  'erdf_equivalent',
  'erdf_equivalent_budget',
  'ipa',
  'ipa_budget',
  'ipa_contribution_rate',
  'enpi_eni_ndici',
  'enpi_eni_ndici_budget',
  'enpi_eni_ndici_contribution_rate',
  'oct',
  'oct_contribution_amount',
  'oct_contribution_rate',
  'other',
  'other_budget',
  'erdf_equivalent_2021_2027',
  'third_country_contribution',
  'small_project',
  'technical_assistance',
  'strategic_importance',
  'deliverable',
  'contribution_strategies_policies',
  'delivered_output_indicator',
  'delivered_result_indicator',
  'project_deliverable_no_infra_areas',
  'eusbsr',
  'eusbsr_p_area_horizontal_action',
  'eusbsr_degree_of_compliance',
  'eusdr',
  'eusdr_p_area_horizontal_action',
  'eusdr_degree_of_compliance',
  'eusair',
  'eusair_p_area_horizontal_action',
  'eusair_degree_of_compliance',
  'eusalp',
  'eusalp_p_area_horizontal_action',
  'eusalp_degree_of_compliance',
  'hierarchy',
  'number_of_partnerships',
  'partnerships',
]);

function trimmed(value?: string | null): string | undefined {
  const s = typeof value === 'string' ? value.trim() : '';
  return s.length > 0 ? s : undefined;
}

function parseDate(value?: string | null): Date | null {
  const s = trimmed(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toEurBigInt(value?: number | null): bigint | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return BigInt(Math.round(value));
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** ISO-3166 alpha-2 rendered in Turkish, falling back to the raw code. */
function countryDisplayName(code: string): string {
  try {
    return new Intl.DisplayNames(['tr'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Extract schema drift from raw project payload. */
function detectProjectDrift(rawProject: Record<string, unknown>): Record<string, unknown> {
  const drift: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawProject)) {
    if (!KNOWN_KEEP_EU_PROJECT_FIELDS.has(key) && value !== undefined && value !== null && value !== '') {
      drift[key] = value;
    }
  }
  return drift;
}

/**
 * Normalizes a raw keep.eu partnership into a KeepEuPartnerRecord.
 */
export function normalizeKeepEuPartner(rawPart: Record<string, unknown>): KeepEuPartnerRecord | null {
  const partnerName =
    trimmed(rawPart.partner_name as string) ??
    trimmed(
      (rawPart.partner_translated_names as { en?: { name_translated?: string } } | undefined)?.en
        ?.name_translated
    );

  if (!partnerName) return null;

  const countryObj = rawPart.country as { name?: string; iso_code?: string } | undefined;
  const countryIso = trimmed(countryObj?.iso_code)?.toUpperCase() ?? null;
  const countryName = trimmed(countryObj?.name) ?? null;
  const isTurkish = countryIso === 'TR';

  const role = rawPart.type === 'lead' ? 'lead' : 'partner';
  const pic = trimmed(rawPart.pic as string) ?? null;
  const beneficiaryId = trimmed(rawPart.beneficiary_id as string) ?? null;
  const town = trimmed(rawPart.town as string) ?? null;
  const legalStatus = trimmed(rawPart.legal_status as string) ?? null;

  const totalBudgetEUR = parseNumber(rawPart.total_budget);
  const euFundingEUR =
    parseNumber(rawPart.eu_funding) ??
    parseNumber(rawPart.partner_cofinancing) ??
    parseNumber(rawPart.ipa_budget);

  const nuts = typeof rawPart.nuts === 'object' && rawPart.nuts !== null
    ? (rawPart.nuts as Record<string, unknown>)
    : null;

  const partnerTranslatedName =
    trimmed(
      (rawPart.partner_translated_names as { en?: { name_translated?: string } } | undefined)?.en
        ?.name_translated
    ) ?? null;

  return {
    partnerName,
    partnerTranslatedName,
    country: countryIso,
    countryName,
    town,
    pic,
    beneficiaryId,
    role,
    legalStatus,
    isTurkish,
    totalBudgetEUR,
    euFundingEUR,
    nuts,
  };
}

/**
 * Parses raw JSON returned by keep.eu Open Data API into normalized KeepEuProjectRecord array.
 */
export async function parseKeepEuResponse(
  data: unknown,
  options?: { persist?: boolean }
): Promise<{
  programmesCount: number;
  projects: KeepEuProjectRecord[];
}> {
  const persist = options?.persist !== false;

  if (typeof data !== 'object' || data === null || !('programmes' in data)) {
    if (persist) {
      await recordAlert({
        level: 'error',
        source: KEEP_EU_SYNC_ALERT_SOURCE,
        message: 'keep.eu API response malformed: missing "programmes" array',
        dedupeKey: 'keep-eu-sync:malformed-response',
      });
    }
    return { programmesCount: 0, projects: [] };
  }

  const programmes = (data as { programmes: unknown[] }).programmes;
  if (!Array.isArray(programmes)) {
    return { programmesCount: 0, projects: [] };
  }

  const normalizedProjects: KeepEuProjectRecord[] = [];

  for (const rawProg of programmes) {
    if (typeof rawProg !== 'object' || rawProg === null) continue;
    const prog = rawProg as Record<string, unknown>;
    const programmeId = (prog.id as number | string) ?? 'UNKNOWN';
    const programmeTitle = trimmed(prog.title as string) ?? null;
    const projectsList = Array.isArray(prog.projects) ? prog.projects : [];

    for (const rawProj of projectsList) {
      if (typeof rawProj !== 'object' || rawProj === null) continue;
      const p = rawProj as Record<string, unknown>;

      const projectId =
        trimmed(p.project_id as string) ??
        (p.keep_eu_internal_id ? `KEU-${p.keep_eu_internal_id}` : null);

      const translations = p.translations as Record<string, Record<string, string>> | undefined;
      const enTranslation = translations?.en ?? {};
      const acronym = trimmed(p.acronym as string) ?? null;
      const title =
        trimmed(enTranslation.name) ??
        acronym ??
        projectId ??
        'Untitled Interreg Project';

      const description =
        trimmed(enTranslation.description) ??
        trimmed(p.project_outputs as string) ??
        trimmed(p.deliverable as string) ??
        null;

      // Partnerships
      const rawPartnerships = Array.isArray(p.partnerships) ? p.partnerships : [];
      const partners: KeepEuPartnerRecord[] = [];
      let leadPartner: KeepEuPartnerRecord | null = null;

      for (const part of rawPartnerships) {
        if (typeof part !== 'object' || part === null) continue;
        const normalizedPart = normalizeKeepEuPartner(part as Record<string, unknown>);
        if (!normalizedPart) continue;

        partners.push(normalizedPart);
        if (normalizedPart.role === 'lead' && !leadPartner) {
          leadPartner = normalizedPart;
        }
      }

      // Themes
      const themes: string[] = [];
      if (Array.isArray(p.themes)) {
        for (const t of p.themes) {
          if (typeof t === 'string' && t.trim()) themes.push(t.trim());
          else if (typeof t === 'object' && t !== null && 'theme_name' in t) {
            const name = (t as { theme_name?: string }).theme_name;
            if (typeof name === 'string' && name.trim()) themes.push(name.trim());
          }
        }
      }

      // Drift detection (CLAUDE.md #6)
      const drift = detectProjectDrift(p);
      if (persist && Object.keys(drift).length > 0) {
        await recordAlert({
          level: 'warn',
          source: KEEP_EU_SYNC_ALERT_SOURCE,
          message: 'keep.eu project carried fields this importer does not map',
          meta: { projectId, unknownFields: Object.keys(drift) },
          dedupeKey: `keep-eu-sync:schema-drift:${Object.keys(drift).sort().join(',')}`,
        });
      }

      if (projectId) {
        normalizedProjects.push({
          projectId,
          internalId: typeof p.keep_eu_internal_id === 'number' ? p.keep_eu_internal_id : null,
          acronym,
          title,
          description,
          status: trimmed(p.status as string) ?? null,
          priority: trimmed(p.priority as string) ?? null,
          interventionType: trimmed(p.intervention_type as string) ?? null,
          programmeId,
          programmeTitle,
          framework: 'INTERREG',
          themes,
          totalBudgetEUR: parseNumber(p.total_budget),
          euFundingEUR: parseNumber(p.eu_funding) ?? parseNumber(p.ipa_budget),
          startDate: trimmed(p.start_date as string) ?? null,
          endDate: trimmed(p.end_date as string) ?? null,
          leadPartner,
          partners,
          rawJson: {
            ...drift,
            deliverable: p.deliverable ?? null,
            projectOutputs: p.project_outputs ?? null,
            interventionType: p.intervention_type ?? null,
            partnershipsCount: partners.length,
          },
        });
      }
    }
  }

  return {
    programmesCount: programmes.length,
    projects: normalizedProjects,
  };
}

/**
 * Fetches data from the keep.eu Open Data API with the proper User-Agent header and API key.
 * Records the raw payload envelope to `RawFetch` (CLAUDE.md #6).
 */
export async function fetchKeepEuOpenData(options?: {
  programmeIds?: number[] | string;
  apiKey?: string;
  userAgent?: string;
  /** False for dry runs: no RawFetch row and no SystemAlert is written. */
  persist?: boolean;
}): Promise<{ ok: boolean; data: unknown; error?: KeepEuFetchErrorCode; status?: number }> {
  const persist = options?.persist !== false;
  const apiKey = options?.apiKey ?? env.KEEP_EU_API_KEY;
  if (!apiKey) {
    if (persist) {
      await recordAlert({
        level: 'error',
        source: KEEP_EU_SYNC_ALERT_SOURCE,
        message: 'keep.eu fetch skipped: KEEP_EU_API_KEY is not configured in environment',
        dedupeKey: 'keep-eu-sync:missing-api-key',
      });
    }
    return { ok: false, data: null, error: 'missing_api_key' };
  }

  const idsParam = options?.programmeIds
    ? Array.isArray(options.programmeIds)
      ? options.programmeIds.join(',')
      : String(options.programmeIds)
    : DEFAULT_TURKEY_PROGRAMME_IDS.join(',');

  const url = `${KEEP_EU_API_BASE_URL}?key=${encodeURIComponent(apiKey)}&ids=${encodeURIComponent(idsParam)}`;
  const userAgent = options?.userAgent ?? KEEP_EU_HTTP_USER_AGENT;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(KEEP_EU_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const statusText = `HTTP ${response.status} ${response.statusText}`;
      if (persist) {
        await recordAlert({
          level: 'error',
          source: KEEP_EU_SYNC_ALERT_SOURCE,
          message:
            response.status === 403
              ? `keep.eu refused access (${statusText}); access must be agreed with Interact`
              : `keep.eu API returned error: ${statusText}`,
          meta: { status: response.status, programmeIds: idsParam },
          dedupeKey:
            response.status === 403
              ? 'keep_eu_forbidden'
              : `keep-eu-sync:http-error-${response.status}`,
        });
      }
      // The status is for server-side callers (the CLI dry run). It never reaches the admin action.
      return {
        ok: false,
        data: null,
        error: response.status === 403 ? 'forbidden' : 'upstream_error',
        status: response.status,
      };
    }

    const json = await response.json();

    // CLAUDE.md #6: the full upstream body is stored. The hash covers only the body, so an
    // unchanged response short-circuits even though `fetchedAt` differs between runs.
    const body = json as Record<string, unknown>;
    if (persist) {
      await recordRawFetch({
        source: 'keep_eu_open_data',
        key: `programmes_${idsParam}`,
        hash: createHash('sha256').update(JSON.stringify(json)).digest('hex'),
        payload: {
          url: KEEP_EU_API_BASE_URL,
          programmeIds: idsParam,
          status: response.status,
          fetchedAt: new Date().toISOString(),
          exportedDate: (body['exported date'] as string | undefined) ?? null,
          body,
        },
      });
    }

    return { ok: true, data: json };
  } catch (err) {
    const message = errorMessage(err);
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    if (persist) {
      await recordAlert({
        level: 'error',
        source: KEEP_EU_SYNC_ALERT_SOURCE,
        message: timedOut
          ? `keep.eu did not answer within ${KEEP_EU_FETCH_TIMEOUT_MS / 1000}s`
          : `keep.eu fetch network error: ${message}`,
        meta: { programmeIds: idsParam },
        dedupeKey: timedOut ? 'keep-eu-sync:timeout' : 'keep-eu-sync:network-error',
      });
    }
    return { ok: false, data: null, error: timedOut ? 'timeout' : 'network_error' };
  }
}

/**
 * Persists one keep.eu project and its partners into the database (`CordisProject`,
 * `CordisOrganization`, `CordisParticipation`).
 *
 * Idempotent by design: uses `upsert` on natural keys.
 */
export async function persistKeepEuRecord(record: KeepEuProjectRecord): Promise<boolean> {
  const rawProjectId = trimmed(record.projectId);
  const title = trimmed(record.title);

  if (!rawProjectId || !title) {
    await recordAlert({
      level: 'warn',
      source: KEEP_EU_SYNC_ALERT_SOURCE,
      message: 'keep.eu record skipped: missing project id or title',
      meta: { projectId: rawProjectId ?? null, hasTitle: Boolean(title) },
      dedupeKey: 'keep-eu-sync:record-missing-id-or-title',
    });
    return false;
  }

  // keep.eu ids live in their own namespace so they can never overwrite a CORDIS project
  // that happens to share the same numeric id.
  const projectId = `${KEEP_EU_KEY_PREFIX}${rawProjectId}`;

  const ecMaxContribution = toEurBigInt(record.euFundingEUR);
  const totalCost = toEurBigInt(record.totalBudgetEUR);

  const projectCore = {
    acronym: trimmed(record.acronym) ?? null,
    title,
    objective: trimmed(record.description) ?? null,
    startDate: parseDate(record.startDate),
    endDate: parseDate(record.endDate),
    status: trimmed(record.status) ?? null,
    masterCall: trimmed(record.programmeTitle) ?? `Programme ${record.programmeId}`,
    subCall: trimmed(record.priority) ?? null,
    totalCost,
    ecMaxContribution,
    rawJson: (record.rawJson ?? {}) as unknown as Prisma.InputJsonObject,
  };

  await prisma.cordisProject.upsert({
    where: { id: projectId },
    create: {
      id: projectId,
      framework: record.framework ?? 'INTERREG',
      ...projectCore,
    },
    update: projectCore,
  });

  // Persist Priority/Topic if available
  const priority = trimmed(record.priority);
  if (priority) {
    const topicCode = priority.length > 50 ? priority.slice(0, 50) : priority;
    await prisma.cordisProjectTopic.upsert({
      where: { projectId_topicCode: { projectId, topicCode } },
      create: { projectId, topicCode, topicTitle: priority },
      update: { topicTitle: priority },
    });
  }

  // Persist Partners & Participations
  for (const partner of record.partners) {
    const partnerName = trimmed(partner.partnerName);
    if (!partnerName) continue;

    // Determine organisation key:
    // If partner has PIC, use PIC.
    // If no PIC, use beneficiary ID or clean slug with KEU prefix.
    const beneficiaryKey = trimmed(partner.beneficiaryId?.split('|')[0]);
    const orgId =
      trimmed(partner.pic) ?? (beneficiaryKey ? `${KEEP_EU_KEY_PREFIX}${beneficiaryKey}` : null);

    if (orgId) {
      const country = trimmed(partner.country) ?? null;
      const city = trimmed(partner.town) ?? null;
      const isTurkish = country === 'TR' || partner.isTurkish;

      // CORDIS rows are authoritative (FO-58: "mevcut CORDIS verisine dokunulmaz"). keep.eu
      // only creates a missing organisation or fills fields that are still empty.
      const existing = await prisma.cordisOrganization.findUnique({
        where: { organisationId: orgId },
        select: { name: true, nameNormalized: true, country: true, city: true },
      });
      if (!existing) {
        await prisma.cordisOrganization.create({
          data: {
            organisationId: orgId,
            name: partnerName,
            nameNormalized: partnerName.toLocaleUpperCase('en-US'),
            country,
            city,
            isTurkish,
            rawJson: (partner.nuts ?? {}) as unknown as Prisma.InputJsonObject,
          },
        });
      } else {
        const fill: Prisma.CordisOrganizationUpdateInput = {};
        if (!existing.nameNormalized) fill.nameNormalized = partnerName.toLocaleUpperCase('en-US');
        if (!existing.country && country) {
          fill.country = country;
          fill.isTurkish = country === 'TR';
        }
        if (!existing.city && city) fill.city = city;
        if (Object.keys(fill).length > 0) {
          await prisma.cordisOrganization.update({ where: { organisationId: orgId }, data: fill });
        }
      }

      const role = partner.role === 'lead' ? 'coordinator' : 'participant';
      const ecContribution = toEurBigInt(partner.euFundingEUR);
      const partnerTotalCost = toEurBigInt(partner.totalBudgetEUR);

      await prisma.cordisParticipation.upsert({
        where: { projectId_organisationId: { projectId, organisationId: orgId } },
        create: {
          projectId,
          organisationId: orgId,
          role,
          ecContribution,
          totalCost: partnerTotalCost,
        },
        update: { role, ecContribution, totalCost: partnerTotalCost },
      });
    } else {
      // Unkeyable partner (no PIC and no beneficiary id)
      await recordAlert({
        level: 'warn',
        source: KEEP_EU_SYNC_ALERT_SOURCE,
        message: 'keep.eu partner has neither PIC nor beneficiary id; participation not written',
        meta: { projectId, partnerName },
        dedupeKey: 'keep-eu-sync:partner-unkeyable',
      });
    }
  }

  return true;
}

/** Formats one project as a rich RAG document. */
export function buildKeepEuRagBody(record: KeepEuProjectRecord): string {
  const leadPartnerStr = record.leadPartner
    ? `Lead Partner: ${record.leadPartner.partnerName}${record.leadPartner.country ? ` (${record.leadPartner.country})` : ''}`
    : null;

  const turkishPartners = record.partners
    .filter((p) => p.isTurkish || p.country === 'TR')
    .map((p) => `${p.partnerName}${p.town ? ` (${p.town})` : ''}`);

  const lines = [
    `Interreg / Cross-Border Project: ${record.acronym ? `${record.acronym} - ` : ''}${record.title}`,
    `Project ID: ${record.projectId}`,
    record.programmeTitle ? `Programme: ${record.programmeTitle}` : null,
    record.priority ? `Priority: ${record.priority}` : null,
    record.status ? `Status: ${record.status}` : null,
    record.startDate && record.endDate ? `Period: ${record.startDate} - ${record.endDate}` : null,
    typeof record.totalBudgetEUR === 'number'
      ? `Total Budget: EUR ${record.totalBudgetEUR.toLocaleString('en-US')}`
      : null,
    typeof record.euFundingEUR === 'number'
      ? `EU Funding / IPA Grant: EUR ${record.euFundingEUR.toLocaleString('en-US')}`
      : null,
    leadPartnerStr,
    turkishPartners.length > 0 ? `Turkish Beneficiaries: ${turkishPartners.join('; ')}` : null,
    record.themes && record.themes.length > 0 ? `Themes: ${record.themes.join(', ')}` : null,
    record.description ? `Objective / Summary: ${record.description}` : null,
  ];

  return lines.filter((l): l is string => Boolean(l)).join('\n');
}

/** Loads existing Interreg projects from database for RAG re-indexing. */
async function loadInterregProjectsFromDatabase(take: number): Promise<KeepEuProjectRecord[]> {
  const rows = await prisma.cordisProject.findMany({
    where: { framework: 'INTERREG' },
    take,
    orderBy: { importedAt: 'desc' },
    include: {
      topics: true,
      participations: {
        include: { organization: true },
      },
    },
  });

  return rows.map((row) => {
    const leadParticipation = row.participations.find((p) => p.role === 'coordinator');
    const partners: KeepEuPartnerRecord[] = row.participations.map((p) => ({
      partnerName: p.organization.name,
      country: p.organization.country,
      ...splitKeepEuKey(p.organisationId),
      role: p.role === 'coordinator' ? 'lead' : 'partner',
      isTurkish: p.organization.isTurkish,
      totalBudgetEUR: p.totalCost ? Number(p.totalCost) : null,
      euFundingEUR: p.ecContribution ? Number(p.ecContribution) : null,
      town: p.organization.city,
    }));

    return {
      projectId: splitKeepEuKey(row.id).beneficiaryId ?? row.id,
      acronym: row.acronym,
      title: row.title,
      description: row.objective,
      status: row.status,
      programmeId: 'INTERREG',
      programmeTitle: row.masterCall,
      priority: row.subCall,
      framework: row.framework,
      totalBudgetEUR: row.totalCost ? Number(row.totalCost) : null,
      euFundingEUR: row.ecMaxContribution ? Number(row.ecMaxContribution) : null,
      startDate: row.startDate ? row.startDate.toISOString() : null,
      endDate: row.endDate ? row.endDate.toISOString() : null,
      leadPartner: leadParticipation
        ? {
            partnerName: leadParticipation.organization.name,
            country: leadParticipation.organization.country,
            ...splitKeepEuKey(leadParticipation.organisationId),
            role: 'lead',
            isTurkish: leadParticipation.organization.isTurkish,
          }
        : null,
      partners,
    };
  });
}

export interface KeepEuSyncOptions {
  records?: KeepEuProjectRecord[];
  programmeIds?: number[] | string;
  /** Defaults to KEEP_EU_API_KEY from the environment. */
  apiKey?: string;
  sourceFromDatabaseOnly?: boolean;
  /** When the keep.eu request fails, re-index existing DB rows instead of stopping. Reported as `success:false`. */
  allowDatabaseFallback?: boolean;
  skipRag?: boolean;
  /**
   * Project ids kept out of RAG embedding. Omit to apply RAG_EXCLUDED_PROJECT_IDS (the default).
   * Pass an empty array only in tests.
   */
  ragExcludeProjectIds?: readonly string[];
  limit?: number;
  onProgress?: (info: {
    current: number;
    total: number;
    project: KeepEuProjectRecord;
    skipped: boolean;
    error?: string;
  }) => void;
}

/**
 * Main synchronization orchestrator:
 *   - If `records` provided: persists them and mirrors to RAG.
 *   - If no records provided: fetches from keep.eu Open Data API, persists, and mirrors to RAG.
 *   - If API fetch disabled or fails and fallback requested: re-mirrors existing database rows.
 */
export async function syncKeepEuData(options?: KeepEuSyncOptions): Promise<KeepEuSyncResult> {
  let source: 'api' | 'input' | 'database' = 'input';
  let dataset: KeepEuProjectRecord[] = [];
  let programmesCount = 1;
  let upstreamOk = true;
  let upstreamError: KeepEuFetchErrorCode | undefined;

  if (options?.records) {
    source = 'input';
    dataset = options.records;
  } else if (options?.sourceFromDatabaseOnly) {
    source = 'database';
    dataset = await loadInterregProjectsFromDatabase(DEFAULT_DATABASE_BATCH);
  } else {
    source = 'api';
    const fetchRes = await fetchKeepEuOpenData({ programmeIds: options?.programmeIds, apiKey: options?.apiKey });
    if (!fetchRes.ok || !fetchRes.data) {
      // The upstream failed, so nothing new was read. Re-indexing old rows is an explicit opt-in
      // and is reported as a failure: it must never look like a successful sync.
      upstreamOk = false;
      upstreamError = fetchRes.error ?? 'upstream_error';
      if (options?.allowDatabaseFallback) {
        dataset = await loadInterregProjectsFromDatabase(DEFAULT_DATABASE_BATCH);
        source = 'database';
      }
    } else {
      const parsed = await parseKeepEuResponse(fetchRes.data);
      dataset = parsed.projects;
      programmesCount = parsed.programmesCount;
    }
  }

  const excludedIds = new Set(options?.ragExcludeProjectIds ?? RAG_EXCLUDED_PROJECT_IDS);
  const upstreamIds = new Set(dataset.map((r) => r.projectId));
  // An upstream outage yields no data at all: that is not evidence that an id is missing.
  const missingExcluded = upstreamOk && dataset.length > 0 ? [...excludedIds].filter((id) => !upstreamIds.has(id)) : [];
  // The database source only loads a batch, so a missing id there proves nothing; warn only on full upstream data.
  if (missingExcluded.length > 0 && source !== 'database' && !options?.limit) {
    await recordAlert({
      level: 'warn',
      source: KEEP_EU_SYNC_ALERT_SOURCE,
      message: `RAG exclusion: ${missingExcluded.length} listed project id(s) not in upstream data`,
      meta: { missingCount: missingExcluded.length },
      dedupeKey: 'keep-eu-sync:rag-exclusion-missing',
    });
  }

  if (typeof options?.limit === 'number' && options.limit > 0) {
    dataset = dataset.slice(0, options.limit);
  }

  let syncedProjectsCount = 0;
  let syncedPartnersCount = 0;
  let skippedCount = 0;
  let totalEuFundingEUR = 0;
  let totalBudgetEUR = 0;
  let ragEmbeddedCount = 0;
  let ragUnchangedCount = 0;
  let ragExcludedCount = 0;

  for (let i = 0; i < dataset.length; i++) {
    const record = dataset[i]!;
    try {
      if (source !== 'database') {
        const written = await persistKeepEuRecord(record);
        if (!written) {
          skippedCount++;
          if (options?.onProgress) {
            options.onProgress({
              current: i + 1,
              total: dataset.length,
              project: record,
              skipped: true,
              error: 'Failed to persist record',
            });
          }
          continue;
        }
      }

      if (excludedIds.has(record.projectId)) {
        ragExcludedCount++;
      } else if (!options?.skipRag) {
        const docTitle = `INTERREG Project: ${record.acronym ?? record.projectId} - ${record.title}`;
        const body = buildKeepEuRagBody(record);

        if (await ragMirrorIsCurrent(docTitle, body)) {
          ragUnchangedCount++;
        } else {
          await prisma.document.deleteMany({
            where: {
              tenantId: null,
              kind: 'INTERREG_PROJECT',
              title: docTitle,
            },
          });

          // Shared public RAG corpus (tenantId is undefined)
          await ingestDocument(docTitle, body, 'INTERREG_PROJECT');
          ragEmbeddedCount++;
        }
      }

      syncedProjectsCount++;
      syncedPartnersCount += record.partners.length;
      if (typeof record.euFundingEUR === 'number' && Number.isFinite(record.euFundingEUR)) {
        totalEuFundingEUR += record.euFundingEUR;
      }
      if (typeof record.totalBudgetEUR === 'number' && Number.isFinite(record.totalBudgetEUR)) {
        totalBudgetEUR += record.totalBudgetEUR;
      }

      if (options?.onProgress) {
        options.onProgress({
          current: i + 1,
          total: dataset.length,
          project: record,
          skipped: false,
        });
      }
    } catch (e) {
      skippedCount++;
      const err = errorMessage(e);
      await recordAlert({
        level: 'error',
        source: KEEP_EU_SYNC_ALERT_SOURCE,
        message: `keep.eu record failed to sync: ${err}`,
        meta: { projectId: record.projectId },
        dedupeKey: 'keep-eu-sync:record-sync-failed',
      });

      if (options?.onProgress) {
        options.onProgress({
          current: i + 1,
          total: dataset.length,
          project: record,
          skipped: true,
          error: err,
        });
      }
    }
  }

  return {
    success: upstreamOk && skippedCount === 0,
    upstreamOk,
    upstreamError,
    source,
    syncedProjectsCount,
    syncedPartnersCount,
    skippedCount,
    totalEuFundingEUR,
    totalBudgetEUR,
    programmesCount,
    ragEmbeddedCount,
    ragUnchangedCount,
    ragExcludedCount,
    ragExclusionMissingCount: missingExcluded.length,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * True when the shared RAG document for this project already holds exactly the
 * chunks `body` would produce, so re-embedding it would change nothing.
 *
 * Compares the stored `Chunk.text` rows (ordinal order) with `splitText(body)`.
 * That needs no new column: the stored chunks are the record's text, and any
 * change to the record changes at least one chunk. Only a single existing
 * document counts as current; zero or several (a legacy duplicate) means
 * rebuild. Failing closed here costs one re-embed, never a missing document.
 */
async function ragMirrorIsCurrent(docTitle: string, body: string): Promise<boolean> {
  const existing = await prisma.document.findMany({
    where: { tenantId: null, kind: 'INTERREG_PROJECT', title: docTitle },
    select: { chunks: { orderBy: { ordinal: 'asc' }, select: { text: true } } },
    take: 2,
  });
  if (existing.length !== 1) return false;

  const stored = existing[0]!.chunks.map((c) => c.text);
  const wanted = splitText(body);
  return stored.length === wanted.length && stored.every((text, i) => text === wanted[i]);
}

interface CountryAggregateRow {
  country: string | null;
  partnerCount: bigint | number;
  totalGrantEUR: bigint | number | null;
}

interface ProgrammeAggregateRow {
  masterCall: string | null;
  projectCount: bigint | number;
  totalGrantEUR: bigint | number | null;
}

/**
 * Aggregates measured Interreg / keep.eu metrics from the database (CLAUDE.md #7).
 */
export async function aggregateKeepEuMetrics(): Promise<KeepEuMetrics> {
  const [totalProjectsCount, totalEuFundingAgg, totalBudgetAgg, countryRows, programmeRows, turkishPartnersCount, distinctPartnersRows, newestProject] =
    await Promise.all([
      prisma.cordisProject.count({ where: { framework: 'INTERREG' } }),
      prisma.cordisProject.aggregate({
        where: { framework: 'INTERREG' },
        _sum: { ecMaxContribution: true },
      }),
      prisma.cordisProject.aggregate({
        where: { framework: 'INTERREG' },
        _sum: { totalCost: true },
      }),
      prisma.$queryRaw<CountryAggregateRow[]>`
        SELECT o."country" AS "country",
               COUNT(DISTINCT p."organisationId") AS "partnerCount",
               COALESCE(SUM(p."ecContribution"), 0) AS "totalGrantEUR"
        FROM "CordisParticipation" p
        JOIN "CordisOrganization" o ON o."organisationId" = p."organisationId"
        JOIN "CordisProject" pr ON pr."id" = p."projectId"
        WHERE pr."framework" = 'INTERREG' AND o."country" IS NOT NULL
        GROUP BY o."country"
        ORDER BY COUNT(DISTINCT p."organisationId") DESC
        LIMIT 10
      `,
      prisma.$queryRaw<ProgrammeAggregateRow[]>`
        SELECT pr."masterCall" AS "masterCall",
               COUNT(pr."id") AS "projectCount",
               COALESCE(SUM(pr."ecMaxContribution"), 0) AS "totalGrantEUR"
        FROM "CordisProject" pr
        WHERE pr."framework" = 'INTERREG' AND pr."masterCall" IS NOT NULL
        GROUP BY pr."masterCall"
        ORDER BY COUNT(pr."id") DESC
        LIMIT 10
      `,
      prisma.cordisParticipation.count({
        where: {
          project: { framework: 'INTERREG' },
          organization: { isTurkish: true },
        },
      }),
      prisma.$queryRaw<{ count: bigint | number }[]>`
        SELECT COUNT(DISTINCT p."organisationId") AS "count"
        FROM "CordisParticipation" p
        JOIN "CordisProject" pr ON pr."id" = p."projectId"
        WHERE pr."framework" = 'INTERREG'
      `,
      prisma.cordisProject.findFirst({
        where: { framework: 'INTERREG' },
        orderBy: { importedAt: 'desc' },
        select: { importedAt: true },
      }),
    ]);

  const totalEuFundingEUR = Number(totalEuFundingAgg._sum.ecMaxContribution ?? 0);
  const totalBudgetEUR = Number(totalBudgetAgg._sum.totalCost ?? 0);

  const topCountriesBreakdown: KeepEuCountryBreakdown[] = (countryRows as CountryAggregateRow[])
    .filter((row): row is CountryAggregateRow & { country: string } => Boolean(row.country))
    .map((row) => ({
      country: row.country,
      name: countryDisplayName(row.country),
      partnerCount: Number(row.partnerCount),
      totalGrantEUR: Number(row.totalGrantEUR ?? 0),
    }));

  const topProgrammesBreakdown: KeepEuProgrammeBreakdown[] = (programmeRows as ProgrammeAggregateRow[])
    .filter((row): row is ProgrammeAggregateRow & { masterCall: string } => Boolean(row.masterCall))
    .map((row) => ({
      programmeTitle: row.masterCall,
      projectCount: Number(row.projectCount),
      totalGrantEUR: Number(row.totalGrantEUR ?? 0),
    }));

  const totalPartnersCount = Number((distinctPartnersRows as { count: bigint | number }[])[0]?.count ?? 0);

  return {
    totalProjectsCount,
    totalPartnersCount,
    turkishPartnersCount,
    totalEuFundingEUR,
    totalBudgetEUR,
    averageGrantPerProjectEUR:
      totalProjectsCount > 0 ? Math.round(totalEuFundingEUR / totalProjectsCount) : 0,
    topProgrammesBreakdown,
    topCountriesBreakdown,
    lastSyncTimestamp: newestProject?.importedAt ? newestProject.importedAt.toISOString() : '',
  };
}
