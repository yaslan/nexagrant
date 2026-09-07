import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { ApplicationClient, type ApplicationPartItem } from './client';
import { errorMessage } from '@/lib/errors';

export default async function ApplicationPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);

  let opp: { id: string; tenantId: string; title: string; applicationParts: ApplicationPartItem[] } | null = null;
  try {
    // findFirst + tenantId, not findUnique by id: an opportunity id is
    // guessable, and findUnique would happily return another tenant's row.
    opp = await withTenant(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id, tenantId },
        include: { applicationParts: true }
      })
    );
  } catch (e) {
    console.warn(`[ApplicationPage] DB query bypassed: ${errorMessage(e)}`);
  }

  // Fallback demo data if DB is unseeded/offline
  if (!opp) {
    opp = {
      id,
      tenantId,
      title: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
      applicationParts: [
        {
          id: 'part-a-1',
          part: 'PART_A',
          magicToken: 'partner-access-token-123',
          content: {
            budget: [
              { partnerName: 'Demo SME Consultancy (TR)', personMonths: 24, countryCoefficient: 1.0, subcontractingCost: 0, travelCost: 0, requestedTotal: 165000 },
              { partnerName: 'Fraunhofer Institute (DE)', personMonths: 36, countryCoefficient: 1.0, subcontractingCost: 0, travelCost: 0, requestedTotal: 247500 },
              { partnerName: 'METU TTO (TR)', personMonths: 18, countryCoefficient: 0.85, subcontractingCost: 0, travelCost: 0, requestedTotal: 102000 },
            ],
          },
        },
        {
          id: 'part-b-1',
          part: 'PART_B',
          magicToken: 'part-b-token-456',
          content: {
            workPackages: [
              { code: 'WP1', title: 'Management & Coordination', leadPartner: 'Demo SME Consultancy', startMonth: 1, endMonth: 36, deliverables: ['D1.1 Data Management Plan'] },
              { code: 'WP2', title: 'System Requirements & Architecture', leadPartner: 'METU TTO', startMonth: 1, endMonth: 12, deliverables: ['D2.1 Technical Specs'] },
              { code: 'WP3', title: 'Prototyping & Pilot Testing', leadPartner: 'Fraunhofer Institute', startMonth: 7, endMonth: 24, deliverables: ['D3.1 Thermal Pilot'] },
              { code: 'WP4', title: 'Dissemination & Exploitation', leadPartner: 'Siemens AG', startMonth: 1, endMonth: 36, deliverables: ['D4.1 DEC Plan'] },
            ],
          },
        },
      ],
    };
  }

  const partA = opp.applicationParts.find((p: { part: string }) => p.part === 'PART_A');
  const partB = opp.applicationParts.find((p: { part: string }) => p.part === 'PART_B');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <ApplicationClient
        opportunityId={opp.id}
        tenantId={opp.tenantId || tenantId}
        opportunityTitle={opp.title}
        partA={partA}
        partB={partB}
      />
    </div>
  );
}
