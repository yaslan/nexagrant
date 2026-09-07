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

/** `model ModuleState` — the tenant × module switch. */
export interface ModuleStateRow {
  moduleId: string;
  status: 'OFF' | 'DEV' | 'PILOT' | 'ON' | string;
}

/** `model ConsortiumSeat`, with the organisation assigned to it. */
export interface ConsortiumSeatWithOrg {
  id: string;
  roleKey: string;
  required: boolean;
  status: string;
  organizationId: string | null;
  organization: LegacyOrganizationRow | null;
}

/** `model SeatCandidate`, with the organisation it proposes. */
export interface SeatCandidateWithOrg {
  id: string;
  seatId: string;
  organizationId: string | null;
  score: number;
  breakdown: unknown;
  rank: number;
  organization: LegacyOrganizationRow | null;
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

/** `model MarketplaceListing`. */
export interface MarketplaceListingRow {
  id: string;
  tenantId: string;
  kind: string;
  title: string;
  description: string;
  price: string;
  status: string;
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

/** `model Invitation` — a pending workspace invite. */
export interface InvitationRow {
  id: string;
  email: string;
  tenantId: string;
  token: string;
  role: string;
  expires: Date;
}
