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

/**
 * Adapter for Eurostars/Eureka call listings
 * Fetches from Eurostars website and parses HTML structure
 */
export class EurostarsAdapter {
  private baseUrl = 'https://www.eurostars-eureka.eu';
  private callsUrl = `${this.baseUrl}/en/Participant/Page/Calls-for-Proposals`;

  /**
   * Fetch and parse Eurostars calls from their website
   */
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
            message: 'Eurostars adapter returned 0 calls; check HTML structure'
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

  /**
   * Parse Eurostars calls from HTML
   * Expected structure: table or list with call rows
   */
  private parseCallsFromHtml(html: string): EurostarsTopic[] {
    const topics: EurostarsTopic[] = [];

    // Simple fallback: if HTML contains call identifiers, extract them
    // Eurostars typically has call numbers like "EUROSTARS-2026-01"
    const callPattern = /EUROSTARS[-\d]+/gi;
    const matches = html.matchAll(callPattern);
    const callIds = new Set<string>();

    for (const match of matches) {
      callIds.add(match[0]);
    }

    // For each call ID found, create a topic entry
    // In production, you'd parse the full HTML with cheerio/jsdom
    for (const callId of callIds) {
      const deadlineMatch = html.match(new RegExp(`${callId}.*?(\\d{1,2}/\\d{1,2}/\\d{4})`, 'i'));
      const deadline = deadlineMatch ? deadlineMatch[1] : null;

      const topic: EurostarsTopic = {
        identifier: callId,
        title: `Eurostars Call ${callId}`,
        callIdentifier: callId,
        callTitle: `Eurostars Call ${callId}`,
        status: 'OPEN',
        typeOfAction: 'Research & Innovation',
        isLumpSum: false,
        isTwoStage: true,
        deadlines: deadline ? [{
          stage: 1,
          at: this.parseDateString(deadline),
          tz: 'Europe/Brussels'
        }] : [],
        nextDeadlineAt: deadline ? this.parseDateString(deadline) : undefined,
        eligibility: {
          restricted: null,
          countriesExcluded: [],
          notes: 'Eurostars consortium: EU/EFTA + associated countries'
        },
        keywords: ['research', 'innovation', 'eurostars', 'eureka'],
        description: 'Eurostars calls are aimed at SMEs and research organizations',
        sourceUrl: `${this.baseUrl}/en/Participant/Page/Calls-for-Proposals`
      };

      const parsed = EurostarsTopicSchema.safeParse(topic);
      if (parsed.success) {
        topics.push(parsed.data);
      }
    }

    return topics;
  }

  /**
   * Parse date string in DD/MM/YYYY format to ISO string
   */
  private parseDateString(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) {
      return new Date().toISOString();
    }
    const date = new Date(`${year}-${month}-${day}T17:00:00Z`);
    return date.toISOString();
  }
}
