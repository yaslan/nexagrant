import { generateText } from '@/lib/llm';
import { withTenant, assertTenantScope, type TenantTx } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { z } from 'zod';

export interface ParsedEsrScores {
  excellence: number;
  impact: number;
  implementation: number;
  total: number;
  threshold: number;
  passed: boolean;
  strengths: string[];
  weaknesses: string[];
}

export const parsedEsrScoresSchema = z.object({
  excellence: z.number().min(0).max(5),
  impact: z.number().min(0).max(5),
  implementation: z.number().min(0).max(5),
  total: z.number().min(0).max(15),
  threshold: z.number().min(0).max(15).default(10.0),
  passed: z.boolean().default(true),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
});

const ESR_PARSER_PROMPT = `Analyze the following EU Horizon Europe Evaluation Summary Report (ESR) text.
Extract the criteria marks and qualitative comments.

Return ONLY valid JSON with keys:
- excellence: number (0.0 to 5.0)
- impact: number (0.0 to 5.0)
- implementation: number (0.0 to 5.0)
- total: number (0.0 to 15.0)
- threshold: number (default 10.0)
- passed: boolean (true if total >= threshold and all subcriteria >= 3.0)
- strengths: string[]
- weaknesses: string[]

ESR Document Text:
"""
{{documentText}}
"""`;

/**
 * Parses ESR text content using LLM and returns structured scores.
 *
 * `tenantId` is required and is asserted, never defaulted. This used to pass
 * `tenantId || 'system'`, and an ESR parse is charged work: `generateText`
 * writes an `AiUsageLog` row (tenant-scoped, FORCE RLS) and a `CreditLedger`
 * row for the same tenant, so a fabricated id books usage against a tenant that
 * does not exist. `PLATFORM_SCOPE_TENANT_ID` is deliberately NOT used here
 * either — it is declared for the zero-credit `embedText` path, and its own
 * docstring rests on "no CreditLedger row is ever written against it"
 * (`CreditLedger.tenantId` is a real FK to `Tenant`). On this path it would
 * fail twice over: the balance read returns 0 and the caller is told it is out
 * of credits, and were it ever funded the ledger insert would break the FK
 * *after* the provider had been paid. Every caller has a tenant — the session
 * one, or an explicit override — so the missing case is a caller bug, refused
 * before the model is called and before anything is spent.
 */
export async function parseEsrDocumentText(
  documentText: string,
  tenantId: string,
  userId?: string
): Promise<ParsedEsrScores> {
  if (!documentText || documentText.trim().length === 0) {
    throw new Error('ESR document text is empty');
  }
  assertTenantScope(tenantId, 'parseEsrDocumentText');

  const prompt = ESR_PARSER_PROMPT.replace('{{documentText}}', documentText.slice(0, 8000));

  const resultStr = await generateText({
    tenantId,
    userId,
    module: 'M6',
    purpose: 'esr-parser',
    prompt,
    system: 'You are an EU Horizon Europe ESR document parser. Return ONLY valid JSON.',
  });

  let raw: unknown;
  try {
    raw = JSON.parse(resultStr.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    throw new Error('Failed to parse AI output into valid ESR score JSON');
  }

  return parsedEsrScoresSchema.parse(raw);
}

/**
 * Parses ESR document text and saves the structured ESR scores to the Proposal record in DB.
 */
export async function extractAndSaveEsrScores(
  proposalId: string,
  documentText: string,
  tenantIdOverride?: string
): Promise<ParsedEsrScores> {
  let tenantId = tenantIdOverride;
  if (!tenantId) {
    const session = await requireTenantAction();
    tenantId = session.tenantId;
  }

  const parsedScores = await parseEsrDocumentText(documentText, tenantId);

  await withTenant(tenantId, async (tx: TenantTx) => {
    const proposal = await tx.proposal.findFirst({
      where: { id: proposalId, tenantId },
      select: { id: true },
    });

    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found in workspace`);
    }

    await tx.proposal.update({
      where: { id: proposalId },
      data: {
        esrScores: parsedScores as unknown as object,
        outcome: parsedScores.passed ? 'above_threshold' : 'below',
      },
    });
  });

  return parsedScores;
}
