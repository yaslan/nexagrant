import React from 'react';
import { notFound } from 'next/navigation';

import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';

import { toEvaluationNotes } from '@/modules/m6/types';
import { lensMarks, readerTypeOf } from '@/modules/m6/lens-scores';

import { EvaluationsClient } from './client';

/**
 * Shape of the tenant-scoped read below. `withTenant`'s generic cannot be inferred from
 * the Prisma client shape this repo ships (src/types/prisma-override.d.ts), so it is
 * supplied explicitly rather than falling back to `any`.
 */
type EvaluationRow = {
  id: string;
  readerType: string;
  status: string;
  excellence: number;
  impact: number;
  implementation: number;
  weaknesses: unknown;
  calibration: number | null;
  createdAt: Date;
};

type OpportunityWithEvaluations = {
  id: string;
  title: string;
  evaluations: EvaluationRow[];
};

/**
 * M6 Evaluator Lens — evaluations for one opportunity.
 *
 * There is no demo fallback here. The previous version answered a DB miss with a
 * hard-coded opportunity carrying invented scores (4.5 / 4.2 / 3.8) and invented
 * strengths and weaknesses, rendered exactly like a real assessment. CLAUDE.md §7 ties
 * every number shown to a record; an unseeded or unreachable database is a reason to
 * show nothing, never a reason to show made-up marks about someone's proposal.
 */
export default async function EvaluationsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  // Module gate (M6). A tenant whose ModuleState says OFF/DEV/PILOT must not
  // reach this page just because it can guess the URL.
  const locked = await moduleGate('M6', locale);
  if (locked) return locked;

  // Tenant-scoped lookup: findUnique by a guessable id would cross tenants.
  const opp = await withTenant<OpportunityWithEvaluations | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        title: true,
        evaluations: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            readerType: true,
            // Read alongside the three mark columns, never instead of them: those
            // columns default to 0, so `status` is the only thing that says whether
            // anyone put a number in them. See @/modules/m6/lens-scores.
            status: true,
            excellence: true,
            impact: true,
            implementation: true,
            weaknesses: true,
            calibration: true,
            createdAt: true,
          },
        },
      },
    }),
  );

  if (!opp) notFound();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <EvaluationsClient
        opportunityId={opp.id}
        opportunityTitle={opp.title}
        evaluations={opp.evaluations.map((e: EvaluationRow) => ({
          id: e.id,
          // The real reader type crosses the boundary. Collapsing PANEL into HUMAN here
          // is what let a panel row — whose marks live in Reviewer/Score — be rendered
          // as a human reader scoring 0/0/0.
          readerType: readerTypeOf(e.readerType),
          // `null` when nothing has been scored. The client must not turn this back
          // into 0: absence is the state, not a value.
          scores: lensMarks(e),
          weaknesses: toEvaluationNotes(e.weaknesses),
          calibration: e.calibration,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
