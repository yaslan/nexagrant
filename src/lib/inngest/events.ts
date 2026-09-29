import { z } from 'zod';

/**
 * Inngest event schemas — strongly typed input/output for all jobs
 * Each event corresponds to a trigger or inter-job communication
 */

// K1: Daily call sync from external sources
export const K1DailyCallsEventSchema = z.object({});

/** Per-source outcome, so a dead upstream is visible in the run result. */
export const K1SourceResultSchema = z.object({
  source: z.string(),
  status: z.enum(['ok', 'error']),
  topicsProcessed: z.number(),
  reason: z.string().optional(),
  schemaDrift: z.array(z.string()).default([]),
});

export const K1DailyCallsOutputSchema = z.object({
  success: z.boolean(),
  totalProcessed: z.number(),
  inserted: z.number(),
  updated: z.number().optional(),
  sediaCount: z.number(),
  eurostarsCount: z.number(),
  tubitakCount: z.number(),
  sources: z.array(K1SourceResultSchema).default([]),
  /** True when at least one adapter reported an upstream contract change. */
  schemaChangeDetected: z.boolean().default(false),
  errors: z.array(z.object({
    identifier: z.string(),
    message: z.string(),
  })).optional(),
});

export type K1SourceResult = z.infer<typeof K1SourceResultSchema>;

export type K1DailyCallsInput = z.infer<typeof K1DailyCallsEventSchema>;
export type K1DailyCallsOutput = z.infer<typeof K1DailyCallsOutputSchema>;

// K2: Monthly CORDIS dataset sync via Python worker
export const K2MonthlyCordisEventSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM format (optional override)
}).partial();

export const K2MonthlyCordisOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  workerResponse: z.any().optional(),
  error: z.string().optional(),
  statusCode: z.number().optional(),
});

export type K2MonthlyCordisInput = z.infer<typeof K2MonthlyCordisEventSchema>;
export type K2MonthlyCordisOutput = z.infer<typeof K2MonthlyCordisOutputSchema>;

// Alerts: Daily saved search notifications
export const AlertsDailyEventSchema = z.object({
  tenantIds: z.array(z.string()).optional(), // target specific tenants or all
});

export const AlertsDailyOutputSchema = z.object({
  success: z.boolean(),
  totalSearches: z.number(),
  emailsSent: z.number(),
  emailsFailed: z.number(),
  emailsSkipped: z.number(), // no new matches since lastRunAt — no "(no new)" spam sent
  errors: z.array(z.object({
    searchId: z.string(),
    reason: z.string(),
  })).optional(),
});

export type AlertsDailyInput = z.infer<typeof AlertsDailyEventSchema>;
export type AlertsDailyOutput = z.infer<typeof AlertsDailyOutputSchema>;

// Credits: Monthly AI credit grant
export const CreditsMonthlyGrantEventSchema = z.object({});

export const CreditsMonthlyGrantOutputSchema = z.object({
  success: z.boolean(),
  totalTenants: z.number(),
  grantedCount: z.number(),
  failedCount: z.number(),
  totalCreditsGranted: z.number(),
  errors: z.array(z.object({
    tenantId: z.string(),
    message: z.string(),
  })).optional(),
});

export type CreditsMonthlyGrantInput = z.infer<typeof CreditsMonthlyGrantEventSchema>;
export type CreditsMonthlyGrantOutput = z.infer<typeof CreditsMonthlyGrantOutputSchema>;

// M4: Weekly focal point summaries
export const M4WeeklySummaryEventSchema = z.object({});

export const M4WeeklySummaryOutputSchema = z.object({
  success: z.boolean(),
  totalPendingActions: z.number(),
  focalPointsNotified: z.number(),
  groupedCount: z.number(),
  /**
   * Due actions on a relationship with no focal point (`ownerUserId` NULL).
   * They are counted in `totalPendingActions` but nobody is notified about
   * them — a relationship lands here when its owner is erased, so a non-zero
   * value is work that needs reassigning, not an error.
   */
  unassignedCount: z.number(),
  errors: z.array(z.object({
    focalPointId: z.string(),
    reason: z.string(),
  })).optional(),
});

export type M4WeeklySummaryInput = z.infer<typeof M4WeeklySummaryEventSchema>;
export type M4WeeklySummaryOutput = z.infer<typeof M4WeeklySummaryOutputSchema>;

// KVKK/GDPR: Purge accounts whose 30-day erasure grace period has expired
export const UsersScheduledDeletionEventSchema = z.object({
  /** Override the grace period for testing; defaults to 30 days */
  gracePeriodDays: z.number().int().positive().optional(),
}).partial();

export const UsersScheduledDeletionOutputSchema = z.object({
  success: z.boolean(),
  dueCount: z.number(),
  purgedCount: z.number(),
  failedCount: z.number(),
  errors: z.array(z.object({
    userId: z.string(),
    message: z.string(),
  })).optional(),
});

export type UsersScheduledDeletionInput = z.infer<typeof UsersScheduledDeletionEventSchema>;
export type UsersScheduledDeletionOutput = z.infer<typeof UsersScheduledDeletionOutputSchema>;

// E11.2: Weekly beta feedback digest to the platform admin
export const FeedbackWeeklyDigestEventSchema = z.object({
  /** Override the window for testing; defaults to the last 7 days. */
  sinceIso: z.string().datetime().optional(),
  /** Override the recipient; defaults to FEEDBACK_DIGEST_TO. */
  to: z.string().email().optional(),
}).partial();

export const FeedbackWeeklyDigestOutputSchema = z.object({
  success: z.boolean(),
  windowStart: z.string(),
  windowEnd: z.string(),
  newCount: z.number(),
  openCount: z.number(),
  overdueCount: z.number(),
  byPriority: z.object({
    P0: z.number(),
    P1: z.number(),
    P2: z.number(),
    P3: z.number(),
  }),
  emailStatus: z.enum(['sent', 'skipped', 'failed']),
  emailReason: z.string().optional(),
});

export type FeedbackWeeklyDigestInput = z.infer<typeof FeedbackWeeklyDigestEventSchema>;
export type FeedbackWeeklyDigestOutput = z.infer<typeof FeedbackWeeklyDigestOutputSchema>;

// TASK-MTVFJTNW6OW11: close open SystemAlert rows that name a tenant that no
// longer exists — they can never become true again and nothing else clears
// them (see src/lib/inngest/jobs/alerts-sweep.ts for the age-threshold reasoning).
export const AlertsSweepEventSchema = z.object({});

export const AlertsSweepOutputSchema = z.object({
  success: z.boolean(),
  scanned: z.number(),
  closed: z.number(),
});

export type AlertsSweepInput = z.infer<typeof AlertsSweepEventSchema>;
export type AlertsSweepOutput = z.infer<typeof AlertsSweepOutputSchema>;

// FB KAMU B3 (TASK-MULRR08Y9YI77): monthly agency region report, stored as a
// masked snapshot for the agency to download. `agency/report.generate` runs it by hand.
export const AGENCY_REPORT_GENERATE_EVENT = 'agency/report.generate';

export const AgencyMonthlyReportOutputSchema = z.object({
  success: z.boolean(),
  period: z.string(),
  agencies: z.number(),
  generated: z.number(),
  skipped: z.number(),
  failed: z.number(),
  errors: z.array(z.object({ tenantId: z.string(), message: z.string() })).optional(),
});

export type AgencyMonthlyReportOutput = z.infer<typeof AgencyMonthlyReportOutputSchema>;
