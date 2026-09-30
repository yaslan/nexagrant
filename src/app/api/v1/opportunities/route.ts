import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api-error';
import { authenticateApiKey } from '@/lib/api-auth';
import { withTenant } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/**
 * One row of GET /api/v1/opportunities.
 *
 * This used to be a *union* of two shapes: the live rows (stage, gateDecisions,
 * proposal) and a second set of demo rows carrying `currentGate`,
 * `targetBudgetEur`, `consortiumSeatsCount` and `submissionDeadline` — none of
 * which are columns on `model Opportunity` in prisma/schema.prisma. Those demo
 * rows were served with a 200 OK whenever the query threw *or* whenever the
 * tenant simply had no opportunities yet, so a brand-new workspace was told it
 * had a €4.2m pipeline sitting at "G1 (Consortium Gate)". That is what
 * CLAUDE.md rule 7 forbids, and the union meant the published contract changed
 * shape depending on whether the database answered.
 *
 * The demo array is gone. There is one shape now — the real one — an empty
 * pipeline is an empty list, and a failed query is reported as a failure.
 */
interface OpportunityApiRow {
  id: string;
  tenantId: string;
  title: string;
  /** `Opportunity.stage` — the Gate enum (G0…G4). There is no `currentGate` column. */
  stage: string;
  status: string;
  gateDecisions: unknown[];
  proposal: unknown;
}

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { tenantId } = authRes.data;

  let opportunities: OpportunityApiRow[];

  try {
    opportunities = await withTenant(tenantId, (tx) =>
      tx.opportunity.findMany({
        // Archived opportunities (`deletedAt` set) are hidden from the product, so the public
        // API must not be the one place they are still readable.
        where: { tenantId, deletedAt: null },
        include: {
          gateDecisions: {
            orderBy: { decidedAt: 'desc' },
            take: 3,
          },
          proposal: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    );
  } catch (e) {
    // Reported, not replaced with invented rows. The old catch fell through to
    // a demo array, so a permanently broken query would have answered 200 OK
    // for as long as nobody read the server log.
    console.error(`[/api/v1/opportunities] query failed: ${errorMessage(e)}`);
    return internalError({
      error: 'Internal Server Error',
      message: 'Opportunity lookup failed.',
      code: 'OPPORTUNITIES_QUERY_FAILED',
    });
  }

  return NextResponse.json({
    success: true,
    meta: {
      tenantId,
      total: opportunities.length,
      queriedAt: new Date().toISOString(),
    },
    data: opportunities,
  });
}
