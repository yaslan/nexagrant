import { z } from 'zod';
import { logger } from '../logger';
import { prisma } from '../db';

export const TubitakTopicSchema = z.object({
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

export type TubitakTopic = z.infer<typeof TubitakTopicSchema>;

/**
 * Adapter for TÜBİTAK (Turkish Science & Technology Council) calls
 * Fetches from TÜBİTAK website and parses HTML structure
 */
export class TubitakAdapter {
  private baseUrl = 'https://www.tubitak.gov.tr';
  private callsUrl = `${this.baseUrl}/en/announcement-calls`;

  /**
   * Fetch and parse TÜBİTAK calls from their website
   */
  async fetchTopics(): Promise<TubitakTopic[]> {
    try {
      logger.info('[TubitakAdapter] Fetching TÜBİTAK calls');

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

      logger.info(`[TubitakAdapter] Fetched ${topics.length} TÜBİTAK calls`);

      if (topics.length === 0) {
        await prisma.systemAlert.create({
          data: {
            level: 'warn',
            source: 'tubitak_adapter',
            message: 'TÜBİTAK adapter returned 0 calls; check HTML structure'
          }
        }).catch(() => {});
      }

      return topics;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[TubitakAdapter] Error fetching TÜBİTAK calls:', err);
      await prisma.systemAlert.create({
        data: {
          level: 'error',
          source: 'tubitak_adapter',
          message: `Failed to fetch TÜBİTAK calls: ${err.message}`
        }
      }).catch(() => {});

      return [];
    }
  }

  /**
   * Parse TÜBİTAK calls from HTML
   * TÜBİTAK typically has program codes like "2026-1" or "2026-A"
   */
  private parseCallsFromHtml(html: string): TubitakTopic[] {
    const topics: TubitakTopic[] = [];

    // Extract TÜBİTAK program identifiers
    // Typical pattern: "2026-1", "2026-A", "TUBITAK-2026-001"
    const programPattern = /(?:TUBITAK[-])?(\d{4}[-][A-Z0-9]+)/gi;
    const matches = html.matchAll(programPattern);
    const programIds = new Set<string>();

    for (const match of matches) {
      const programId = match[1];
      if (!programIds.has(programId)) {
        programIds.add(programId);
      }
    }

    // For each program, create a topic entry
    for (const programId of programIds) {
      const deadlineMatch = html.match(new RegExp(`${programId}.*?(\\d{1,2}\\/\\d{1,2}\\/\\d{4})`, 'i'));
      const deadline = deadlineMatch ? deadlineMatch[1] : null;

      const topic: TubitakTopic = {
        identifier: `TUBITAK-${programId}`,
        title: `TÜBİTAK Call ${programId}`,
        callIdentifier: `TUBITAK-${programId}`,
        callTitle: `TÜBİTAK Call ${programId}`,
        status: 'OPEN',
        typeOfAction: 'Research & Development',
        isLumpSum: false,
        isTwoStage: false,
        deadlines: deadline ? [{
          stage: 1,
          at: this.parseDateString(deadline),
          tz: 'Europe/Istanbul'
        }] : [],
        nextDeadlineAt: deadline ? this.parseDateString(deadline) : undefined,
        eligibility: {
          restricted: 'TR',
          countriesExcluded: [],
          notes: 'TÜBİTAK calls are primarily for Turkish institutions and researchers'
        },
        keywords: ['tubitak', 'research', 'development', 'turkey'],
        description: 'TÜBİTAK research and technology development program calls',
        sourceUrl: this.callsUrl
      };

      const parsed = TubitakTopicSchema.safeParse(topic);
      if (parsed.success) {
        topics.push(parsed.data);
      }
    }

    return topics;
  }

  /**
   * Parse date string in DD/MM/YYYY format to ISO string (Istanbul timezone)
   */
  private parseDateString(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) {
      return new Date().toISOString();
    }
    // Convert to ISO UTC string (TÜBİTAK dates → 17:00 Turkey time)
    const date = new Date(`${year}-${month}-${day}T17:00:00+03:00`);
    return date.toISOString();
  }
}
