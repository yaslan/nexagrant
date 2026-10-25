import { logger } from '@/lib/logger';
import {
  PartnerSearchOrgRowSchema,
  PartnerSearchTopicOrganisationsSchema,
  withdrawnCountOf,
  type PartnerSearchOrgRow,
} from './schemas/partner-search';
import { SEDIA_STATUS_CODES } from './schemas/sedia';
import { errorMessage } from './schemas/common';

/**
 * Funding & Tenders Portal partner-search adapter (FO-60 / TASK-MVCH2J271U5VY).
 *
 * Anonymous, read-only endpoints only (discovery: docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md).
 * No portal login, no session, no `availablefullRightOrganisations` (401 for us).
 *
 * Politeness (card rules): one request in flight at a time (≤ 2 allowed), at least
 * `MIN_INTERVAL_MS` between requests, exponential backoff on transport errors and
 * 5xx, and an identifying User-Agent. A 403 or 429 is not retried: it throws
 * `PartnerSearchBlockedError`, the caller stops the run and raises an alert.
 *
 * PRIVACY: every row leaves this module through `projectOrgRow`, which keeps an
 * allowlist of fields. `ecasId` and any other person field are dropped here.
 */

export const PARTNER_SEARCH_SOURCE = 'partner_search';

const PORTAL_BASE = 'https://ec.europa.eu/info/funding-tenders/opportunities/api/partnerSearch';
const SEDIA_SEARCH_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
const SEDIA_API_KEY = 'SEDIA';

/**
 * The portal asks for a contact address in the User-Agent. Bump the version with releases.
 * The card's wording is "iletişim"; HTTP header values are ByteStrings (code points ≤ 255),
 * so `ş` would make fetch throw on every request. The ASCII spelling keeps the same contact.
 */
export const PARTNER_SEARCH_USER_AGENT = 'FonBridge/0.1.0 (iletisim: info@fonbridge.com)';

export const PARTNER_SEARCH_MIN_INTERVAL_MS = 1_000;
export const PARTNER_SEARCH_TIMEOUT_MS = 10_000;
export const PARTNER_SEARCH_MAX_RETRIES = 3;
/** The run stops after this many transport failures in a row (circuit open). */
export const PARTNER_SEARCH_CIRCUIT_THRESHOLD = 3;

/** 403 or 429 from the portal: stop the whole run, do not retry. */
export class PartnerSearchBlockedError extends Error {
  constructor(public readonly status: number) {
    super(`Partner Search portal refused the request (HTTP ${status})`);
    this.name = 'PartnerSearchBlockedError';
  }
}

/** Transport failure after the retries are used up, or the circuit opened. */
export class PartnerSearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerSearchUnavailableError';
  }
}

/** The fields we store. Anything not listed here never leaves the adapter. */
export interface PartnerSearchAllowlistedRow {
  id: string;
  organisationName: string;
  organisationType: string | null;
  country: string | null;
  pic: string | null;
  summary: string | null;
  expertise: 'Expertise_offer' | 'Expertise_request';
  interestStatus: string | null;
  requestDate: string | null;
  topicIdentifier: string;
}

export function projectOrgRow(row: PartnerSearchOrgRow): PartnerSearchAllowlistedRow {
  return {
    id: String(row.id),
    organisationName: row.organisationName,
    organisationType: row.organisationType ?? null,
    country: row.country ?? null,
    pic: row.pic == null ? null : String(row.pic),
    summary: row.summary ?? null,
    expertise: row.expertise,
    interestStatus: row.interestStatus ?? null,
    requestDate: row.requestDate ?? null,
    topicIdentifier: row.topicIdentifier,
  };
}

export type PartnerSearchTopicResult =
  | {
      status: 'ok';
      topicIdentifier: string;
      rows: PartnerSearchAllowlistedRow[];
      /** Person announcements in this response: counted, never stored. */
      personCount: number;
      /** Count from `topicOrganisationsWithdraw`. Its ids are not used: absence across scans decides withdrawal. */
      withdrawnCount: number;
      schemaDrift: string[];
    }
  | { status: 'drift'; topicIdentifier: string; schemaDrift: string[] };

export interface PartnerSearchClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  minIntervalMs?: number;
  maxRetries?: number;
  circuitThreshold?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PartnerSearchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly circuitThreshold: number;
  private lastRequestAt = 0;
  private consecutiveFailures = 0;

  constructor(options: PartnerSearchClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
    this.minIntervalMs = options.minIntervalMs ?? PARTNER_SEARCH_MIN_INTERVAL_MS;
    this.maxRetries = options.maxRetries ?? PARTNER_SEARCH_MAX_RETRIES;
    this.circuitThreshold = options.circuitThreshold ?? PARTNER_SEARCH_CIRCUIT_THRESHOLD;
  }

  /** True once enough transport failures came in a row that the run should stop. */
  get circuitOpen(): boolean {
    return this.consecutiveFailures >= this.circuitThreshold;
  }

  /** One request at a time, at least `minIntervalMs` after the previous one started. */
  private async pace(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = this.now();
  }

  /**
   * Fetch one URL with pacing and retries. Returns the parsed JSON body.
   * 403/429 throw `PartnerSearchBlockedError` at once. A transport error or 5xx is
   * retried with exponential backoff, then counts toward the circuit.
   */
  private async request(url: string, init: { method: 'GET' | 'POST'; body?: FormData }): Promise<unknown> {
    if (this.circuitOpen) {
      throw new PartnerSearchUnavailableError('circuit open: too many failures in a row');
    }
    let lastError = '';
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await this.sleep(1_000 * 2 ** (attempt - 1));
      await this.pace();
      try {
        const response = await this.fetchImpl(url, {
          method: init.method,
          body: init.body,
          headers: { 'User-Agent': PARTNER_SEARCH_USER_AGENT, Accept: 'application/json' },
          signal: AbortSignal.timeout(PARTNER_SEARCH_TIMEOUT_MS),
        });
        if (response.status === 403 || response.status === 429) {
          throw new PartnerSearchBlockedError(response.status);
        }
        if (response.status >= 500) {
          lastError = `HTTP ${response.status}`;
          continue;
        }
        if (!response.ok) {
          // A 4xx other than 403/429 is a contract or input problem, not load: no retry.
          this.consecutiveFailures++;
          throw new PartnerSearchUnavailableError(`HTTP ${response.status} from portal`);
        }
        this.consecutiveFailures = 0;
        return await response.json();
      } catch (error) {
        if (error instanceof PartnerSearchBlockedError || error instanceof PartnerSearchUnavailableError) {
          throw error;
        }
        lastError = errorMessage(error);
      }
    }
    this.consecutiveFailures++;
    throw new PartnerSearchUnavailableError(`gave up after ${this.maxRetries + 1} attempts: ${lastError}`);
  }

  /** `topicOrganisations.json?ccm2Id=` — ccm2Id goes in the query string, not the body. */
  async fetchTopic(topicIdentifier: string, ccm2Id: string): Promise<PartnerSearchTopicResult> {
    const url = `${PORTAL_BASE}/topicOrganisations.json?ccm2Id=${encodeURIComponent(ccm2Id)}`;
    const body = await this.request(url, { method: 'POST' });

    const envelope = PartnerSearchTopicOrganisationsSchema.safeParse(body);
    if (!envelope.success) {
      return {
        status: 'drift',
        topicIdentifier,
        schemaDrift: [`topicOrganisations envelope: ${envelope.error.issues[0]?.message ?? 'invalid'}`],
      };
    }

    const schemaDrift: string[] = [];
    const rows: PartnerSearchAllowlistedRow[] = [];
    let personCount = 0;
    envelope.data.topicOrganizations.forEach((raw, index) => {
      // Allowlist on `type` (FO-60 review 1). PERSON is counted and dropped before any field is
      // read. Only an explicit ORGANISATION is stored: a missing, empty or unknown type is drift,
      // so a row that is not known to be an organisation never reaches the database.
      const type = typeof raw === 'object' && raw !== null ? (raw as { type?: unknown }).type : undefined;
      if (type === 'PERSON') {
        personCount++;
        return;
      }
      if (type !== 'ORGANISATION') {
        schemaDrift.push(`topicOrganizations[${index}]: unknown type`);
        return;
      }
      const parsed = PartnerSearchOrgRowSchema.safeParse(raw);
      if (!parsed.success) {
        schemaDrift.push(`topicOrganizations[${index}]: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
        return;
      }
      rows.push(projectOrgRow(parsed.data));
    });

    if (schemaDrift.length > 0) {
      logger.warn(`[partner-search] ${topicIdentifier}: ${schemaDrift.length} row(s) off-contract`);
      return { status: 'drift', topicIdentifier, schemaDrift };
    }
    return {
      status: 'ok',
      topicIdentifier,
      rows,
      personCount,
      withdrawnCount: withdrawnCountOf(envelope.data.topicOrganisationsWithdraw),
      schemaDrift: [],
    };
  }

  /**
   * Topic identifier → ccm2Id, from the SEDIA search listing (paged). The portal's
   * endpoints key on ccm2Id, while `Topic` stores only the identifier.
   */
  async fetchCcm2Map(options: { pageSize?: number; maxPages?: number } = {}): Promise<Map<string, string>> {
    const pageSize = options.pageSize ?? 100;
    const maxPages = options.maxPages ?? 25;
    const map = new Map<string, string>();
    const query = {
      bool: {
        must: [
          { terms: { type: ['1'] } },
          { terms: { status: [SEDIA_STATUS_CODES.FORTHCOMING, SEDIA_STATUS_CODES.OPEN] } },
        ],
      },
    };

    for (let page = 1; page <= maxPages; page++) {
      const form = new FormData();
      form.append('query', new Blob([JSON.stringify(query)], { type: 'application/json' }), 'query.json');
      form.append('languages', new Blob(['["en"]'], { type: 'application/json' }), 'languages.json');
      const url = `${SEDIA_SEARCH_URL}?apiKey=${SEDIA_API_KEY}&text=***&pageSize=${pageSize}&pageNumber=${page}`;
      const body = (await this.request(url, { method: 'POST', body: form })) as {
        totalResults?: unknown;
        results?: Array<{ metadata?: { identifier?: string[]; ccm2Id?: string[] } }>;
      };
      const results = Array.isArray(body.results) ? body.results : [];
      for (const r of results) {
        const identifier = r.metadata?.identifier?.[0];
        const ccm2Id = r.metadata?.ccm2Id?.[0];
        if (identifier && ccm2Id) map.set(identifier, ccm2Id);
      }
      if (results.length < pageSize) break;
    }
    return map;
  }
}
