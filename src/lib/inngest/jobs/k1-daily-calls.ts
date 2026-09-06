import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { SediaAdapter } from '@/lib/adapters/sedia';
import { EurostarsAdapter } from '@/lib/adapters/eurostars';
import { TubitakAdapter } from '@/lib/adapters/tubitak';
import { K1DailyCallsOutputSchema, type K1DailyCallsOutput } from '../events';

/**
 * K1 Daily Call Sync — 2 AM UTC
 * Fetches new calls from SEDIA, Eurostars, and TÜBİTAK
 * Normalizes and stores in database
 */
export const k1DailyCalls = inngest.createFunction(
  { id: 'k1-daily-calls', triggers: [{ cron: '0 2 * * *' }] },
  async ({ step }): Promise<K1DailyCallsOutput> => {
    const sediaTopics = await step.run('fetch-sedia-topics', async () => {
      const adapter = new SediaAdapter();
      return await adapter.fetchTopics();
    });

    const eurostarsTopics = await step.run('fetch-eurostars-topics', async () => {
      const adapter = new EurostarsAdapter();
      return await adapter.fetchTopics();
    });

    const tubitakTopics = await step.run('fetch-tubitak-topics', async () => {
      const adapter = new TubitakAdapter();
      return await adapter.fetchTopics();
    });

    const result = await step.run('normalize-and-upsert', async () => {
      const allTopics = [...sediaTopics, ...eurostarsTopics, ...tubitakTopics];
      const errors: Array<{ identifier: string; message: string }> = [];

      let insertedCount = 0;
      for (const t of allTopics) {
        try {
          const topicStatus = t.status as 'FORTHCOMING' | 'OPEN' | 'CLOSED';
          await prisma.topic.upsert({
            where: { identifier: t.identifier },
            update: {
              title: t.title,
              status: topicStatus,
              typeOfAction: t.typeOfAction,
              isLumpSum: t.isLumpSum,
              isTwoStage: t.isTwoStage,
              deadlines: t.deadlines || [],
            },
            create: {
              identifier: t.identifier,
              title: t.title,
              status: topicStatus || 'FORTHCOMING',
              typeOfAction: t.typeOfAction,
              isLumpSum: t.isLumpSum || false,
              isTwoStage: t.isTwoStage || false,
              deadlines: t.deadlines || [],
              call: {
                connectOrCreate: {
                  where: { callIdentifier: 'HORIZON-DEFAULT' },
                  create: {
                    callIdentifier: 'HORIZON-DEFAULT',
                    title: 'Default Horizon Call',
                    programme: {
                      connectOrCreate: {
                        where: { id: 'HE' },
                        create: {
                          id: 'HE',
                          name: 'Horizon Europe',
                          sourceKey: 'horizon',
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          insertedCount++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Failed to upsert topic ${t.identifier}:`, error);
          errors.push({ identifier: t.identifier, message: msg });
        }
      }

      const output: K1DailyCallsOutput = {
        success: true,
        totalProcessed: allTopics.length,
        inserted: insertedCount,
        sediaCount: sediaTopics.length,
        eurostarsCount: eurostarsTopics.length,
        tubitakCount: tubitakTopics.length,
      };

      if (errors.length > 0) {
        output.errors = errors;
      }

      return K1DailyCallsOutputSchema.parse(output);
    });

    return result;
  }
);
