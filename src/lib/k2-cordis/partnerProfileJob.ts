import { prisma } from '@/lib/db';

/**
 * A CordisOrganization as the profile query loads it — the `include` chain down
 * to each project's topics. Query results arrive untyped here (`prisma generate`
 * does not run in this repo; see src/types/prisma-override.d.ts), so the shape
 * is declared rather than inferred.
 */
interface OrganizationWithParticipations {
  organisationId: string;
  name: string;
  nameNormalized: string | null;
  activityType: string | null;
  sme: boolean;
  country: string | null;
  isTurkish: boolean;
  participations: Array<{
    role: string | null;
    ecContribution: bigint | null;
    netEcContribution: bigint | null;
    project: {
      framework: string | null;
      startDate: Date | null;
      endDate: Date | null;
      topics: Array<{ topicCode: string; topicTitle: string | null }>;
    };
  }>;
}

/** One co-participation edge, as the upsert batch writes it. */
interface CoParticipationItem {
  orgA: string;
  orgB: string;
  count: number;
  lastYear?: number;
}

export interface PartnerProfileJobResult {
  success: boolean;
  updatedProfiles: number;
  updatedCoParticipations: number;
  durationMs: number;
}

/**
 * Materializes raw K2 CORDIS data into M1 derived partner profiles and co-participation network
 */
export async function generatePartnerProfiles(): Promise<PartnerProfileJobResult> {
  const startTime = Date.now();
  const now = new Date();

  // 1. Calculate co-participations across all projects
  const projectParticipations = await prisma.cordisParticipation.findMany({
    select: {
      projectId: true,
      organisationId: true,
      project: {
        select: {
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  const projectOrgsMap = new Map<string, { orgs: string[]; year?: number }>();

  for (const p of projectParticipations) {
    if (!projectOrgsMap.has(p.projectId)) {
      const year = p.project.startDate
        ? new Date(p.project.startDate).getFullYear()
        : p.project.endDate
        ? new Date(p.project.endDate).getFullYear()
        : undefined;
      projectOrgsMap.set(p.projectId, { orgs: [], year });
    }
    projectOrgsMap.get(p.projectId)!.orgs.push(p.organisationId);
  }

  const coPartMap = new Map<string, { orgA: string; orgB: string; count: number; lastYear?: number }>();

  for (const [, item] of projectOrgsMap.entries()) {
    const orgs = Array.from(new Set(item.orgs));
    if (orgs.length < 2) continue;

    for (let i = 0; i < orgs.length; i++) {
      for (let j = i + 1; j < orgs.length; j++) {
        const [orgA, orgB] = orgs[i] < orgs[j] ? [orgs[i], orgs[j]] : [orgs[j], orgs[i]];
        const key = `${orgA}:${orgB}`;

        if (!coPartMap.has(key)) {
          coPartMap.set(key, { orgA, orgB, count: 0, lastYear: item.year });
        }
        const existing = coPartMap.get(key)!;
        existing.count += 1;
        if (item.year && (!existing.lastYear || item.year > existing.lastYear)) {
          existing.lastYear = item.year;
        }
      }
    }
  }

  // Upsert co-participations in batches
  const coPartItems = Array.from(coPartMap.values());
  const BATCH_SIZE = 500;

  for (let i = 0; i < coPartItems.length; i += BATCH_SIZE) {
    const batch = coPartItems.slice(i, i + BATCH_SIZE);
    await prisma.$transaction(
      batch.map((cp: CoParticipationItem) =>
        prisma.cordisCoParticipation.upsert({
          where: { orgA_orgB: { orgA: cp.orgA, orgB: cp.orgB } },
          create: {
            orgA: cp.orgA,
            orgB: cp.orgB,
            sharedProjectCount: cp.count,
            lastSharedYear: cp.lastYear,
          },
          update: {
            sharedProjectCount: cp.count,
            lastSharedYear: cp.lastYear,
          },
        })
      )
    );
  }

  // 2. Build partner profiles per organization
  const organizations: OrganizationWithParticipations[] = await prisma.cordisOrganization.findMany({
    include: {
      participations: {
        include: {
          project: {
            include: {
              topics: true,
            },
          },
        },
      },
    },
  });

  let updatedProfilesCount = 0;

  for (let i = 0; i < organizations.length; i += BATCH_SIZE) {
    const batchOrgs = organizations.slice(i, i + BATCH_SIZE);

    const upsertPromises = batchOrgs.map((org) => {
      const participations = org.participations;

      let horizonProjects = 0;
      let h2020Projects = 0;
      let coordinatorProjects = 0;
      let activeProjects = 0;
      let totalEcContribution = BigInt(0);
      let lastProjectDate: Date | null = null;

      const topicCounts = new Map<string, { code: string; title: string; count: number }>();
      const partnerCountryCounts = new Map<string, number>();

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
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      // Top 20 Co-partners & countries
      const coParts = coPartItems.filter((cp) => cp.orgA === org.organisationId || cp.orgB === org.organisationId);
      const topPartners = coParts
        .map((cp) => {
          const partnerId = cp.orgA === org.organisationId ? cp.orgB : cp.orgA;
          return {
            organisationId: partnerId,
            count: cp.count,
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      return prisma.cordisPartnerProfile.upsert({
        where: { organisationId: org.organisationId },
        create: {
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
          totalEcContribution,
          lastProjectDate,
          topTopics,
          topCountries: [],
          topPartners,
        },
        update: {
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
          totalEcContribution,
          lastProjectDate,
          topTopics,
          topPartners,
        },
      });
    });

    await prisma.$transaction(upsertPromises);
    updatedProfilesCount += batchOrgs.length;
  }

  return {
    success: true,
    updatedProfiles: updatedProfilesCount,
    updatedCoParticipations: coPartItems.length,
    durationMs: Date.now() - startTime,
  };
}
