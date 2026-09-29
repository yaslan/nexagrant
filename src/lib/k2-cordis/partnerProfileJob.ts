import { prisma } from '@/lib/db';

/**
 * TASK-MUMJ7W0GUI6N1 — the job used to load the whole CORDIS graph at once:
 * every participation, then every organisation with its participations, each
 * carrying a full copy of its project (rawJson and objective included), plus a
 * JS Map of every co-participation pair — 1.06 M distinct pairs on the real HORIZON
 * dump — and a `filter` over all pairs per organisation. On 23,613 projects it
 * filled the 4 GB heap and the process died (exit 134, TASK-MUMH7CVD8P2J0).
 *
 * Now nothing is held beyond one page of organisations:
 *   1. co-participation pairs are aggregated and upserted by Postgres, one
 *      `INSERT … SELECT … GROUP BY` per page of `orgA` ids;
 *   2. profiles walk CordisOrganization by `organisationId` cursor, loading
 *      only the columns they read, with each page's top partners ranked in SQL,
 *      and are written as ONE parameterized statement per page.
 *
 * Why not `prisma.$transaction(page.map(upsert))` as before: Prisma 7 keeps a
 * query-plan cache (1,000 entries by default) and a 500-upsert batch whose JSON
 * values differ on every page is a new entry each time — measured at ~10 MB per
 * page, so the paged job still died under a 256 MB heap cap. With the cache
 * disabled the same loop stays flat at ~85 MB; the raw statement below has one
 * fixed text and never grows it.
 *
 * The output is the old job's output. Two things the old job left to chance are
 * now fixed: ties in topTopics / topPartners break by code / id (they used to
 * follow whatever order the rows arrived in), and a shared project's year is its
 * calendar year (`getFullYear()` read it in the process's time zone, which west
 * of UTC turned a 1 January start into the previous year).
 */

/** Organisations per page: one co-participation statement and one profile statement each. */
const DEFAULT_PAGE_SIZE = 500;
const TOP_N = 20;

/**
 * A CordisOrganization as the profile query selects it. Query results arrive
 * untyped here (`prisma generate` does not run in this repo; see
 * src/types/prisma-override.d.ts), so the shapes are declared rather than inferred.
 */
interface OrganizationRow {
  organisationId: string;
  name: string;
  nameNormalized: string | null;
  activityType: string | null;
  sme: boolean;
  country: string | null;
  isTurkish: boolean;
}

interface ParticipationRow {
  organisationId: string;
  role: string | null;
  ecContribution: bigint | null;
  netEcContribution: bigint | null;
  project: {
    framework: string | null;
    startDate: Date | null;
    endDate: Date | null;
    topics: Array<{ topicCode: string; topicTitle: string | null }>;
  };
}

/** A profile as {@link upsertProfiles} sends it: bigint and date as text, for JSON. */
interface ProfileRow {
  organisationId: string;
  name: string;
  nameNormalized: string | null;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  isTurkish: boolean;
  totalProjects: number;
  horizonProjects: number;
  h2020Projects: number;
  coordinatorProjects: number;
  activeProjects: number;
  totalEcContribution: string;
  lastProjectDate: string | null;
  topTopics: Array<{ code: string; title: string; count: number }>;
  topPartners: Array<{ organisationId: string; count: number }>;
}

interface TopPartnerRow {
  org: string;
  partner: string;
  count: number;
}

export interface PartnerProfileJobResult {
  success: boolean;
  updatedProfiles: number;
  updatedCoParticipations: number;
  durationMs: number;
}

export interface PartnerProfileJobOptions {
  /** Organisations per page; small values exist for tests that cross page boundaries. */
  pageSize?: number;
}

/** Walks CordisOrganization in `organisationId` order, one page at a time. */
async function* organizationPages(pageSize: number): AsyncGenerator<OrganizationRow[]> {
  let cursor: string | undefined;
  for (;;) {
    const page: OrganizationRow[] = await prisma.cordisOrganization.findMany({
      where: cursor === undefined ? {} : { organisationId: { gt: cursor } },
      orderBy: { organisationId: 'asc' },
      take: pageSize,
      select: {
        organisationId: true,
        name: true,
        nameNormalized: true,
        activityType: true,
        sme: true,
        country: true,
        isTurkish: true,
      },
    });
    if (page.length === 0) return;
    yield page;
    if (page.length < pageSize) return;
    cursor = page[page.length - 1]!.organisationId;
  }
}

/**
 * Upserts every pair whose smaller id is in `orgIds`. Each pair is written once
 * across all pages because only its `orgA` side selects it. `COLLATE "C"` keeps
 * the orgA < orgB order the old code's JS `<` produced, whatever the database
 * collation. A pair with no dated project keeps its stored year, as Prisma's
 * upsert did when handed `lastSharedYear: undefined`.
 */
async function upsertCoParticipations(orgIds: string[]): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "CordisCoParticipation" ("orgA", "orgB", "sharedProjectCount", "lastSharedYear")
    SELECT p1."organisationId",
           p2."organisationId",
           COUNT(*)::int,
           MAX(EXTRACT(YEAR FROM COALESCE(pr."startDate", pr."endDate")))::int
      FROM "CordisParticipation" p1
      JOIN "CordisParticipation" p2
        ON p2."projectId" = p1."projectId"
       AND p2."organisationId" COLLATE "C" > p1."organisationId" COLLATE "C"
      JOIN "CordisProject" pr ON pr."id" = p1."projectId"
     WHERE p1."organisationId" = ANY(${orgIds}::text[])
     GROUP BY p1."organisationId", p2."organisationId"
    ON CONFLICT ("orgA", "orgB") DO UPDATE SET
      "sharedProjectCount" = EXCLUDED."sharedProjectCount",
      "lastSharedYear" = COALESCE(EXCLUDED."lastSharedYear", "CordisCoParticipation"."lastSharedYear")
  `;
}

/** Each organisation's 20 most frequent co-participants, most shared projects first. */
async function topPartnersFor(orgIds: string[]): Promise<Map<string, Array<{ organisationId: string; count: number }>>> {
  const rows: TopPartnerRow[] = await prisma.$queryRaw`
    SELECT org, partner, cnt AS count FROM (
      SELECT p1."organisationId" AS org,
             p2."organisationId" AS partner,
             COUNT(*)::int AS cnt,
             ROW_NUMBER() OVER (
               PARTITION BY p1."organisationId"
               ORDER BY COUNT(*) DESC, p2."organisationId" COLLATE "C"
             ) AS rn
        FROM "CordisParticipation" p1
        JOIN "CordisParticipation" p2
          ON p2."projectId" = p1."projectId"
         AND p2."organisationId" <> p1."organisationId"
       WHERE p1."organisationId" = ANY(${orgIds}::text[])
       GROUP BY p1."organisationId", p2."organisationId"
    ) ranked
    WHERE rn <= ${TOP_N}
    ORDER BY org, rn
  `;
  const byOrg = new Map<string, Array<{ organisationId: string; count: number }>>();
  for (const r of rows) {
    const list = byOrg.get(r.org) ?? [];
    list.push({ organisationId: r.partner, count: Number(r.count) });
    byOrg.set(r.org, list);
  }
  return byOrg;
}

/**
 * Upserts one page of profiles in a single statement. Same columns as the old
 * Prisma upsert: `topCountries` is only set on insert, and `updatedAt` (Prisma's
 * `@updatedAt`, stored as UTC) is stamped here since no client sets it. The ISO
 * date's `Z` is ignored by the `timestamp` cast, which is the UTC wall time
 * Prisma writes too.
 */
async function upsertProfiles(rows: ProfileRow[]): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "CordisPartnerProfile" (
      "organisationId", "name", "nameNormalized", "country", "activityType", "sme", "isTurkish",
      "totalProjects", "horizonProjects", "h2020Projects", "coordinatorProjects", "activeProjects",
      "totalEcContribution", "lastProjectDate", "topTopics", "topCountries", "topPartners", "updatedAt"
    )
    SELECT x."organisationId", x."name", x."nameNormalized", x."country", x."activityType", x."sme", x."isTurkish",
           x."totalProjects", x."horizonProjects", x."h2020Projects", x."coordinatorProjects", x."activeProjects",
           x."totalEcContribution"::bigint, x."lastProjectDate"::timestamp(3), x."topTopics", '[]'::jsonb, x."topPartners",
           (now() AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        "organisationId" text, "name" text, "nameNormalized" text, "country" text, "activityType" text,
        "sme" boolean, "isTurkish" boolean, "totalProjects" int, "horizonProjects" int, "h2020Projects" int,
        "coordinatorProjects" int, "activeProjects" int, "totalEcContribution" text, "lastProjectDate" text,
        "topTopics" jsonb, "topPartners" jsonb
      )
    ON CONFLICT ("organisationId") DO UPDATE SET
      "name" = EXCLUDED."name",
      "nameNormalized" = EXCLUDED."nameNormalized",
      "country" = EXCLUDED."country",
      "activityType" = EXCLUDED."activityType",
      "sme" = EXCLUDED."sme",
      "isTurkish" = EXCLUDED."isTurkish",
      "totalProjects" = EXCLUDED."totalProjects",
      "horizonProjects" = EXCLUDED."horizonProjects",
      "h2020Projects" = EXCLUDED."h2020Projects",
      "coordinatorProjects" = EXCLUDED."coordinatorProjects",
      "activeProjects" = EXCLUDED."activeProjects",
      "totalEcContribution" = EXCLUDED."totalEcContribution",
      "lastProjectDate" = EXCLUDED."lastProjectDate",
      "topTopics" = EXCLUDED."topTopics",
      "topPartners" = EXCLUDED."topPartners",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

/**
 * Materializes raw K2 CORDIS data into M1 derived partner profiles and co-participation network
 */
export async function generatePartnerProfiles(
  options: PartnerProfileJobOptions = {}
): Promise<PartnerProfileJobResult> {
  const startTime = Date.now();
  const now = new Date();
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  // 1. Co-participation network, aggregated in the database page by page
  let updatedCoParticipations = 0;
  for await (const orgs of organizationPages(pageSize)) {
    updatedCoParticipations += await upsertCoParticipations(orgs.map((o) => o.organisationId));
  }

  // 2. Build partner profiles per organization
  let updatedProfilesCount = 0;

  for await (const batchOrgs of organizationPages(pageSize)) {
    const orgIds = batchOrgs.map((o) => o.organisationId);

    const participationRows: ParticipationRow[] = await prisma.cordisParticipation.findMany({
      where: { organisationId: { in: orgIds } },
      orderBy: [{ organisationId: 'asc' }, { projectId: 'asc' }],
      select: {
        organisationId: true,
        role: true,
        ecContribution: true,
        netEcContribution: true,
        project: {
          select: {
            framework: true,
            startDate: true,
            endDate: true,
            topics: { select: { topicCode: true, topicTitle: true }, orderBy: { topicCode: 'asc' } },
          },
        },
      },
    });
    const participationsByOrg = new Map<string, ParticipationRow[]>();
    for (const pt of participationRows) {
      const list = participationsByOrg.get(pt.organisationId) ?? [];
      list.push(pt);
      participationsByOrg.set(pt.organisationId, list);
    }
    const partnersByOrg = await topPartnersFor(orgIds);

    const profiles: ProfileRow[] = batchOrgs.map((org) => {
      const participations = participationsByOrg.get(org.organisationId) ?? [];

      let horizonProjects = 0;
      let h2020Projects = 0;
      let coordinatorProjects = 0;
      let activeProjects = 0;
      let totalEcContribution = BigInt(0);
      let lastProjectDate: Date | null = null;

      const topicCounts = new Map<string, { code: string; title: string; count: number }>();

      for (const pt of participations) {
        const proj = pt.project;
        if (proj.framework === 'HORIZON') horizonProjects++;
        if (proj.framework === 'H2020') h2020Projects++;
        if (pt.role === 'coordinator') coordinatorProjects++;

        if (proj.endDate && new Date(proj.endDate) > now) {
          activeProjects++;
        }

        const contrib = pt.netEcContribution || pt.ecContribution || BigInt(0);
        totalEcContribution += contrib;

        const projDate = proj.startDate ? new Date(proj.startDate) : proj.endDate ? new Date(proj.endDate) : null;
        if (projDate && (!lastProjectDate || projDate > lastProjectDate)) {
          lastProjectDate = projDate;
        }

        // Topics
        for (const top of (proj.topics || [])) {
          if (!topicCounts.has(top.topicCode)) {
            topicCounts.set(top.topicCode, {
              code: top.topicCode,
              title: top.topicTitle || top.topicCode,
              count: 0,
            });
          }
          topicCounts.get(top.topicCode)!.count += 1;
        }
      }

      // Top 20 Topics
      const topTopics = Array.from(topicCounts.values())
        .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
        .slice(0, TOP_N);

      // Top 20 Co-partners
      const topPartners = partnersByOrg.get(org.organisationId) ?? [];

      return {
        organisationId: org.organisationId,
        name: org.name,
        nameNormalized: org.nameNormalized,
        country: org.country,
        activityType: org.activityType,
        sme: org.sme,
        isTurkish: org.isTurkish,
        totalProjects: participations.length,
        horizonProjects,
        h2020Projects,
        coordinatorProjects,
        activeProjects,
        totalEcContribution: totalEcContribution.toString(),
        lastProjectDate: lastProjectDate ? lastProjectDate.toISOString() : null,
        topTopics,
        topPartners,
      };
    });

    await upsertProfiles(profiles);
    updatedProfilesCount += batchOrgs.length;
  }

  return {
    success: true,
    updatedProfiles: updatedProfilesCount,
    updatedCoParticipations,
    durationMs: Date.now() - startTime,
  };
}
