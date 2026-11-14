import type { DealStage } from '@prisma/client';
import { z } from 'zod';

/**
 * Input contracts for the M18 CRUD layer (NG-135 / F3). Every browser-supplied value passes one
 * of these before it reaches Prisma. Pure: no DB, no session.
 */

export const LIFECYCLE_VALUES = ['LEAD', 'CLIENT', 'DISQUALIFIED'] as const;
export type Lifecycle = (typeof LIFECYCLE_VALUES)[number];

/** The twelve DealStage values, listed here so the module runs without a generated Prisma client. */
const DEAL_STAGES = [
  'NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY_MEETING', 'ELIGIBILITY_ANALYSIS', 'PROPOSAL',
  'CONTRACT', 'APPLICATION_PREP', 'SUBMITTED', 'WON', 'REJECTED', 'LOST',
] as const satisfies readonly DealStage[];
export const DEAL_STAGE_VALUES = DEAL_STAGES;

const trimmed = (max: number) => z.string().trim().max(max);
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const leadCreateSchema = z.object({
  name: trimmed(200).min(1),
  legalName: optionalTrimmed(200),
  provinceCode: z
    .union([z.string().trim().regex(/^\d{1,2}$/), z.literal('')])
    .nullish()
    .transform((v) => (v ? v : null)),
  website: optionalTrimmed(300),
  sizeBand: z.enum(['MICRO', 'SMALL', 'MEDIUM', 'LARGE']).nullish().transform((v) => v ?? null),
});
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadListQuerySchema = z.object({
  q: trimmed(100).optional().transform((v) => (v ? v : undefined)),
  lifecycle: z.enum(LIFECYCLE_VALUES).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

export const dealCreateSchema = z.object({
  organizationId: z.string().min(1),
  title: trimmed(200).min(1),
  // Minor units (cent), validated and converted by src/lib/money.ts before this point.
  estimatedFeeCents: z.number().int().min(0).nullish().transform((v) => v ?? null),
  currency: z.string().trim().length(3).default('EUR'),
});
export type DealCreateInput = z.infer<typeof dealCreateSchema>;

export const stageMoveSchema = z.object({
  dealId: z.string().min(1),
  to: z.enum(DEAL_STAGE_VALUES),
  lostReason: optionalTrimmed(500),
});
export type StageMoveInput = z.infer<typeof stageMoveSchema>;

export const taskCreateSchema = z.object({
  dealId: z.string().min(1),
  title: trimmed(200).min(1),
  dueAt: z.coerce.date().nullish().transform((v) => v ?? null),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskDoneSchema = z.object({
  taskId: z.string().min(1),
  done: z.boolean(),
});
export type TaskDoneInput = z.infer<typeof taskDoneSchema>;
