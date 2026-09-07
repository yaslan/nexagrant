import { notFound } from 'next/navigation';

import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { moduleGate } from '@/lib/modules/guard';

import { listPanelScores } from '@/modules/m6/server/actions';
import { EvaluationDashboard } from '@/modules/m6/ui/EvaluationDashboard';

import { PanelClient } from './client';

/**
 * M6 Evaluator Lens — panel scoring for an opportunity's proposal.
 *
 * The EvaluatorForm and EvaluationDashboard components existed but no route
 * rendered them, which is why neither had ever been exercised against real tenant
 * data. Both are mounted here behind the same tenant scope as the rest of M6.
 */
type SeatedProposal = {
  id: string;
  evaluations: { id: string; reviewers: { id: string }[] }[];
};

export default async function EvaluationPanelPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { tenantId, userId } = await requireTenantPage(locale);

  // Module gate (M6). A tenant whose ModuleState says OFF/DEV/PILOT must not
  // reach this page just because it can guess the URL.
  const locked = await moduleGate('M6', locale);
  if (locked) return locked;

  const proposal = await withTenant<SeatedProposal | null>(tenantId, (tx) =>
    tx.proposal.findFirst({
      // Matched on the opportunity, so a proposal id from another tenant cannot be
      // reached by guessing one.
      where: { opportunityId: id, tenantId },
      select: {
        id: true,
        evaluations: {
          where: { readerType: 'PANEL', tenantId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            // Only this user's seat; a reviewer scores as themselves and nobody else.
            reviewers: { where: { userId, tenantId }, select: { id: true } },
          },
        },
      },
    }),
  );

  if (!proposal) notFound();

  const seated = proposal.evaluations.find((e) => e.reviewers.length > 0);

  // Read here rather than in the client: `listPanelScores` resolves the tenant from the
  // session and runs inside `withTenant`, and a server read means the dashboard has no
  // loading state to get wrong.
  const rows = await listPanelScores(proposal.id);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <PanelClient
        proposalId={proposal.id}
        seatedEvaluationId={seated?.id ?? null}
        dashboard={<EvaluationDashboard rows={rows} />}
      />
    </div>
  );
}
