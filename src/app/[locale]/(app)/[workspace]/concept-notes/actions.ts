'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateCompletion, LlmMessage } from '@/lib/llm';
import { assertModuleAccess } from '@/lib/modules/access';
import { buildRagPrompt } from '@/lib/rag';
import { revalidatePath } from 'next/cache';
import { findAccessibleTemplate, templateSections } from '@/modules/m2/server/templates';

/**
 * `tenantId` was read as `session.tenantId` with no null check. Prisma
 * treats an `undefined` field in a `where` clause as absent, so
 * `findFirst({ where: { id, tenantId: undefined } })` matched a note in *any*
 * tenant — and the follow-up `update({ where: { id } })` then wrote to it.
 */

/**
 * Create a new Concept Note from a template for an opportunity.
 */
export async function createConceptNote(
  opportunityId: string,
  templateId: string
) {
  const { tenantId, userId } = await requireTenantAction();

  // A platform template or one this tenant owns — `templateId` is a server
  // action argument, so an unscoped lookup by id read another tenant's row
  // (TASK-MTVTU103F11XJ).
  const template = await findAccessibleTemplate(templateId, tenantId);
  if (!template) throw new Error('Template not found');

  // Initialize empty content from template schema
  const content: Record<string, string> = {};
  for (const section of templateSections(template.schema)) {
    content[section.key] = '';
  }

  const note = await withTenant(tenantId, (tx) =>
    tx.conceptNote.create({
    data: {
      tenantId,
      opportunityId,
      templateId,
      content,
      status: 'draft',
      version: 1,
      createdBy: userId,
    },
    })
  );

  revalidatePath('/[locale]/(app)/[workspace]/concept-notes', 'page');
  return note;
}

/**
 * Save section content manually.
 */
export async function saveSectionContent(
  noteId: string,
  sectionKey: string,
  markdown: string
) {
  const { tenantId } = await requireTenantAction();

  await withTenant(tenantId, async (tx) => {
    const note = await tx.conceptNote.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) throw new Error('Note not found');

    const content = note.content as Record<string, string>;
    content[sectionKey] = markdown;

    await tx.conceptNote.update({
      where: { id: note.id },
      data: { content, version: note.version + 1 },
    });
  });

  return { success: true };
}

/**
 * AI-generate a draft for a specific section of a concept note.
 * Uses RAG to pull relevant evidence and topic context.
 */
export async function generateSectionDraft(
  noteId: string,
  sectionKey: string,
  sectionLabel: string,
  maxWords: number,
  opportunityTitle: string
) {
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M2');
  const { tenantId, userId } = await requireTenantAction();

  // Build RAG-augmented context
  const ragQuery = `${opportunityTitle} — section: ${sectionLabel}`;
  const ragPrompt = await buildRagPrompt(ragQuery, tenantId, undefined, { userId });

  const messages: LlmMessage[] = [
    {
      role: 'system',
      content: `You are an expert proposal writer for EU Horizon Europe funding applications. 
Write compelling, evidence-based content that follows EU evaluation criteria. 
Be specific, quantitative where possible, and reference the applicant's capabilities.
Always write in English unless specifically requested otherwise.
Maximum word count: ${maxWords} words.`,
    },
    {
      role: 'user',
      content: `Write the "${sectionLabel}" section for a concept note targeting: "${opportunityTitle}".

${ragPrompt}

Requirements:
- Maximum ${maxWords} words
- Use formal academic/proposal writing style
- Include specific, measurable objectives where appropriate
- Reference relevant prior work and capabilities from the context provided`,
    },
  ];

  const result = await generateCompletion({
    tenantId,
    userId,
    messages,
    module: 'M2',
    purpose: 'concept_note_draft',
    proposalId: noteId,
    section: sectionKey,
  });

  // Auto-save the generated draft into the note
  await withTenant(tenantId, async (tx) => {
    const note = await tx.conceptNote.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) return;

    const content = note.content as Record<string, string>;
    content[sectionKey] = result.text;
    await tx.conceptNote.update({
      where: { id: note.id },
      data: { content, version: note.version + 1 },
    });
  });

  revalidatePath('/[locale]/(app)/[workspace]/concept-notes', 'page');

  return {
    text: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    // The credits the ledger actually moved by, not a second copy of the
    // formula: this screen used to re-derive the old adapter's price inline, so
    // the figure it showed drifted from the `AiUsageLog` row behind it.
    creditsUsed: result.credits,
  };
}

/**
 * Update the status of a concept note (draft → review → approved).
 */
export async function updateNoteStatus(noteId: string, status: string) {
  const { tenantId } = await requireTenantAction();

  // `updateMany` so the tenant is a real filter rather than an extra column on
  // a unique selector.
  await withTenant(tenantId, (tx) =>
    tx.conceptNote.updateMany({
      where: { id: noteId, tenantId },
      data: { status },
    })
  );

  revalidatePath('/[locale]/(app)/[workspace]/concept-notes', 'page');
  return { success: true };
}
