import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { cordisOrganizationsQuerySchema, pickQuery } from '@/lib/k2-cordis/api-query';
import type { CordisPartnerProfileRow } from '@/lib/k2-cordis/rows';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const country = searchParams.get('country')?.trim().toUpperCase() || '';
    const activityType = searchParams.get('activity_type')?.trim().toUpperCase() || '';
    const isTurkish = searchParams.get('is_turkish') !== null ? searchParams.get('is_turkish') === 'true' : undefined;

    const parsed = cordisOrganizationsQuerySchema.safeParse(
      pickQuery(searchParams, ['min_projects', 'page', 'limit'] as const)
    );
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_query' }, { status: 400 });
    }
    const { min_projects: minProjects, page, limit } = parsed.data;

    const where: Record<string, unknown> = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameNormalized: { contains: q.toUpperCase(), mode: 'insensitive' } },
      ];
    }

    if (country) {
      where.country = country;
    }

    if (activityType) {
      where.activityType = activityType;
    }

    if (isTurkish !== undefined) {
      where.isTurkish = isTurkish;
    }

    if (minProjects > 0) {
      where.totalProjects = { gte: minProjects };
    }

    // Query derived CordisPartnerProfile
    const [total, profiles] = await Promise.all([
      prisma.cordisPartnerProfile.count({ where }),
      prisma.cordisPartnerProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { totalProjects: 'desc' },
      }),
    ]);

    const data = (profiles as CordisPartnerProfileRow[]).map((p) => ({
      organisationId: p.organisationId,
      name: p.name,
      country: p.country,
      activityType: p.activityType,
      sme: p.sme,
      isTurkish: p.isTurkish,
      totalProjects: p.totalProjects,
      horizonProjects: p.horizonProjects,
      h2020Projects: p.h2020Projects,
      coordinatorProjects: p.coordinatorProjects,
      activeProjects: p.activeProjects,
      totalEcContributionEUR: Number(p.totalEcContribution),
      lastProjectDate: p.lastProjectDate,
      topTopics: p.topTopics,
    }));

    return NextResponse.json({
      success: true,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        license: 'CC BY 4.0',
        attribution: 'Kaynak: CORDIS, Avrupa Komisyonu',
      },
      data,
    });
  } catch (error) {
    // A Prisma message quotes the query shape and table names: log it, never return it.
    logger.error('[API /api/cordis/organizations] query failed', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
