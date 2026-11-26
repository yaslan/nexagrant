'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { tenantScopeOf, TenantScope, assertTenantActionWritable, assertTenantActionRole } from '@/lib/tenant';
import type { Gate } from '@prisma/client';
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
import { isPresentId } from '@/lib/required-id';
import { rescoreOpportunityG0 } from '@/lib/scoring/g0-compute';
import { withTenant } from '@/lib/db';
import { findScopedWorkspace, isWorkspaceSlug } from '@/lib/workspaces';
import { isDatabaseUnavailable } from '@/lib/db-unavailable';
import { evaluateGate } from '@/lib/gates/evaluate';
import type { GateReason } from '@/lib/gates/reasons';
import { classifyStageMove, isStage, nextStageOf } from '@/lib/gates/transition';
import { canArchiveOpportunity } from '@/lib/pipeline/archive';
import { WITHDRAWAL_REASON_MAX, reactivateOpportunity, withdrawOpportunity } from '@/lib/k5-pipeline/withdrawal';
import {
  APPLICATION_DECLARATIONS,
  nextApplicationStatus,
  type ApplicationDeclaration,
  type DeclarationRefusal,
} from '@/lib/k5-pipeline/applicationOutcome';

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
const WORKSPACE_REFUSED = { success: false as const, error: 'WORKSPACE_NOT_FOUND' as const };
const INVALID_INPUT = { success: false as const, error: 'INVALID_INPUT' as const };
const CREATE_FAILED = { success: false as const, error: 'CREATE_FAILED' as const };

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

/** A string Postgres can store: no NUL (22021) and no other control characters. */
const text = (max: number) => z.string().max(max).regex(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/);

/**
 * `createOpportunity` input (TASK-MUO64UQJUWEBI, İNCELEME-83 Y-1).
 *
 * A server action's argument is whatever the request body says — the TypeScript
 * signature is not checked at runtime. A `workspaceSlug` of `{foo:1}`, `["ws-a"]`,
 * `7` or `"ws-a\u0000"` used to reach the workspace query and make it throw, and the
 * catch below buffered the row as if the database were down. Every field is now a
 * bounded string before anything touches the database.
 */
const CreateOpportunityInput = z.object({
  workspaceSlug: z.string().refine(isWorkspaceSlug),
  title: text(500).refine((v) => v.trim().length > 0),
  topicId: text(200).optional(),
  intendedRole: text(50).optional(),
  ownerId: text(200).optional(),
  ownerName: text(200).optional(),
  notes: text(10_000).optional(),
  // A new opportunity starts at G0 and nothing else. Strict, so a client that still names a stage
  // is refused rather than quietly put somewhere it did not ask for.
}).strict();

/** B7 declaration input. */
const DeclareInput = z.object({
  opportunityId: z.string().min(1),
  declaration: z.enum(APPLICATION_DECLARATIONS as [ApplicationDeclaration, ...ApplicationDeclaration[]]),
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

export async function createOpportunity(input: {
  workspaceSlug: string;
  title: string;
  topicId?: string;
  intendedRole?: string;
  ownerId?: string;
  ownerName?: string;
  notes?: string;
}) {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  const parsed = CreateOpportunityInput.safeParse(input);
  if (!parsed.success) return INVALID_INPUT;
  const {
    workspaceSlug,
    title,
    topicId,
    intendedRole = 'coordinator',
    ownerId,
    ownerName,
    notes,
  } = parsed.data;
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'manage_workspaces');
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
    workspaceId: workspaceSlug,
    title,
    topicId: topicId ? topicId.trim() : null,
    intendedRole,
    ownerId: ownerId || resolvedOwner?.id || userId,
    ownerName: ownerName || resolvedOwner?.name || null,
    stage: 'G0',
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
  let workspaceRefused = false;

  try {
    // The slug is client input (the URL segment). It must name a live workspace
    // this membership covers — `findScopedWorkspace` — and a slug that does not
    // is refused, never swapped for "the first workspace" (TASK-MUO12A7NHANOT,
    // İNCELEME-76 Y-1: a user restricted to workspace B wrote into A, and a
    // soft-deleted `default` workspace kept receiving rows). The read and the
    // write share one tenant scope, so the row is created under the same scope
    // that proved the workspace.
    const created = await withTenant(tenantId, async (tx) => {
      const workspace = await findScopedWorkspace(tx, scope, workspaceSlug);
      if (!workspace) {
        workspaceRefused = true;
        return null;
      }

      return tx.opportunity.create({
        data: {
          tenantId,
          workspaceId: workspace.id,
          title,
          topicId: topicId ? topicId.trim() : null,
          intendedRole,
          ownerId: ownerId || userId || null,
          stage: 'G0',
          status: 'ACTIVE',
          g0Score: null,
          notes: notes || null
        }
      });
    });

    if (created) {
      // Deliberately outside the scope above, and it must stay outside:
      // `rescoreOpportunityG0` opens its own `withTenant`, i.e. its own
      // transaction on another connection. Called from inside the block it
      // would be unable to see the not-yet-committed opportunity, find nothing
      // to score, and leave every new opportunity silently unscored.
      //
      // Derive the G0 score from what is actually on file for this tenant and topic — the K1 topic
      // match, the imported success rate, the tenant's CORDIS history, the call's budget and
      // flags — and store the per-feature breakdown alongside it (CLAUDE.md §7). An opportunity
      // with no evidence yet stays unscored rather than being handed a plausible-looking number.
      //
      // The row is committed by now, so a scoring failure must not turn this into a failed
      // create (the user would retry and file it twice) nor into a buffered copy: the card
      // stays unscored, which the board already shows honestly.
      let scored: Awaited<ReturnType<typeof rescoreOpportunityG0>> = null;
      try {
        scored = await rescoreOpportunityG0(tenantId, created.id);
      } catch (err) {
        console.warn(`[createOpportunity] G0 scoring skipped for ${created.id}: ${errorMessage(err)}`);
      }

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
    // Only an outage may fall through to the buffer. Anything else — a query Prisma or
    // Postgres refused — is a refusal: buffering it would report `success` for a row
    // that no workspace check ever passed.
    if (!isDatabaseUnavailable(err)) {
      console.warn(`[createOpportunity] refused by the database, not buffered: ${errorMessage(err)}`);
      return CREATE_FAILED;
    }
    console.warn('[createOpportunity] DB query bypassed, stored in resilient pipeline store:', errorMessage(err));
  }

  // Not a database outage: the workspace is not one this user may write to. Buffering the row
  // would show a card on a board it does not belong to.
  if (workspaceRefused) return WORKSPACE_REFUSED;

  // Exactly one row leaves this action: the persisted one, or — only when the database did not
  // take it — the buffered one.
  const opportunity = persisted ?? addInMemoryOpportunity(tenantId, newOpp);

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch {}
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
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'manage_workspaces');
  const { tenantId } = scope;
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(opportunityId)) return { success: false as const, error: 'INVALID_INPUT' as const };

  updateInMemoryOpportunityOwner(tenantId, opportunityId, ownerId, ownerName);

  try {
    // updateMany + tenantId, not update by id: `update` on a guessable id would
    // reassign an opportunity belonging to another tenant.
    await withTenant(tenantId, (tx) =>
      tx.opportunity.updateMany({
        where: { id: opportunityId, tenantId },
        data: { ownerId },
      })
    );
  } catch (err) {
    console.warn(`[assignOpportunityOwner] DB update bypassed: ${errorMessage(err)}`);
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch {}

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
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'edit_proposal');
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
  } catch {}

  return { success: true, note: noteObj };
}

/**
 * What a stage move answers. `success` says the action ran; `passed` says the card may stand in the
 * column it was dropped on. A refusal is a normal answer, an error is not: a database failure
 * comes back as `success: false` and must never read as a move.
 */
export type MoveStageResult =
  | { success: true; passed: true; reasons: string[] }
  | { success: true; passed: false; reasons: string[]; reasonDetails?: GateReason[]; refusal?: 'STAGE_SKIP'; nextStage?: Gate }
  | {
      success: false;
      error: 'TENANT_SCOPE_REQUIRED' | 'INVALID_INPUT' | 'OPPORTUNITY_NOT_FOUND' | 'STAGE_MOVE_FAILED';
    };

/**
 * The pipeline board's drop.
 *
 * Forward to the next stage runs that stage's gate, and only the gate writes the stage. A skip is
 * refused without running anything: the stages in between were never decided. Backward stays free
 * and files no decision; the specification's reopen rules are separate work.
 *
 * The role check is `manage_workspaces` alone: rbac.ts grants `evaluate_gates` to the same roles.
 */
export async function moveOpportunityStage(opportunityId: string, newStage: Gate): Promise<MoveStageResult> {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'manage_workspaces');
  const { tenantId, userId } = scope;
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(opportunityId) || !isStage(newStage)) {
    return { success: false, error: 'INVALID_INPUT' };
  }

  try {
    const owned = await findOwnedStage(tenantId, opportunityId);
    // Also the answer for a row that lives only in the in-memory fallback: there is nothing on
    // file for a gate to decide on, so it cannot move.
    if (!owned) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

    const move = classifyStageMove(owned.stage, newStage);
    if (move === 'same') return { success: true, passed: true, reasons: [] };
    if (move === 'skip') {
      const nextStage = nextStageOf(owned.stage) ?? undefined;
      return {
        success: true,
        passed: false,
        refusal: 'STAGE_SKIP',
        nextStage,
        reasons: [`Cannot skip from ${owned.stage} to ${newStage}: ${nextStage} comes first`],
      };
    }

    if (move === 'next') {
      const gate = await evaluateGate(opportunityId, newStage, tenantId, userId || 'system');
      revalidatePipeline();
      if (!gate.passed) return { success: true, passed: false, reasons: gate.reasons, reasonDetails: gate.reasonDetails };
    } else {
      const { count } = await withTenant(tenantId, (tx) =>
        tx.opportunity.updateMany({
          where: { id: opportunityId, tenantId, deletedAt: null },
          data: { stage: newStage },
        }),
      );
      if (count === 0) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };
      revalidatePipeline();
    }

    updateInMemoryOpportunityStage(tenantId, opportunityId, newStage);
    return { success: true, passed: true, reasons: [] };
  } catch (err) {
    // The raw driver message is kept in the server log, not handed to the browser.
    console.warn(`[moveOpportunityStage] failed: ${errorMessage(err)}`);
    return { success: false, error: 'STAGE_MOVE_FAILED' };
  }
}

function findOwnedStage(tenantId: string, opportunityId: string) {
  return withTenant<{ stage: Gate } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId, deletedAt: null },
      select: { stage: true },
    }),
  );
}

function revalidatePipeline() {
  try {
    revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
    revalidatePath('/[locale]/(app)/[workspace]/firsatlar', 'page');
  } catch {}
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
 *
 * The engine writes `stage = gate` on a pass and trusts the gate it is handed, so the browser may
 * only name the next gate or re-run the current one. Any other gate would be a way round the
 * order: G4 passes on a G0 opportunity, and an old gate would pull a later one backward.
 */
export async function evaluateOpportunityGate({
  opportunityId,
  gate,
}: {
  opportunityId: string;
  gate: Gate;
}): Promise<
  | { success: true; passed: boolean; reasons: string[]; reasonDetails?: GateReason[] }
  | {
      success: false;
      error: 'TENANT_SCOPE_REQUIRED' | 'OPPORTUNITY_NOT_FOUND' | 'GATE_OUT_OF_ORDER' | 'GATE_EVALUATION_FAILED';
    }
> {
  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'evaluate_gates');
  const { tenantId, userId } = scope;
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(opportunityId)) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

  try {
    const owned = await findOwnedStage(tenantId, opportunityId);
    // Also the honest answer for an opportunity that only exists in the in-memory fallback
    // buffer: there is nothing on file to evaluate, so no gate decision can be recorded.
    if (!owned) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

    const move = classifyStageMove(owned.stage, gate);
    if (move !== 'next' && move !== 'same') return { success: false, error: 'GATE_OUT_OF_ORDER' };

    const result = await evaluateGate(opportunityId, gate, tenantId, userId || 'system');

    revalidatePipeline();

    return { success: true, ...result };
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
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  const { tenantId, userId, role } = scope;
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(opportunityId)) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };

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
    } catch {}

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
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  // The role half (rbac.ts; TASK-MUN80UOUPB2A4, FB GÜVENLİK Y-3).
  assertTenantActionRole(scope, 'edit_proposal');
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
    } catch {}

    return { success: true };
  } catch (err) {
    console.warn(`[logEffort] failed: ${errorMessage(err)}`);
    return { success: false, error: 'EFFORT_SAVE_FAILED' };
  }
}

/**
 * Records the institution's own declaration that it submitted an application, or what the
 * result was (FB KAMU B7, TASK-MULRRU63LWC6E).
 *
 * Nothing in the product used to write `Proposal.submittedAt` or the `SUBMITTED` / `FUNDED` /
 * `REJECTED` statuses, so the "başvuru gönderildi" and "sonuç" steps of the agency funnel had no
 * source. The transition rule lives in `nextApplicationStatus` (pure, tested); this action only
 * loads the row, applies the rule and writes it, with an audit row in the same transaction.
 *
 * Who may declare: the same people who may archive — the pipeline roles, or the card's owner.
 * A GUEST_PARTNER reading the board must not be able to move the tenant's reported numbers.
 */
export async function declareApplication({
  opportunityId,
  declaration,
}: {
  opportunityId: string;
  declaration: ApplicationDeclaration;
}): Promise<
  | { success: true; status: string }
  | {
      success: false;
      error:
        | 'TENANT_SCOPE_REQUIRED'
        | 'INVALID_INPUT'
        | 'OPPORTUNITY_NOT_FOUND'
        | 'DECLARE_FORBIDDEN'
        | DeclarationRefusal
        | 'DECLARE_CONFLICT'
        | 'DECLARE_FAILED';
    }
> {
  const parsed = DeclareInput.safeParse({ opportunityId, declaration });
  if (!parsed.success) return { success: false, error: 'INVALID_INPUT' };

  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  // Read-only once a free pilot has ended (src/lib/billing/pilot.ts).
  await assertTenantActionWritable(scope.tenantId);
  const { tenantId, userId, role } = scope;

  try {
    const result = await withTenant<
      | { ok: true; status: string }
      | { ok: false; error: 'OPPORTUNITY_NOT_FOUND' | 'DECLARE_FORBIDDEN' | DeclarationRefusal | 'DECLARE_CONFLICT' }
    >(tenantId, async (tx) => {
      const opp = await tx.opportunity.findFirst({
        where: { id: parsed.data.opportunityId, tenantId, deletedAt: null },
        select: { id: true, status: true, ownerId: true, proposal: { select: { id: true, submittedAt: true } } },
      });
      if (!opp) return { ok: false, error: 'OPPORTUNITY_NOT_FOUND' };
      if (!canArchiveOpportunity(role, opp.ownerId, userId)) return { ok: false, error: 'DECLARE_FORBIDDEN' };

      const next = nextApplicationStatus(opp.status, Boolean(opp.proposal?.submittedAt), parsed.data.declaration);
      if ('refused' in next) return { ok: false, error: next.refused };

      if (next.status !== opp.status) {
        // NG-282: conditional on the status just read, like the withdrawal (withdrawal.ts). A
        // withdrawal committed in between leaves count 0 here instead of being overwritten —
        // the decision log's last row WITHDRAW with the status SUBMITTED. It runs before the
        // proposal write, so a refused declaration writes nothing at all.
        const moved = await tx.opportunity.updateMany({
          where: { id: opp.id, tenantId, deletedAt: null, status: opp.status },
          data: { status: next.status },
        });
        if (moved.count === 0) {
          // Read again in this transaction (READ COMMITTED: it sees the concurrent commit) and
          // answer the real reason: gone, or the rule's refusal for the status it has now.
          const now = await tx.opportunity.findFirst({
            where: { id: opp.id, tenantId, deletedAt: null },
            select: { status: true, proposal: { select: { submittedAt: true } } },
          });
          if (!now) return { ok: false, error: 'OPPORTUNITY_NOT_FOUND' };
          const again = nextApplicationStatus(now.status, Boolean(now.proposal?.submittedAt), parsed.data.declaration);
          return { ok: false, error: 'refused' in again ? again.refused : 'DECLARE_CONFLICT' };
        }
      }

      if (parsed.data.declaration === 'submitted') {
        // The first submission date is the one that counts; declaring again does not move it.
        if (!opp.proposal) {
          await tx.proposal.create({
            data: { tenantId, opportunityId: opp.id, submittedAt: new Date() },
          });
        } else if (!opp.proposal.submittedAt) {
          await tx.proposal.updateMany({
            where: { id: opp.proposal.id, tenantId, submittedAt: null },
            data: { submittedAt: new Date() },
          });
        }
      }

      if (next.status !== opp.status) {
        await tx.auditEvent.create({
          data: {
            tenantId,
            actorId: userId,
            type: 'opportunity.application_declared',
            target: opp.id,
            data: { declaration: parsed.data.declaration, from: opp.status, to: next.status },
          },
        });
      }

      return { ok: true, status: next.status };
    });

    if (!result.ok) return { success: false, error: result.error };

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/dashboard', 'page');
    } catch {}

    return { success: true, status: result.status };
  } catch (err) {
    console.warn(`[declareApplication] failed: ${errorMessage(err)}`);
    return { success: false, error: 'DECLARE_FAILED' };
  }
}

/**
 * Withdraw ("vazgeç") with a reason — NG-15 calls the BE-05 layer (NG-38) and nothing else.
 *
 * The rule (reason required, withdrawable statuses) lives in `withdrawOpportunity`; this action
 * does not repeat it. The form may send an empty reason: the refusal is returned here and shown.
 * Who may withdraw is the same rule as archiving and declaring (`canArchiveOpportunity`). The
 * check here answers early and is what tests/server-action-rbac-guard.test.ts reads; the binding
 * one is in `withdrawOpportunity` (NG-241, inceleme Ö-2): same rule, inside the writing
 * transaction and in the conditional update's `where`, so an owner change between this read and
 * the write cannot let the write through.
 */
const WithdrawOpportunityInput = z.object({
  opportunityId: z.string().min(1),
  reason: z.string().max(WITHDRAWAL_REASON_MAX),
});

export async function withdrawOpportunityAction({
  opportunityId,
  reason,
}: {
  opportunityId: string;
  reason: string;
}): Promise<
  | { success: true }
  | {
      success: false;
      error:
        | 'TENANT_SCOPE_REQUIRED'
        | 'INVALID_INPUT'
        | 'REASON_TOO_LONG'
        | 'REASON_REQUIRED'
        | 'OPPORTUNITY_NOT_FOUND'
        | 'WITHDRAW_FORBIDDEN'
        | 'ALREADY_WITHDRAWN'
        | 'ALREADY_DECIDED'
        | 'WITHDRAW_CONFLICT'
        | 'WITHDRAW_FAILED';
    }
> {
  const parsed = WithdrawOpportunityInput.safeParse({ opportunityId, reason });
  if (!parsed.success) {
    const reasonTooLong = parsed.error.issues.some((i) => i.path[0] === 'reason');
    return { success: false, error: reasonTooLong ? 'REASON_TOO_LONG' : 'INVALID_INPUT' };
  }

  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  await assertTenantActionWritable(scope.tenantId);
  const { tenantId, userId, role } = scope;

  try {
    const owner = await withTenant(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id: parsed.data.opportunityId, tenantId, deletedAt: null },
        select: { ownerId: true },
      }),
    );
    if (!owner) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };
    if (!canArchiveOpportunity(role, owner.ownerId, userId)) {
      return { success: false, error: 'WITHDRAW_FORBIDDEN' };
    }

    const result = await withdrawOpportunity({ tenantId, userId, role }, parsed.data.opportunityId, {
      reason: parsed.data.reason,
    });
    if ('refused' in result) {
      const map = {
        REASON_REQUIRED: 'REASON_REQUIRED',
        NOT_FOUND: 'OPPORTUNITY_NOT_FOUND',
        FORBIDDEN: 'WITHDRAW_FORBIDDEN',
        ALREADY_WITHDRAWN: 'ALREADY_WITHDRAWN',
        ALREADY_DECIDED: 'ALREADY_DECIDED',
        CONFLICT: 'WITHDRAW_CONFLICT',
      } as const;
      return { success: false, error: map[result.refused] };
    }

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/dashboard', 'page');
    } catch {}

    return { success: true };
  } catch (err) {
    console.warn(`[withdrawOpportunityAction] failed: ${errorMessage(err)}`);
    return { success: false, error: 'WITHDRAW_FAILED' };
  }
}

/**
 * Reactivate ("yeniden etkinleştir") a withdrawn opportunity with a reason — NG-241, K-584158 = A.
 *
 * Same order as `withdrawOpportunityAction`: Zod → session → `assertTenantActionWritable` → the
 * layer. The role rule (`canArchiveOpportunity`) is read here for an early answer and checked
 * again, binding, by the layer in the transaction that writes (inceleme Ö-2). The
 * rule (only WITHDRAWN, reason required, back to the status the withdrawal left) lives in
 * `reactivateOpportunity`; this action maps its refusals and does not repeat them.
 * `status` on success is where the opportunity went back to (ACTIVE or SUBMITTED).
 */
export async function reactivateOpportunityAction({
  opportunityId,
  reason,
}: {
  opportunityId: string;
  reason: string;
}): Promise<
  | { success: true; status: 'ACTIVE' | 'SUBMITTED' }
  | {
      success: false;
      error:
        | 'TENANT_SCOPE_REQUIRED'
        | 'INVALID_INPUT'
        | 'REASON_TOO_LONG'
        | 'REASON_REQUIRED'
        | 'OPPORTUNITY_NOT_FOUND'
        | 'REACTIVATE_FORBIDDEN'
        | 'NOT_WITHDRAWN'
        | 'REACTIVATE_CONFLICT'
        | 'REACTIVATE_FAILED';
    }
> {
  const parsed = WithdrawOpportunityInput.safeParse({ opportunityId, reason });
  if (!parsed.success) {
    const reasonTooLong = parsed.error.issues.some((i) => i.path[0] === 'reason');
    return { success: false, error: reasonTooLong ? 'REASON_TOO_LONG' : 'INVALID_INPUT' };
  }

  const scope = await sessionScope();
  if (!scope) return NO_TENANT;
  await assertTenantActionWritable(scope.tenantId);
  const { tenantId, userId, role } = scope;

  try {
    const owner = await withTenant(tenantId, (tx) =>
      tx.opportunity.findFirst({
        where: { id: parsed.data.opportunityId, tenantId, deletedAt: null },
        select: { ownerId: true },
      }),
    );
    if (!owner) return { success: false, error: 'OPPORTUNITY_NOT_FOUND' };
    if (!canArchiveOpportunity(role, owner.ownerId, userId)) {
      return { success: false, error: 'REACTIVATE_FORBIDDEN' };
    }

    const result = await reactivateOpportunity({
      tenantId,
      userId,
      role,
      opportunityId: parsed.data.opportunityId,
      reason: parsed.data.reason,
    });
    if ('refused' in result) {
      const map = {
        REASON_REQUIRED: 'REASON_REQUIRED',
        NOT_FOUND: 'OPPORTUNITY_NOT_FOUND',
        FORBIDDEN: 'REACTIVATE_FORBIDDEN',
        NOT_WITHDRAWN: 'NOT_WITHDRAWN',
        CONFLICT: 'REACTIVATE_CONFLICT',
      } as const;
      return { success: false, error: map[result.refused] };
    }
    // reactivationTarget only ever answers a withdrawable status.
    const status = result.status === 'SUBMITTED' ? 'SUBMITTED' : 'ACTIVE';

    try {
      revalidatePath('/[locale]/(app)/[workspace]/pipeline', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/pipeline/[id]', 'page');
      revalidatePath('/[locale]/(app)/[workspace]/dashboard', 'page');
    } catch {}

    return { success: true, status };
  } catch (err) {
    console.warn(`[reactivateOpportunityAction] failed: ${errorMessage(err)}`);
    return { success: false, error: 'REACTIVATE_FAILED' };
  }
}
