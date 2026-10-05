import { z } from 'zod';
import { BaseTopicSchema } from './common';

/**
 * SEDIA (EU Funding & Tenders portal, `search-api`) contracts.
 *
 * Two layers on purpose:
 *  - `SediaSearchEnvelopeSchema` / `SediaRawResultSchema` describe the UPSTREAM
 *    payload. They are deliberately loose: they assert only the fields we cannot
 *    work without, so a parse failure means a real API schema change (→ SystemAlert)
 *    rather than "the EC added a field".
 *  - `SediaTopicSchema` is our NORMALIZED shape, written to `Topic`.
 */

/** Fields the normalizer cannot work without. Everything else passes through. */
export const SediaRawMetadataSchema = z.looseObject({
  identifier: z.array(z.string()).min(1),
  title: z.array(z.string()).min(1),
  status: z.array(z.string()).min(1),
});

export const SediaRawResultSchema = z.looseObject({
  metadata: SediaRawMetadataSchema,
});

export const SediaSearchEnvelopeSchema = z.looseObject({
  totalResults: z.number(),
  results: z.array(z.unknown()),
});

export type SediaRawResult = z.infer<typeof SediaRawResultSchema>;
export type SediaSearchEnvelope = z.infer<typeof SediaSearchEnvelopeSchema>;

/** Portal status codes → our `TopicStatus` enum. */
export const SEDIA_STATUS_CODES = {
  FORTHCOMING: '31094501',
  OPEN: '31094502',
  CLOSED: '31094503',
} as const;

export function mapSediaStatus(code: string | undefined): 'FORTHCOMING' | 'OPEN' | 'CLOSED' {
  if (code === SEDIA_STATUS_CODES.FORTHCOMING) return 'FORTHCOMING';
  if (code === SEDIA_STATUS_CODES.CLOSED) return 'CLOSED';
  return 'OPEN';
}

/** Normalized SEDIA topic — what the K1 job persists. */
export const SediaTopicSchema = BaseTopicSchema;
export type SediaTopic = z.infer<typeof SediaTopicSchema>;

/** Shape of `metadata.budgetOverview[0]` once JSON-parsed. */
export const SediaBudgetActionSchema = z.looseObject({
  deadlineModel: z.string().optional(),
  plannedOpeningDate: z.string().optional(),
  deadlineDates: z.array(z.string()).optional(),
  budgetYearMap: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  expectedGrants: z.number().optional(),
});

export const SediaBudgetOverviewSchema = z.looseObject({
  budgetTopicActionMap: z.record(z.string(), z.array(SediaBudgetActionSchema)).optional(),
});

export type SediaBudgetAction = z.infer<typeof SediaBudgetActionSchema>;
