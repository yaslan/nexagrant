import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const country = searchParams.get('country')?.trim().toUpperCase() || '';
    const topic = searchParams.get('topic')?.trim() || '';
    const framework = searchParams.get('framework')?.trim().toUpperCase() || '';
    const yearFrom = searchParams.get('year_from') ? parseInt(searchParams.get('year_from')!, 10) : undefined;
    const yearTo = searchParams.get('year_to') ? parseInt(searchParams.get('year_to')!, 10) : undefined;
    const role = searchParams.get('role')?.trim().toLowerCase() || '';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const rawLimit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const where: any = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { acronym: { contains: q, mode: 'insensitive' } },
        { objective: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (framework) {
      where.framework = framework;
    }

    if (yearFrom || yearTo) {
      where.startDate = {};
      if (yearFrom) where.startDate.gte = new Date(`${yearFrom}-01-01`);
      if (yearTo) where.startDate.lte = new Date(`${yearTo}-12-31`);
    }

    if (topic) {
      where.topics = {
        some: {
          topicCode: { contains: topic, mode: 'insensitive' },
        },
      };
    }

    if (country || role) {
      where.participations = {
        some: {
          ...(role ? { role } : {}),
          ...(country ? { organization: { country } } : {}),
        },
      };
    }

    const [total, projects] = await Promise.all([
      prisma.cordisProject.count({ where }),
      prisma.cordisProject.findMany({
        where,
        skip: (page - 1) * rawLimit,
        take: rawLimit,
        orderBy: { startDate: 'desc' },
        include: {
          topics: true,
          participations: {
            take: 10,
            include: {
              organization: {
                select: {
                  organisationId: true,
                  name: true,
                  country: true,
                  activityType: true,
                  isTurkish: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const formattedProjects = projects.map((p: any) => {
      const coordinator = p.participations.find((pt: any) => pt.role === 'coordinator')?.organization;
      return {
        id: p.id,
        acronym: p.acronym,
        title: p.title,
        framework: p.framework,
        startDate: p.startDate,
        endDate: p.endDate,
        totalCostEUR: p.totalCost ? Number(p.totalCost) : null,
        ecMaxContributionEUR: p.ecMaxContribution ? Number(p.ecMaxContribution) : null,
        objective: p.objective,
        cordisUrl: `https://cordis.europa.eu/project/id/${p.id}`,
        coordinator: coordinator
          ? {
              id: coordinator.organisationId,
              name: coordinator.name,
              country: coordinator.country,
              isTurkish: coordinator.isTurkish,
            }
          : null,
        topics: p.topics.map((t: any) => t.topicCode),
        participationsCount: p.participations.length,
      };
    });

    return NextResponse.json({
      success: true,
      meta: {
        total,
        page,
        limit: rawLimit,
        totalPages: Math.ceil(total / rawLimit),
        license: 'CC BY 4.0',
        attribution: 'Kaynak: CORDIS, Avrupa Komisyonu',
      },
      data: formattedProjects,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to search CORDIS projects' },
      { status: 500 }
    );
  }
}
