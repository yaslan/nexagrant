import { logger } from '../logger';
import { createAdapterAlert, reportSchemaDrift } from './alerts';
import {
  type AdapterResult,
  adapterError,
  adapterOk,
  computeAgeInDays,
  type Deadline,
  errorMessage,
  OPEN_ELIGIBILITY,
} from './schemas/common';
import {
  EUROSTARS_CALL_PATTERNS,
  EUROSTARS_CARD_PATTERN,
  EurostarsTopicSchema,
  parseLongDate,
  type EurostarsTopic,
} from './schemas/eurostars';

export { EurostarsTopicSchema };
export type { EurostarsTopic };

export const EUROSTARS_SOURCE = 'eurostars';

/** `dd/mm/yyyy` or `dd-mm-yyyy` → ISO at 17:00 UTC, or null when unparseable. */
function parseShortDate(dateStr: string): string | null {
  const [day, month, year] = dateStr.split(/[/-]/);
  if (!day || !month || !year) return null;
  const date = new Date(
    `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T17:00:00Z`
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export class EurostarsAdapter {
  /**
   * The old participant portal (`eurostars-eureka.eu`) answers 403 to every
   * non-browser client, so the EUREKA programme page is the working source.
   * Override with `K1_EUROSTARS_URL` if the network moves it again.
   */
  private callsUrl =
    process.env.K1_EUROSTARS_URL ?? 'https://eurekanetwork.org/programmes/eurostars/';

  /** Pure — parses a captured page, so it is unit-testable without the network. */
  parseCallsFromHtml(html: string, now: Date = new Date()): EurostarsTopic[] {
    const byIdentifier = new Map<string, EurostarsTopic>();

    // Primary: "Deadline 10 September 2026 … Eurostars Call 11 for projects".
    EUROSTARS_CARD_PATTERN.lastIndex = 0;
    for (const match of html.matchAll(EUROSTARS_CARD_PATTERN)) {
      const [, day, month, year, callNumber] = match;
      if (!day || !month || !year || !callNumber) continue;

      const deadlineAt = parseLongDate(day, month, year);
      const identifier = `EUROSTARS-CALL-${callNumber}`;
      const topic = this.buildTopic({ identifier, deadlineAt, now });
      if (topic) byIdentifier.set(identifier, topic);
    }

    // Fallback: legacy call codes such as "EUROSTARS-2026-01".
    if (byIdentifier.size === 0) {
      for (const pattern of EUROSTARS_CALL_PATTERNS) {
        pattern.lastIndex = 0;
        for (const match of html.matchAll(pattern)) {
          const identifier = match[0].trim().replace(/\s/g, '-').toUpperCase();
          const deadlineMatch = html.match(
            new RegExp(
              `${identifier.replace(/[-\s]/g, '[-\\s]')}[^]*?(?:deadline|closing date)[:\\s]+(?:\\w+\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})`,
              'i'
            )
          );
          const deadlineAt = deadlineMatch?.[1] ? parseShortDate(deadlineMatch[1]) : null;
          const topic = this.buildTopic({ identifier, deadlineAt, now, html });
          if (topic) byIdentifier.set(identifier, topic);
        }
      }
    }

    return [...byIdentifier.values()];
  }

  private buildTopic(args: {
    identifier: string;
    deadlineAt: string | null;
    now: Date;
    html?: string;
  }): EurostarsTopic | null {
    const { identifier, deadlineAt, now, html } = args;

    let status: 'FORTHCOMING' | 'OPEN' | 'CLOSED' = 'OPEN';
    if (deadlineAt) {
      status = new Date(deadlineAt).getTime() < now.getTime() ? 'CLOSED' : 'OPEN';
    } else if (html) {
      const statusMatch = html.match(
        new RegExp(`${identifier.replace(/[-\s]/g, '[-\\s]')}[^]*?(?:open|closed|forthcoming)`, 'i')
      );
      const statusText = statusMatch?.[0].toLowerCase() ?? '';
      if (statusText.includes('forthcoming')) status = 'FORTHCOMING';
      else if (statusText.includes('closed')) status = 'CLOSED';
    }

    const deadlines: Deadline[] = deadlineAt
      ? [{ stage: 1, at: deadlineAt, tz: 'Europe/Brussels' }]
      : [];

    const parsed = EurostarsTopicSchema.safeParse({
      identifier,
      title: `Eurostars Call ${identifier.replace(/^EUROSTARS-(CALL-)?/, '')}`,
      callIdentifier: identifier,
      callTitle: `Eurostars Call ${identifier.replace(/^EUROSTARS-(CALL-)?/, '')}`,
      status,
      typeOfAction: 'Research & Innovation',
      frameworkProgramme: 'EUROSTARS',
      isLumpSum: false,
      // Eurostars runs a single full-proposal submission per cut-off.
      isTwoStage: false,
      deadlines,
      nextDeadlineAt: deadlineAt,
      plannedOpeningDate: null,
      ageInDays: computeAgeInDays(null, now),
      eligibility: {
        ...OPEN_ELIGIBILITY,
        notes:
          'Eurostars consortium: EUREKA member and associated countries — no single-country restriction',
      },
      keywords: ['research', 'innovation', 'eurostars', 'eureka', 'sme'],
      description:
        'Eurostars supports transnational R&D projects driven by SMEs in cooperation with research organisations',
      sourceUrl: this.callsUrl,
    });

    if (!parsed.success) {
      logger.warn(`[EurostarsAdapter] Failed to parse call ${identifier}: ${parsed.error.message}`);
      return null;
    }
    return parsed.data;
  }

  /**
   * Primary K1 entry point. Never throws — a blocked or restructured page comes
   * back as `{ status: 'error', reason, topicsProcessed: 0 }`.
   */
  async fetchEurostarsTopics(): Promise<AdapterResult<EurostarsTopic>> {
    try {
      logger.info('[EurostarsAdapter] Fetching Eurostars calls');

      const response = await fetch(this.callsUrl, { headers: { 'User-Agent': 'FonBridge/1.0' } });
      if (!response.ok) {
        const reason = `HTTP ${response.status}: ${response.statusText}`;
        await createAdapterAlert(
          EUROSTARS_SOURCE,
          'error',
          `Failed to fetch Eurostars calls: ${reason}`,
          undefined,
          // Same defect on both paths (a non-ok response and a thrown fetch),
          // and the reason text is the only thing that moved between them.
          `${EUROSTARS_SOURCE}:fetch-failed`
        );
        return adapterError<EurostarsTopic>(EUROSTARS_SOURCE, reason);
      }

      const html = await response.text();
      const topics = this.parseCallsFromHtml(html);
      logger.info(`[EurostarsAdapter] Fetched ${topics.length} Eurostars calls`);

      // A 200 page with no recognizable call id means the markup changed.
      const schemaDrift =
        topics.length === 0
          ? ['Eurostars page returned 200 but matched no known call-id pattern']
          : [];
      await reportSchemaDrift(EUROSTARS_SOURCE, schemaDrift);

      return adapterOk(EUROSTARS_SOURCE, topics, schemaDrift);
    } catch (error) {
      const reason = errorMessage(error);
      logger.error('[EurostarsAdapter] Error fetching Eurostars calls:', error);
      await createAdapterAlert(
        EUROSTARS_SOURCE,
        'error',
        `Failed to fetch Eurostars calls: ${reason}`,
        undefined,
        `${EUROSTARS_SOURCE}:fetch-failed`
      );
      return adapterError<EurostarsTopic>(EUROSTARS_SOURCE, reason);
    }
  }

  /** Back-compatible plain list. */
  async fetchTopics(): Promise<EurostarsTopic[]> {
    const result = await this.fetchEurostarsTopics();
    return result.topics;
  }
}
