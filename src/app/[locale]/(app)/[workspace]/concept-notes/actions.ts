'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateWithAI, LlmMessage } from '@/lib/llm';
import { buildRagPrompt } from '@/lib/rag';
import { revalidatePath } from 'next/cache';

/**
 * Create a new Concept Note from a template for an opportunity.
 */
export async function createConceptNote(
  opportunityId: string,
  templateId: string
) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  const template = await prisma.conceptTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) throw new Error('Template not found');

  // Initialize empty content from template schema
  const schema = template.schema as { sections: { key: string; labelKey: string; maxWords: number }[] };
  const content: Record<string, string> = {};
  for (const section of schema.sections) {
    content[section.key] = '';
  }

  const note = await prisma.conceptNote.create({
    data: {
      tenantId,
      opportunityId,
      templateId,
      content,
      status: 'draft',
      version: 1,
      createdBy: session.user.id,
    },
  });

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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  const note = await prisma.conceptNote.findFirst({
    where: { id: noteId, tenantId },
  });
  if (!note) throw new Error('Note not found');

  const content = note.content as Record<string, string>;
  content[sectionKey] = markdown;

  await prisma.conceptNote.update({
    where: { id: noteId },
    data: { content, version: note.version + 1 },
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
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  // Build RAG-augmented context
  const ragQuery = `${opportunityTitle} — section: ${sectionLabel}`;
  const ragPrompt = await buildRagPrompt(ragQuery, tenantId);

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

  const result = await generateWithAI(
    tenantId,
    session.user.id || "",
    messages,
    {
      module: 'M2',
      purpose: 'concept_note_draft',
      proposalId: noteId,
      section: sectionKey,
    }
  );

  // Auto-save the generated draft into the note
  const note = await prisma.conceptNote.findFirst({
    where: { id: noteId, tenantId },
  });
  if (note) {
    const content = note.content as Record<string, string>;
    content[sectionKey] = result.text;
    await prisma.conceptNote.update({
      where: { id: noteId },
      data: { content, version: note.version + 1 },
    });
  }

  revalidatePath('/[locale]/(app)/[workspace]/concept-notes', 'page');

  return {
    text: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    creditsUsed: Math.ceil(result.inputTokens / 1000) + Math.ceil(result.outputTokens / 1000) * 3,
  };
}

/**
 * Update the status of a concept note (draft → review → approved).
 */
export async function updateNoteStatus(noteId: string, status: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  const tenantId = (session as any).tenantId;

  await prisma.conceptNote.update({
    where: { id: noteId, tenantId },
    data: { status },
  });

  revalidatePath('/[locale]/(app)/[workspace]/concept-notes', 'page');
  return { success: true };
}
