import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import ConsortiumManager, { type ConsortiumSeat, type OrgInfo, type SeatCandidate } from './manager';
import { errorMessage } from '@/lib/errors';
import { moduleGate } from '@/lib/modules/guard';

/** `CordisOrganization` columns this page maps onto the manager's `OrgInfo`. */
interface CordisOrgRow {
  organisationId: string;
  name: string;
  shortName: string | null;
  country: string | null;
  sme: boolean;
}

/** The header fields this page renders for an opportunity. */
interface ConsortiumOpportunity {
  id: string;
  title: string;
  stage: string;
  status: string;
  topicId: string | null;
  intendedRole: string | null;
  g0Score: number | null;
}

const DEMO_OPPORTUNITIES: Record<string, ConsortiumOpportunity> = {
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

/**
 * M8 consortium page.
 *
 * This page used to resolve its tenant as
 * `session.tenantId ?? prisma.tenant.findFirst()` and then apply the tenant to
 * the WHERE clause only `if (tenantId)`. With no session the fallback handed
 * the request whichever tenant happened to be seeded first, and if the table
 * was empty the condition was dropped entirely — so `opportunity.findFirst({
 * where: { id } })` returned *any* tenant's opportunity by guessed id. The seat
 * candidates were never tenant-scoped at all.
 *
 * It now follows the same rule as `./actions.ts`: the tenant comes from
 * `requireTenantPage()` (no fallback — anonymous visitors are redirected) and
 * every query runs inside `withTenant`, matched on `(id, tenantId)`.
 */
export default async function ConsortiumPage({
  params,
}: {
  params: Promise<{ id: string; locale: string; workspace: string }>;
}) {
  const { id, locale, workspace } = await params;
  const locked = await moduleGate('M8', locale);
  if (locked) return locked;
  const { tenantId } = await requireTenantPage(locale);

  let opportunity: ConsortiumOpportunity | null = null;
  let seats: ConsortiumSeat[] = [];
  let candidates: SeatCandidate[] = [];
  let orgs: OrgInfo[] = [];

  try {
    opportunity = await withTenant<ConsortiumOpportunity | null>(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id, tenantId },
      })
    );

    if (opportunity) {
      seats = await withTenant<ConsortiumSeat[]>(tenantId, (tx) =>
        tx.consortiumSeat.findMany({
          where: { opportunityId: id, tenantId },
          orderBy: { roleKey: 'asc' },
        })
      );

      const seatIds = seats.map((s) => s.id);
      if (seatIds.length > 0) {
        candidates = await withTenant<SeatCandidate[]>(tenantId, (tx) =>
          tx.seatCandidate.findMany({
            where: { seatId: { in: seatIds }, tenantId },
            orderBy: { rank: 'asc' },
          })
        );
      }

      const orgIds = [
        ...seats.map((s) => s.organizationId).filter(Boolean),
        ...candidates.map((c) => c.organizationId).filter(Boolean),
      ] as string[];

      // Organizations are shared CORDIS reference data, not tenant rows; the ids
      // here already come from rows read inside this tenant. `prisma.organization`
      // is not a model in prisma/schema.prisma — the query threw on every render
      // and the catch below quietly served the demo fallback instead.
      if (orgIds.length > 0) {
        const cordisOrgs = await withTenant<CordisOrgRow[]>(tenantId, (tx) =>
          tx.cordisOrganization.findMany({
            where: { organisationId: { in: orgIds } },
            select: { organisationId: true, name: true, shortName: true, country: true, sme: true },
          })
        );
        orgs = cordisOrgs.map((o) => ({
          id: o.organisationId,
          name: o.name,
          shortName: o.shortName,
          country: o.country,
          isSme: o.sme,
        }));
      }
    }
  } catch (e) {
    console.warn(`[ConsortiumPage] DB query bypassed for ${id}: ${errorMessage(e)}`);
  }

  // Demo opportunity fallback
  if (!opportunity) {
    opportunity = DEMO_OPPORTUNITIES[id] ?? null;
  }

  if (!opportunity) return notFound();

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]));

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
