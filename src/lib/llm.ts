/**
 * LLM adapter — the ONE entry point every Fabrika LLM call goes through
 * (CLAUDE.md rule 5).
 *
 * Until TASK-MTSXGXBCJ007W there were two: this file and `src/lib/ai/llm.ts`.
 * They were not a cosmetic duplicate — they priced the same call differently
 * (`max(1, total/10K)` vs `in/1K + 3×out/1K`), so a 4.000/1.000-token call cost
 * 1 credit through one and 7 through the other, inside the same module (M2:
 * `m2/server/actions.ts` vs the concept-notes screen). They also defaulted to
 * different models and hashed prompts to different lengths, so an audit could
 * not tie the two sets of rows together. The second adapter is gone; everything
 * below is the only place that talks to a provider, writes `AiUsageLog` and
 * moves `CreditLedger`.
 */

import { prisma } from '@/lib/db';
import crypto from 'crypto';
import type { TenantTx } from '@/lib/db';
import { env } from '@/lib/env';
import { errorStatus } from '@/lib/errors';

export type LlmProvider = 'anthropic' | 'openai';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const DEFAULT_PROVIDER: LlmProvider = 'anthropic';

/**
 * One default per provider — the merge had to pick one of the two the old
 * adapters carried (`claude-3-5-sonnet-20240620` and `claude-sonnet-4-20250514`).
 * Neither is current, both are Sonnet-class, and `claude-sonnet-5` is the
 * same-class successor that is *cheaper per token than either* ($2/$10 per MTok
 * against Sonnet 4's $3/$15), so no call site gets more expensive to serve. A
 * move to Opus-class is a separate, measured decision — not a side effect of
 * deleting a duplicate file.
 */
const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
};

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Tokens per credit.
 *
 * This is the formula `src/lib/ai/llm.ts` charged at 6 of the 7 production call
 * sites, kept deliberately: unifying on the *other* formula would have raised
 * the price 7× at those six sites with no announcement, which is a commercial
 * decision and not one a refactor gets to make. The seventh (concept notes) gets
 * cheaper, which harms no tenant.
 *
 * It is not the last word. `docs/BILLING.md` §"Kredi maliyeti" sells a *third*
 * model — a flat credit per action (M2 draft 1, M6 evaluation 3, M9 brief 1,
 * M10 document 1, M11 section 2, M1 profile summary 1, M3 source summary 1) —
 * which no code has ever implemented, and two of the call sites here (M7
 * `tto_ip_checklist`, M6 `esr-parser`) have no published figure at all. Aligning
 * code with the published table is an open decision on the card; when it lands
 * it changes `creditsForUsage` and nothing else.
 */
const TOKENS_PER_CREDIT = 10_000;

export interface LlmCompletion {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** Credits actually charged for this call — the number the ledger moved by. */
  credits: number;
  provider: string;
  model: string;
}

/** What a caller asks for. `prompt`+`system` and `messages` are alternatives. */
export type LlmGenerateOptions = {
  tenantId: string;
  userId?: string;
  /** Module or layer id the call is booked to, e.g. `M6`. */
  module: string;
  /** What the call was for, e.g. `evaluation`. */
  purpose: string;
  proposalId?: string;
  section?: string;
  model?: string;
  provider?: LlmProvider;
  maxTokens?: number;
} & (
  | { prompt: string; system?: string; messages?: never }
  | { messages: LlmMessage[]; prompt?: never; system?: never }
);

/** A provider rejection that still carries its HTTP status, so retry can classify it. */
export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

/**
 * Exponential backoff. Kept from `src/lib/ai/llm.ts`: the surviving adapter had
 * no retry at all, so merging into it without this would have been a regression
 * at the six call sites that used to have one.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      // An error with no status is not a client error, so it stays retryable.
      const status = errorStatus(error);
      const isClientError = status !== undefined && status !== 429 && status >= 400 && status < 500;
      if (attempt > maxRetries || isClientError) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`[AI Retry] Attempt ${attempt} failed with ${status}. Retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

/**
 * The provider key, or a hard failure. Called once before the retry loop as
 * well: a missing key is a configuration fault, and retrying it three times
 * with backoff only delays the same error by seven seconds.
 */
function requireApiKey(provider: LlmProvider): string {
  const apiKey = provider === 'anthropic' ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(`${provider === 'anthropic' ? 'ANTHROPIC' : 'OPENAI'}_API_KEY not set`);
  }
  return apiKey;
}

/** The text a response carries, found by block type. */
function textFromAnthropicContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  // NOT `content[0]` — the current models return thinking blocks first, so an
  // index lookup silently yields an empty draft instead of the answer.
  for (const block of content) {
    if (
      typeof block === 'object' && block !== null &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      return (block as { text: string }).text;
    }
  }
  return '';
}

async function callProvider(
  messages: LlmMessage[],
  opts: { provider: LlmProvider; model: string; maxTokens: number }
): Promise<Omit<LlmCompletion, 'credits'>> {
  const { provider, model, maxTokens } = opts;

  if (provider === 'anthropic') {
    const apiKey = requireApiKey('anthropic');

    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role, content: m.content }));

    // `temperature` is deliberately NOT sent. The old adapter sent it on every
    // call (default 0.7); the current Anthropic models removed the sampling
    // parameters and reject a request that carries one with a 400.
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
        system: systemMsg,
        messages: userMessages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmProviderError(`Anthropic API error ${res.status}: ${body}`, res.status);
    }

    const data = await res.json();
    return {
      text: textFromAnthropicContent(data?.content),
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0,
      provider: 'anthropic',
      model,
    };
  }

  if (provider === 'openai') {
    const apiKey = requireApiKey('openai');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmProviderError(`OpenAI API error ${res.status}: ${body}`, res.status);
    }

    const data = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content || '',
      inputTokens: data?.usage?.prompt_tokens || 0,
      outputTokens: data?.usage?.completion_tokens || 0,
      provider: 'openai',
      model,
    };
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Credits charged for one generation. The single seam the pricing decision
 * lands on — see {@link TOKENS_PER_CREDIT}. Pure, so it is unit-testable and no
 * caller may re-derive it: the number a screen shows the user must come from
 * here (or from the `AiUsageLog` row), never from a second copy of the maths.
 */
export function creditsForUsage(inputTokens: number, outputTokens: number): number {
  return Math.max(1, Math.ceil((inputTokens + outputTokens) / TOKENS_PER_CREDIT));
}

/**
 * `promptHash` for an `AiUsageLog` row: sha256, full 64 hex digits, over every
 * message including the system prompt.
 *
 * The two old adapters disagreed on *both* halves of this — one hashed only the
 * user prompt at 64 digits, the other every message at 16 — so the same prompt
 * produced two unrelatable hashes and an audit could not join the two sets of
 * rows. Only the hash is ever stored; the prompt text itself never reaches the
 * database.
 */
function hashMessages(messages: LlmMessage[]): string {
  return crypto
    .createHash('sha256')
    .update(messages.map(m => `${m.role}:${m.content}`).join('\n'))
    .digest('hex');
}

/** Normalise either input shape into the message list the provider is sent. */
function toMessages(options: LlmGenerateOptions): LlmMessage[] {
  if (options.messages) return options.messages;
  const messages: LlmMessage[] = [];
  if (options.system) messages.push({ role: 'system', content: options.system });
  messages.push({ role: 'user', content: options.prompt });
  return messages;
}

/** Current credit balance for a tenant. */
export async function getCreditBalance(tenantId: string): Promise<number> {
  const result = await prisma.creditLedger.aggregate({
    where: { tenantId },
    _sum: { delta: true },
  });
  return result._sum.delta || 0;
}

/**
 * Call the model, record the call in `AiUsageLog`, deduct the credits.
 *
 * Throws when the tenant has no credits left, and when the provider rejects the
 * request after retries. Returns the usage the call actually produced —
 * including the credits charged — so a caller that wants to show the cost reads
 * it from here instead of recomputing the formula.
 */
export async function generateCompletion(options: LlmGenerateOptions): Promise<LlmCompletion> {
  const balance = await getCreditBalance(options.tenantId);
  if (balance <= 0) {
    throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
  }

  const provider = options.provider || DEFAULT_PROVIDER;
  const model = options.model || DEFAULT_MODELS[provider];
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const messages = toMessages(options);

  requireApiKey(provider);
  const result = await withRetry(() => callProvider(messages, { provider, model, maxTokens }));

  const credits = creditsForUsage(result.inputTokens, result.outputTokens);
  const promptHash = hashMessages(messages);

  await prisma.$transaction(async (tx: TenantTx) => {
    await tx.aiUsageLog.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId,
        module: options.module,
        purpose: options.purpose,
        provider: result.provider,
        model: result.model,
        promptHash,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        credits,
        proposalId: options.proposalId,
        section: options.section,
      },
    });
    await tx.creditLedger.create({
      data: {
        tenantId: options.tenantId,
        delta: -credits,
        reason: `usage:${options.module}`,
        refId: options.proposalId,
      },
    });
  });

  return { ...result, credits };
}

/**
 * The generated text alone — the shape almost every call site wants.
 * A thin wrapper over {@link generateCompletion}; there is no second path.
 */
export async function generateText(options: LlmGenerateOptions): Promise<string> {
  const result = await generateCompletion(options);
  return result.text;
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
