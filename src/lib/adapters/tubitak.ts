import { logger } from '../logger';
import { createAdapterAlert, reportSchemaDrift } from './alerts';
import {
  type AdapterResult,
  adapterError,
  adapterOk,
  computeAgeInDays,
  countryEligibility,
  type Deadline,
  errorMessage,
} from './schemas/common';
import {
  TUBITAK_PROGRAMME_LINK_PATTERN,
  TUBITAK_PROGRAMME_PATTERNS,
  TubitakTopicSchema,
  type TubitakTopic,
} from './schemas/tubitak';

export { TubitakTopicSchema };
export type { TubitakTopic };

export const TUBITAK_SOURCE = 'tubitak';

/** The catalogue markup ships HTML entities in programme names. */
function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

const TUBITAK_ELIGIBILITY_NOTES =
  'TÜBİTAK calls are primarily for Turkish institutions and researchers. Consortium participation with EU/international partners may be possible.';

/** `dd/mm/yyyy`, `dd.mm.yyyy` or `dd-mm-yyyy` → ISO at 17:00 UTC, or null. */
function parseDateString(dateStr: string): string | null {
  const [day, month, year] = dateStr.split(/[./-]/);
  if (!day || !month || !year) return null;
  const date = new Date(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T17:00:00Z`
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class TubitakAdapter {
  private baseUrl = 'https://www.tubitak.gov.tr';
  /**
   * The English `/en/funding/...` path is gone (404); the Turkish support
   * catalogue is the live one. Override with `K1_TUBITAK_URL` if it moves.
   */
  private callsUrl = process.env.K1_TUBITAK_URL ?? `${this.baseUrl}/tr/destekler`;

  /** Pure — parses a captured page, so it is unit-testable without the network. */
  parseCallsFromHtml(html: string, now: Date = new Date()): TubitakTopic[] {
    const byIdentifier = new Map<string, TubitakTopic>();

    // Primary: the programme catalogue links, e.g.
    // <a href="/tr/destekler/sanayi/…/1501-…">1501 - TÜBİTAK Sanayi Ar-Ge …</a>
    TUBITAK_PROGRAMME_LINK_PATTERN.lastIndex = 0;
    for (const match of html.matchAll(TUBITAK_PROGRAMME_LINK_PATTERN)) {
      const [, href, code, name] = match;
      if (!href || !code || !name) continue;

      const identifier = `TUBITAK-${code}`;
      // A programme can appear more than once (nav + list); first wins.
      if (byIdentifier.has(identifier)) continue;

      const topic = this.buildTopic({
        identifier,
        title: `TÜBİTAK ${code} — ${decodeEntities(name)}`,
        deadlineAt: this.findDeadline(html, identifier),
        sourceUrl: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
        now,
      });
      if (topic) byIdentifier.set(identifier, topic);
    }

    // Fallback: legacy code shapes on the older English pages.
    if (byIdentifier.size === 0) {
      for (const pattern of TUBITAK_PROGRAMME_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of html.matchAll(pattern)) {
          const captured = match[1];
          if (!captured) continue;
          const identifier = `TUBITAK-${captured}`.replace(/\s/g, '-').toUpperCase();
          if (byIdentifier.has(identifier)) continue;

          const topic = this.buildTopic({
            identifier,
            title: `TÜBİTAK Call ${identifier}`,
            deadlineAt: this.findDeadline(html, identifier),
            sourceUrl: this.callsUrl,
            now,
          });
          if (topic) byIdentifier.set(identifier, topic);
        }
      }
    }

    return [...byIdentifier.values()];
  }

  private findDeadline(html: string, identifier: string): string | null {
    const idPattern = identifier.replace(/-/g, '[-\\s]');
    const match = html.match(
      new RegExp(
        `${idPattern}[^]{0,2000}?(?:deadline|closing date|application deadline|son başvuru)[:\\s]+(?:\\w+\\s+)?(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})`,
        'i'
      )
    );
    return match?.[1] ? parseDateString(match[1]) : null;
  }

  private buildTopic(args: {
    identifier: string;
    title: string;
    deadlineAt: string | null;
    sourceUrl: string;
    now: Date;
  }): TubitakTopic | null {
    const { identifier, title, deadlineAt, sourceUrl, now } = args;

    // No deadline on the catalogue page means the programme is listed but not
    // currently in a call window — FORTHCOMING, not "open with no deadline".
    let status: 'FORTHCOMING' | 'OPEN' | 'CLOSED' = 'FORTHCOMING';
    if (deadlineAt) {
      status = new Date(deadlineAt).getTime() < now.getTime() ? 'CLOSED' : 'OPEN';
    }

    const deadlines: Deadline[] = deadlineAt
      ? [{ stage: 1, at: deadlineAt, tz: 'Europe/Istanbul' }]
      : [];

    const parsed = TubitakTopicSchema.safeParse({
      identifier,
      title,
      callIdentifier: identifier,
      callTitle: title,
      status,
      typeOfAction: 'Research & Development',
      frameworkProgramme: 'TUBITAK',
      isLumpSum: false,
      isTwoStage: false,
      deadlines,
      nextDeadlineAt: deadlineAt,
      plannedOpeningDate: null,
      ageInDays: computeAgeInDays(null, now),
      eligibility: countryEligibility('TR', TUBITAK_ELIGIBILITY_NOTES),
      keywords: ['tubitak', 'research', 'development', 'turkey', 'innovation'],
      description:
        'TÜBİTAK (The Scientific and Technological Research Council of Turkey) supports research and technology development projects',
      sourceUrl,
    });

    if (!parsed.success) {
      logger.warn(`[TubitakAdapter] Failed to parse program ${identifier}: ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  }

  /**
   * Primary K1 entry point. Never throws — a blocked or restructured page comes
   * back as `{ status: 'error', reason, topicsProcessed: 0 }`.
   */
  async fetchTubitakTopics(): Promise<AdapterResult<TubitakTopic>> {
    try {
      logger.info('[TubitakAdapter] Fetching TÜBİTAK calls');

      const response = await fetch(this.callsUrl, { headers: { 'User-Agent': 'NexaGrant/1.0' } });
      if (!response.ok) {
        const reason = `HTTP ${response.status}: ${response.statusText}`;
        await createAdapterAlert(
          TUBITAK_SOURCE,
          'error',
          `Failed to fetch TÜBİTAK calls: ${reason}`,
          undefined,
          // Same defect on both paths (a non-ok response and a thrown fetch),
          // and the reason text is the only thing that moved between them.
          `${TUBITAK_SOURCE}:fetch-failed`
        );
        return adapterError<TubitakTopic>(TUBITAK_SOURCE, reason);
      }

      const html = await response.text();
      const topics = this.parseCallsFromHtml(html);
      logger.info(`[TubitakAdapter] Fetched ${topics.length} TÜBİTAK calls`);

      const schemaDrift =
        topics.length === 0
          ? ['TÜBİTAK page returned 200 but matched no known programme-code pattern']
          : [];
      await reportSchemaDrift(TUBITAK_SOURCE, schemaDrift);

      return adapterOk(TUBITAK_SOURCE, topics, schemaDrift);
    } catch (error) {
      const reason = errorMessage(error);
      logger.error('[TubitakAdapter] Error fetching TÜBİTAK calls:', error);
      await createAdapterAlert(
        TUBITAK_SOURCE,
        'error',
        `Failed to fetch TÜBİTAK calls: ${reason}`,
        undefined,
        `${TUBITAK_SOURCE}:fetch-failed`
      );
      return adapterError<TubitakTopic>(TUBITAK_SOURCE, reason);
    }
  }

  /** Back-compatible plain list. */
  async fetchTopics(): Promise<TubitakTopic[]> {
    const result = await this.fetchTubitakTopics();
    return result.topics;
  }
}
