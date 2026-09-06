import { z } from 'zod';
import { prisma } from '../db';

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
  pageNumber?: number;
  pageSize?: number;
  statuses?: string[]; // '31094501' (forthcoming), '31094502' (open), '31094503' (closed)
  frameworkProgrammes?: string[]; // e.g. '43108390' (Horizon Europe), '43152860' (Digital Europe)
  types?: string[]; // '1' (grants), '2' (tenders)
  languages?: string[];
}

export interface SediaSearchResult {
  totalResults: number;
  pageNumber: number;
  pageSize: number;
  topics: SediaTopic[];
}

/**
 * Adapter for EU Funding & Tenders Portal (SEDIA) Search API
 */
export class SediaAdapter {
  private baseUrl = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
  private apiKey = 'SEDIA';

  /**
   * Primary method to search topics from the live SEDIA API
   */
  async searchSedia(options: SediaSearchOptions = {}): Promise<SediaSearchResult> {
    const {
      text = '***',
      pageNumber = 1,
      pageSize = 50,
      statuses = ['31094501', '31094502'], // default forthcoming and open
      frameworkProgrammes = [], // empty = all frameworks
      types = ['1'], // default grants
      languages = ['en']
    } = options;

    const queryText = text.trim() || '***';
    const encodedText = encodeURIComponent(queryText);
    const searchUrl = `${this.baseUrl}?apiKey=${this.apiKey}&text=${encodedText}&pageSize=${pageSize}&pageNumber=${pageNumber}`;

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

    console.log(`[SediaAdapter] Searching SEDIA API: text="${queryText}", page=${pageNumber}, size=${pageSize}`);

    try {
      const formData = new FormData();
      formData.append('query', new Blob([JSON.stringify(queryObj)], { type: 'application/json' }), 'query.json');
      formData.append('languages', new Blob([JSON.stringify(languages)], { type: 'application/json' }), 'languages.json');

      const response = await fetch(searchUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`SEDIA API responded with HTTP status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rawResults = data.results || [];
      const totalResults = typeof data.totalResults === 'number' ? data.totalResults : rawResults.length;

      const topics: SediaTopic[] = [];

      for (const item of rawResults) {
        const meta = item.metadata || {};
        const identifier = meta.identifier?.[0] || meta.REFERENCE?.[0] || item.reference || 'UNKNOWN-ID';
        const title = meta.title?.[0] || item.summary || 'Untitled Topic';
        
        // Status mapping: 31094501 -> FORTHCOMING, 31094502 -> OPEN, 31094503 -> CLOSED
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
            // Ignore JSON parse error in budgetOverview
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
            restricted: null,
            countriesExcluded: []
          },
          keywords: meta.keywords || [],
          description: item.summary || meta.description?.[0] || undefined,
          sourceUrl
        };

        const parsed = SediaTopicSchema.safeParse(rawTopic);
        if (parsed.success) {
          topics.push(parsed.data);
        } else {
          // If strict validation fails on minor optional fields, push fallback standard object
          topics.push(rawTopic as SediaTopic);
        }
      }

      return {
        totalResults,
        pageNumber,
        pageSize,
        topics
      };
    } catch (e: any) {
      console.error('[SediaAdapter] Error querying SEDIA API:', e);
      await prisma.systemAlert.create({
        data: {
          level: 'error',
          source: 'sedia_adapter',
          message: `Network error fetching from SEDIA: ${e.message}`,
        }
      }).catch(() => {});
      
      return {
        totalResults: 0,
        pageNumber,
        pageSize,
        topics: []
      };
    }
  }

  /**
   * Compatibility method for Inngest background sync jobs
   */
  async fetchTopics(): Promise<SediaTopic[]> {
    const result = await this.searchSedia({ pageSize: 100, pageNumber: 1 });
    return result.topics;
  }
}

