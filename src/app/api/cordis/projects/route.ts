import { NextRequest, NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { cordisProjectsQuerySchema, pickQuery } from '@/lib/k2-cordis/api-query';
import type { CordisProjectWithParticipants } from '@/lib/k2-cordis/rows';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const country = searchParams.get('country')?.trim().toUpperCase() || '';
    const topic = searchParams.get('topic')?.trim() || '';
    const framework = searchParams.get('framework')?.trim().toUpperCase() || '';
    const role = searchParams.get('role')?.trim().toLowerCase() || '';

    const parsed = cordisProjectsQuerySchema.safeParse(
      pickQuery(searchParams, ['year_from', 'year_to', 'page', 'limit'] as const)
    );
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_query' }, { status: 400 });
    }
    const { year_from: yearFrom, year_to: yearTo, page, limit: rawLimit } = parsed.data;

    const where: Record<string, unknown> = {};

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
      const startDate: { gte?: Date; lte?: Date } = {};
      if (yearFrom) startDate.gte = new Date(`${yearFrom}-01-01`);
      if (yearTo) startDate.lte = new Date(`${yearTo}-12-31`);
      where.startDate = startDate;
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

    const formattedProjects = (projects as CordisProjectWithParticipants[]).map((p) => {
      const coordinator = p.participations.find((pt) => pt.role === 'coordinator')?.organization;
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
        topics: p.topics.map((t) => t.topicCode),
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
  } catch (error) {
    // A Prisma message quotes the query shape and table names: log it, never return it.
    logger.error('[API /api/cordis/projects] query failed', error);
    return internalError({ success: false, error: 'internal_error' });
  }
}
