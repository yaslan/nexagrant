'use server';

import { prisma, withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/llm';
import { retrieveChunks } from '@/lib/rag';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * M2 concept notes.
 *
 * `tenantId`/`userId` were arguments, and the opportunity and note lookups
 * keyed on `id` alone — so a guessed id could draft against, read, or overwrite
 * another tenant's concept note, and bill the AI call to whichever tenant the
 * caller named. Both now come from the session.
 *
 * `ConceptTemplate` is deliberately still read off the shared `prisma` client:
 * it is platform catalogue data, not tenant data.
 */

/**
 * One section of a ConceptTemplate. The template's `schema` Json column holds
 * an array of these — see the comment on the column in prisma/schema.prisma.
 */
interface ConceptTemplateSection {
  key: string;
  labelKey: string;
  maxWords: number;
  promptKey: string;
}

/** `ConceptNote.content`: the drafted markdown, keyed by section. */
type ConceptNoteContent = Record<string, string>;

/**
 * The Opportunity this module drafts against.
 *
 * `Opportunity.topicId` has no `topic` relation in the Prisma schema (it is a
 * plain, unenforced foreign key), so the topic is fetched separately — see
 * `generateConceptNoteDraft` below. Do not add `include: { topic: true }`
 * here; Prisma will throw `PrismaClientValidationError` since the relation
 * does not exist.
 */
interface OpportunityWithTopic {
  id: string;
  title: string;
  topicId: string | null;
}

/** The AiUsageLog columns the transparency report reads. */
interface AiUsageLogRow {
  module: string;
  purpose: string;
  model: string;
  promptHash: string;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  section: string | null;
  createdAt: Date;
}

export async function generateConceptNoteDraft(
  opportunityId: string,
  templateId: string,
  inputs: Record<string, string>
) {
  const { tenantId, userId } = await requireTenantAction();

  // 1. Get the opportunity — scoped to the session tenant
  const opp = await withTenant<OpportunityWithTopic | null>(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: opportunityId, tenantId }
    })
  );

  if (!opp) throw new Error('Opportunity not found');

  // 1b. Topic is shared catalogue data with no Prisma relation to Opportunity
  // (see the OpportunityWithTopic comment) — fetched separately by topicId.
  const topic = opp.topicId
    ? await prisma.topic.findUnique({
        where: { id: opp.topicId },
        select: { title: true, identifier: true }
      })
    : null;

  // 2. Get the template (shared catalogue, not tenant-scoped)
  const template = await prisma.conceptTemplate.findUnique({
    where: { id: templateId }
  });

  if (!template) throw new Error('Template not found');

  // 3. For each section, search RAG for context and generate text
  const content: Record<string, string> = {};
  const schema = template.schema as unknown as ConceptTemplateSection[];
  
  for (const section of schema) {
    // Basic RAG search
    const searchQuery = `${opp.title} ${topic?.title || ''} ${section.promptKey}`;
    const ragResults = await retrieveChunks(searchQuery, 3, tenantId, { userId });
    
    let contextStr = '';
    if (ragResults && Array.isArray(ragResults)) {
      contextStr = ragResults.map(r => r.text).join('\n\n');
    }

    const prompt = `
      You are an expert grant writer for EU funding (Horizon Europe, etc.).
      Topic: ${topic?.title} (${topic?.identifier})
      Project Idea/Title: ${opp.title}
      Additional Inputs: ${JSON.stringify(inputs)}
      
      Background Context from Documents:
      ${contextStr}
      
      Task:
      ${section.promptKey}
      Write around ${section.maxWords} words.
    `;

    const generatedText = await generateText({
      tenantId,
      userId,
      module: 'M2',
      purpose: `Drafting section: ${section.key}`,
      proposalId: opportunityId,
      section: section.key,
      prompt
    });
    
    content[section.key] = generatedText;
  }

  // 4. Save to db
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
      }
    })
  );

  return note.id;
}

export async function saveConceptNoteDraft(noteId: string, content: ConceptNoteContent) {
  const { tenantId } = await requireTenantAction();

  // `updateMany` keeps tenantId in the WHERE clause; `update` takes only a
  // unique selector and would overwrite another tenant's draft.
  const updated = await withTenant(tenantId, (tx) =>
    tx.conceptNote.updateMany({
      where: { id: noteId, tenantId },
      data: { content, updatedAt: new Date() }
    })
  );

  return { success: updated.count > 0 };
}

export async function exportToDocx(noteId: string) {
  const { tenantId } = await requireTenantAction();

  const note = await withTenant(tenantId, (tx) =>
    tx.conceptNote.findFirst({
      where: { id: noteId, tenantId }
    })
  );

  if (!note) throw new Error('Note not found');

  // ConceptNote has no `opportunity` relation in the schema (see the
  // ConceptNoteWithOpportunity comment) — fetched separately by opportunityId.
  const opportunity = await withTenant(tenantId, (tx) =>
    tx.opportunity.findFirst({
      where: { id: note.opportunityId, tenantId },
      select: { title: true }
    })
  );

  if (!opportunity) throw new Error('Opportunity not found for concept note');

  const template = await prisma.conceptTemplate.findUnique({
    where: { id: note.templateId }
  });

  const schema = (template?.schema ?? []) as unknown as ConceptTemplateSection[];

  const children = [
    new Paragraph({
      children: [new TextRun({ text: `Concept Note: ${opportunity.title}`, bold: true, size: 32 })]
    })
  ];

  for (const section of schema || []) {
    const text = (note.content as Record<string, string>)[section.key] || '';
    children.push(new Paragraph({
      children: [new TextRun({ text: section.labelKey, bold: true, size: 24 })],
      spacing: { before: 400, after: 200 }
    }));
    children.push(new Paragraph({
      children: [new TextRun(text)]
    }));
  }

  const doc = new DocxDocument({
    sections: [{
      properties: {},
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer.toString('base64');
}

export async function generateAiUsageDeclaration(opportunityId: string) {
  const { tenantId } = await requireTenantAction();

  const logs = await withTenant<AiUsageLogRow[]>(tenantId, (tx) =>
    tx.aiUsageLog.findMany({
      where: { tenantId, proposalId: opportunityId },
      orderBy: { createdAt: 'asc' }
    })
  );

  const totalInputs = logs.reduce((acc: number, l) => acc + l.inputTokens, 0);
  const totalOutputs = logs.reduce((acc: number, l) => acc + l.outputTokens, 0);
  const totalCredits = logs.reduce((acc: number, l) => acc + l.credits, 0);

  const sectionsUsed = Array.from(new Set(logs.map((l) => l.section).filter(Boolean)));

  const declarationMarkdown = `
# Artificial Intelligence Usage & Transparency Declaration

**Opportunity ID:** ${opportunityId}  
**Tenant ID:** ${tenantId}  
**Declaration Date:** ${new Date().toISOString().split('T')[0]}  

---

## 1. Compliance Statement
This document provides full transparency regarding the use of Artificial Intelligence (AI) tools in drafting and refining proposal concept notes and narratives. In accordance with EU Horizon Europe and European Commission AI Ethics Guidelines, AI tools were utilized strictly as writing assistants under direct human design, oversight, and verification.

## 2. Summary of AI Assistance
- **Total AI Interactions:** ${logs.length}
- **Total Input Tokens:** ${totalInputs.toLocaleString()}
- **Total Output Tokens:** ${totalOutputs.toLocaleString()}
- **Total AI Credits Consumed:** ${totalCredits}
- **Proposal Sections Assisted:** ${sectionsUsed.join(', ') || 'N/A'}

## 3. Log of AI Operations

| Timestamp (UTC) | Module | Section / Purpose | Model | Prompt Hash | Tokens (In/Out) | Credits |
|---|---|---|---|---|---|---|
${logs.map((l) => `| ${l.createdAt.toISOString()} | ${l.module} | ${l.section || l.purpose} | ${l.model} | \`${l.promptHash.slice(0, 10)}...\` | ${l.inputTokens}/${l.outputTokens} | ${l.credits} |`).join('\n')}

---
*Generated automatically by ${PRODUCT_NAME} SaaS Platform Compliance Engine.*
`.trim();

  return {
    logsCount: logs.length,
    totalInputTokens: totalInputs,
    totalOutputTokens: totalOutputs,
    totalCredits,
    declarationMarkdown
  };
}
