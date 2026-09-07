import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = searchParams.get('q')?.trim() || '';
    const country = searchParams.get('country')?.trim().toUpperCase() || '';
    const activityType = searchParams.get('activity_type')?.trim().toUpperCase() || '';
    const minProjects = searchParams.get('min_projects') ? parseInt(searchParams.get('min_projects')!, 10) : 0;
    const isTurkish = searchParams.get('is_turkish') !== null ? searchParams.get('is_turkish') === 'true' : undefined;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

    const where: any = {};

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

    const data = profiles.map((p: any) => ({
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
    return NextResponse.json(
      { success: false, error: errorMessage(error, 'Failed to search M1 partner profiles')},
      { status: 500 }
    );
  }
}
