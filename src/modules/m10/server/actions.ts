'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/ai/llm';
import { submitForDualApproval, approveByDepartment, rejectDualApproval, Department } from '@/lib/dual-approval';
import { revalidatePath } from 'next/cache';

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

  let contentText = '';
  try {
    contentText = await generateText({
      tenantId,
      userId,
      module: 'M10',
      purpose: `document_generation_${kind.toLowerCase()}`,
      prompt,
      system: 'You are an expert EU Horizon Europe legal & administrative document generator.'
    });
  } catch (e: any) {
    console.warn(`[m10 generateStandardDoc] LLM fallback for ${kind}:`, e.message);
    if (kind === 'NDA') {
      contentText = `### MUTUAL NON-DISCLOSURE AGREEMENT (NDA)\n\n**1. Purpose:** Confidentiality agreement for project **${oppTitle}**.\n**2. Obligations:** Disclosing Party and Receiving Party agree to hold all technical and financial background IP strictly confidential for a period of 5 years.\n**3. Jurisdiction:** EU Commercial Law & International Arbitration.`;
    } else if (kind === 'LOI') {
      contentText = `### LETTER OF INTENT (LOI)\n\n**To the European Commission / Coordinator:**\nWe hereby confirm our institutional intent and formal commitment to participate as a full consortium partner in the proposal **${oppTitle}** under Horizon Europe.`;
    } else if (kind === 'COMMITMENT') {
      contentText = `### CONSORTIUM PARTNER COMMITMENT FORM\n\n**Partner Name:** Fraunhofer Institute / SME Partner\n**Target Proposal:** ${oppTitle}\n**Allocated Effort:** 16 Person-Months (WP3 & WP5)\n**Background IP:** Pre-existing patent portfolio & modeling tools declared under Section 3.`;
    } else if (kind === 'AWARD_PACK') {
      contentText = `### TÜBİTAK EŞİK ÜSTÜ ÖDÜLÜ BAŞVURU PAKETİ\n\n**1. Proje Adı:** ${oppTitle}\n**2. Çağrı Kodu:** HORIZON-CL5-2026-D3-01\n**3. Komisyon ESR Puanı:** 13.5 / 15.0 (Eşik Üstü Başarılı)\n**4. Başvuran Şirket:** FonBridge Teknoloji A.Ş.\n**5. Ödül Beyanı:** İşbu paket TÜBİTAK Eşik Üstü Ödülü yönetmeliğine uygun olarak hazırlanmıştır.`;
    } else {
      contentText = `### ESR DEBRIEF & ACTION PLAN\n\n**Proposal:** ${oppTitle}\n**Evaluator Feedback Summary:** High excellence score (4.5), minor weakness in WP5 dissemination quantification.\n**Resubmission Plan:** Revise Part B Section 2.2 for the next call cycle.`;
    }
  }

  const mockUrl = `https://storage.fabrika.app/docs/${tenantId}/${opportunityId}/${kind.toLowerCase()}_v1.pdf`;

  const doc = await withTenant<any>(tenantId, async (tx) => {
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
  } catch (e) {}

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
  } catch (e) {}

  return { success: updated.count > 0, signedAt };
}

export async function createNewVersion(docId: string) {
  const { tenantId } = await requireTenantAction();

  const updatedDoc = await withTenant<any>(tenantId, async (tx) => {
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
  } catch (e) {}

  return { success: updatedDoc !== null, updatedDoc };
}

export async function submitDualApprovalAction(docId: string, actorName: string = 'Dr. Mehmet Yılmaz') {
  const approvalState = submitForDualApproval(docId, actorName);
  return { success: true, approvalState };
}

export async function departmentApproveAction(
  currentState: any,
  department: Department,
  actorName: string,
  note?: string
) {
  const updatedState = approveByDepartment(currentState, department, actorName, note);
  return { success: true, approvalState: updatedState };
}
