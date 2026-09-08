/**
 * LLM Adapter — Anthropic + OpenAI-compatible interface
 * Abstracts provider details and logs usage to AiUsageLog + deducts credits.
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';
import type { TenantTx } from '@/lib/db';
import { env } from '@/lib/env';

export type LlmProvider = 'anthropic' | 'openai';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  provider?: LlmProvider;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: string;
  model: string;
}

const DEFAULT_PROVIDER: LlmProvider = 'anthropic';
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

// Credit cost per 1K tokens (configurable per tenant later)
const CREDITS_PER_1K_INPUT = 1;
const CREDITS_PER_1K_OUTPUT = 3;

/**
 * Call an LLM and return the response text.
 */
async function callProvider(
  messages: LlmMessage[],
  opts: Required<Pick<LlmOptions, 'provider' | 'model' | 'maxTokens' | 'temperature'>>
): Promise<LlmResult> {
  const { provider, model, maxTokens, temperature } = opts;

  if (provider === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role,
      content: m.content,
    }));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemMsg,
        messages: userMessages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return {
      text: data.content?.[0]?.text || '',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      provider: 'anthropic',
      model,
    };
  }

  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || '',
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      provider: 'openai',
      model,
    };
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Calculate credit cost from token usage.
 */
function calculateCredits(inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens / 1000) * CREDITS_PER_1K_INPUT
       + Math.ceil(outputTokens / 1000) * CREDITS_PER_1K_OUTPUT;
}

/**
 * Get current credit balance for a tenant.
 */
export async function getCreditBalance(tenantId: string): Promise<number> {
  const result = await prisma.creditLedger.aggregate({
    where: { tenantId },
    _sum: { delta: true },
  });
  return result._sum.delta || 0;
}

/**
 * High-level function: call LLM, log usage, deduct credits.
 * Throws if tenant has insufficient credits.
 */
export async function generateWithAI(
  tenantId: string,
  userId: string,
  messages: LlmMessage[],
  meta: { module: string; purpose: string; proposalId?: string; section?: string },
  opts?: LlmOptions
): Promise<LlmResult> {
  // 1. Check credit balance
  const balance = await getCreditBalance(tenantId);
  if (balance <= 0) {
    throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
  }

  const provider = opts?.provider || DEFAULT_PROVIDER;
  const model = opts?.model || DEFAULT_MODELS[provider];
  const maxTokens = opts?.maxTokens || 4096;
  const temperature = opts?.temperature || 0.7;

  // 2. Call LLM
  const result = await callProvider(messages, { provider, model, maxTokens, temperature });

  // 3. Calculate credits
  const credits = calculateCredits(result.inputTokens, result.outputTokens);

  // 4. Log usage + deduct credits in a transaction
  const promptHash = crypto.createHash('sha256')
    .update(messages.map(m => m.content).join(''))
    .digest('hex')
    .slice(0, 16);

  await prisma.$transaction(async (tx: TenantTx) => {
    await tx.aiUsageLog.create({
      data: {
        tenantId,
        userId,
        module: meta.module,
        purpose: meta.purpose,
        provider: result.provider,
        model: result.model,
        promptHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        credits,
        proposalId: meta.proposalId,
        section: meta.section,
      },
    });
    await tx.creditLedger.create({
      data: {
        tenantId,
        delta: -credits,
        reason: `usage:${meta.module}`,
        refId: meta.proposalId,
      },
    });
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Embeddings
//
// The RAG path used to call OpenAI directly from `src/lib/rag.ts` and
// `src/lib/ai/rag.ts`, so the full text of every uploaded document left the
// building in 1000-character chunks and left *zero* rows behind: no tenant, no
// promptHash, no record at all (TASK-MTSWVADF7RQ1B). That breaks CLAUDE.md rule
// 5 and, because a document upload is personal data processing, GDPR art. 30's
// record of processing activities. Both files now go through `embedText` below,
// which is the same choke point `generateWithAI` uses — one AiUsageLog row per
// call that actually reaches the provider.
// ─────────────────────────────────────────────────────────────────────────────

/** Default embedding model. 1536 dimensions is what `Chunk.embedding` is declared as. */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Written to `AiUsageLog.tenantId` for a call that genuinely belongs to no
 * tenant — ingesting the shared CORDIS corpus, or a platform admin uploading a
 * work programme (`Document.tenantId IS NULL` means "shared public").
 *
 * This is a declared scope, not a stand-in for a tenant we failed to look up.
 * `AiUsageLog.tenantId` is `String` (non-null) and this card may not touch
 * prisma/schema.prisma, so the alternative was to skip logging platform calls
 * altogether — which is exactly the hole being closed. The reserved form cannot
 * collide with a real id: tenant ids here are cuids or slugs (`demo-tenant`),
 * never underscore-wrapped. Because it matches no `Tenant` row it is invisible
 * to every tenant under the RLS policy on AiUsageLog, and no CreditLedger row is
 * ever written against it (CreditLedger.tenantId is a real FK).
 *
 * The proper fix is `AiUsageLog.tenantId String?`; see the result report.
 */
export const PLATFORM_SCOPE_TENANT_ID = '__platform__';

/** Who a provider call is attributed to in `AiUsageLog`. */
export interface AiCallAttribution {
  /** `null` = platform scope; recorded as {@link PLATFORM_SCOPE_TENANT_ID}. */
  tenantId: string | null;
  userId?: string;
  /** Layer/module id, e.g. `K6` for the shared AI layer, `M2` for a module. */
  module: string;
  /** What the call was for, e.g. `rag_ingest_embedding`. */
  purpose: string;
}

/**
 * Thrown when the provider call succeeded but its AiUsageLog row could not be
 * written. Kept distinct so a caller with an embedding fallback (`getEmbedding`)
 * cannot quietly swallow it: data has already left for the provider at that
 * point, and silently continuing would recreate the unrecorded-processing hole.
 */
export class AiUsageLogWriteError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AiUsageLogWriteError';
  }
}

/** Only ever the hash reaches the database — never the text that was embedded. */
function hashPrompt(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Embed one string via OpenAI and record the call in `AiUsageLog`.
 *
 * Throws if `OPENAI_API_KEY` is unset or the provider rejects the request, so
 * nothing is logged for a call that never happened. Callers that want a
 * dev/demo fallback catch that themselves (see `getEmbedding`).
 *
 * `credits` is deliberately `0`: docs/BILLING.md §"Kredi maliyeti" prices M1,
 * M2, M3, M6, M9, M10 and M11 actions and says nothing about embeddings, and
 * CLAUDE.md rule 7 forbids inventing a figure to show a user. The usage row
 * carries the real token count, so a coefficient can be applied later without
 * losing today's data.
 */
export async function embedText(
  text: string,
  attribution: AiCallAttribution,
  opts?: { model?: string; dimensions?: number }
): Promise<number[]> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const model = opts?.model || DEFAULT_EMBEDDING_MODEL;
  const dimensions = opts?.dimensions ?? EMBEDDING_DIMENSIONS;

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text, dimensions }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const embedding: number[] | undefined = data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('OpenAI embeddings returned no vector');
  }

  // The request has been made — the record is now mandatory, not best-effort.
  try {
    await prisma.aiUsageLog.create({
      data: {
        tenantId: attribution.tenantId ?? PLATFORM_SCOPE_TENANT_ID,
        userId: attribution.userId,
        module: attribution.module,
        purpose: attribution.purpose,
        provider: 'openai',
        model,
        promptHash: hashPrompt(text),
        inputTokens: data?.usage?.prompt_tokens ?? 0,
        outputTokens: 0,
        credits: 0,
      },
    });
  } catch (e) {
    console.error('[embedText] AiUsageLog write failed after a provider call', e);
    throw new AiUsageLogWriteError(
      'Embedding call completed but its AiUsageLog row could not be written',
      e
    );
  }

  return embedding;
}
