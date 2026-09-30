import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { cordisOrganisationIdSchema } from '@/lib/k2-cordis/api-query';
import type {
  CordisCoParticipationRow,
  CordisOrganizationSummary,
  CordisParticipationWithProject,
} from '@/lib/k2-cordis/rows';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idParse = cordisOrganisationIdSchema.safeParse((await params).id);
    if (!idParse.success) {
      return NextResponse.json({ success: false, error: 'invalid_id' }, { status: 400 });
    }
    const id = idParse.data;

    const org = await prisma.cordisOrganization.findUnique({
      where: { organisationId: id },
      include: {
        profile: true,
        participations: {
          take: 20,
          include: {
            project: {
              include: {
                topics: true,
              },
            },
          },
          orderBy: {
            project: {
              startDate: 'desc',
            },
          },
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: 'Organization not found in CORDIS database' },
        { status: 404 }
      );
    }

    // Co-participation network
    const coParts = await prisma.cordisCoParticipation.findMany({
      where: {
        OR: [{ orgA: id }, { orgB: id }],
      },
      orderBy: { sharedProjectCount: 'desc' },
      take: 20,
    });

    const partnerOrgIds = (coParts as CordisCoParticipationRow[]).map((cp) =>
      cp.orgA === id ? cp.orgB : cp.orgA
    );
    const partnerOrgs = await prisma.cordisOrganization.findMany({
      where: { organisationId: { in: partnerOrgIds } },
      select: {
        organisationId: true,
        name: true,
        country: true,
        activityType: true,
        isTurkish: true,
      },
    });

    const partnerMap = new Map(
      (partnerOrgs as CordisOrganizationSummary[]).map((p) => [p.organisationId, p])
    );

    const network = (coParts as CordisCoParticipationRow[]).map((cp) => {
      const partnerId = cp.orgA === id ? cp.orgB : cp.orgA;
      const partner = partnerMap.get(partnerId);
      return {
        organisationId: partnerId,
        name: partner?.name || `Org ${partnerId}`,
        country: partner?.country,
        activityType: partner?.activityType,
        isTurkish: partner?.isTurkish || false,
        sharedProjectCount: cp.sharedProjectCount,
        lastSharedYear: cp.lastSharedYear,
      };
    });

    const formattedProjects = (org.participations as CordisParticipationWithProject[]).map((pt) => ({
      projectId: pt.projectId,
      acronym: pt.project.acronym,
      title: pt.project.title,
      framework: pt.project.framework,
      role: pt.role,
      ecContributionEUR: pt.ecContribution ? Number(pt.ecContribution) : null,
      startDate: pt.project.startDate,
      endDate: pt.project.endDate,
      cordisUrl: `https://cordis.europa.eu/project/id/${pt.projectId}`,
      topics: pt.project.topics.map((t) => t.topicCode),
    }));

    return NextResponse.json({
      success: true,
      meta: {
        license: 'CC BY 4.0',
        attribution: 'Kaynak: CORDIS, Avrupa Komisyonu',
      },
      data: {
        organization: {
          organisationId: org.organisationId,
          name: org.name,
          shortName: org.shortName,
          vatNumber: org.vatNumber,
          activityType: org.activityType,
          sme: org.sme,
          country: org.country,
          city: org.city,
          nutsCode: org.nutsCode,
          geolocation: org.geolocation,
          url: org.url,
          isTurkish: org.isTurkish,
        },
        profile: org.profile
          ? {
              totalProjects: org.profile.totalProjects,
              horizonProjects: org.profile.horizonProjects,
              h2020Projects: org.profile.h2020Projects,
              coordinatorProjects: org.profile.coordinatorProjects,
              activeProjects: org.profile.activeProjects,
              totalEcContributionEUR: Number(org.profile.totalEcContribution),
              lastProjectDate: org.profile.lastProjectDate,
              topTopics: org.profile.topTopics,
              topPartners: org.profile.topPartners,
            }
          : null,
        network,
        projects: formattedProjects,
      },
    });
  } catch (error) {
    // A Prisma message quotes the query shape and table names: log it, never return it.
    logger.error('[API /api/cordis/organizations/[id]] query failed', error);
    return internalError({ success: false, error: 'internal_error' });
  }
}
