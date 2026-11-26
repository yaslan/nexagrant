import React from 'react';
import { notFound } from 'next/navigation';
import type { Gate } from '@prisma/client';

import { withTenant } from '@/lib/db';
import { requireTenantPageRole } from '@/lib/page-role';
import { computeG0ForOpportunity } from '@/lib/scoring/g0-compute';
import type { G0Computation } from '@/lib/scoring/g0-compute';
import { DEFAULT_GATE_RULES } from '@/lib/scoring/defaults';
import { canArchiveOpportunity } from '@/lib/pipeline/archive';
import type { SavedG0Decision } from '@/lib/gates/latest-g0-decision';
import { listDecisions } from '@/lib/k5-pipeline/withdrawal';

import { OpportunityDetailClient, type DecisionEntry, type G0Display, type OpportunityView } from './client';
import type { EffortEntry } from './effort';
import { moduleGate } from '@/lib/modules/guard';

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
  ownerId: string | null;
};

/** One `Effort` row as loaded here, before the user id is resolved to a display name. */
type EffortRow = {
  id: string;
  date: Date;
  hours: number;
  note: string | null;
  userId: string;
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
  const { tenantId, userId, role } = await requireTenantPageRole(locale, 'view_proposal');
  const locked = await moduleGate('M5', locale);
  if (locked) return locked;

  const loaded = await withTenant<{
    opp: OpportunityRow | null;
    g0: G0Computation | null;
    efforts: EffortEntry[];
    savedG0: SavedG0Decision | null;
  }>(tenantId, async (tx) => {
    // findFirst + tenantId, never findUnique on a guessable id, and `deletedAt: null` so a
    // soft-deleted (KVKK/GDPR erasure) or archived opportunity 404s instead of staying readable.
    const opp: OpportunityRow | null = await tx.opportunity.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        title: true,
        topicId: true,
        stage: true,
        status: true,
        intendedRole: true,
        ownerId: true,
      },
    });
    if (!opp) return { opp: null, g0: null, efforts: [], savedG0: null };

    // Past G0 the box shows the saved decision, not the live number (NG-69). Same ordering as
    // gates/evaluate.ts: newest first, erased rows are no decision.
    const savedRow = opp.stage === 'G0'
      ? null
      : await tx.gateDecision.findFirst({
          where: { tenantId, opportunityId: id, gate: 'G0', deletedAt: null },
          orderBy: [{ decidedAt: 'desc' }, { id: 'desc' }],
          select: { passed: true, decidedAt: true },
        });
    const savedG0: SavedG0Decision | null = savedRow
      ? { passed: savedRow.passed, decidedAt: savedRow.decidedAt }
      : null;

    // The effort tab used to render a two-row `MOCK_EFFORTS` constant. These are the rows the
    // `Effort` table actually holds for this opportunity; when there are none the tab says so.
    const rows: EffortRow[] = await tx.effort.findMany({
      where: { tenantId, opportunityId: id, deletedAt: null },
      orderBy: [{ date: 'desc' }],
      select: { id: true, date: true, hours: true, note: true, userId: true },
    });

    // `Effort.userId` is a plain column with no relation, so the display names are a second,
    // id-bounded read. A user id that resolves to nobody stays unresolved in the UI rather than
    // being replaced with a plausible name.
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users: { id: string; name: string | null }[] = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const efforts: EffortEntry[] = rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString(),
      hours: r.hours,
      note: r.note,
      userName: nameById.get(r.userId) ?? null,
    }));

    // The live score is only computed at G0; past G0 the box shows the saved decision (NG-69).
    const g0 = opp.stage === 'G0' ? await computeG0ForOpportunity(tx, tenantId, id) : null;
    return { opp, g0, efforts, savedG0 };
  });

  if (!loaded.opp) notFound();

  const g0: G0Display = {
    score: loaded.g0?.score ?? null,
    decision: loaded.g0?.decision ?? null,
    measuredSources: loaded.g0?.sources.filter((s) => s.status === 'measured').length ?? 0,
    totalSources: loaded.g0?.sources.length ?? 0,
    reasons: loaded.g0?.reasonDetails ?? [],
    minScore: DEFAULT_GATE_RULES.G0.minScore,
    scoringBasis: loaded.g0?.scoringBasis ?? 'standard',
    denominator: loaded.g0?.denominator ?? null,
  };

  const opportunity: OpportunityView = {
    id: loaded.opp.id,
    title: loaded.opp.title,
    topicId: loaded.opp.topicId,
    stage: loaded.opp.stage,
    status: loaded.opp.status,
    intendedRole: loaded.opp.intendedRole,
  };

  // Whether the archive control is offered at all. The server action re-checks it — hiding a
  // button is not authorisation — but showing a control that always refuses is its own defect.
  const canArchive = canArchiveOpportunity(role, loaded.opp.ownerId, userId);

  // The decision log (NG-15 / NG-38): written by the withdrawal layer, read back here. Null means
  // the opportunity is not this tenant's, which the `notFound()` above has already caught.
  const decisionRows = await listDecisions({ tenantId }, id);
  // Every kind is shown, REACTIVATE included (NG-241 Faz 2: its label is `detail.withdraw.kind.*`).
  const decisions: DecisionEntry[] = (decisionRows ?? []).map((d) => ({
    id: d.id,
    kind: d.kind,
    reason: d.reason,
    decidedAt: d.decidedAt.toISOString(),
  }));

  return (
    <OpportunityDetailClient
      opportunity={opportunity}
      g0={g0}
      savedG0={loaded.savedG0}
      efforts={loaded.efforts}
      decisions={decisions}
      canArchive={canArchive}
      backHref={`/${locale}/${workspace}/pipeline`}
      locale={locale}
      workspace={workspace}
    />
  );
}
