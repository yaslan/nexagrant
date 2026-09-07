import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/**
 * One row of GET /api/v1/opportunities.
 *
 * The live rows and the offline demo rows are deliberately typed as a union
 * because they are **not the same shape**: the demo rows carry currentGate,
 * targetBudgetEur, consortiumSeatsCount and submissionDeadline, none of which
 * exist on the Opportunity table, while the live rows carry stage,
 * gateDecisions and proposal. A consumer therefore sees a different contract
 * depending on whether the database is reachable. Reconciling them is an API
 * decision, not a lint fix; recorded in the TASK-MTQ60SGW45T0X report.
 */
type OpportunityApiRow =
  | {
      id: string;
      tenantId: string;
      title: string;
      stage: string;
      status: string;
      gateDecisions: unknown[];
      proposal: unknown;
    }
  | {
      id: string;
      tenantId: string;
      title: string;
      status: string;
      currentGate: string;
      targetBudgetEur: number;
      consortiumSeatsCount: number;
      submissionDeadline: string;
    };

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { tenantId } = authRes.data;

  let opportunities: OpportunityApiRow[] = [];

  try {
    opportunities = await prisma.opportunity.findMany({
      where: { tenantId },
      include: {
        gateDecisions: {
          orderBy: { decidedAt: 'desc' },
          take: 3,
        },
        proposal: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (e) {
    console.warn(`[/api/v1/opportunities] DB query fallback: ${errorMessage(e)}`);
  }

  if (!opportunities || opportunities.length === 0) {
    opportunities = [
      {
        id: 'opp-demo-1',
        tenantId,
        title: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
        status: 'ACTIVE_PIPELINE',
        currentGate: 'G1 (Consortium Gate)',
        targetBudgetEur: 4200000,
        consortiumSeatsCount: 4,
        submissionDeadline: '2026-09-15T17:00:00.000Z',
      },
      {
        id: 'opp-demo-2',
        tenantId,
        title: 'EIC-ACC-2026-STEP: Autonomous Battery Thermal Sensor Spin-off',
        status: 'CONCEPT_DRAFT',
        currentGate: 'G0 (Strategic Go/No-Go)',
        targetBudgetEur: 2500000,
        consortiumSeatsCount: 1,
        submissionDeadline: '2026-11-05T17:00:00.000Z',
      },
    ];
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
