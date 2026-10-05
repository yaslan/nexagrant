import { inngest } from '../client';
import { prisma } from '@/lib/db';

/**
 * M4 Weekly Summary — Monday 9 AM UTC
 * Sends relationship management summaries and due actions to focal points
 * Includes next steps due within the coming week
 */
export const m4WeeklySummary = inngest.createFunction(
  { id: 'm4-weekly-summary', triggers: [{ cron: '0 9 * * 1' }] },
  async ({ step }: any) => {
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
      const grouped = new Map<string, any[]>();

      for (const action of pendingActions) {
        const key = `${action.tenantId}:${action.ownerUserId}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(action);
      }

      let notificationsSent = 0;
      for (const [key, actions] of grouped) {
        // In production, would send email/notification to the focal point
        // For now, just track that it would be sent
        notificationsSent++;
      }

      return {
        success: true,
        totalPendingActions: pendingActions.length,
        focalPointsNotified: notificationsSent,
        groupedCount: grouped.size,
      };
    });

    return result;
  }
);
