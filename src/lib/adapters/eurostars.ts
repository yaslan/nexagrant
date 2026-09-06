import { z } from 'zod';
import { logger } from '../logger';
import { prisma } from '../db';

export const EurostarsTopicSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  status: z.enum(['FORTHCOMING', 'OPEN', 'CLOSED']),
  typeOfAction: z.string().optional(),
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
  nextDeadlineAt: z.string().optional(),
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

export type EurostarsTopic = z.infer<typeof EurostarsTopicSchema>;

export class EurostarsAdapter {
  private baseUrl = 'https://www.eurostars-eureka.eu';
  private callsUrl = `${this.baseUrl}/en/Participant/Page/Calls-for-Proposals`;

  private parseDateString(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) {
      return new Date().toISOString();
    }
    const date = new Date(`${year}-${month}-${day}T17:00:00Z`);
    return date.toISOString();
  }

  async fetchTopics(): Promise<EurostarsTopic[]> {
    try {
      logger.info('[EurostarsAdapter] Fetching Eurostars calls');

      const response = await fetch(this.callsUrl, {
        headers: {
          'User-Agent': 'Fabrika/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const topics = this.parseCallsFromHtml(html);

      logger.info(`[EurostarsAdapter] Fetched ${topics.length} Eurostars calls`);

      if (topics.length === 0) {
        await prisma.systemAlert.create({
          data: {
            level: 'warn',
            source: 'eurostars_adapter',
            message: 'Eurostars adapter returned 0 calls; check HTML structure or endpoint'
          }
        }).catch(() => {});
      }

      return topics;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[EurostarsAdapter] Error fetching Eurostars calls:', err);
      await prisma.systemAlert.create({
        data: {
          level: 'error',
          source: 'eurostars_adapter',
          message: `Failed to fetch Eurostars calls: ${err.message}`
        }
      }).catch(() => {});

      return [];
    }
  }

  private parseCallsFromHtml(html: string): EurostarsTopic[] {
    const topics: EurostarsTopic[] = [];
    const processedCalls = new Set<string>();

    // Extract multiple call ID patterns
    const patterns = [
      /EUROSTARS[-\s](\d{4}[-\s](?:01|02|03|04|05|06|07|08|09|10|11|12|A|B))/gi,
      /eurostars\s*call\s*(\d{4}[-\s][\dAB]{2,3})/gi,
      /EUREKA[-\s](\d{4}[-\s][\dAB]{2,3})/gi
    ];

    const callIds = new Set<string>();

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const callId = match[0].trim().replace(/\s/g, '-').toUpperCase();
        if (!callIds.has(callId) && !processedCalls.has(callId)) {
          callIds.add(callId);
        }
      }
    }

    // Process each found call ID
    for (const callId of callIds) {
      try {
        // Extract deadline for this call
        const deadlinePattern = new RegExp(`${callId.replace(/[-\s]/g, '[-\\s]')}[^]*?(?:deadline|closing date)[:\\s]+(?:\\w+\\s+)?(\\d{1,2}[/-]\\d{1,2}[/-]\\d{4})`, 'i');
        const deadlineMatch = html.match(deadlinePattern);
        const deadlineStr = deadlineMatch ? deadlineMatch[1] : null;

        // Extract status: assume calls are OPEN unless marked otherwise
        const statusPattern = new RegExp(`${callId.replace(/[-\s]/g, '[-\\s]')}[^]*?(?:open|closed|forthcoming)`, 'i');
        const statusMatch = html.match(statusPattern);
        let status: 'FORTHCOMING' | 'OPEN' | 'CLOSED' = 'OPEN';
        if (statusMatch) {
          const statusText = statusMatch[0].toLowerCase();
          if (statusText.includes('forthcoming')) status = 'FORTHCOMING';
          else if (statusText.includes('closed')) status = 'CLOSED';
        }

        const topic: EurostarsTopic = {
          identifier: callId,
          title: `Eurostars Call ${callId}`,
          callIdentifier: callId,
          callTitle: `Eurostars Call ${callId}`,
          status,
          typeOfAction: 'Research & Innovation',
          isLumpSum: false,
          isTwoStage: true,
          deadlines: deadlineStr ? [{
            stage: 1,
            at: this.parseDateString(deadlineStr),
            tz: 'Europe/Brussels'
          }] : [],
          nextDeadlineAt: deadlineStr ? this.parseDateString(deadlineStr) : undefined,
          eligibility: {
            restricted: null,
            countriesExcluded: [],
            notes: 'Eurostars consortium: EU/EFTA member countries + associated countries'
          },
          keywords: ['research', 'innovation', 'eurostars', 'eureka', 'sme'],
          description: 'Eurostars supports transnational R&D projects driven by SMEs in cooperation with research organisations',
          sourceUrl: this.callsUrl
        };

        const parsed = EurostarsTopicSchema.safeParse(topic);
        if (parsed.success) {
          topics.push(parsed.data);
          processedCalls.add(callId);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`[EurostarsAdapter] Failed to parse call ${callId}: ${errMsg}`);
      }
    }

    return topics;
  }
}
