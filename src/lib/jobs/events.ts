import { z } from 'zod';

/**
 * Job payload and output schemas — strongly typed input/output for every
 * scheduled job (src/lib/jobs/schedule.ts)
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

// K2: Monthly CORDIS dataset sync, run in-process (NG-225; no Python worker)
export const K2MonthlyCordisEventSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM format (optional override)
}).partial();

// NG-225: the job runs `runCordisImport` in-process; no Python worker answer any more.
export const K2MonthlyCordisOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  /** `YYYY-MM` the run belongs to (the tick's month). */
  month: z.string().optional(),
  /** `CordisImportRun.runId` of this run, when one was written. */
  runId: z.string().optional(),
  /** True when the dump's hash matched the last full import ("Zaten güncel"). */
  skipped: z.boolean().optional(),
  rowCounts: z
    .object({
      projects: z.number(),
      organizations: z.number(),
      participations: z.number(),
      topics: z.number(),
      scivocs: z.number(),
    })
    .optional(),
  profiles: z
    .object({ updatedProfiles: z.number(), updatedCoParticipations: z.number(), durationMs: z.number() })
    .optional(),
  /** A failure code (`IMPORT_FAILED`, `SKIP_LIMIT_EXCEEDED`, `HEAP_TOO_SMALL`, …), never raw SQL. */
  error: z.string().optional(),
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
  // Set whenever success is false: 'no_mail_provider' or 'send_failed'.
  reason: z.string().optional(),
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
  /** `YYYY-MM` the run granted for; one grant per tenant per period. */
  period: z.string(),
  grantedCount: z.number(),
  /** Tenants that already had this period's grant, so got nothing this run. */
  alreadyGrantedCount: z.number(),
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
// them (see src/lib/jobs/tasks/alerts-sweep.ts for the age-threshold reasoning).
export const AlertsSweepEventSchema = z.object({});

export const AlertsSweepOutputSchema = z.object({
  success: z.boolean(),
  scanned: z.number(),
  closed: z.number(),
});

export type AlertsSweepInput = z.infer<typeof AlertsSweepEventSchema>;
export type AlertsSweepOutput = z.infer<typeof AlertsSweepOutputSchema>;

// FB KAMU B3 (TASK-MULRR08Y9YI77): monthly agency region report, stored as a
// masked snapshot for the agency to download. `agency/report.generate` runs it by hand
// and names the month it wants; only the last closed month is accepted
// (TASK-MUM97IPC2QSGC — see requestedReportPeriod in src/lib/agency/report.ts).
export const AGENCY_REPORT_GENERATE_EVENT = 'agency/report.generate';

export const AgencyReportGenerateEventSchema = z
  .object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })
  .strict();

export type AgencyReportGenerateInput = z.infer<typeof AgencyReportGenerateEventSchema>;

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

// K1: nightly TopicMatch recompute (TASK-MULQL2NYKRGJX)
export const K1TopicMatchOutputSchema = z.object({
  success: z.boolean(),
  tenants: z.number(),
  done: z.number(),
  noProfileEmbedding: z.number(),
  pilotExpired: z.number(),
  failed: z.number(),
  scored: z.number(),
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  ineligible: z.number(),
  topicsWithoutEmbedding: z.number(),
  durationMs: z.number(),
});

export type K1TopicMatchOutput = z.infer<typeof K1TopicMatchOutputSchema>;

// K1: Topic + TenantProfile embeddings (TASK-MUN7C48UHPOGI). `tenantId` = one
// profile, queued when it is saved; no payload = the nightly sweep.
export const K1EmbeddingsEventSchema = z.object({ tenantId: z.string().min(1).optional() });

/** Counts only: `errors` is stripped so a provider message never reaches the job log summary. */
export const K1EmbeddingsOutputSchema = z.object({
  success: z.boolean(),
  skipped: z.enum(['no_api_key']).optional(),
  topicsScanned: z.number(),
  topicsEmbedded: z.number(),
  topicsUpToDate: z.number(),
  topicsEmpty: z.number(),
  profilesScanned: z.number(),
  profilesEmbedded: z.number(),
  profilesUpToDate: z.number(),
  profilesEmpty: z.number(),
  profilesPilotExpired: z.number(),
  rejected: z.number(),
  previouslyRejected: z.number(),
  shortened: z.number(),
  raced: z.number(),
  failed: z.number(),
  estimatedUsd: z.number(),
  maxUsd: z.number(),
  budgetExhausted: z.boolean(),
  aborted: z.boolean(),
  requestRefused: z.boolean(),
  durationMs: z.number(),
});

export type K1EmbeddingsOutput = z.infer<typeof K1EmbeddingsOutputSchema>;

// M4: daily "no contact for 60 days" digest (TASK-MULQL2NYKRGJX)
export const M4StaleRelationshipsOutputSchema = z.object({
  success: z.boolean(),
  reason: z.enum(['no_mail_provider', 'send_failed']).optional(),
  tenants: z.number(),
  tenantsPilotExpired: z.number(),
  tenantsModuleClosed: z.number(),
  tenantsFailed: z.number(),
  relationshipsDue: z.number(),
  relationshipsReminded: z.number(),
  skippedUnassigned: z.number(),
  skippedNeverContacted: z.number(),
  skippedAlreadyReminded: z.number(),
  skippedRecipient: z.number(),
  skippedMailedToday: z.number(),
  digestsSent: z.number(),
  digestsFailed: z.number(),
  durationMs: z.number(),
});

export type M4StaleRelationshipsOutput = z.infer<typeof M4StaleRelationshipsOutputSchema>;
