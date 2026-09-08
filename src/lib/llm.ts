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

import { aiCreditEntry } from '@/lib/billing/catalog';
import { withTenant } from '@/lib/db';
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
 * Model overrides, keyed `module` or `module:purpose` (the pair wins).
 *
 * Lives here rather than at the call site so a module never names a model
 * string: which model serves which action is this file's business, and a
 * provider migration is then one table, not a grep.
 *
 * M6 evaluation is the only entry. It is the product's most expensive action
 * (3 credits against 1 everywhere else) and the one whose output is scored
 * against a real Commission rubric, so it is served by the Opus-class model.
 * ASSUMPTION, revertible in one line: this was put to the owner with the
 * option-C decision and drew no objection — it is not a ruling in writing.
 */
const MODEL_OVERRIDES: Readonly<Record<string, string>> = {
  'M6:evaluation': 'claude-opus-5',
};


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
 * An AI action nobody has priced. Refused rather than defaulted.
 *
 * The tempting fallbacks are both wrong: returning 0 gives away provider spend
 * on the house and leaves a 0-credit row that looks deliberate in an audit;
 * returning 1 invents a price and charges a tenant a figure no document sells,
 * which is the exact class of defect this card exists to remove. So an unpriced
 * action fails, loudly, before any money is spent — see `resolveCredits`.
 */
export class UnpricedAiActionError extends Error {
  constructor(readonly module: string, readonly purpose: string) {
    super(
      `No credit price for AI action "${module}:${purpose}". Add it to ` +
        `AI_ACTION_CREDITS in src/lib/billing/catalog.ts and to docs/BILLING.md §1.`
    );
    this.name = 'UnpricedAiActionError';
  }
}

/** What the ledger moves by for one generation, and where the figure came from. */
export interface AiCreditQuote {
  credits: number;
  /** `false` when the figure is the lead's proposal, not a sold price. */
  published: boolean;
}

/**
 * Credits charged for one generation — read from the published catalogue, not
 * computed from the response.
 *
 * The single seam the pricing decision lands on. Before TASK-MTSXGXBCJ007W this
 * was `max(1, ceil((in+out)/10_000))`, so what a tenant paid for the *same*
 * button depended on how verbose the model happened to be that afternoon, and
 * docs/BILLING.md's "M6 değerlendirme 3 kredi" was a promise no code kept. The
 * figure now comes from `AI_ACTION_CREDITS`, which is what §1 prints.
 *
 * `inputTokens`, `outputTokens` and `model` are accepted and deliberately do
 * not affect the result. They stay in the signature because every one of them
 * is still written to the `AiUsageLog` row, and because a usage-based
 * coefficient — if the owner ever wants one — belongs in this function rather
 * than in a second one; keeping the inputs here means adding it is an edit, not
 * a new call-site contract.
 */
export function creditsForUsage(params: {
  module: string;
  purpose: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}): number {
  return resolveCredits(params.module, params.purpose).credits;
}

/**
 * The quote behind {@link creditsForUsage}, including whether the figure is one
 * the customer has been shown. Throws {@link UnpricedAiActionError} for an
 * action with no entry.
 */
export function resolveCredits(module: string, purpose: string): AiCreditQuote {
  const entry = aiCreditEntry(module, purpose);
  if (!entry) throw new UnpricedAiActionError(module, purpose);
  return { credits: entry.credits, published: entry.approval === 'published' };
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

/**
 * Current credit balance for a tenant.
 *
 * Goes through `withTenant` because `CreditLedger` is FORCE RLS: outside the
 * wrapper `app.tenant_id` is unset, `"tenantId" = current_setting(...)` is NULL
 * for every row, and the aggregate reads a confident `0` rather than failing.
 * That is the worst shape a bug can take — it does not throw, it silently says
 * the tenant is out of credits (TASK-MTSYH8LDGV5YU).
 */
export async function getCreditBalance(tenantId: string): Promise<number> {
  const result = await withTenant(tenantId, (tx) =>
    tx.creditLedger.aggregate({
      where: { tenantId },
      _sum: { delta: true },
    })
  );
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
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
  const messages = toMessages(options);

  // Explicit > override table > provider default. The override only applies to
  // the provider it was written for; asking for OpenAI must not silently send
  // an Anthropic model id.
  const overridden = provider === DEFAULT_PROVIDER
    ? MODEL_OVERRIDES[`${options.module}:${options.purpose}`] ?? MODEL_OVERRIDES[options.module]
    : undefined;
  const model = options.model || overridden || DEFAULT_MODELS[provider];

  // Priced BEFORE the provider is called, and deliberately so. Since
  // TASK-MTSXGXBCJ007W the price no longer depends on the response, so an
  // action with no catalogue entry can be refused while it is still free to
  // refuse it. Resolving afterwards would mean paying the provider for a call
  // we then cannot bill or even log.
  const { credits } = resolveCredits(options.module, options.purpose);

  requireApiKey(provider);
  const result = await withRetry(() => callProvider(messages, { provider, model, maxTokens }));

  const promptHash = hashMessages(messages);

  // `withTenant`, not a bare `$transaction`: both tables below are FORCE RLS
  // and their WITH CHECK compares "tenantId" to app.tenant_id, which only
  // `withTenant` sets. A bare transaction is refused outright (42501).
  await withTenant(options.tenantId, async (tx: TenantTx) => {
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
  const scope = attribution.tenantId ?? PLATFORM_SCOPE_TENANT_ID;
  try {
    // `withTenant(scope)` and not the global client: AiUsageLog is FORCE RLS, so
    // an INSERT with app.tenant_id unset is refused (42501) no matter how well
    // formed the row is. The platform scope goes through the same wrapper — it
    // matches no Tenant row, but the policy compares strings, not foreign keys,
    // so `app.tenant_id = '__platform__'` satisfies the WITH CHECK exactly.
    await withTenant(scope, (tx) =>
      tx.aiUsageLog.create({
        data: {
          tenantId: scope,
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
      })
    );
  } catch (e) {
    console.error('[embedText] AiUsageLog write failed after a provider call', e);
    throw new AiUsageLogWriteError(
      'Embedding call completed but its AiUsageLog row could not be written',
      e
    );
  }

  return embedding;
}
