import { z } from 'zod';

/**
 * Inngest event schemas — strongly typed input/output for all jobs
 * Each event corresponds to a trigger or inter-job communication
 */

// K1: Daily call sync from external sources
export const K1DailyCallsEventSchema = z.object({});

export const K1DailyCallsOutputSchema = z.object({
  success: z.boolean(),
  totalProcessed: z.number(),
  inserted: z.number(),
  updated: z.number().optional(),
  sediaCount: z.number(),
  eurostarsCount: z.number(),
  tubitakCount: z.number(),
  errors: z.array(z.object({
    identifier: z.string(),
    message: z.string(),
  })).optional(),
});

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
  errors: z.array(z.object({
    focalPointId: z.string(),
    reason: z.string(),
  })).optional(),
});

export type M4WeeklySummaryInput = z.infer<typeof M4WeeklySummaryEventSchema>;
export type M4WeeklySummaryOutput = z.infer<typeof M4WeeklySummaryOutputSchema>;
