'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/ai/llm';
import {
  submitForDualApproval,
  approveByDepartment,
  Department,
  type ApprovalActor,
  type DualApprovalState,
} from '@/lib/dual-approval';
import { auth } from '@/lib/auth';
import { emailLocalPart } from '@/lib/user-display';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import type { FollowupDocRow } from '@/types/db-rows';
import { recordAlert } from '@/lib/observability/system-alert';

/**
 * M10 follow-up documents.
 *
 * `tenantId`/`userId` were arguments passed in by the documents client
 * component, i.e. attacker-controlled on a public POST endpoint, and the
 * document lookups keyed on `id` alone. Both are fixed here: the tenant comes
 * from the session and every query is matched on `(id, tenantId)`.
 */

export async function generateStandardDoc(
  opportunityId: string,
  kind: 'NDA' | 'LOI' | 'COMMITMENT' | 'ESR_DEBRIEF' | 'AWARD_PACK' | string
) {
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

  const prompt = `Generate an official, legally structured EU Horizon Europe ${kind} document for:
  Opportunity: ${oppTitle}
  Document Kind: ${kind}

  Return structured Markdown text for this document type:
  - If NDA: Mutual Non-Disclosure Agreement clauses, IP confidentiality, 5-year duration.
  - If LOI: Letter of Intent confirming institutional commitment to join the proposal.
  - If COMMITMENT: Consortium Partner Commitment Form specifying Person-Months & Background IP.
  - If ESR_DEBRIEF: Post-evaluation ESR score debrief, strengths, weaknesses & resubmission strategy.
  - If AWARD_PACK: TÜBİTAK Eşik Üstü Ödülü (Threshold Award) package application form & company declaration.`;

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
      system: 'You are an expert EU Horizon Europe legal & administrative document generator.'
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
    });
    throw new Error(`Document generation failed for ${kind}. No document was created and no credit was charged.`);
  }

  if (!contentText.trim()) {
    // An empty completion is the same non-event as a thrown one.
    await recordAlert({
      level: 'error',
      source: 'm10_document_generation_empty',
      message: `Follow-up document generation returned empty text for kind ${kind}.`,
      meta: { module: 'M10', kind, opportunityId },
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

    // Deduct 1 AI credit for M10 document generation
    await tx.creditLedger.create({
      data: {
        tenantId,
        delta: -1,
        reason: `M10: Follow-up Document Generation (${kind})`
      }
    });

    return created;
  });

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/documents', 'page');
  } catch {}

  return { ...doc, contentText };
}

export async function signDocument(docId: string) {
  const { tenantId } = await requireTenantAction();

  // `updateMany` keeps tenantId in the WHERE clause; `update` takes only a
  // unique selector, so a guessed doc id would sign another tenant's document.
  const signedAt = new Date();
  const updated = await withTenant<{ count: number }>(tenantId, (tx) =>
    tx.followupDoc.updateMany({
      where: { id: docId, tenantId },
      data: { signedAt }
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/documents', 'page');
  } catch {}

  return { success: updated.count > 0, signedAt };
}

export async function createNewVersion(docId: string) {
  const { tenantId } = await requireTenantAction();

  const updatedDoc = await withTenant<FollowupDocRow | null>(tenantId, async (tx) => {
    // Scoped read: a doc id from another tenant must not resolve here.
    const existing = await tx.followupDoc.findFirst({ where: { id: docId, tenantId } });
    if (!existing) return null;

    const nextVer = existing.version + 1;
    return tx.followupDoc.update({
      where: { id: existing.id },
      data: {
        version: nextVer,
        signedAt: null, // Reset signature state for new revision
        contentUrl: `https://storage.fabrika.app/docs/${existing.tenantId}/${existing.opportunityId}/${existing.kind.toLowerCase()}_v${nextVer}.pdf`
      }
    });
  });

  try {
    revalidatePath('/[locale]/(app)/[workspace]/opportunities/[id]/documents', 'page');
  } catch {}

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

export async function submitDualApprovalAction(docId: string) {
  const actor = await requireApprovalActor();
  const approvalState = submitForDualApproval(docId, actor);
  return { success: true, approvalState };
}

export async function departmentApproveAction(
  currentState: DualApprovalState,
  department: Department,
  note?: string
) {
  const actor = await requireApprovalActor();
  const updatedState = approveByDepartment(currentState, department, actor, note);
  return { success: true, approvalState: updatedState };
}
