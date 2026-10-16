import { prisma } from '@/lib/db';

/**
 * TASK-MVBBPXU1ZW0F5 (FO-5) — organisations that coordinate the most CORDIS
 * projects whose topic code starts with a given prefix (e.g. `HORIZON-CL5-`).
 *
 * No new table and no re-import: the answer is read from the existing graph.
 *   - CordisProjectTopic.topicCode  → which projects carry the prefix
 *   - CordisParticipation.role = 'coordinator' → who led each of them
 *   - CordisOrganization             → name and country for display
 *
 * A project can carry several topic codes under one prefix (…-01-01, …-01-02),
 * so projects are de-duplicated before they are counted. Without that, a project
 * with two matching codes would count twice for its coordinator.
 *
 * `topicPrefix` must already be validated by `cordisTopicPrefixSchema`
 * (src/lib/k2-cordis/api-query.ts): it is interpolated into a LIKE pattern, and
 * the schema keeps the LIKE metacharacters `%` and `_` out of it.
 */

export interface CoordinatorLeaderRow {
  organisationId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  /** Projects under the prefix that this organisation coordinates. */
  coordinatedProjects: number;
  /** Sum of `ecContribution` (EUR, minor unit = cent) over those projects. */
  totalEcContribution: bigint;
}

export interface CoordinatorLeadersQuery {
  topicPrefix: string;
  limit: number;
  /** ISO-3166 alpha-2, upper case. Filters the coordinating organisation's country. */
  country?: string;
}

/** Rows returned at most; the API schema caps `limit` at the same value. */
export const COORDINATOR_LEADERS_MAX_LIMIT = 50;

interface RawLeaderRow {
  organisationId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  coordinatedProjects: number;
  totalEcContribution: string;
}

export async function coordinatorLeaders(query: CoordinatorLeadersQuery): Promise<CoordinatorLeaderRow[]> {
  const pattern = `${query.topicPrefix}%`;
  const limit = Math.min(COORDINATOR_LEADERS_MAX_LIMIT, Math.max(1, query.limit));
  const country = query.country ?? null;

  // `::text` on the SUM keeps the euro total exact: Postgres returns SUM(bigint)
  // as numeric, and a float round-trip would lose cents on large totals.
  const rows: RawLeaderRow[] = await prisma.$queryRaw`
    WITH matched_projects AS (
      SELECT DISTINCT "projectId"
      FROM "CordisProjectTopic"
      WHERE "topicCode" LIKE ${pattern}
    )
    SELECT
      p."organisationId" AS "organisationId",
      o."name" AS "name",
      o."shortName" AS "shortName",
      o."country" AS "country",
      COUNT(*)::int AS "coordinatedProjects",
      COALESCE(SUM(p."ecContribution"), 0)::text AS "totalEcContribution"
    FROM "CordisParticipation" p
    JOIN matched_projects m ON m."projectId" = p."projectId"
    JOIN "CordisOrganization" o ON o."organisationId" = p."organisationId"
    WHERE p."role" = 'coordinator'
      AND (${country}::text IS NULL OR o."country" = ${country})
    GROUP BY p."organisationId", o."name", o."shortName", o."country"
    ORDER BY "coordinatedProjects" DESC, SUM(p."ecContribution") DESC NULLS LAST, p."organisationId" ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    organisationId: row.organisationId,
    name: row.name,
    shortName: row.shortName,
    country: row.country,
    coordinatedProjects: row.coordinatedProjects,
    totalEcContribution: BigInt(row.totalEcContribution),
  }));
}
