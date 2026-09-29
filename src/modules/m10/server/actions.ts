'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/llm';
import { renderPrompt } from '@/lib/ai/prompts';
import { promptLocale } from '@/lib/ai/prompts/locale';
import { assertModuleAccess } from '@/lib/modules/access';
import {
  submitForDualApproval,
  approveByDepartment,
  deriveDualApprovalState,
  refusalForDepartmentApproval,
  Department,
  type ApprovalActor,
  type DualApprovalRefusal,
  type DualApprovalState,
  type PersistedApproval,
} from '@/lib/dual-approval';
import { auth } from '@/lib/auth';
import { emailLocalPart } from '@/lib/user-display';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import { isPresentId } from '@/lib/required-id';
import type { FollowupDocRow } from '@/types/db-rows';
import { recordAlert } from '@/lib/observability/system-alert';
import { isLlmUnusableOutcome } from '@/lib/llm-outcome';

/**
 * M10 follow-up documents.
 *
 * `tenantId`/`userId` were arguments passed in by the documents client
 * component, i.e. attacker-controlled on a public POST endpoint, and the
 * document lookups keyed on `id` alone. Both are fixed here: the tenant comes
 * from the session and every query is matched on `(id, tenantId)`.
 */

/** The documents page is a server component; every write here re-renders it. */
function revalidateDocuments(): void {
  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/documents', 'page');
  } catch {}
}

export async function generateStandardDoc(
  opportunityId: string,
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | string
) {
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M10');
  const { tenantId, userId } = await requireTenantAction();

  const opp = await withTenant<{ title: string } | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId },
      select: { title: true }
    })
  );

  if (!opp) {
    throw new Error(`Opportunity ${opportunityId} not found in this workspace.`);
  }

  const oppTitle = opp.title || 'Ufuk Avrupa Proje Başvurusu';

  const locale = await promptLocale();
  const prompt = renderPrompt('m10/standard-doc', { kind, opportunityTitle: oppTitle }, locale);

  // TASK-MTQYXISOPUJ53 — fabricated fallbacks.
  //
  // This call used to be wrapped in a try/catch that, on any LLM failure,
  // substituted a hard-coded document per `kind` and carried on: an NDA, an
  // LOI, a COMMITMENT form naming "Fraunhofer Institute / SME Partner" with
  // "16 Person-Months (WP3 & WP5)", an AWARD_PACK asserting "Komisyon ESR
  // Puanı: 13.5 / 15.0" for "FonBridge Teknoloji A.Ş.", and an ESR_DEBRIEF
  // reporting an excellence score of 4.5. The row was then written to
  // `FollowupDoc`, one AI credit was deducted, and the user was shown a
  // legal-looking document nothing had generated — figures with no Evidence
  // record behind them (CLAUDE.md rule 7) on documents meant to be signed and
  // sent to a consortium.
  //
  // A generation that did not happen is an error, not a document. Nothing is
  // written and no credit is charged; the client already surfaces a thrown
  // action as a failure.
  let contentText: string;
  try {
    contentText = await generateText({
      tenantId,
      userId,
      module: 'M10',
      purpose: `document_generation_${kind.toLowerCase()}`,
      prompt,
      system: renderPrompt('m10/standard-doc-system', {}, locale)
    });
  } catch (e) {
    console.error(`[m10 generateStandardDoc] generation failed for ${kind}: ${errorMessage(e)}`);
    await recordAlert({
      level: 'error',
      source: 'm10_document_generation_failed',
      message: `Follow-up document generation failed for kind ${kind}: ${errorMessage(e)}`,
      // No tenantId/userId: SystemAlert has no RLS policy. The opportunity id is
      // the tenant-scoped handle an admin can join back.
      meta: { module: 'M10', kind, opportunityId },
      // The document kind is what an operator debugs — a broken prompt or a
      // model that will not answer is per kind — while `opportunityId` and the
      // LLM error text name the occurrence. Note this folds across tenants,
      // which is acceptable only because the alert never carried a tenant id
      // to begin with (the privacy rule above forbids it), so no tenant
      // separation is being given up here.
      dedupeKey: `m10-doc-generation-failed:${kind}`,
    });
    // A cut-off or declined answer keeps its own error: its digest is what lets
    // the screen say "cut off at the length limit" instead of nothing
    // (TASK-MUN4PSBP19RKK). The adapter has already charged nothing for it.
    if (isLlmUnusableOutcome(e)) throw e;
    throw new Error(`Document generation failed for ${kind}. No document was created and no credit was charged.`);
  }

  if (!contentText.trim()) {
    // An empty completion is the same non-event as a thrown one.
    await recordAlert({
      level: 'error',
      source: 'm10_document_generation_empty',
      message: `Follow-up document generation returned empty text for kind ${kind}.`,
      meta: { module: 'M10', kind, opportunityId },
      // Same reasoning as above: kind identifies the problem, the opportunity
      // identifies the occurrence.
      dedupeKey: `m10-doc-generation-empty:${kind}`,
    });
    throw new Error(`Document generation returned no content for ${kind}. No document was created and no credit was charged.`);
  }

  const mockUrl = `https://storage.fabrika.app/docs/${tenantId}/${opportunityId}/${kind.toLowerCase()}_v1.pdf`;

  const doc = await withTenant<FollowupDocRow>(tenantId, async (tx) => {
    const created = await tx.followupDoc.create({
      data: {
        tenantId,
        opportunityId,
        kind,
        version: 1,
        contentUrl: mockUrl
      }
    });

    return created;
  });

  revalidateDocuments();

  return { ...doc, contentText };
}

export async function signDocument(docId: string) {
  const { tenantId } = await requireTenantAction();
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(docId)) return { success: false, signedAt: null };

  // `updateMany` keeps tenantId in the WHERE clause; `update` takes only a
  // unique selector, so a guessed doc id would sign another tenant's document.
  const signedAt = new Date();
  const updated = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.followupDoc.updateMany({
      where: { id: docId, tenantId },
      data: { signedAt }
    })
  );

  revalidateDocuments();

  return { success: updated.count > 0, signedAt };
}

export async function createNewVersion(docId: string) {
  const { tenantId } = await requireTenantAction();
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(docId)) return { success: false, updatedDoc: null };

  const updatedDoc = await withTenant<FollowupDocRow | null>(tenantId, async (tx) => {
    // Scoped read: a doc id from another tenant must not resolve here.
    const existing = await tx.followupDoc.findFirst({ where: { id: docId, tenantId } });
    if (!existing) return null;

    const nextVer = existing.version + 1;

    // A revision is a different document to sign, so the sign-off it inherited
    // does not carry over: the steps are deleted with the signature they led to.
    // Leaving them would light stages 2-3 of the banner for approvals given on
    // text nobody in the flow has read.
    await tx.dualApprovalStep.deleteMany({ where: { followupDocId: existing.id, tenantId } });

    return tx.followupDoc.update({
      where: { id: existing.id },
      data: {
        version: nextVer,
        signedAt: null, // Reset signature state for new revision
        approvalSubmittedAt: null,
        approvalSubmittedById: null,
        approvalSubmittedByName: null,
        contentUrl: `https://storage.fabrika.app/docs/${existing.tenantId}/${existing.opportunityId}/${existing.kind.toLowerCase()}_v${nextVer}.pdf`
      }
    });
  });

  revalidateDocuments();

  return { success: updatedDoc !== null, updatedDoc };
}

/**
 * Who is signing this approval step.
 *
 * `submitDualApprovalAction` used to take the actor name as an argument and default
 * it to the name of one real, uninvolved person, so a call that named nobody produced an audit record
 * naming a real person who had never seen the document. The actor is now read from
 * the session only — never from the request body, which a client controls — and a
 * request without a session is refused by `requireTenantAction()` before any record
 * exists.
 *
 * `displayName` falls back to the e-mail local part and then to the user id: all
 * three are data the session actually carries, so nothing is invented.
 */
async function requireApprovalActor(): Promise<ApprovalActor> {
  const { userId } = await requireTenantAction();
  const session = (await auth()) as { user?: { name?: string | null; email?: string | null } } | null;
  const name = session?.user?.name?.trim();
  return {
    userId,
    displayName: name || emailLocalPart(session?.user?.email) || userId,
  };
}

/**
 * The stored half of one document's flow.
 *
 * TASK-MTSAIWF4ENUSL — steps 2 and 3 used to live in React state only: finance
 * approved, the page was reloaded, and the approval was gone. `FollowupDoc`
 * carried nothing but `signedAt`, so the banner's middle two stages were an
 * in-memory claim about a corporate sign-off. They are rows now.
 */
type ApprovalRow = {
  id: string;
  approvalSubmittedAt: Date | null;
  approvalSubmittedById: string | null;
  approvalSubmittedByName: string | null;
  signedAt: Date | null;
  approvalSteps: {
    id: string;
    department: string;
    actorUserId: string;
    actorName: string;
    note: string | null;
    decidedAt: Date;
  }[];
};

const APPROVAL_SELECT = {
  id: true,
  approvalSubmittedAt: true,
  approvalSubmittedById: true,
  approvalSubmittedByName: true,
  signedAt: true,
  approvalSteps: {
    select: {
      id: true,
      department: true,
      actorUserId: true,
      actorName: true,
      note: true,
      decidedAt: true,
    },
    orderBy: { decidedAt: 'asc' },
  },
} as const;

function toPersisted(row: ApprovalRow): PersistedApproval {
  return {
    docId: row.id,
    submittedAt: row.approvalSubmittedAt,
    submittedById: row.approvalSubmittedById,
    submittedByName: row.approvalSubmittedByName,
    signedAt: row.signedAt,
    steps: row.approvalSteps,
  };
}

/** Shape both approval actions answer with, so the client never has to guess. */
export type DualApprovalActionResult =
  | { success: true; approvalState: DualApprovalState; signedAt: string | null }
  | { success: false; refusal: DualApprovalRefusal; approvalState: DualApprovalState | null };

/** Either a refused step (with whatever state the caller may still see) or a written one. */
type ApproveOutcome =
  | { refusal: DualApprovalRefusal; row: ApprovalRow | null }
  | { refusal: null; row: ApprovalRow };

/** Postgres unique violation — the four-eyes indexes on `DualApprovalStep`. */
function uniqueViolationRefusal(e: unknown): DualApprovalRefusal | null {
  const code = (e as { code?: string })?.code;
  if (code !== 'P2002' && code !== '23505') return null;
  const target = JSON.stringify((e as { meta?: unknown })?.meta ?? '') + String(e);
  return target.includes('actorUserId')
    ? 'SAME_ACTOR_BOTH_DEPARTMENTS'
    : 'DEPARTMENT_ALREADY_APPROVED';
}

/**
 * Puts one document into the dual approval flow, durably.
 *
 * Idempotent on purpose: a document already in the flow keeps the submitter it
 * was opened by. An audit record is not silently re-signed by whoever reloads
 * the page.
 */
export async function submitDualApprovalAction(docId: string): Promise<DualApprovalActionResult> {
  const { tenantId } = await requireTenantAction();
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(docId)) return { success: false, refusal: 'DOC_NOT_FOUND', approvalState: null };
  const actor = await requireApprovalActor();

  // The engine decides what a submission is; the row records it.
  const opened = submitForDualApproval(docId, actor);
  const openedAt = new Date(opened.auditTrail[0]!.timestamp);

  const row = await withTenant<ApprovalRow | null>(tenantId, async (tx) => {
    const existing = await tx.followupDoc.findFirst({
      where: { id: docId, tenantId },
      select: APPROVAL_SELECT,
    });
    if (!existing) return null;
    if (existing.approvalSubmittedAt) return existing;

    // `updateMany` keeps tenantId in the WHERE clause: `update` takes only a
    // unique selector, so a guessed id would open a flow on another tenant's doc.
    await tx.followupDoc.updateMany({
      where: { id: docId, tenantId },
      data: {
        approvalSubmittedAt: openedAt,
        approvalSubmittedById: opened.submittedByUserId,
        approvalSubmittedByName: opened.submittedBy,
      },
    });

    return tx.followupDoc.findFirst({ where: { id: docId, tenantId }, select: APPROVAL_SELECT });
  });

  if (!row) return { success: false, refusal: 'DOC_NOT_FOUND', approvalState: null };

  revalidateDocuments();
  const approvalState = deriveDualApprovalState(toPersisted(row));
  if (!approvalState) return { success: false, refusal: 'NOT_IN_FLOW', approvalState: null };
  return { success: true, approvalState, signedAt: row.signedAt?.toISOString() ?? null };
}

/**
 * One department sign-off, written down.
 *
 * The old signature took the whole `DualApprovalState` from the client — a
 * server action argument is request body, so the caller could describe any
 * workflow it liked and have it signed. The only thing taken from the client now
 * is which document and which department; the state is read from the database.
 *
 * The legal step completes the flow, and the completion is the signature: it is
 * written in the same transaction as the step, so there is no window in which
 * the fourth stage is lit by a document that is not signed.
 */
export async function departmentApproveAction(
  docId: string,
  department: Department,
  note?: string
): Promise<DualApprovalActionResult> {
  const { tenantId } = await requireTenantAction();
  // Client-supplied: Prisma drops an `undefined` key from `where` (TASK-MUN2KUHP1BP18).
  if (!isPresentId(docId)) return { success: false, refusal: 'DOC_NOT_FOUND', approvalState: null };
  const actor = await requireApprovalActor();

  const outcome: ApproveOutcome = await withTenant<ApproveOutcome>(tenantId, async (tx) => {
    const existing = await tx.followupDoc.findFirst({
      where: { id: docId, tenantId },
      select: APPROVAL_SELECT,
    });
    if (!existing) return { refusal: 'DOC_NOT_FOUND' as const, row: null };

    const refusal = refusalForDepartmentApproval(toPersisted(existing), department, actor);
    if (refusal) return { refusal, row: existing };

    // The engine builds the audit line; the row below *is* that line.
    const next = approveByDepartment(
      deriveDualApprovalState(toPersisted(existing))!,
      department,
      actor,
      note
    );
    const line = next.auditTrail[next.auditTrail.length - 1]!;

    await tx.dualApprovalStep.create({
      data: {
        tenantId,
        followupDocId: existing.id,
        department,
        actorUserId: line.actorUserId,
        actorName: line.actorName,
        note: line.note ?? null,
        decidedAt: new Date(line.timestamp),
      },
    });

    if (next.stage === 'APPROVED_AND_SIGNED') {
      await tx.followupDoc.updateMany({
        where: { id: existing.id, tenantId },
        data: { signedAt: new Date(line.timestamp) },
      });
    }

    const reread = await tx.followupDoc.findFirst({
      where: { id: docId, tenantId },
      select: APPROVAL_SELECT,
    });
    return { refusal: null, row: reread! };
  }).catch((e: unknown) => {
    // The unique indexes are the backstop for two approvers racing each other.
    const refusal = uniqueViolationRefusal(e);
    if (!refusal) throw e;
    return { refusal, row: null };
  });

  if (outcome.refusal) {
    const approvalState = outcome.row ? deriveDualApprovalState(toPersisted(outcome.row)) : null;
    return { success: false, refusal: outcome.refusal, approvalState };
  }

  revalidateDocuments();
  const approvalState = deriveDualApprovalState(toPersisted(outcome.row));
  if (!approvalState) return { success: false, refusal: 'NOT_IN_FLOW', approvalState: null };
  return { success: true, approvalState, signedAt: outcome.row.signedAt?.toISOString() ?? null };
}
