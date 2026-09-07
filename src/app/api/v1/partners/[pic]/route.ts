import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/**
 * The body of GET /api/v1/partners/[pic].
 *
 * This used to be a *union* of two shapes: a live `prisma.organization` row with
 * `participations`, and an offline document with `metrics`/`recentProjects`/
 * `networkHub`. Only the second one ever reached a caller — there is no
 * `model Organization` in prisma/schema.prisma, so `prisma.organization` was
 * `undefined`, the call threw a TypeError, and the catch fabricated a partner
 * for *any* PIC string: a name, a country, 142 projects and €54.2M, all
 * invented. The union is gone; the surviving shape is the one callers have been
 * receiving, now filled from the CORDIS partner graph, and an unknown PIC is a
 * 404 instead of a made-up organisation.
 *
 * Two values are null rather than guessed, because no CORDIS table carries them
 * (CLAUDE.md rule 7): `networkHub.cooperationIndex`, and `grantAmountEur` on a
 * participation with no recorded EC contribution.
 */
interface PartnerDetailApiRow {
  pic: string;
  name: string;
  country: string | null;
  orgType: string | null;
  city: string | null;
  isSme: boolean;
  metrics: {
    totalProjects: number;
    coordinatorRoles: number;
    totalFundingEur: number;
    /** Mean participant count over this organisation's projects. */
    averageTeamSize: number | null;
    /** Most frequent topic codes/titles, most frequent first. */
    preferredPillars: string[];
  };
  recentProjects: Array<{
    projectAcronym: string | null;
    projectTitle: string;
    programme: string | null;
    role: string;
    grantAmountEur: number | null;
    startDate: string | null;
    status: string | null;
  }>;
  networkHub: {
    topCoAuthors: string[];
    /** No source in the CORDIS schema. Always null — never a made-up number. */
    cooperationIndex: number | null;
  };
}

/**
 * The CORDIS columns this endpoint reads.
 *
 * These annotations are load-bearing, not decoration. `prisma generate` does not
 * run here, so every delegate is typed `any` (src/types/prisma-override.d.ts) and
 * an un-annotated query result infects the whole route with implicit `any`.
 * Naming the columns is the only type checking this file can get.
 */
interface CordisOrgRow {
  organisationId: string;
  name: string;
  country: string | null;
  city: string | null;
  activityType: string | null;
  sme: boolean;
  profile: {
    totalProjects: number;
    coordinatorProjects: number;
    totalEcContribution: bigint;
    /** Json columns; shape is validated by topicLabel/partnerLabel below. */
    topTopics: unknown;
    topPartners: unknown;
  } | null;
}

/** One participation, as the metric aggregation reads it. */
interface ParticipationRow {
  projectId: string;
  role: string;
  ecContribution: bigint | null;
}

/** One participation with its project, as `recentProjects` reads it. */
interface RecentParticipationRow {
  role: string;
  ecContribution: bigint | null;
  // `CordisParticipation.project` is a required relation, so it is never null.
  project: {
    acronym: string | null;
    title: string;
    masterCall: string | null;
    framework: string;
    startDate: Date | null;
    status: string | null;
  };
}

interface TeamSizeRow {
  projectId: string;
  _count: { organisationId: number };
}

interface CoParticipationEdgeRow {
  orgA: string;
  orgB: string;
}

interface CoParticipantRow {
  organisationId: string;
  name: string;
  country: string | null;
}

/** One entry of CordisPartnerProfile.topTopics (a Json column). */
function topicLabel(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const o = entry as { title?: unknown; code?: unknown };
    if (typeof o.title === 'string' && o.title) return o.title;
    if (typeof o.code === 'string' && o.code) return o.code;
  }
  return null;
}

/** One entry of CordisPartnerProfile.topPartners (a Json column). */
function partnerLabel(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object') {
    const o = entry as { name?: unknown; country?: unknown };
    if (typeof o.name !== 'string' || !o.name) return null;
    return typeof o.country === 'string' && o.country ? `${o.name} (${o.country})` : o.name;
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pic: string }> }
) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { pic } = await params;

  let partner: PartnerDetailApiRow;
  try {
    // Shared reference data, like the list route: the Cordis* tables have no
    // tenantId and scripts/rls-models.ts declares them SYSTEM_WIDE, so there is
    // no tenant column for `withTenant` to scope. The API key gates access.
    const org: CordisOrgRow | null = await prisma.cordisOrganization.findUnique({
      where: { organisationId: pic },
      select: {
        organisationId: true,
        name: true,
        country: true,
        city: true,
        activityType: true,
        sme: true,
        profile: {
          select: {
            totalProjects: true,
            coordinatorProjects: true,
            totalEcContribution: true,
            topTopics: true,
            topPartners: true,
          },
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: `No CORDIS organisation with PIC ${pic}.`,
          code: 'PARTNER_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    const [participations, recent]: [ParticipationRow[], RecentParticipationRow[]] =
      await Promise.all([
        prisma.cordisParticipation.findMany({
          where: { organisationId: pic },
          select: { projectId: true, role: true, ecContribution: true },
        }),
        prisma.cordisParticipation.findMany({
          where: { organisationId: pic },
          take: 10,
          orderBy: { project: { startDate: 'desc' } },
          select: {
            role: true,
            ecContribution: true,
            project: {
              select: {
                acronym: true,
                title: true,
                masterCall: true,
                framework: true,
                startDate: true,
                status: true,
              },
            },
          },
        }),
      ]);

    const projectIds = participations.map((p) => p.projectId);
    const profile = org.profile;

    // Mean participant count across this organisation's projects. Measured, not
    // assumed: null when there are no participations to average.
    const teamSizes: TeamSizeRow[] = projectIds.length
      ? await prisma.cordisParticipation.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: { organisationId: true },
        })
      : [];
    const averageTeamSize = teamSizes.length
      ? Math.round(
          (teamSizes.reduce((sum, t) => sum + t._count.organisationId, 0) / teamSizes.length) * 10
        ) / 10
      : null;

    // Topic history: the derived profile when the importer has built it,
    // otherwise counted straight off the project topics.
    let preferredPillars = (Array.isArray(profile?.topTopics) ? profile.topTopics : [])
      .map(topicLabel)
      .filter((v): v is string => v !== null)
      .slice(0, 3);
    if (preferredPillars.length === 0 && projectIds.length) {
      const topTopics: { topicCode: string }[] = await prisma.cordisProjectTopic.groupBy({
        by: ['topicCode'],
        where: { projectId: { in: projectIds } },
        _count: { projectId: true },
        orderBy: { _count: { projectId: 'desc' } },
        take: 3,
      });
      preferredPillars = topTopics.map((t) => t.topicCode);
    }

    // Frequent co-participants: the derived profile, otherwise the
    // co-participation edge table. Edges are stored once under orgA < orgB, so
    // both directions have to be asked for.
    let topCoAuthors = (Array.isArray(profile?.topPartners) ? profile.topPartners : [])
      .map(partnerLabel)
      .filter((v): v is string => v !== null)
      .slice(0, 3);
    if (topCoAuthors.length === 0) {
      const edges: CoParticipationEdgeRow[] = await prisma.cordisCoParticipation.findMany({
        where: { OR: [{ orgA: pic }, { orgB: pic }] },
        orderBy: { sharedProjectCount: 'desc' },
        take: 3,
        select: { orgA: true, orgB: true },
      });
      const otherIds = edges.map((e) => (e.orgA === pic ? e.orgB : e.orgA));
      if (otherIds.length) {
        const others: CoParticipantRow[] = await prisma.cordisOrganization.findMany({
          where: { organisationId: { in: otherIds } },
          select: { organisationId: true, name: true, country: true },
        });
        const byId = new Map(others.map((o) => [o.organisationId, o]));
        topCoAuthors = otherIds
          .map((id) => byId.get(id))
          .filter((o): o is CoParticipantRow => !!o)
          .map((o) => (o.country ? `${o.name} (${o.country})` : o.name));
      }
    }

    partner = {
      pic: org.organisationId,
      name: org.name,
      country: org.country,
      orgType: org.activityType,
      city: org.city,
      isSme: org.sme,
      metrics: {
        totalProjects: profile ? profile.totalProjects : participations.length,
        coordinatorRoles: profile
          ? profile.coordinatorProjects
          : participations.filter((p) => p.role === 'coordinator').length,
        totalFundingEur: profile
          ? Number(profile.totalEcContribution)
          : participations.reduce((sum, p) => sum + Number(p.ecContribution ?? 0), 0),
        averageTeamSize,
        preferredPillars,
      },
      recentProjects: recent.map((p) => ({
        projectAcronym: p.project.acronym,
        projectTitle: p.project.title,
        programme: p.project.masterCall ?? p.project.framework,
        role: p.role,
        grantAmountEur: p.ecContribution === null ? null : Number(p.ecContribution),
        startDate: p.project.startDate ? p.project.startDate.toISOString().slice(0, 10) : null,
        status: p.project.status,
      })),
      networkHub: {
        topCoAuthors,
        cooperationIndex: null,
      },
    };
  } catch (e) {
    // Reported, not replaced with an invented organisation.
    console.error(`[/api/v1/partners/${pic}] query failed: ${errorMessage(e)}`);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Partner lookup failed.',
        code: 'PARTNER_QUERY_FAILED',
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: partner,
    meta: {
      queriedAt: new Date().toISOString(),
      source: 'CORDIS Open Data & Caching Engine',
    },
  });
}
