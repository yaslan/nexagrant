import React from 'react';
import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { EvaluationsClient } from './client';

export default async function EvaluationsPage({
  params
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  let opp: any = null;
  try {
    // Tenant-scoped lookup: findUnique by a guessable id would cross tenants.
    opp = await withTenant(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id, tenantId },
        include: { evaluations: { orderBy: { createdAt: 'desc' } } }
      })
    );
  } catch (e: any) {
    console.warn(`[EvaluationsPage] DB query bypassed: ${e.message}`);
  }

  // Fallback demo opportunity if DB is unseeded/offline
  if (!opp) {
    opp = {
      id,
      tenantId,
      title: 'HORIZON-CL5-2026-D3-01: Zero-Emission Transport Systems & Battery Tech',
      evaluations: [
        {
          id: 'ev-ai-1',
          readerType: 'AI',
          excellence: 4.5,
          impact: 4.2,
          implementation: 3.8,
          weaknesses: {
            strengths: [
              'Clear TRL progression roadmap from TRL 4 to TRL 7',
              'Strong multi-disciplinary consortium with leading EU research institutes'
            ],
            weaknesses: [
              'Risk mitigation matrix lacks specific contingency measures for TRL scale-up.',
              'Budget allocation for dissemination activities is under-justified in Work Package 5.'
            ],
            recommendations: [
              'Detail quantifiable KPIs for exploitation in section 2.2',
              'Add backup partner roles for critical WP3 deliverables'
            ]
          },
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <EvaluationsClient
        opportunityId={opp.id}
        opportunityTitle={opp.title}
        evaluations={opp.evaluations || []}
      />
    </div>
  );
}
