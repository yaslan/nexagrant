import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { authenticateApiKey } from '@/lib/api-auth';
import { errorMessage } from '@/lib/errors';
import { pickQuery, coordinatorLeadersQuerySchema } from '@/lib/k2-cordis/api-query';
import { coordinatorLeaders } from '@/lib/k2-cordis/coordinator-leaders';

/**
 * GET /api/v1/partners/leaders?topicPrefix=HORIZON-CL5-&limit=20&country=DE
 *
 * Organisations that coordinate the most CORDIS projects under a topic-code
 * prefix (TASK-MVBBPXU1ZW0F5). `topicPrefix` is required; a missing or malformed
 * one is a 400 before any query runs.
 *
 * `totalEcContributionEur` is a string. CORDIS stores whole euros and a sum over
 * a prefix can exceed the range where a JSON number stays exact.
 */
export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req, { action: 'view_partner_search', feature: 'partner_search' });
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { searchParams } = new URL(req.url);
  const parsed = coordinatorLeadersQuerySchema.safeParse(
    pickQuery(searchParams, ['topicPrefix', 'limit', 'country'] as const)
  );
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid_query' }, { status: 400 });
  }
  const { topicPrefix, limit, country } = parsed.data;

  let leaders;
  try {
    leaders = await coordinatorLeaders({ topicPrefix, limit, country });
  } catch (e) {
    // Logged server-side only; the body carries a fixed code, never the query text.
    console.error(`[/api/v1/partners/leaders] query failed: ${errorMessage(e)}`);
    return internalError({
      error: 'Internal Server Error',
      message: 'Leader lookup failed.',
      code: 'PARTNER_LEADERS_QUERY_FAILED',
    });
  }

  return NextResponse.json({
    success: true,
    meta: {
      topicPrefix,
      total: leaders.length,
      limit,
      queriedAt: new Date().toISOString(),
      authenticatedTenant: authRes.data.tenantId,
    },
    data: leaders.map((row) => ({
      id: row.organisationId,
      pic: row.organisationId,
      name: row.shortName || row.name,
      legalName: row.name,
      country: row.country,
      coordinatedProjects: row.coordinatedProjects,
      totalEcContributionEur: row.totalEcContribution.toString(),
    })),
  });
}
