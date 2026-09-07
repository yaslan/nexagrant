'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tenantScopeOf, TenantScope } from '@/lib/tenant';
import { Gate } from '@prisma/client';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import {
  addInMemoryOpportunity,
  updateInMemoryOpportunityStage,
  updateInMemoryOpportunityOwner,
  addInMemoryOpportunityNote,
  getWorkspaceMembers,
  type OpportunityItem,
  type WorkspaceMember
} from '@/lib/k5-pipeline/pipelineStore';
import { errorMessage } from '@/lib/errors';
import { rescoreOpportunityG0 } from '@/lib/scoring/g0-compute';
import { withTenant } from '@/lib/db';
import { evaluateGate } from '@/lib/gates/evaluate';
import { canArchiveOpportunity } from '@/lib/pipeline/archive';

/**
 * The tenant of a server action comes from the session and from nowhere else.
 *
 * These actions used to accept a `tenantIdParam` sent by the browser and fall
 * back to `prisma.tenant.findFirst()` when the session had none — either path
 * lets a caller write into a tenant it was never granted. Returning `null` here
 * makes the action refuse instead of guessing.
 */
async function sessionScope(): Promise<TenantScope | null> {
  try {
    return tenantScopeOf((await auth()));
  } catch (e) {
    console.warn(`[pipeline/actions] session lookup failed: ${errorMessage(e)}`);
    return null;
  }
}

const NO_TENANT = { success: false as const, error: 'TENANT_SCOPE_REQUIRED' as const };

/** One effort row covers at most a week of hours — above that it is a typo, not a fact. */
const MAX_EFFORT_HOURS = 24 * 7;

/**
 * Effort form input, validated on the server (CLAUDE.md: Zod on every server action).
 *
 * `hours` is bounded on both ends: a `0` row is noise and a four-digit row is a fat-fingered
 * decimal point, and both would land straight in the person-days figure the dashboard reads.
 */
const EffortInput = z.object({
  opportunityId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().finite().gt(0).max(MAX_EFFORT_HOURS),
  note: z.string().max(500).optional(),
});

/**
 * The real people a card can be assigned to, for the board (client component)
 * to render its owner pickers. `board.tsx` cannot call `withTenant` itself —
 * it has no server context — so this is the round trip that stands in for the
 * literal member array it used to import directly.
 */
export async function getOpportunityFormMembers(): Promise<{ success: boolean; members: WorkspaceMember[] }> {
  const scope = await sessionScope();
  if (!scope) return { success: false, members: [] };

  try {
    const members = await getWorkspaceMembers(scope.tenantId);
    return { success: true, members };
  } catch (err) {
    console.warn(`[getOpportunityFormMembers] query bypassed: ${errorMessage(err)}`);
    return { success: false, members: [] };
  }
}

/**
 * Live call topics for the "Suggested" chips under the topic-id field.
 *
 * Open calls with a future deadline first, then forthcoming ones as a
 * fallback when nothing is open yet. Never a fixed list: a hardcoded set of
 * codes goes stale the moment those calls close, which is what this replaces
 * (four 2024 Horizon codes, static regardless of what `Topic` actually holds).
 * `Topic` is not tenant-scoped — it is the shared EU calls catalogue — so this
 * needs no `withTenant`, only a session to keep the action from being called
 * by a logged-out request.
 */
export async function getSuggestedTopics(): Promise<{
  success: boolean;
  topics: { identifier: string; title: string }[];
}> {
  const scope = await sessionScope();
  if (!scope) return { success: false, topics: [] };

  try {
    const now = new Date();
    let topics = await prisma.topic.findMany({
      where: { status: 'OPEN', OR: [{ nextDeadlineAt: null }, { nextDeadlineAt: { gte: now } }] },
      orderBy: { nextDeadlineAt: 'asc' },
      select: { identifier: true, title: true },
      take: 6
    });

    if (topics.length === 0) {
      topics = await prisma.topic.findMany({
        where: { status: 'FORTHCOMING' },
        orderBy: { nextDeadlineAt: 'asc' },
        select: { identifier: true, title: true },
        take: 6
      });
    }

    return { success: true, topics };
  } catch (err) {
    console.warn(`[getSuggestedTopics] query bypassed: ${errorMessage(err)}`);
    return { success: false, topics: [] };
  }
}

export async function createOpportunity({
  workspaceSlug,
  title,
  topicId,
  intendedRole = 'coordinator',
  ownerId,
  ownerName,
  stage = 'G0',
  notes
}: {
  workspaceSlug: string;
  title: string;
  topicId?: string;
  intendedRole?: string;
  ownerId?: string;
  ownerName?: string;
  stage?: Gate;
  notes?: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId, userId } = scope;

  // Real tenant members, not a fixed list — falls back to whoever the requesting
  // session belongs to when no owner was picked or the member lookup comes up empty.
  let members: WorkspaceMember[] = [];
  try {
    members = await getWorkspaceMembers(tenantId);
  } catch (err) {
    console.warn(`[createOpportunity] member lookup bypassed: ${errorMessage(err)}`);
  }
  const resolvedOwner = ownerId
    ? members.find((m) => m.id === ownerId)
    : members.find((m) => m.id === userId);

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const newOpp: Omit<OpportunityItem, 'tenantId'> = {
    id: `opp-${Date.now()}`,
    workspaceId: workspaceSlug || 'default',
    title,
    topicId: topicId ? topicId.trim() : null,
    intendedRole,
    ownerId: ownerId || resolvedOwner?.id || userId,
    ownerName: ownerName || resolvedOwner?.name || null,
    stage: stage || 'G0',
    status: 'ACTIVE',
    // Scored below, from the opportunity's own evidence. This used to be
    // `Math.floor(Math.random() * 15 + 80)` — an invented 80–94 that the board displayed as a
    // triage score and `gates/evaluate.ts` compared against the 70 threshold. `null` is the
    // honest state for "not scored yet"; the UI already handles it.
    g0Score: null,
    notes: notes || null,
    notesList: notes
      ? [
          {
            id: `note-${Date.now()}`,
            text: notes,
            authorName: ownerName || resolvedOwner?.name || 'Atanmadı',
            authorAvatar: resolvedOwner?.avatar || '👤',
            createdAt: nowFormatted
          }
        ]
      : [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // The in-memory row is prepared but deliberately NOT filed yet.
  //
  // It used to be written unconditionally, before the database create. The buffer row carries
  // `opp-<timestamp>` and Prisma then mints its own cuid, so the two rows could never share an
  // id — and `pipeline/page.tsx` merges the database list and the buffer list *by id*. Every
  // opportunity was therefore drawn twice on the board, and stayed drawn until the server
  // restarted; the same buffer also kept drawing a card for an opportunity that had since been
  // deleted from the database (the "ghost card").
  //
  // `pipelineStore` documents itself as a database-outage fallback, so it is only written when
  // the database actually refused the row.
  let persisted: OpportunityItem | null = null;

  try {
    // Both lookups carry `tenantId`, so a workspace slug from another tenant
    // resolves to nothing instead of to that tenant's workspace.
    let workspace = await prisma.workspace.findFirst({
      where: {
        tenantId,
        ...(workspaceSlug && workspaceSlug !== 'default' ? { slug: workspaceSlug } : {})
      }
    });
    if (!workspace) {
      workspace = await prisma.workspace.findFirst({ where: { tenantId } });
    }

    if (workspace) {
      const created = await prisma.opportunity.create({
        data: {
          tenantId,
          workspaceId: workspace.id,
          title,
          topicId: topicId ? topicId.trim() : null,
          intendedRole,
          ownerId: ownerId || userId || null,
          stage: stage || 'G0',
          status: 'ACTIVE',
          g0Score: null,
          notes: notes || null
        }
      });

      // Derive the G0 score from what is actually on file for this tenant and topic — the K1 topic
      // match, the imported success rate, the tenant's CORDIS history, the call's budget and
      // flags — and store the per-feature breakdown alongside it (CLAUDE.md §7). An opportunity
      // with no evidence yet stays unscored rather than being handed a plausible-looking number.
      const scored = await rescoreOpportunityG0(tenantId, created.id);

      // The row handed back to the board is the row the database holds, id included, so the
      // optimistic card and the card the next render draws are the same card.
      persisted = {
        ...newOpp,
        tenantId,
        id: created.id,
        workspaceId: created.workspaceId,
        title: created.title,
        topicId: created.topicId,
        intendedRole: created.intendedRole,
        ownerId: created.ownerId ?? newOpp.ownerId,
        stage: created.stage,
        status: created.status,
        g0Score: scored?.score ?? created.g0Score ?? null,
        notes: created.notes,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt
      };
    }
  } catch (err) {
    console.warn('[createOpportunity] DB query bypassed, stored in resilient pipeline store:', errorMessage(err));
  }

  // Exactly one row leaves this action: the persisted one, or — only when the database did not
  // take it — the buffered one.
  const opportunity = persisted ?? addInMemoryOpportunity(tenantId, newOpp);

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}
  return { success: true, opportunity };
}

export async function assignOpportunityOwner({
  opportunityId,
  ownerId,
  ownerName,
}: {
  opportunityId: string;
  ownerId: string;
  ownerName: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  updateInMemoryOpportunityOwner(tenantId, opportunityId, ownerId, ownerName);

  try {
    // updateMany + tenantId, not update by id: `update` on a guessable id would
    // reassign an opportunity belonging to another tenant.
    await prisma.opportunity.updateMany({
      where: { id: opportunityId, tenantId },
      data: { ownerId },
    });
  } catch (err) {
    console.warn(`[assignOpportunityOwner] DB update bypassed: ${errorMessage(err)}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}

  return { success: true, ownerId, ownerName };
}

export async function addOpportunityNote({
  opportunityId,
  text,
  authorName,
  authorAvatar,
}: {
  opportunityId: string;
  text: string;
  authorName: string;
  authorAvatar: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  const nowFormatted = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const noteObj = {
    id: `note-${Date.now()}`,
    text,
    authorName,
    authorAvatar,
    createdAt: nowFormatted,
  };

  addInMemoryOpportunityNote(tenantId, opportunityId, noteObj);

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}

  return { success: true, note: noteObj };
}

export async function moveOpportunityStage(opportunityId: string, newStage: Gate) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId } = scope;

  updateInMemoryOpportunityStage(tenantId, opportunityId, newStage);

  try {
    // `tenantId` is always part of the filter — an empty tenant clause here used
    // to update the row whatever tenant it belonged to.
    await prisma.opportunity.updateMany({
      where: { id: opportunityId, tenantId },
      data: { stage: newStage }
    });
  } catch (err) {
    console.warn(`[moveOpportunityStage] DB update bypassed: ${errorMessage(err)}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch (e) {}
  return { success: true };
}

/**
 * Runs the real stage gate for one opportunity.
 *
 * The pipeline detail screen used to "evaluate" with two `alert()` calls on a one-second timer:
 * it announced a pass without reading a rule, without writing a `GateDecision` and without
 * moving the stage. This action is the call site `evaluateGate` never had from the product.
 *
 * The ownership check below is now a second layer, not the only one. `evaluateGate` carries its own
 * tenant filter as of TASK-MTQZMLLZE1I29 — it runs inside `withTenant` and refuses an id it cannot
 * see with `GateOpportunityNotFoundError` — so a guessed cross-tenant id is rejected by the engine
 * whatever the caller does. This check stays anyway: it is what distinguishes the two honest
 * answers this action can give (`OPPORTUNITY_NOT_FOUND` for an id that is not this tenant's or
 * lives only in the in-memory fallback, `GATE_EVALUATION_FAILED` for a gate that broke), and a
 * future third caller inherits the engine's guarantee rather than this file's.
 */
export async function evaluateOpportunityGate({
  opportunityId,
  gate,
}: {
  opportunityId: string;
  gate: Gate;
}): Promise<
  | { success: true; passed: boolean; reasons: string[] }
  | { success: false; error: 'TENANT_SCOPE_REQUIRED' | 'OPPORTUNITY_NOT_FOUND' | 'GATE_EVALUATION_FAILED' }
> {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId, userId } = scope;

  try {
    const owned = await withTenant<{ id: string } | null>(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id: opportunityId, tenantId, deletedAt: null },
        select: { id: true },
      }),
    );
    // Also the honest answer for an opportunity that only exists in the in-memory fallback
    // buffer: there is nothing on file to evaluate, so no gate decision can be recorded.
    if (!owned) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

    const result = await evaluateGate(opportunityId, gate, tenantId, userId || 'system');

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
    } catch (e) {}

    return { success: true, passed: result.passed, reasons: result.reasons };
  } catch (err) {
    // The raw driver message is kept in the server log, not handed to the browser.
    console.warn(`[evaluateOpportunityGate] failed: ${errorMessage(err)}`);
    return { success: false, error: 'GATE_EVALUATION_FAILED' };
  }
}

/**
 * Archives one opportunity: hides it from the product, keeps the row.
 *
 * `Opportunity.deletedAt` has existed in the schema since the KVKK/GDPR erasure work
 * ("soft-delete marker … hidden from the product, still restorable") but nothing in the product
 * ever wrote it — an opportunity could only leave a board by being deleted straight out of the
 * database. This action is the entry point that column was missing.
 *
 * It is deliberately *not* a delete:
 *   · the row stays, with `deletedAt` and `deletionReason` set, so the audit trail, the gate
 *     decisions and the effort log attached to it are still there to answer questions later;
 *   · `updateMany` carries both `id` and `tenantId`, so an id guessed from another tenant
 *     matches nothing rather than archiving that tenant's work;
 *   · `deletedAt: null` is part of the filter, so archiving twice is a no-op instead of
 *     overwriting the original archive timestamp.
 *
 * Restoring from the archive is not implemented — see the report for TASK-MTQZNBGENT12T.
 */
export async function archiveOpportunity({
  opportunityId,
}: {
  opportunityId: string;
}): Promise<
  | { success: true; opportunityId: string; archivedAt: string }
  | {
      success: false;
      error:
        | 'TENANT_SCOPE_REQUIRED'
        | 'OPPORTUNITY_NOT_FOUND'
        | 'ARCHIVE_FORBIDDEN'
        | 'ARCHIVE_FAILED';
    }
> {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId, userId, role } = scope;

  try {
    const archivedAt = new Date();

    const outcome = await withTenant<'NOT_FOUND' | 'FORBIDDEN' | 'ARCHIVED'>(
      tenantId,
      async (tx) => {
        // findFirst + tenantId, never findUnique on a guessable id.
        const owned = await tx.opportunity.findFirst({
          where: { id: opportunityId, tenantId, deletedAt: null },
          select: { id: true, title: true, stage: true, ownerId: true },
        });
        // Also the honest answer for a row that only exists in the in-memory fallback buffer:
        // there is nothing on file to archive.
        if (!owned) return 'NOT_FOUND';

        if (!canArchiveOpportunity(role, owned.ownerId, userId)) return 'FORBIDDEN';

        const updated = await tx.opportunity.updateMany({
          where: { id: opportunityId, tenantId, deletedAt: null },
          data: { deletedAt: archivedAt, deletionReason: 'archived_by_user' },
        });
        if (updated.count === 0) return 'NOT_FOUND';

        // The audit row is written inside the same transaction as the archive: an opportunity
        // that vanished from every board with no record of who removed it is exactly the
        // situation this action exists to avoid.
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: userId,
            type: 'opportunity.archived',
            target: opportunityId,
            // Titles are tenant business data, not personal data; no user identity beyond the
            // actor id (already a column) is recorded here.
            data: { title: owned.title, stage: owned.stage, reason: 'archived_by_user' },
          },
        });

        return 'ARCHIVED';
      },
    );

    if (outcome === 'NOT_FOUND') return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };
    if (outcome === 'FORBIDDEN') return { success: false, error: 'ARCHIVE_FORBIDDEN' };

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/dashboard', 'page');
    } catch (e) {}

    return { success: true, opportunityId, archivedAt: archivedAt.toISOString() };
  } catch (err) {
    // The driver message stays in the server log; the browser gets a code it can translate.
    console.warn(`[archiveOpportunity] failed: ${errorMessage(err)}`);
    return { success: false, error: 'ARCHIVE_FAILED' };
  }
}


/**
 * Records one effort entry against an opportunity.
 *
 * The effort tab used to be a `MOCK_EFFORTS` array with two invented rows ("Alice, 4.5h, Read
 * work programme"), and its form pushed into React state and nothing else: the person-day total
 * on screen was arithmetic over fiction, and every entry logged was gone on reload. The `Effort`
 * table has been in the schema the whole time; this is the write path it never had.
 *
 * The row is filed against the session's own user id. `userId` is not accepted from the browser
 * — logging effort as somebody else is not a thing this form should be able to do.
 */
export async function logEffort({
  opportunityId,
  date,
  hours,
  note,
}: {
  opportunityId: string;
  /** `YYYY-MM-DD` from an `<input type="date">`; stored at UTC midnight (CLAUDE.md §10). */
  date: string;
  hours: number;
  note?: string;
}): Promise<
  | { success: true }
  | {
      success: false;
      error:
        | 'TENANT_SCOPE_REQUIRED'
        | 'OPPORTUNITY_NOT_FOUND'
        | 'EFFORT_INVALID_INPUT'
        | 'EFFORT_SAVE_FAILED';
    }
> {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const { tenantId, userId } = scope;

  const parsed = EffortInput.safeParse({ opportunityId, date, hours, note });
  if (!parsed.success) return { success: false, error: 'EFFORT_INVALID_INPUT' };

  // `new Date('2026-09-07')` is parsed as UTC midnight, which is what the column stores; the
  // regex above is what keeps a locale-dependent string from reaching it.
  const day = new Date(`${parsed.data.date}T00:00:00.000Z`);
  if (Number.isNaN(day.getTime())) return { success: false, error: 'EFFORT_INVALID_INPUT' };

  try {
    const outcome = await withTenant<'NOT_FOUND' | 'LOGGED'>(tenantId, async (tx) => {
      const owned = await tx.opportunity.findFirst({
        where: { id: parsed.data.opportunityId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!owned) return 'NOT_FOUND';

      await tx.effort.create({
        data: {
          tenantId,
          opportunityId: owned.id,
          userId,
          date: day,
          hours: parsed.data.hours,
          note: parsed.data.note?.trim() || null,
        },
      });
      return 'LOGGED';
    });

    if (outcome === 'NOT_FOUND') return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/dashboard', 'page');
    } catch (e) {}

    return { success: true };
  } catch (err) {
    console.warn(`[logEffort] failed: ${errorMessage(err)}`);
    return { success: false, error: 'EFFORT_SAVE_FAILED' };
  }
}
