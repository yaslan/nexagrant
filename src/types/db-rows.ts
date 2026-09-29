/**
 * Row shapes for the tables the app queries.
 *
 * These exist because a clone of this repo carries no generated Prisma client:
 * `prisma generate` writes into node_modules only. `pnpm gate` now runs it
 * first, but any `tsc` run before that resolves `@prisma/client` to
 * src/types/prisma-override.d.ts, where the delegate *methods* are `any`. Each
 * interface below records the columns one screen or action reads, so the
 * compiler has something to check even though Prisma gives it nothing.
 *
 * The model *names* are no longer part of that gap: `ModelName` in
 * src/types/prisma-override.d.ts enumerates the 71 delegates the schema
 * declares, so `prisma.organization.findMany()` is a compile error rather than a
 * runtime TypeError.
 *
 * Every model named here exists in prisma/schema.prisma. That is now a rule, not
 * a hope: this file used to also carry `LegacyOrganizationRow`,
 * `LegacyParticipationRow`, `LegacyCollabRow`, `LegacyOrgTopicStatRow`,
 * `LegacyOrganizationWithParticipations`, `ConsortiumSeatWithOrg` and
 * `SeatCandidateWithOrg` — hand-written shapes for models and relations that are
 * *not* in the schema (`Organization`, `Participation`, `Collab`,
 * `OrgTopicStat`, `ConsortiumSeat.organization`). Because the delegates are
 * `any`, typing a phantom model made `prisma.organization.findMany(...)` look
 * checked while the delegate was `undefined` at runtime. All seven were dead
 * code by the time the last caller (src/app/api/v1/partners) was bound to the
 * CORDIS tables, and they are deleted so nobody reads them as evidence that the
 * table exists.
 *
 * The guard that replaces them is a test, not a comment:
 * src/modules/m8/server/schema-contract.test.ts reads prisma/schema.prisma and
 * fails on any `prisma.<model>.<query>` in the repo that names a model, relation
 * or column the schema does not have.
 */

/** `model Relationship` — M3 focal-point CRM. */
export interface RelationshipRow {
  id: string;
  organizationId: string | null;
  partnerOrgId: string | null;
  kind: string;
  /** Internal focal point. `null` = unassigned, or the owner was erased. */
  ownerUserId: string | null;
  counterpartName: string | null;
  counterpartEmail: string | null;
  warmth: string;
  lastContactAt: Date | null;
  nextStep: string | null;
  nextStepDue: Date | null;
  notes: string | null;
  updatedAt: Date;
}

/** `model ModuleState` — the tenant × module switch. */
export interface ModuleStateRow {
  moduleId: string;
  status: 'OFF' | 'DEV' | 'PILOT' | 'ON' | string;
}

/** `model Interaction` — one logged touch on a relationship. */
export interface InteractionRow {
  id: string;
  tenantId: string;
  relationshipId: string;
  kind: string;
  at: Date;
  summary: string | null;
  briefId: string | null;
}

/** `model TtoPortfolioItem` — M7 technology portfolio. */
export interface TtoPortfolioItemRow {
  id: string;
  tenantId: string;
  title: string;
  trl: number;
  patentStatus: string;
  summary: string;
  keywords: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** `model MeetingBrief` — M9 partner-meeting brief. */
export interface MeetingBriefRow {
  id: string;
  tenantId: string;
  interactionId: string;
  partnerName: string | null;
  content: string;
  meetingScheduledAt: Date | null;
  meetingScheduledTz: string | null;
  createdAt: Date;
  /** NULL = not linked to an opportunity (add-meeting-brief-opportunity.sql). */
  opportunityId: string | null;
}

/** `model FollowupDoc` — M10 NDA/LOI/award-pack document. */
export interface FollowupDocRow {
  id: string;
  tenantId: string;
  opportunityId: string;
  kind: string;
  version: number;
  contentUrl: string | null;
  signedAt: Date | null;
  createdAt: Date;
}

/** `model ApiKey` — never carries the raw key, only its hash and prefix. */
export interface ApiKeyRow {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/**
 * `model Invitation` — a pending workspace invite. `tokenHash` is left out on
 * purpose: it never leaves the server (TASK-MULQLL2T8ZJX4).
 */
export interface InvitationRow {
  id: string;
  email: string;
  tenantId: string;
  role: string;
  expires: Date;
}

/** `model SavedSearch` — a /calls search, saved for the daily alert digest. */
export interface SavedSearchRow {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filters: unknown;
  notify: boolean;
  lastRunAt: Date | null;
  createdAt: Date;
}
