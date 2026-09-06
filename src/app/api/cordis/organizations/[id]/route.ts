import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const partnerOrgIds = coParts.map((cp: any) => (cp.orgA === id ? cp.orgB : cp.orgA));
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

    const partnerMap = new Map<string, any>(partnerOrgs.map((p: any) => [p.organisationId, p]));

    const network = coParts.map((cp: any) => {
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

    const formattedProjects = org.participations.map((pt: any) => ({
      projectId: pt.projectId,
      acronym: pt.project.acronym,
      title: pt.project.title,
      framework: pt.project.framework,
      role: pt.role,
      ecContributionEUR: pt.ecContribution ? Number(pt.ecContribution) : null,
      startDate: pt.project.startDate,
      endDate: pt.project.endDate,
      cordisUrl: `https://cordis.europa.eu/project/id/${pt.projectId}`,
      topics: pt.project.topics.map((t: any) => t.topicCode),
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
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch CORDIS organization profile' },
      { status: 500 }
    );
  }
}
