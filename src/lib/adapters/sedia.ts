import { z } from 'zod';
import { prisma } from '../db';
import { logger } from '../logger';

export const SediaTopicSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  status: z.enum(['FORTHCOMING', 'OPEN', 'CLOSED']),
  typeOfAction: z.string().optional(),
  frameworkProgramme: z.string().optional(),
  callIdentifier: z.string().optional(),
  callTitle: z.string().optional(),
  isLumpSum: z.boolean().default(false),
  isTwoStage: z.boolean().default(false),
  budgetPerProjectCents: z.number().optional(),
  numProjects: z.number().optional(),
  deadlines: z.array(z.object({
    stage: z.number(),
    at: z.string(),
    tz: z.string()
  })).default([]),
  nextDeadlineAt: z.string().optional().nullable(),
  plannedOpeningDate: z.string().optional().nullable(),
  eligibility: z.object({
    restricted: z.string().nullable().optional(),
    countriesExcluded: z.array(z.string()).default([]),
    notes: z.string().optional()
  }).default({ restricted: null, countriesExcluded: [] }),
  destination: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export type SediaTopic = z.infer<typeof SediaTopicSchema>;

export interface SediaSearchOptions {
  text?: string;
  pageSize?: number;
  maxPages?: number;
  statuses?: string[];
  frameworkProgrammes?: string[];
  types?: string[];
  languages?: string[];
}

export interface SediaSearchResult {
  totalResults: number;
  pageNumber: number;
  pageSize: number;
  topics: SediaTopic[];
}

export class SediaAdapter {
  private baseUrl = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
  private apiKey = 'SEDIA';

  private detectEuOnlyEligibility(text: string): boolean {
    const euOnlyPatterns = [
      /EU\/EEA\/CH only/i,
      /European Union.*European Economic Area.*Switzerland/i,
      /limited to EU.*EEA.*CH/i,
      /restricted to European member states/i,
      /only.*European Union/i
    ];
    return euOnlyPatterns.some(p => p.test(text));
  }

  private async fetchTopicDetails(identifier: string): Promise<Partial<SediaTopic> | null> {
    try {
      const url = `https://ec.europa.eu/info/funding-tenders/opportunities/data/topicDetails/${identifier.toLowerCase()}.json`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;

      const data = await response.json();
      const details: Partial<SediaTopic> = {};

      if (data.description) {
        details.description = data.description;
      }
      if (data.eligibility) {
        const eligText = String(data.eligibility);
        details.eligibility = {
          restricted: this.detectEuOnlyEligibility(eligText) ? 'EU_EEA_CH_ONLY' : null,
          countriesExcluded: [],
          notes: eligText
        };
      }

      return details;
    } catch (e) {
      return null;
    }
  }

  async searchSedia(options: SediaSearchOptions = {}): Promise<SediaSearchResult> {
    const {
      text = '***',
      pageSize = 100,
      maxPages = 10,
      statuses = ['31094501', '31094502'],
      frameworkProgrammes = [],
      types = ['1'],
      languages = ['en']
    } = options;

    const queryText = text.trim() || '***';
    const mustConditions: any[] = [];

    if (types && types.length > 0) {
      mustConditions.push({ terms: { type: types } });
    }

    if (statuses && statuses.length > 0) {
      mustConditions.push({ terms: { status: statuses } });
    }

    if (frameworkProgrammes && frameworkProgrammes.length > 0) {
      mustConditions.push({ terms: { frameworkProgramme: frameworkProgrammes } });
    }

    const queryObj = {
      bool: {
        must: mustConditions
      }
    };

    const topics: SediaTopic[] = [];
    let totalResults = 0;
    let pageNumber = 1;
    const errors: string[] = [];

    while (pageNumber <= maxPages) {
      const encodedText = encodeURIComponent(queryText);
      const searchUrl = `${this.baseUrl}?apiKey=${this.apiKey}&text=${encodedText}&pageSize=${pageSize}&pageNumber=${pageNumber}`;

      logger.info(`[SediaAdapter] Fetching page ${pageNumber}/${maxPages}, size=${pageSize}`);

      try {
        const formData = new FormData();
        formData.append('query', new Blob([JSON.stringify(queryObj)], { type: 'application/json' }), 'query.json');
        formData.append('languages', new Blob([JSON.stringify(languages)], { type: 'application/json' }), 'languages.json');

        const response = await fetch(searchUrl, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        const rawResults = data.results || [];

        if (pageNumber === 1) {
          totalResults = typeof data.totalResults === 'number' ? data.totalResults : 0;
        }

        if (rawResults.length === 0) {
          logger.info(`[SediaAdapter] No results on page ${pageNumber}, stopping pagination`);
          break;
        }

        for (const item of rawResults) {
          try {
            const meta = item.metadata || {};
            const identifier = meta.identifier?.[0] || meta.REFERENCE?.[0] || item.reference || 'UNKNOWN-ID';
            const title = meta.title?.[0] || item.summary || 'Untitled Topic';

            const rawStatus = meta.status?.[0] || '31094502';
            let status: 'FORTHCOMING' | 'OPEN' | 'CLOSED' = 'OPEN';
            if (rawStatus === '31094501') status = 'FORTHCOMING';
            else if (rawStatus === '31094503') status = 'CLOSED';

            const typeOfAction = meta.typesOfAction?.[0] || (types.includes('2') ? 'Tender' : 'Grant');
            const frameworkProgramme = meta.frameworkProgramme?.[0] || meta.programmeDivision?.[0] || 'EU Funding';
            const callIdentifier = meta.callIdentifier?.[0] || identifier.split('-').slice(0, 3).join('-');
            const callTitle = meta.callTitle?.[0] || '';
            const sourceUrl = meta.url?.[0] || `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/${identifier}`;

            let isTwoStage = false;
            let isLumpSum = false;
            let nextDeadlineAt: string | null = null;
            let plannedOpeningDate: string | null = meta.plannedOpeningDate?.[0] || null;
            let budgetPerProjectCents: number | undefined = undefined;
            const deadlines: { stage: number; at: string; tz: string }[] = [];
            let eligibilityRestricted: string | null = null;
            let eligibilityNotes = '';

            if (meta.budgetOverview?.[0]) {
              try {
                const bo = JSON.parse(meta.budgetOverview[0]);
                const actionMaps = Object.values(bo.budgetTopicActionMap || {});
                for (const actions of actionMaps as any[]) {
                  for (const act of (actions || [])) {
                    if (act.deadlineModel?.toLowerCase().includes('two-stage')) {
                      isTwoStage = true;
                    }
                    if (act.plannedOpeningDate && !plannedOpeningDate) {
                      plannedOpeningDate = act.plannedOpeningDate;
                    }
                    if (act.deadlineDates && Array.isArray(act.deadlineDates)) {
                      act.deadlineDates.forEach((dStr: string, idx: number) => {
                        deadlines.push({ stage: idx + 1, at: `${dStr}T17:00:00Z`, tz: 'Europe/Brussels' });
                      });
                    }
                    if (act.budgetYearMap) {
                      const bVals = Object.values(act.budgetYearMap).map((v: any) => parseFloat(String(v)) || 0);
                      const maxB = Math.max(...bVals, 0);
                      if (maxB > 0) {
                        budgetPerProjectCents = Math.round(maxB * 100);
                      }
                    }
                  }
                }
              } catch (e) {
                // Ignore JSON parse error
              }
            }

            if (deadlines.length === 0 && meta.deadlineDate) {
              meta.deadlineDate.forEach((dStr: string, idx: number) => {
                deadlines.push({ stage: idx + 1, at: dStr.includes('T') ? dStr : `${dStr}T17:00:00Z`, tz: 'Europe/Brussels' });
              });
            }

            if (deadlines.length > 0) {
              nextDeadlineAt = deadlines[0].at;
            }

            if (title.toLowerCase().includes('lump sum') || typeOfAction.toLowerCase().includes('lump sum')) {
              isLumpSum = true;
            }

            // Detect EU/EEA/CH-only eligibility from text
            const fullText = `${title} ${item.summary || ''} ${typeOfAction || ''}`;
            if (this.detectEuOnlyEligibility(fullText)) {
              eligibilityRestricted = 'EU_EEA_CH_ONLY';
              eligibilityNotes = 'EU/EEA/CH only — detected from call description';
            }

            let description = item.summary || meta.description?.[0];

            // Try to fetch topic details for enrichment (with timeout)
            const topicDetails = await this.fetchTopicDetails(identifier);
            if (topicDetails?.description) {
              description = topicDetails.description;
            }
            if (topicDetails?.eligibility?.restricted && !eligibilityRestricted) {
              eligibilityRestricted = topicDetails.eligibility.restricted;
              eligibilityNotes = topicDetails.eligibility.notes || '';
            }

            const rawTopic = {
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
              eligibility: {
                restricted: eligibilityRestricted,
                countriesExcluded: [],
                notes: eligibilityNotes
              },
              keywords: meta.keywords || [],
              description,
              sourceUrl
            };

            const parsed = SediaTopicSchema.safeParse(rawTopic);
            if (parsed.success) {
              topics.push(parsed.data);
            } else {
              topics.push(rawTopic as SediaTopic);
            }
          } catch (itemErr) {
            const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
            errors.push(`Topic parse error: ${msg}`);
          }
        }

        pageNumber++;
      } catch (e: any) {
        logger.error(`[SediaAdapter] Error on page ${pageNumber}:`, e);
        errors.push(`Page ${pageNumber} fetch error: ${e.message}`);
        break;
      }
    }

    if (errors.length > 0) {
      logger.warn(`[SediaAdapter] ${errors.length} errors during fetch`, { firstErrors: errors.slice(0, 3) });
      if (errors.length > 3) {
        await prisma.systemAlert.create({
          data: {
            level: 'warn',
            source: 'sedia_adapter',
            message: `SEDIA fetch completed with ${errors.length} errors. First 3: ${errors.slice(0, 3).join('; ')}`,
          }
        }).catch(() => {});
      }
    }

    logger.info(`[SediaAdapter] Total fetched: ${topics.length} topics across ${pageNumber - 1} pages`);

    return {
      totalResults,
      pageNumber: 1,
      pageSize,
      topics
    };
  }

  async fetchTopics(): Promise<SediaTopic[]> {
    const result = await this.searchSedia({ pageSize: 100, maxPages: 10 });
    return result.topics;
  }
}
