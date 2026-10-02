import { logger } from '../logger';
import { createAdapterAlert, reportSchemaDrift } from './alerts';
import {
  type AdapterResult,
  adapterError,
  adapterOk,
  computeAgeInDays,
  type Deadline,
  detectLumpSum,
  detectTwoStage,
  type Eligibility,
  errorMessage,
  inferEligibilityFromText,
  OPEN_ELIGIBILITY,
  stripHtml,
} from './schemas/common';
import {
  mapSediaStatus,
  SEDIA_STATUS_CODES,
  SediaBudgetOverviewSchema,
  SediaRawResultSchema,
  SediaSearchEnvelopeSchema,
  SediaTopicSchema,
  type SediaTopic,
} from './schemas/sedia';

export { createAdapterAlert, reportSchemaDrift };
export {
  SediaTopicSchema,
  SediaRawResultSchema,
  SediaSearchEnvelopeSchema,
  SEDIA_STATUS_CODES,
  mapSediaStatus,
};
export type { SediaTopic };

export const SEDIA_SOURCE = 'sedia';

export interface SediaSearchOptions {
  text?: string;
  pageSize?: number;
  maxPages?: number;
  /**
   * First SEDIA page to fetch, 1-based (default 1). The live search on the calls
   * page asks for exactly the page a person is on; the daily job walks from 1.
   */
  startPage?: number;
  statuses?: string[];
  frameworkProgrammes?: string[];
  types?: string[];
  languages?: string[];
  /**
   * Fetch `topicDetails/<id>.json` for topics whose description is missing from
   * the search payload. Off by default: the search response already carries
   * `descriptionByte` and `topicConditions`, so enrichment would add one blocking
   * HTTP round-trip per topic (≈1000 per daily run) for almost no extra data.
   */
  enrichFromTopicDetails?: boolean;
  /** Hard cap on enrichment round-trips, even when enabled. */
  maxDetailFetches?: number;
}

export interface SediaSearchResult {
  totalResults: number;
  pageNumber: number;
  pageSize: number;
  topics: SediaTopic[];
  /** Upstream shape problems seen while parsing — empty means the API matched. */
  schemaDrift: string[];
  /** Transport/parse errors that stopped pagination early. */
  errors: string[];
}

function firstOf(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const v = value[0];
    return typeof v === 'string' ? v : v === undefined || v === null ? undefined : String(v);
  }
  if (typeof value === 'string') return value;
  return undefined;
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') return [value];
  return [];
}

/** SEDIA sends `2027-04-06T00:00:00.000+0000` or a bare `2027-04-06`. */
function toIsoDeadline(raw: string): string | null {
  if (!raw) return null;
  const withTime = raw.includes('T') ? raw : `${raw}T17:00:00Z`;
  const d = new Date(withTime);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toIsoDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export class SediaAdapter {
  private baseUrl = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
  private apiKey = 'SEDIA';

  /**
   * Optional per-topic enrichment. Kept for topics the search payload leaves
   * empty; callers must opt in via `enrichFromTopicDetails`.
   */
  private async fetchTopicDetails(
    identifier: string
  ): Promise<{ description?: string; eligibility?: Eligibility } | null> {
    try {
      const url = `https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/${identifier.toLowerCase()}.json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;

      const data = (await response.json()) as Record<string, unknown>;
      const details: { description?: string; eligibility?: Eligibility } = {};

      if (typeof data.description === 'string') {
        details.description = stripHtml(data.description);
      }
      if (data.eligibility) {
        const eligText = stripHtml(String(data.eligibility));
        details.eligibility = inferEligibilityFromText(eligText) ?? {
          ...OPEN_ELIGIBILITY,
          notes: eligText,
        };
      }

      return details;
    } catch {
      return null;
    }
  }

  /**
   * Normalize one raw search result. Pure — no I/O — so it is unit-testable
   * against a captured payload.
   */
  normalizeResult(item: Record<string, unknown>, now: Date = new Date()): SediaTopic {
    const meta = (item.metadata ?? {}) as Record<string, unknown>;

    const identifier =
      firstOf(meta.identifier) ??
      firstOf(meta.REFERENCE) ??
      (typeof item.reference === 'string' ? item.reference : undefined) ??
      'UNKNOWN-ID';
    const title =
      firstOf(meta.title) ??
      (typeof item.summary === 'string' ? item.summary : undefined) ??
      'Untitled Topic';

    const status = mapSediaStatus(firstOf(meta.status));
    const typeOfAction = firstOf(meta.typesOfAction) ?? 'Grant';
    const frameworkProgramme =
      firstOf(meta.frameworkProgramme) ?? firstOf(meta.programmeDivision) ?? 'EU Funding';
    const callIdentifier =
      firstOf(meta.callIdentifier) ?? identifier.split('-').slice(0, 3).join('-');
    const callTitle = firstOf(meta.callTitle) ?? '';
    const destination = firstOf(meta.destination);
    const sourceUrl =
      firstOf(meta.url) ??
      `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identifier}`;

    const deadlines: Deadline[] = [];
    let plannedOpeningDate = toIsoDate(firstOf(meta.plannedOpeningDate) ?? firstOf(meta.startDate));
    let budgetPerProjectCents: number | undefined;
    let isTwoStage = detectTwoStage(firstOf(meta.deadlineModel));

    // budgetOverview carries the authoritative deadline dates (17:00 Brussels),
    // the deadline model and the per-year budget.
    const budgetRaw = firstOf(meta.budgetOverview);
    if (budgetRaw) {
      try {
        const parsed = SediaBudgetOverviewSchema.safeParse(JSON.parse(budgetRaw));
        if (parsed.success) {
          for (const actions of Object.values(parsed.data.budgetTopicActionMap ?? {})) {
            for (const act of actions) {
              if (detectTwoStage(act.deadlineModel)) isTwoStage = true;
              if (act.plannedOpeningDate && !plannedOpeningDate) {
                plannedOpeningDate = toIsoDate(act.plannedOpeningDate);
              }
              for (const [idx, dStr] of (act.deadlineDates ?? []).entries()) {
                const at = toIsoDeadline(dStr);
                if (at) deadlines.push({ stage: idx + 1, at, tz: 'Europe/Brussels' });
              }
              const budgets = Object.values(act.budgetYearMap ?? {}).map(
                (v) => parseFloat(String(v)) || 0
              );
              const maxBudget = budgets.length > 0 ? Math.max(...budgets) : 0;
              if (maxBudget > 0) budgetPerProjectCents = Math.round(maxBudget * 100);
            }
          }
        }
      } catch {
        // A malformed budgetOverview must not drop the whole topic.
      }
    }

    if (deadlines.length === 0) {
      for (const [idx, dStr] of toArray(meta.deadlineDate).entries()) {
        const at = toIsoDeadline(dStr);
        if (at) deadlines.push({ stage: idx + 1, at, tz: 'Europe/Brussels' });
      }
    }

    deadlines.sort((a, b) => a.at.localeCompare(b.at));
    deadlines.forEach((d, idx) => {
      d.stage = idx + 1;
    });
    const nextDeadlineAt = deadlines.length > 0 ? deadlines[0]!.at : null;
    if (deadlines.length > 1) isTwoStage = true;

    // The search payload already ships the topic description and the eligibility
    // conditions as HTML — no per-topic round-trip needed.
    const description =
      stripHtml(firstOf(meta.descriptionByte)) ||
      (typeof item.summary === 'string' ? item.summary : '') ||
      undefined;
    const conditions = stripHtml(firstOf(meta.topicConditions));

    const isLumpSum = detectLumpSum(title, typeOfAction, firstOf(meta.typeOfMGAs), conditions);

    const eligibility: Eligibility =
      inferEligibilityFromText(`${title} ${typeOfAction} ${conditions} ${description ?? ''}`) ??
      OPEN_ELIGIBILITY;

    const raw = {
      identifier,
      title,
      status,
      typeOfAction,
      frameworkProgramme,
      callIdentifier,
      callTitle,
      isLumpSum,
      isTwoStage,
      budgetPerProjectCents,
      deadlines,
      nextDeadlineAt,
      plannedOpeningDate,
      ageInDays: computeAgeInDays(plannedOpeningDate, now),
      eligibility,
      destination,
      keywords: toArray(meta.keywords),
      description,
      sourceUrl,
    };

    const parsed = SediaTopicSchema.safeParse(raw);
    return parsed.success ? parsed.data : (raw as SediaTopic);
  }

  async searchSedia(options: SediaSearchOptions = {}): Promise<SediaSearchResult> {
    const {
      text = '***',
      pageSize = 100,
      maxPages = 10,
      startPage = 1,
      statuses = [SEDIA_STATUS_CODES.FORTHCOMING, SEDIA_STATUS_CODES.OPEN],
      frameworkProgrammes = [],
      types = ['1'],
      languages = ['en'],
      enrichFromTopicDetails = false,
      maxDetailFetches = 25,
    } = options;

    const queryText = text.trim() || '***';
    const mustConditions: Record<string, unknown>[] = [];

    if (types.length > 0) mustConditions.push({ terms: { type: types } });
    if (statuses.length > 0) mustConditions.push({ terms: { status: statuses } });
    if (frameworkProgrammes.length > 0) {
      mustConditions.push({ terms: { frameworkProgramme: frameworkProgrammes } });
    }

    const queryObj = { bool: { must: mustConditions } };

    const topics: SediaTopic[] = [];
    const schemaDrift: string[] = [];
    const errors: string[] = [];
    const now = new Date();
    let totalResults = 0;
    const firstPage = Math.max(1, Math.floor(startPage));
    let pageNumber = firstPage;
    let detailFetches = 0;

    while (pageNumber < firstPage + maxPages) {
      const encodedText = encodeURIComponent(queryText);
      const searchUrl = `${this.baseUrl}?apiKey=${this.apiKey}&text=${encodedText}&pageSize=${pageSize}&pageNumber=${pageNumber}`;

      logger.info(
        `[SediaAdapter] Fetching page ${pageNumber} (${pageNumber - firstPage + 1}/${maxPages}), size=${pageSize}`
      );

      try {
        const formData = new FormData();
        formData.append(
          'query',
          new Blob([JSON.stringify(queryObj)], { type: 'application/json' }),
          'query.json'
        );
        formData.append(
          'languages',
          new Blob([JSON.stringify(languages)], { type: 'application/json' }),
          'languages.json'
        );

        const response = await fetch(searchUrl, { method: 'POST', body: formData });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data: unknown = await response.json();

        // Envelope check — a failure here is a real API contract change.
        const envelope = SediaSearchEnvelopeSchema.safeParse(data);
        if (!envelope.success) {
          schemaDrift.push(
            `search envelope changed on page ${pageNumber}: ${envelope.error.issues
              .slice(0, 3)
              .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
              .join('; ')}`
          );
        }

        const rawResults: unknown[] = envelope.success
          ? envelope.data.results
          : Array.isArray((data as { results?: unknown })?.results)
            ? ((data as { results: unknown[] }).results)
            : [];

        if (pageNumber === firstPage && envelope.success) {
          totalResults = envelope.data.totalResults;
        }

        if (rawResults.length === 0) {
          logger.info(`[SediaAdapter] No results on page ${pageNumber}, stopping pagination`);
          break;
        }

        for (const item of rawResults) {
          const shape = SediaRawResultSchema.safeParse(item);
          if (!shape.success) {
            schemaDrift.push(
              `result missing required metadata: ${shape.error.issues
                .slice(0, 2)
                .map((i) => i.path.join('.'))
                .join(', ')}`
            );
            continue;
          }

          try {
            const topic = this.normalizeResult(shape.data as Record<string, unknown>, now);

            if (
              enrichFromTopicDetails &&
              !topic.description &&
              detailFetches < maxDetailFetches
            ) {
              detailFetches++;
              const details = await this.fetchTopicDetails(topic.identifier);
              if (details?.description) topic.description = details.description;
              if (details?.eligibility?.restricted && !topic.eligibility.restricted) {
                topic.eligibility = details.eligibility;
              }
            }

            topics.push(topic);
          } catch (itemErr) {
            errors.push(`Topic normalize error: ${errorMessage(itemErr)}`);
          }
        }

        pageNumber++;
      } catch (e) {
        const msg = errorMessage(e);
        logger.error(`[SediaAdapter] Error on page ${pageNumber}:`, e);
        errors.push(`Page ${pageNumber} fetch error: ${msg}`);
        break;
      }
    }

    if (errors.length > 0) {
      logger.warn(`[SediaAdapter] ${errors.length} errors during fetch`, {
        firstErrors: errors.slice(0, 3),
      });
    }

    logger.info(
      `[SediaAdapter] Total fetched: ${topics.length} topics across ${pageNumber - firstPage} pages`
    );

    return { totalResults, pageNumber: firstPage, pageSize, topics, schemaDrift, errors };
  }

  /** Back-compatible plain list. Never throws; an empty array means "nothing usable". */
  async fetchTopics(options: SediaSearchOptions = {}): Promise<SediaTopic[]> {
    const result = await this.fetchSediaTopics(options);
    return result.topics;
  }

  /**
   * Primary K1 entry point. Reports status, drift and a reason instead of throwing,
   * so a dead SEDIA never takes the daily job down with it.
   */
  async fetchSediaTopics(options: SediaSearchOptions = {}): Promise<AdapterResult<SediaTopic>> {
    try {
      const result = await this.searchSedia({ pageSize: 100, maxPages: 13, ...options });

      await reportSchemaDrift(SEDIA_SOURCE, result.schemaDrift);

      // Pagination died before any topic came back → treat as a source failure.
      if (result.topics.length === 0 && result.errors.length > 0) {
        return adapterError<SediaTopic>(
          SEDIA_SOURCE,
          result.errors[0] ?? 'SEDIA returned no topics',
          result.schemaDrift
        );
      }

      return adapterOk(SEDIA_SOURCE, result.topics, result.schemaDrift);
    } catch (e) {
      const reason = errorMessage(e);
      logger.error('[SediaAdapter] fetchSediaTopics failed:', e);
      // The fetch-failure text changes between attempts against the same dead
      // endpoint; that the fetch is failing does not.
      await createAdapterAlert(
        SEDIA_SOURCE,
        'error',
        `SEDIA fetch failed: ${reason}`,
        undefined,
        `${SEDIA_SOURCE}:fetch-failed`
      );
      return adapterError<SediaTopic>(SEDIA_SOURCE, reason);
    }
  }
}
