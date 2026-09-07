import React from 'react';
import { notFound } from 'next/navigation';
import type { Gate } from '@prisma/client';

import { withTenant } from '@/lib/db';
import { requireTenantPage } from '@/lib/tenant';
import { computeG0ForOpportunity } from '@/lib/scoring/g0-compute';
import type { G0Computation } from '@/lib/scoring/g0-compute';
import { DEFAULT_GATE_RULES } from '@/lib/scoring/defaults';

import { OpportunityDetailClient, type G0Display, type OpportunityView } from './client';

/**
 * Shape of the tenant-scoped read below. `withTenant`'s generic cannot be inferred from the
 * Prisma client shape this repo ships (src/types/prisma-override.d.ts), so it is supplied
 * explicitly rather than falling back to `any`.
 */
type OpportunityRow = {
  id: string;
  title: string;
  topicId: string | null;
  stage: Gate;
  status: string;
  intendedRole: string | null;
};

/**
 * One opportunity in the stage-gate pipeline.
 *
 * This page used to be a client component built on a `getOpportunity()` mock: a hard-coded
 * title, a hard-coded `HORIZON-…` topic and `g0Score: 92`, rendered as "92/100" for every id
 * anyone typed into the URL. The canonical scorer said 18 for the same opportunity, so the
 * figure on screen contradicted the figure the gate decided on — and CLAUDE.md §7 requires a
 * record behind any number a user reads.
 *
 * The score is now derived here, server-side and tenant-scoped, by `computeG0ForOpportunity`
 * — the same function `src/lib/gates/evaluate.ts` runs. Nothing is written on a page view: the
 * gate button persists, the render only reads. When the scorer has no evidence it returns
 * `null` and the screen says the score could not be computed; it never falls back to 0, and
 * never to 92.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string; id: string }>;
}) {
  const { locale, workspace, id } = await params;
  const { tenantId } = await requireTenantPage(locale);

  const loaded = await withTenant<{ opp: OpportunityRow | null; g0: G0Computation | null }>(
    tenantId,
    async (tx) => {
      // findFirst + tenantId, never findUnique on a guessable id, and `deletedAt: null` so a
      // soft-deleted (KVKK/GDPR erasure) opportunity 404s instead of staying readable.
      const opp: OpportunityRow | null = await tx.opportunity.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: {
          id: true,
          title: true,
          topicId: true,
          stage: true,
          status: true,
          intendedRole: true,
        },
      });
      if (!opp) return { opp: null, g0: null };
      return { opp, g0: await computeG0ForOpportunity(tx, tenantId, id) };
    },
  );

  if (!loaded.opp) notFound();

  const g0: G0Display = {
    score: loaded.g0?.score ?? null,
    decision: loaded.g0?.decision ?? null,
    measuredSources: loaded.g0?.sources.filter((s) => s.status === 'measured').length ?? 0,
    totalSources: loaded.g0?.sources.length ?? 0,
    reasons: loaded.g0?.reasons ?? [],
    minScore: DEFAULT_GATE_RULES.G0.minScore,
  };

  const opportunity: OpportunityView = {
    id: loaded.opp.id,
    title: loaded.opp.title,
    topicId: loaded.opp.topicId,
    stage: loaded.opp.stage,
    status: loaded.opp.status,
    intendedRole: loaded.opp.intendedRole,
  };

  return (
    <OpportunityDetailClient
      opportunity={opportunity}
      g0={g0}
      backHref={`/${locale}/${workspace}/pipeline`}
    />
  );
}
