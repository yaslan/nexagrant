import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ConsortiumManager from './manager';

const DEMO_OPPORTUNITIES: Record<string, any> = {
  'demo-opp-1': {
    id: 'demo-opp-1',
    title: 'FLEX-GRID: Decarbonised Smart Grid Flexibility Solutions',
    stage: 'G0',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2024-D3-01-01',
    intendedRole: 'coordinator',
    g0Score: 88,
  },
  'demo-opp-2': {
    id: 'demo-opp-2',
    title: 'TWIN-HYDRO: AI-Powered Digital Twins for Green Hydrogen Plants',
    stage: 'G1',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL4-2024-TWIN-01',
    intendedRole: 'partner',
    g0Score: 92,
  },
  'demo-opp-3': {
    id: 'demo-opp-3',
    title: 'CIRC-PACK: Circular Bio-Economy Polymers for Industrial Packaging',
    stage: 'G2',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL6-2024-CIRCBIO-01',
    intendedRole: 'coordinator',
    g0Score: 85,
  },
  'demo-opp-4': {
    id: 'demo-opp-4',
    title: 'CLEAN-PORT: Zero-Emission Coastal Freight & Smart Bunkering',
    stage: 'G3',
    status: 'ACTIVE',
    topicId: 'HORIZON-CL5-2024-D5-01-12',
    intendedRole: 'partner',
    g0Score: 94,
  },
};

export default async function ConsortiumPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const session = await auth();
  let tenantId = (session as any)?.tenantId;

  let opportunity: any = null;
  let seats: any[] = [];
  let candidates: any[] = [];
  let orgs: any[] = [];

  try {
    if (!tenantId) {
      const tenant = await prisma.tenant.findFirst();
      tenantId = tenant?.id;
    }

    const whereCond: any = { id };
    if (tenantId) whereCond.tenantId = tenantId;

    opportunity = await prisma.opportunity.findFirst({
      where: whereCond,
    });

    if (opportunity) {
      const seatsWhere: any = { opportunityId: id };
      if (tenantId) seatsWhere.tenantId = tenantId;

      seats = await prisma.consortiumSeat.findMany({
        where: seatsWhere,
        orderBy: { roleKey: 'asc' },
      });

      const seatIds = seats.map((s: any) => s.id);
      if (seatIds.length > 0) {
        candidates = await prisma.seatCandidate.findMany({
          where: { seatId: { in: seatIds } },
          orderBy: { rank: 'asc' },
        });
      }

      const orgIds = [
        ...seats.map((s: any) => s.organizationId).filter(Boolean),
        ...candidates.map((c: any) => c.organizationId).filter(Boolean),
      ] as string[];

      if (orgIds.length > 0) {
        orgs = await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, shortName: true, country: true, isSme: true },
        });
      }
    }
  } catch (e: any) {
    console.warn(`[ConsortiumPage] DB query bypassed for ${id}: ${e.message}`);
  }

  // Demo opportunity fallback
  if (!opportunity) {
    opportunity = DEMO_OPPORTUNITIES[id];
  }

  if (!opportunity) return notFound();

  const orgMap = Object.fromEntries(orgs.map((o: any) => [o.id, o]));

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          href={`/${locale}/${workspace}/pipeline`}
          className="text-muted hover:text-ink"
        >
          ← Back to Pipeline
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold font-heading">Consortium Builder</h1>
        <p className="text-muted mt-1">
          {opportunity.title} — Stage {opportunity.stage}
        </p>
      </div>

      <ConsortiumManager
        opportunityId={id}
        seats={seats}
        candidates={candidates}
        orgMap={orgMap}
      />
    </div>
  );
}
