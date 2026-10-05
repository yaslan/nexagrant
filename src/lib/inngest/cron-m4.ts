import { inngest } from './client';
import { prisma } from '@/lib/db';

export const m4SixtyDayRuleCron = (inngest.createFunction as any)(
  { id: "m4-60-day-warmth-downgrade" },
  { cron: "0 0 * * *" }, // Run daily at midnight
  async ({ step }: any) => {
    await step.run("downgrade-warmth", async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const result = await prisma.relationship.updateMany({
        where: {
          lastContactAt: { lt: sixtyDaysAgo },
          warmth: { in: ['active', 'hot', 'warm'] }
        },
        data: {
          warmth: 'cold'
        }
      });
      return { updatedCount: result.count };
    });
  }
);

export const m4WeeklySummaryCron = (inngest.createFunction as any)(
  { id: "m4-weekly-summary" },
  { cron: "0 9 * * 1" }, // Run Monday at 9AM
  async ({ step }: any) => {
    await step.run("generate-weekly-summaries", async () => {
      const pendingSteps = await prisma.relationship.findMany({
        where: {
          nextStepDue: {
            not: null,
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) 
          }
        },
        select: {
          tenantId: true,
          ownerUserId: true,
          id: true,
          nextStep: true,
          nextStepDue: true
        }
      });

      // Mock email sending
      console.log('M4 Weekly Summary: Found pending steps to notify', pendingSteps.length);
      return { sentCount: pendingSteps.length };
    });
  }
);
