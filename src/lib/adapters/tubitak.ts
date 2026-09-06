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

export class TubitakAdapter {
  private baseUrl = 'https://www.tubitak.gov.tr';
  private callsUrl = `${this.baseUrl}/en/funding/research-projects-funding`;

  private parseDateString(dateStr: string): string {
    const [day, month, year] = dateStr.split('/');
    if (!day || !month || !year) {
      return new Date().toISOString();
    }
    const date = new Date(`${year}-${month}-${day}T17:00:00Z`);
    return date.toISOString();
  }

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
            message: 'TÜBİTAK adapter returned 0 calls; check HTML structure or endpoint'
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

  private parseCallsFromHtml(html: string): TubitakTopic[] {
    const topics: TubitakTopic[] = [];
    const processedPrograms = new Set<string>();

    // Extract multiple TÜBİTAK program patterns
    const patterns = [
      /(?:TÜBİTAK|TUBITAK)[-\s]([\d]{4}[-][A-Z0-9]{1,3})/gi,
      /(?:program|call)[-\s]*(\d{4}[-][A-Z0-9]{1,3})/gi,
      /[A-Z]{1,3}[-](\d{4})(?=\s|$)/gi  // Program codes like "RDI-2024"
    ];

    const programIds = new Set<string>();

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        let programId = match[0].trim().toUpperCase();
        if (match[1]) {
          programId = `TUBITAK-${match[1]}`.replace(/\s/g, '-');
        } else {
          programId = `TUBITAK-${programId}`.replace(/\s/g, '-');
        }
        if (!programIds.has(programId) && !processedPrograms.has(programId)) {
          programIds.add(programId);
        }
      }
    }

    // Process each program
    for (const programId of programIds) {
      try {
        // Extract deadline
        const deadlinePattern = new RegExp(`${programId.replace(/[-]/g, '[-\\s]')}[^]*?(?:deadline|closing date|application deadline)[:\\s]+(?:\\w+\\s+)?(\\d{1,2}[./-]\\d{1,2}[./-]\\d{4})`, 'i');
        const deadlineMatch = html.match(deadlinePattern);
        const deadlineStr = deadlineMatch ? deadlineMatch[1].replace(/\./g, '/') : null;

        // Extract status
        const statusPattern = new RegExp(`${programId.replace(/[-]/g, '[-\\s]')}[^]*?(?:open|closed|forthcoming|planned)`, 'i');
        const statusMatch = html.match(statusPattern);
        let status: 'FORTHCOMING' | 'OPEN' | 'CLOSED' = 'OPEN';
        if (statusMatch) {
          const statusText = statusMatch[0].toLowerCase();
          if (statusText.includes('forthcoming') || statusText.includes('planned')) status = 'FORTHCOMING';
          else if (statusText.includes('closed')) status = 'CLOSED';
        }

        const topic: TubitakTopic = {
          identifier: programId,
          title: `TÜBİTAK Call ${programId}`,
          callIdentifier: programId,
          callTitle: `TÜBİTAK Call ${programId}`,
          status,
          typeOfAction: 'Research & Development',
          isLumpSum: false,
          isTwoStage: false,
          deadlines: deadlineStr ? [{
            stage: 1,
            at: this.parseDateString(deadlineStr),
            tz: 'Europe/Istanbul'
          }] : [],
          nextDeadlineAt: deadlineStr ? this.parseDateString(deadlineStr) : undefined,
          eligibility: {
            restricted: 'TR',
            countriesExcluded: [],
            notes: 'TÜBİTAK calls are primarily for Turkish institutions and researchers. Consortium participation with EU/international partners may be possible.'
          },
          keywords: ['tubitak', 'research', 'development', 'turkey', 'innovation'],
          description: 'TÜBİTAK (The Scientific and Technological Research Council of Turkey) supports research and technology development projects',
          sourceUrl: this.callsUrl
        };

        const parsed = TubitakTopicSchema.safeParse(topic);
        if (parsed.success) {
          topics.push(parsed.data);
          processedPrograms.add(programId);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`[TubitakAdapter] Failed to parse program ${programId}: ${errMsg}`);
      }
    }

    return topics;
  }
}
