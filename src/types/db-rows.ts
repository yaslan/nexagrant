/**
 * Row shapes for the partner-graph tables the M1/M8 screens query.
 *
 * Two things make these necessary rather than derivable:
 *
 * 1. `prisma generate` does not run in this repo, so `@prisma/client` carries
 *    no model types at all (see src/types/prisma-override.d.ts).
 * 2. `Organization`, `Participation`, `Collab` and `OrgTopicStat` are **not in
 *    prisma/schema.prisma**. Every `prisma.organization.*` call therefore
 *    throws at runtime, which is why each of these screens wraps its query in
 *    try/catch and falls back to CORDIS tables or demo rows. These interfaces
 *    record the columns the code reads, so whoever adds the models has the
 *    contract in front of them. Tracked in the TASK-MTQ60SGW45T0X result
 *    report.
 */

/** `Organization` — the pre-CORDIS partner table. */
export interface LegacyOrganizationRow {
  id: string;
  name: string;
  shortName: string | null;
  country: string | null;
  activityType: string | null;
  isSme: boolean;
  eigenvector: number | null;
  degree: number | null;
  participationCount: number | null;
  coordinatorCount: number | null;
  ecContributionSum: bigint | null;
}

/** `Participation` — an organisation on a project, in the legacy graph. */
export interface LegacyParticipationRow {
  id: string;
  organizationId: string;
  role: string | null;
  ecContributionCents: number | null;
  project: {
    id: string;
    acronym: string | null;
    title: string;
    topicCode: string | null;
    startDate: Date | null;
    endDate: Date | null;
  } | null;
}

/** A legacy Organization with the project history the detail page lists. */
export interface LegacyOrganizationWithParticipations extends LegacyOrganizationRow {
  participations: LegacyParticipationRow[];
}

/** `Collab` — a co-participation edge in the legacy graph. */
export interface LegacyCollabRow {
  orgA: string;
  orgB: string;
  projects: number | null;
}

/** `OrgTopicStat` — an organisation's record against one topic prefix. */
export interface LegacyOrgTopicStatRow {
  organizationId: string | null;
  topicPrefix: string;
  participationCount: number;
  coordinatorCount: number;
  organization: LegacyOrganizationRow;
}

/** `model Relationship` — M3 focal-point CRM. This one does exist. */
export interface RelationshipRow {
  id: string;
  organizationId: string | null;
  partnerOrgId: string | null;
  kind: string;
  counterpartName: string | null;
  counterpartEmail: string | null;
  warmth: string;
  lastContactAt: Date | null;
  nextStep: string | null;
  nextStepDue: Date | null;
  notes: string | null;
  updatedAt: Date;
}
