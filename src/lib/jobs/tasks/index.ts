import type { Task } from 'graphile-worker';
import type { JobId } from '../schedule';
import { k1DailyCallsTask } from './k1-daily-calls';
import { k2MonthlyCordisTask } from './k2-monthly-cordis';
import { alertsDailyTask } from './alerts-daily';
import { creditsMonthlyGrantTask } from './credits-monthly-grant';
import { m4WeeklySummaryTask } from './m4-weekly-summary';
import { usersScheduledDeletionTask } from './users-scheduled-deletion';
import { feedbackWeeklyDigestTask } from './feedback-weekly-digest';
import { alertsSweepTask } from './alerts-sweep';
import { stripeEventCleanupTask } from './stripe-event-cleanup';
import { agencyMonthlyReportTask } from './agency-monthly-report';
import { invitationCleanupTask } from './invitation-cleanup';
import { publicLeadCleanupTask } from './public-lead-cleanup';
import { jobQueueHealthTask } from './job-queue-health';

/**
 * Every job the worker serves, keyed by the id used in the crontab
 * (src/lib/jobs/schedule.ts). `Record<JobId, …>` makes a scheduled job without
 * a task a type error rather than a "task not found" at 2 AM.
 */
export const taskList: Record<JobId, Task> = {
  'k1-daily-calls': k1DailyCallsTask,
  'k2-monthly-cordis': k2MonthlyCordisTask,
  'alerts-daily': alertsDailyTask,
  'credits-monthly-grant': creditsMonthlyGrantTask,
  'm4-weekly-summary': m4WeeklySummaryTask,
  'users-scheduled-deletion': usersScheduledDeletionTask,
  'feedback-weekly-digest': feedbackWeeklyDigestTask,
  'alerts-sweep': alertsSweepTask,
  'stripe-event-cleanup': stripeEventCleanupTask,
  'agency-monthly-report': agencyMonthlyReportTask,
  'invitation-cleanup': invitationCleanupTask,
  'public-lead-cleanup': publicLeadCleanupTask,
  'job-queue-health': jobQueueHealthTask,
};
