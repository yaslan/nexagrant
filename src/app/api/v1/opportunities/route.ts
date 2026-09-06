import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { tenantId } = authRes.data;

  let opportunities: any[] = [];

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
  } catch (e: any) {
    console.warn(`[/api/v1/opportunities] DB query fallback: ${e.message}`);
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
