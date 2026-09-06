import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { EurostarsAdapter } from '@/lib/adapters/eurostars';
import { TubitakAdapter } from '@/lib/adapters/tubitak';
import { K1DailyCallsOutputSchema, type K1DailyCallsOutput } from '../events';

/**
 * Map topic source to programme ID
 */
function getProgrammeIdFromTopic(callId?: string, source?: string): string {
  if (callId?.startsWith('EUROSTARS')) return 'EUROSTARS';
  if (callId?.startsWith('TUBITAK')) return 'TUBITAK';
  if (callId?.startsWith('HORIZON') || callId?.startsWith('HE-')) return 'HE';
  if (callId?.startsWith('EUREKA')) return 'EUREKA';
  if (source?.toLowerCase().includes('eurostars')) return 'EUROSTARS';
  if (source?.toLowerCase().includes('tubitak')) return 'TUBITAK';
  return 'HE'; // default to Horizon Europe
}

/**
 * Extract call identifier for grouping topics
 */
function extractCallIdentifier(topic: Record<string, unknown>): string {
  const callId = topic.callIdentifier as string | undefined;
  if (callId) return callId;

  const identifier = topic.identifier as string | undefined;
  if (identifier) {
    // Extract base call ID from topic identifier
    // e.g., HORIZON-CL5-2026-09-D4-01 → HORIZON-CL5-2026-09
    const match = identifier.match(/^([A-Z]+-[A-Z0-9]+-\d{4}-\d{2})/);
    if (match) return match[1];
  }
  return `DEFAULT-${new Date().getFullYear()}`;
}

/**
 * K1 Daily Call Sync — 2 AM UTC
 * Fetches new calls from SEDIA, Eurostars, and TÜBİTAK
 * Normalizes and stores in database with proper Call and Programme relationships
 */
export const k1DailyCalls = inngest.createFunction(
  { id: 'k1-daily-calls', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }): Promise<K1DailyCallsOutput> => {
    const sediaTopics = await step.run('fetch-sedia-topics', async () => {
      const adapter = new SediaAdapter();
      try {
        return await adapter.fetchTopics();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('[k1-daily-calls] SEDIA fetch failed:', err);
        return [];
      }
    });

    const eurostarsTopics = await step.run('fetch-eurostars-topics', async () => {
      const adapter = new EurostarsAdapter();
      try {
        return await adapter.fetchTopics();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('[k1-daily-calls] Eurostars fetch failed:', err);
        return [];
      }
    });

    const tubitakTopics = await step.run('fetch-tubitak-topics', async () => {
      const adapter = new TubitakAdapter();
      try {
        return await adapter.fetchTopics();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('[k1-daily-calls] TÜBİTAK fetch failed:', err);
        return [];
      }
    });

    const result = await step.run('normalize-and-upsert', async () => {
      const allTopics = [...sediaTopics, ...eurostarsTopics, ...tubitakTopics];
      const errors: Array<{ identifier: string; message: string }> = [];
      let insertedCount = 0;
      let updatedCount = 0;

      for (const t of allTopics) {
        try {
          const topicStatus = (t.status || 'FORTHCOMING') as 'FORTHCOMING' | 'OPEN' | 'CLOSED';
          const callId = extractCallIdentifier(t);
          const programmeId = getProgrammeIdFromTopic(callId);

          // Ensure programme exists
          await prisma.programme.upsert({
            where: { id: programmeId },
            update: {},
            create: {
              id: programmeId,
              name: getProgrammeName(programmeId),
              sourceKey: programmeId.toLowerCase(),
            }
          });

          // Upsert call
          const call = await prisma.call.upsert({
            where: { callIdentifier: callId },
            update: {
              title: t.callTitle || t.title,
            },
            create: {
              callIdentifier: callId,
              title: t.callTitle || `Call ${callId}`,
              programmeId,
              url: t.sourceUrl || undefined,
            }
          });

          // Upsert topic with call relationship
          const existing = await prisma.topic.findUnique({
            where: { identifier: t.identifier }
          });

          const topicData = {
            title: t.title,
            status: topicStatus,
            typeOfAction: t.typeOfAction || undefined,
            isLumpSum: t.isLumpSum || false,
            isTwoStage: t.isTwoStage || false,
            budgetPerProjectCents: t.budgetPerProjectCents ? BigInt(t.budgetPerProjectCents) : null,
            deadlines: t.deadlines || [],
            nextDeadlineAt: t.nextDeadlineAt ? new Date(t.nextDeadlineAt) : null,
            eligibility: t.eligibility || {},
            keywords: t.keywords || [],
            description: t.description || undefined,
            sourceUrl: t.sourceUrl || undefined,
            callId: call.id,
          };

          if (existing) {
            await prisma.topic.update({
              where: { id: existing.id },
              data: topicData
            });
            updatedCount++;
          } else {
            await prisma.topic.create({
              data: {
                identifier: t.identifier,
                ...topicData,
              }
            });
            insertedCount++;
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to upsert topic ${t.identifier}:`, error);
          errors.push({ identifier: t.identifier, message: msg });
        }
      }

      const output: K1DailyCallsOutput = {
        success: errors.length === 0,
        totalProcessed: allTopics.length,
        inserted: insertedCount,
        updated: updatedCount,
        sediaCount: sediaTopics.length,
        eurostarsCount: eurostarsTopics.length,
        tubitakCount: tubitakTopics.length,
      };

      if (errors.length > 0) {
        output.errors = errors;
        logger.warn(`[k1-daily-calls] ${errors.length} topics failed to process`);
      }

      logger.info(`[k1-daily-calls] Completed: ${insertedCount} inserted, ${updatedCount} updated, ${errors.length} errors`);

      return K1DailyCallsOutputSchema.parse(output);
    });

    return result;
  }
);

/**
 * Get human-readable programme name from ID
 */
function getProgrammeName(programmeId: string): string {
  const names: Record<string, string> = {
    'HE': 'Horizon Europe',
    'EUROSTARS': 'Eurostars',
    'EUREKA': 'Eureka',
    'TUBITAK': 'TÜBİTAK',
    'CETP': 'CET Partnership',
    'DUT': 'Digital Europe',
    'ERASMUS': 'Erasmus+',
    'EIT': 'EIT',
  };
  return names[programmeId] || programmeId;
}
