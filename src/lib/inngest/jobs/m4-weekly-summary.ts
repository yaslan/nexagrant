import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { M4WeeklySummaryOutputSchema, type M4WeeklySummaryOutput } from '../events';

/**
 * M4 Weekly Summary — Monday 9 AM UTC
 * Sends relationship management summaries and due actions to focal points
 * Groups pending actions by focal point and notifies them
 */
export const m4WeeklySummary = inngest.createFunction(
  { id: 'm4-weekly-summary', triggers: [{ cron: '0 9 * * 1' }] },
  async ({ step }): Promise<M4WeeklySummaryOutput> => {
    const pendingActions = await step.run('fetch-pending-actions', async () => {
      const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      return await prisma.relationship.findMany({
        where: {
          nextStepDue: {
            not: null,
            lte: oneWeekFromNow,
          },
        },
        select: {
          id: true,
          tenantId: true,
          ownerUserId: true,
          counterpartName: true,
          nextStep: true,
          nextStepDue: true,
          warmth: true,
        },
      });
    });

    const result = await step.run('group-and-notify', async () => {
      type PendingAction = typeof pendingActions[0];
      const grouped = new Map<string, PendingAction[]>();
      const errors: Array<{ focalPointId: string; reason: string }> = [];

      // A relationship can be unassigned: `ownerUserId` is nullable so the
      // KVKK/GDPR purge can detach an erased focal point. There is nobody to
      // notify for those, and folding them into a `tenant:null` key would
      // invent one shared recipient out of unrelated rows — so they are counted
      // and left out of the grouping.
      let unassignedCount = 0;

      for (const action of pendingActions) {
        if (action.ownerUserId === null) {
          unassignedCount++;
          continue;
        }
        const key = `${action.tenantId}:${action.ownerUserId}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(action);
      }

      let notificationsSent = 0;
      for (const [key] of grouped) {
        try {
          // TODO: send email/notification to the focal point
          // For now, just track that it would be sent
          notificationsSent++;
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          errors.push({ focalPointId: key, reason: msg });
        }
      }

      const output: M4WeeklySummaryOutput = {
        success: true,
        totalPendingActions: pendingActions.length,
        focalPointsNotified: notificationsSent,
        groupedCount: grouped.size,
        unassignedCount,
      };

      if (errors.length > 0) {
        output.errors = errors;
      }

      return M4WeeklySummaryOutputSchema.parse(output);
    });

    return result;
  }
);
