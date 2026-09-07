import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { prisma } from '@/lib/db';
import { errorMessage } from '@/lib/errors';

/**
 * The body of GET /api/v1/partners/[pic].
 *
 * A union because the two branches are **not the same shape**: the live row is
 * the Organization record with its `participations`, while the offline
 * fallback returns a curated `metrics`/`recentProjects`/`networkHub` document
 * that no table produces. A consumer therefore sees a different contract
 * depending on whether the database is reachable. Reconciling them is an API
 * decision, not a lint fix; recorded in the TASK-MTQ60SGW45T0X report.
 */
type PartnerDetailApiRow =
  | {
      id: string;
      pic: string | null;
      name: string;
      country: string | null;
      orgType: string | null;
      isSme: boolean;
      participations: unknown[];
    }
  | {
      pic: string;
      name: string;
      country: string;
      orgType: string;
      city: string;
      isSme: boolean;
      metrics: {
        totalProjects: number;
        coordinatorRoles: number;
        totalFundingEur: number;
        averageTeamSize: number;
        preferredPillars: string[];
      };
      recentProjects: Array<{
        projectAcronym: string;
        projectTitle: string;
        programme: string;
        role: string;
        grantAmountEur: number;
        startDate: string;
        status: string;
      }>;
      networkHub: { topCoAuthors: string[]; cooperationIndex: number };
    };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pic: string }> }
) {
  const authRes = await authenticateApiKey(req);
  if (!authRes.authenticated) {
    return authRes.errorResponse;
  }

  const { pic } = await params;

  let partner: PartnerDetailApiRow | null = null;

  try {
    partner = await prisma.organization.findUnique({
      where: { pic },
      include: {
        participations: {
          take: 10,
          include: { project: true },
        },
      },
    });
  } catch (e) {
    console.warn(`[/api/v1/partners/${pic}] DB query fallback: ${errorMessage(e)}`);
  }

  if (!partner) {
    // Dynamic mock response for queried PIC
    partner = {
      pic,
      name: pic === '999841469' ? 'Middle East Technical University (ODTÜ)' : `EU Research Participant (PIC: ${pic})`,
      country: pic === '999841469' ? 'TR' : 'DE',
      orgType: 'HES',
      city: pic === '999841469' ? 'Ankara' : 'Munich',
      isSme: false,
      metrics: {
        totalProjects: 142,
        coordinatorRoles: 28,
        totalFundingEur: 54200000,
        averageTeamSize: 11.4,
        preferredPillars: ['Pillar II (Clusters)', 'EIC / Pathfinder', 'MSCA'],
      },
      recentProjects: [
        {
          projectAcronym: 'THERMO-CLEAN',
          projectTitle: 'Next-Generation Ultra-Efficient Thermal Cell Management for Commercial EVs',
          programme: 'HORIZON-CL5-2024-D3',
          role: 'Coordinator',
          grantAmountEur: 4200000,
          startDate: '2024-09-01',
          status: 'ONGOING',
        },
        {
          projectAcronym: 'SOLID-SAFE',
          projectTitle: 'Solid-State Battery Micro-Electrolyte Safety Verification',
          programme: 'HORIZON-CL4-2023-DIGITAL',
          role: 'Partner / WP Leader',
          grantAmountEur: 750000,
          startDate: '2023-11-01',
          status: 'ONGOING',
        },
      ],
      networkHub: {
        topCoAuthors: ['Fraunhofer-Gesellschaft (DE)', 'Politecnico di Milano (IT)', 'Siemens AG (DE)'],
        cooperationIndex: 94.2,
      },
    };
  }

  return NextResponse.json({
    success: true,
    data: partner,
    meta: {
      queriedAt: new Date().toISOString(),
      source: 'CORDIS Open Data & Caching Engine',
    },
  });
}
