/**
 * Row shapes for the K2 CORDIS tables, mirroring prisma/schema.prisma.
 *
 * `prisma generate` does not run in this repo, so `@prisma/client` carries no
 * model types and every query result arrives as `any` (see
 * src/types/prisma-override.d.ts). These are the shapes the CORDIS API routes
 * and jobs actually read, declared once rather than re-guessed per file.
 *
 * Each interface is a subset: only the columns a `select`/`include` in this
 * codebase asks for. Add a column here when a query starts reading it.
 */

/** `model CordisCoParticipation` — one edge of the co-participation graph. */
export interface CordisCoParticipationRow {
  orgA: string;
  orgB: string;
  sharedProjectCount: number;
  lastSharedYear: number | null;
}

/** `model CordisOrganization`, as the network endpoint lists a partner. */
export interface CordisOrganizationSummary {
  organisationId: string;
  name: string;
  country: string | null;
  activityType: string | null;
  isTurkish: boolean;
}

/** `model CordisProjectTopic`. */
export interface CordisProjectTopicRow {
  topicCode: string;
  topicTitle: string | null;
}

/** `model CordisProject`, as the project list and org profile render it. */
export interface CordisProjectRow {
  id: string;
  acronym: string | null;
  title: string;
  objective: string | null;
  framework: string;
  status: string | null;
  masterCall: string | null;
  startDate: Date | null;
  endDate: Date | null;
  totalCost: bigint | null;
  ecMaxContribution: bigint | null;
  topics: CordisProjectTopicRow[];
}

/** A project with the participating organisations the list endpoint shows. */
export interface CordisProjectWithParticipants extends CordisProjectRow {
  participations: Array<{
    role: string;
    organization: CordisOrganizationSummary;
  }>;
}

/** `model CordisParticipation` with the project it belongs to. */
export interface CordisParticipationWithProject {
  projectId: string;
  role: string;
  ecContribution: bigint | null;
  project: CordisProjectRow;
}

/** `model CordisPartnerProfile` — the derived M1 profile. */
export interface CordisPartnerProfileRow {
  organisationId: string;
  name: string;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  isTurkish: boolean;
  totalProjects: number;
  horizonProjects: number;
  h2020Projects: number;
  coordinatorProjects: number;
  activeProjects: number;
  totalEcContribution: bigint;
  lastProjectDate: Date | null;
  topTopics: unknown;
  topCountries: unknown;
  topPartners: unknown;
}
