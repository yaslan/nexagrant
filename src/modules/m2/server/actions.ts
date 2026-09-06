'use server';

import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai/llm';
import { semanticSearch } from '@/lib/ai/rag';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';

export async function generateConceptNoteDraft(
  opportunityId: string,
  tenantId: string,
  userId: string,
  templateId: string,
  inputs: Record<string, string>
) {
  // 1. Get the opportunity and topic
  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { topic: true }
  });
  
  if (!opp) throw new Error('Opportunity not found');

  // 2. Get the template
  const template = await prisma.conceptTemplate.findUnique({
    where: { id: templateId }
  });

  if (!template) throw new Error('Template not found');

  // 3. For each section, search RAG for context and generate text
  const content: Record<string, string> = {};
  const schema = template.schema as any[];
  
  for (const section of schema) {
    // Basic RAG search
    const searchQuery = `${opp.title} ${opp.topic?.title || ''} ${section.promptKey}`;
    const ragResults = await semanticSearch(searchQuery, tenantId, 3);
    
    let contextStr = '';
    if (ragResults && Array.isArray(ragResults)) {
      contextStr = ragResults.map(r => r.text).join('\n\n');
    }

    const prompt = `
      You are an expert grant writer for EU funding (Horizon Europe, etc.).
      Topic: ${opp.topic?.title} (${opp.topic?.identifier})
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
  const note = await prisma.conceptNote.create({
    data: {
      tenantId,
      opportunityId,
      templateId,
      content,
      status: 'draft',
      version: 1,
      createdBy: userId,
    }
  });

  return note.id;
}

export async function saveConceptNoteDraft(noteId: string, content: any) {
  await prisma.conceptNote.update({
    where: { id: noteId },
    data: { content, updatedAt: new Date() }
  });
}

export async function exportToDocx(noteId: string) {
  const note = await prisma.conceptNote.findUnique({
    where: { id: noteId },
    include: { opportunity: true }
  });

  if (!note) throw new Error('Note not found');

  const template = await prisma.conceptTemplate.findUnique({
    where: { id: note.templateId }
  });

  const schema = template?.schema as any[];

  const children = [
    new Paragraph({
      children: [new TextRun({ text: `Concept Note: ${note.opportunity.title}`, bold: true, size: 32 })]
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

export async function generateAiUsageDeclaration(opportunityId: string, tenantId: string) {
  const logs = await prisma.aiUsageLog.findMany({
    where: { tenantId, proposalId: opportunityId },
    orderBy: { createdAt: 'asc' }
  });

  const totalInputs = logs.reduce((acc: number, l: any) => acc + l.inputTokens, 0);
  const totalOutputs = logs.reduce((acc: number, l: any) => acc + l.outputTokens, 0);
  const totalCredits = logs.reduce((acc: number, l: any) => acc + l.credits, 0);

  const sectionsUsed = Array.from(new Set(logs.map((l: any) => l.section).filter(Boolean)));

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
${logs.map((l: any) => `| ${l.createdAt.toISOString()} | ${l.module} | ${l.section || l.purpose} | ${l.model} | \`${l.promptHash.slice(0, 10)}...\` | ${l.inputTokens}/${l.outputTokens} | ${l.credits} |`).join('\n')}

---
*Generated automatically by FonBridge SaaS Platform Compliance Engine.*
`.trim();

  return {
    logsCount: logs.length,
    totalInputTokens: totalInputs,
    totalOutputTokens: totalOutputs,
    totalCredits,
    declarationMarkdown
  };
}
