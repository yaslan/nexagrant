import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

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

  // Two reads, because "this opportunity does not exist" and "this opportunity has no
  // proposal yet" are different answers and used to collapse into one `notFound()`:
  // an opportunity a user had just created, but not yet written a proposal for,
  // answered 404 — telling them their opportunity was gone, which was untrue.
  const found = await withTenant<{
    opportunity: { id: string } | null;
    proposal: SeatedProposal | null;
  }>(tenantId, async (tx) => {
    // Tenant-matched, not `findUnique`: the id is guessable and must not cross tenants.
    const opportunity = await tx.opportunity.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!opportunity) return { opportunity: null, proposal: null };

    const proposal = await tx.proposal.findFirst({
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
    });
    return { opportunity, proposal };
  });

  // No such opportunity in this workspace — 404 is the honest answer here.
  if (!found.opportunity) notFound();

  const { proposal } = found;

  // The opportunity is real but carries no proposal, so there is nothing to score.
  // This renders an empty state rather than 404 or a skeleton that never resolves.
  if (!proposal) {
    const t = await getTranslations({ locale, namespace: 'm6' });
    return (
      <div className="max-w-4xl mx-auto py-6 sm:px-6 space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t('panel.title')}</h1>
        <p
          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
          data-testid="m6-panel-no-proposal"
        >
          {t('panel.noProposal')}
        </p>
      </div>
    );
  }

  const seated = proposal.evaluations.find((e) => e.reviewers.length > 0);

  // Read here rather than in the client: `listPanelScores` resolves the tenant from the
  // session and runs inside `withTenant`, and a server read means the dashboard has no
  // loading state to get wrong.
  const rows = await listPanelScores(proposal.id);

  return (
    <div className="max-w-4xl mx-auto py-6 sm:px-6 space-y-6">
      <PanelClient
        proposalId={proposal.id}
        seatedEvaluationId={seated?.id ?? null}
        dashboard={<EvaluationDashboard rows={rows} />}
      />
    </div>
  );
}
