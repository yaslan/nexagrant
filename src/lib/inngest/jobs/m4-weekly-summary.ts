import { inngest } from '../client';
import { prisma } from '@/lib/db';
import { M4WeeklySummaryOutputSchema, type M4WeeklySummaryOutput } from '../events';

/**
 * The part of a due relationship the grouping rule reads. Deliberately just
 * these two fields: `step.run` hands its result back JSON-serialised, so
 * `nextStepDue` arrives as a string rather than the `Date` Prisma declares, and
 * a wider interface here would only be a second, wrong description of the row.
 */
export interface PendingAction {
  tenantId: string;
  ownerUserId: string | null;
}

/**
 * Groups due actions by their focal point and counts the ones that have none.
 *
 * A relationship can be unassigned: `ownerUserId` is nullable so the KVKK/GDPR
 * purge can detach an erased focal point (A4 option C, 2026-09-08). There is
 * nobody to notify for those, and folding them into a `tenant:null` key would
 * invent one shared recipient out of unrelated rows — across tenants, at that —
 * so they are counted and left out of the grouping.
 *
 * Exported separately from the Inngest wrapper so the rule can be unit-tested
 * without an Inngest runtime, the same way `purgeDueUsers()` is.
 */
export function groupPendingActionsByFocalPoint<T extends PendingAction>(
  actions: T[]
): { grouped: Map<string, T[]>; unassignedCount: number } {
  const grouped = new Map<string, T[]>();
  let unassignedCount = 0;

  for (const action of actions) {
    // `== null` rather than `=== null`: Prisma returns null, but a partial
    // select or a hand-built row can carry undefined, and that would otherwise
    // group under a literal `tenant:undefined` recipient.
    if (action.ownerUserId == null) {
      unassignedCount++;
      continue;
    }
    const key = `${action.tenantId}:${action.ownerUserId}`;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(action);
    else grouped.set(key, [action]);
  }

  return { grouped, unassignedCount };
}

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
      const errors: Array<{ focalPointId: string; reason: string }> = [];
      const { grouped, unassignedCount } = groupPendingActionsByFocalPoint(pendingActions);

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
