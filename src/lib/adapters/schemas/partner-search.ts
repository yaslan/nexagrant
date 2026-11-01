import { z } from 'zod';

/**
 * Funding & Tenders Portal partner-search payloads (FO-60 / TASK-MVCH2J271U5VY).
 *
 * Shape source: docs/agent-results/TASK-MVCGPI6V3RM1F-be-fb.md (discovery, anonymous
 * probes). Like the SEDIA schemas, these are deliberately loose: they assert only
 * the fields the ingestor cannot work without. A parse failure means the portal
 * changed its contract (→ SystemAlert, ingestion stops, last good data kept).
 *
 * PRIVACY: `topicPersonsWithdraw` rows carry `ecasId`. That field is never read
 * into a typed value here and never reaches a database row (GDPR, discovery §3).
 */

/** A calendar date or an ISO date-time. `19/10/2026` is not one (FO-60 review 2). */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(value));
}

/** One announcement row. Organisation rows only; the adapter rejects every other `type` before this schema runs. */
export const PartnerSearchOrgRowSchema = z.looseObject({
  id: z.union([z.string().min(1), z.number()]),
  organisationName: z.string(),
  organisationType: z.string().nullish(),
  country: z.string().nullish(),
  pic: z.union([z.string(), z.number()]).nullish(),
  summary: z.string().nullish(),
  expertise: z.enum(['Expertise_offer', 'Expertise_request']),
  interestStatus: z.string().nullish(),
  requestDate: z
    .string()
    .nullish()
    .refine((value) => value == null || isIsoDate(value), 'requestDate: not a date'),
  topicIdentifier: z.string().min(1),
  type: z.literal('ORGANISATION'),
});

export type PartnerSearchOrgRow = z.infer<typeof PartnerSearchOrgRowSchema>;

/**
 * `topicOrganisations.json` envelope. The live portal sends the withdrawn lists as
 * arrays of full rows (seen on CERV-2026-DAPHNE-PREVENTION, 2026-10-22); the masked
 * capture used `{ count }`. Both shapes are accepted and only the count is kept.
 * Withdrawal is decided by absence across scans (see the ingestor), not by an id list.
 *
 * `topicPersonsWithdraw` is deliberately left as `unknown`: it carries `ecasId`, and
 * nothing in it is parsed or stored, not even its item count beyond the array length.
 */
const WithdrawListSchema = z.union([
  z.array(z.unknown()),
  z.looseObject({ count: z.number().int().nonnegative() }),
]);

export const PartnerSearchTopicOrganisationsSchema = z.looseObject({
  topicOrganizations: z.array(z.unknown()),
  topicOrganisationsWithdraw: WithdrawListSchema.optional(),
  topicPersonsWithdraw: z.unknown().optional(),
});

/** Number of withdrawn organisation announcements in the envelope (array length or `count`). */
export function withdrawnCountOf(list: z.infer<typeof WithdrawListSchema> | undefined): number {
  if (list === undefined) return 0;
  return Array.isArray(list) ? list.length : list.count;
}

export type PartnerSearchTopicOrganisations = z.infer<typeof PartnerSearchTopicOrganisationsSchema>;

/** `topicDetails.json` — used only to confirm the topic's ccm2Id / status. */
export const PartnerSearchTopicDetailsSchema = z.looseObject({
  topic: z.looseObject({
    ccm2Id: z.union([z.string(), z.number()]),
    identifier: z.string().min(1),
    status: z.string(),
  }),
  topicPersonsWithdrawCount: z.number().int().nonnegative().optional(),
});

export type PartnerSearchTopicDetails = z.infer<typeof PartnerSearchTopicDetailsSchema>;

/**
 * Parse a SEDIA-style search metadata entry for the ccm2Id map. Used by the
 * adapter to map `Topic.identifier` → `ccm2Id` (the portal's endpoints key on ccm2Id).
 */
export const PartnerSearchCcm2MetadataSchema = z.looseObject({
  identifier: z.array(z.string()).min(1),
  ccm2Id: z.array(z.string()).min(1),
});
