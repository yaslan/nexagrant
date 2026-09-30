import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/**
 * One row of GET /api/v1/partners.
 *
 * The field *names* are the ones this endpoint has always published and are
 * deliberately unchanged. What changed is where they come from: this route used
 * to call `prisma.organization`, and there is no `model Organization` in
 * prisma/schema.prisma, so the delegate was `undefined` and the call threw a
 * TypeError on every request. The try/catch swallowed it and the endpoint served
 * a hard-coded demo array with 200 OK — an invented `projectCount: 1420` for
 * Fraunhofer among them. Rows now come from the CORDIS partner graph
 * (CordisOrganization + its derived CordisPartnerProfile).
 *
 * `stats.networkCentralityScore` is null on purpose: no CORDIS table carries a
 * centrality measure, and CLAUDE.md rule 7 forbids inventing one. The key stays
 * so the response shape does not change; the value says "not measured".
 */
interface PartnerApiRow {
  id: string;
  pic: string;
  name: string;
  legalName: string;
  country: string | null;
  orgType: string | null;
  isSme: boolean;
  city: string | null;
  stats: {
    /** From CordisPartnerProfile; null when the profile has not been derived. */
    projectCount: number | null;
    coordinatorCount: number | null;
    totalEuContributionEur: number | null;
    /** No source in the CORDIS schema. Always null — never a made-up number. */
    networkCentralityScore: number | null;
  };
}

/** The CordisOrganization columns this endpoint reads, with its profile. */
interface CordisOrgWithProfile {
  organisationId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  activityType: string | null;
  sme: boolean;
  city: string | null;
  profile: {
    totalProjects: number;
    coordinatorProjects: number;
    totalEcContribution: bigint;
  } | null;
}

function toApiRow(org: CordisOrgWithProfile): PartnerApiRow {
  return {
    id: org.organisationId,
    pic: org.organisationId,
    // CORDIS stores the registered legal name in `name` and the trading short
    // form in `shortName`, which is the display/legal split this API publishes.
    name: org.shortName || org.name,
    legalName: org.name,
    country: org.country,
    orgType: org.activityType,
    isSme: org.sme,
    city: org.city,
    stats: {
      projectCount: org.profile ? org.profile.totalProjects : null,
      coordinatorCount: org.profile ? org.profile.coordinatorProjects : null,
      totalEuContributionEur: org.profile ? Number(org.profile.totalEcContribution) : null,
      networkCentralityScore: null,
    },
  };
}

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const country = searchParams.get('country');
  const orgType = searchParams.get('orgType');
  const q = searchParams.get('q')?.trim();
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

  const where: Record<string, unknown> = {};
  if (country) where.country = country.toUpperCase();
  if (orgType) where.activityType = orgType.toUpperCase();
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { nameNormalized: { contains: q, mode: 'insensitive' } },
      { organisationId: { contains: q } },
    ];
  }

  let orgs: CordisOrgWithProfile[];
  try {
    // The CORDIS tables are shared reference data, not tenant data: they carry
    // no tenantId and scripts/rls-models.ts lists all eight of them as
    // SYSTEM_WIDE, so no tenant_isolation policy applies and `withTenant` would
    // have nothing to scope. The API key still decides *who may ask*; it does
    // not partition *what is returned*. `meta.authenticatedTenant` records the
    // caller.
    orgs = await prisma.cordisOrganization.findMany({
      where,
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        organisationId: true,
        name: true,
        shortName: true,
        country: true,
        activityType: true,
        sme: true,
        city: true,
        profile: {
          select: {
            totalProjects: true,
            coordinatorProjects: true,
            totalEcContribution: true,
          },
        },
      },
    });
  } catch (e) {
    // A query failure is reported, not replaced with invented rows. The old
    // catch fell through to a demo array, which is how a broken query shipped
    // twice without anyone noticing.
    console.error(`[/api/v1/partners] query failed: ${errorMessage(e)}`);
    return internalError({
      error: 'Internal Server Error',
      message: 'Partner lookup failed.',
      code: 'PARTNERS_QUERY_FAILED',
    });
  }

  const partners = orgs.map(toApiRow);

  return NextResponse.json({
    success: true,
    meta: {
      // Unchanged semantics: the number of rows in `data`, not the number of
      // matches in the database. Flagged in the TASK-MTRK8YPNJDCIT report.
      total: partners.length,
      limit,
      queriedAt: new Date().toISOString(),
      authenticatedTenant: authRes.data.tenantId,
    },
    data: partners,
  });
}
