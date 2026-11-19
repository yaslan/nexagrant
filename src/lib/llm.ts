/**
 * LLM adapter — the ONE entry point every FonBridge LLM call goes through
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
import { assertNgAiQuota } from '@/lib/billing/nexagrant/usage';
import { recordAlert } from '@/lib/observability/system-alert';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import type { TenantTx } from '@/lib/db';
import { declaredNodeEnv, env } from '@/lib/env';
import { errorStatus } from '@/lib/errors';
import { LLM_REFUSED_DIGEST, LLM_TRUNCATED_DIGEST } from '@/lib/llm-outcome';

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
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
};

const DEFAULT_MAX_TOKENS = 4096;

/**
 * Output-token ceilings, keyed `module` or `module:purpose` (the pair wins),
 * for the actions that write whole documents (TASK-MUN4PSBP19RKK).
 *
 * At 4096 the default model cut M10 AWARD_PACK off in 2 of 3 runs, and M7 and
 * M10 NDA sat at 3.3K–3.8K median — one verbose afternoon from the same cut
 * (docs/agent-results/TASK-MUN3FWZWT11MX-se-fb.md §2). `max_tokens` is a
 * ceiling, not a charge: the provider bills the tokens actually generated, so
 * raising it changes nothing for a call that already finished and costs only
 * the tail a truncated call used to lose. 8192 is ~2x the longest measured
 * complete document, and keeps a worst-case non-streaming call near 90 s.
 */
/**
 * M17 pre-assessment (FO-188): one JSON object with strengths, weaknesses and
 * quoted evidence for each of 12–14 criteria plus a rewrite. 12288 cut the Turkish
 * run mid-object (stop_reason max_tokens, FO-188 round 2), so both evaluate calls
 * take 24576; the ceiling is a cap, not a charge.
 */
const M17_EVALUATE_MAX_TOKENS = 24576;

const MAX_TOKENS_OVERRIDES: Readonly<Record<string, number>> = {
  M7: 8192,
  M10: 8192,
  'M17:evaluate-attempt': M17_EVALUATE_MAX_TOKENS,
  'M17:evaluate-retry': M17_EVALUATE_MAX_TOKENS,
};

/** Output ceiling for one call: explicit > per-action table > default. */
export function maxTokensFor(module: string, purpose: string, explicit?: number): number {
  return explicit || MAX_TOKENS_OVERRIDES[`${module}:${purpose}`] || MAX_TOKENS_OVERRIDES[module] || DEFAULT_MAX_TOKENS;
}

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
  /**
   * Why the provider stopped, as it reported it (`end_turn`, `stop_sequence`,
   * OpenAI `stop`, …). A returned completion always *finished*: a truncated
   * or refused one is thrown as {@link LlmTruncatedError} /
   * {@link LlmRefusalError} instead, so no caller can mistake half a document
   * for a whole one. `null` when the provider sent none.
   */
  stopReason: string | null;
}

/** What a generation amounted to, read from the provider's stop reason. */
type LlmOutcome = 'complete' | 'truncated' | 'refused';

/** One provider answer before billing — the completion plus how it ended. */
type ProviderResult = Omit<LlmCompletion, 'credits'> & { outcome: LlmOutcome };

/**
 * Map a provider stop reason onto the three outcomes the adapter acts on.
 *
 * Only the reasons that mean "unusable" are listed; everything else —
 * including an absent reason — is treated as a finished answer, which is how
 * this adapter behaved for every reason before it read the field at all.
 * `pause_turn` / `tool_use` cannot occur: no call site sends tools.
 */
function outcomeOf(provider: LlmProvider, stopReason: string | null): LlmOutcome {
  if (provider === 'anthropic') {
    if (stopReason === 'max_tokens' || stopReason === 'model_context_window_exceeded') return 'truncated';
    if (stopReason === 'refusal') return 'refused';
    return 'complete';
  }
  if (stopReason === 'length') return 'truncated';
  if (stopReason === 'content_filter') return 'refused';
  return 'complete';
}

/** What an unusable generation reports, whichever of the two it was. */
interface LlmOutcomeDetail {
  module: string;
  purpose: string;
  provider: string;
  model: string;
  stopReason: string | null;
  outputTokens: number;
  maxTokens: number;
}

/**
 * The model hit the output ceiling before finishing. Nothing was charged; the
 * call is still in `AiUsageLog` (credits 0), because the prompt did reach the
 * provider. `digest` is what the browser receives (src/lib/llm-outcome.ts).
 */
export class LlmTruncatedError extends Error {
  readonly digest = LLM_TRUNCATED_DIGEST;
  readonly code = LLM_TRUNCATED_DIGEST;
  constructor(readonly detail: LlmOutcomeDetail) {
    super(
      `AI output for ${detail.module}:${detail.purpose} was cut off at the length limit ` +
        `(${detail.outputTokens}/${detail.maxTokens} tokens, stop_reason ${detail.stopReason}). ` +
        `Nothing was saved and no credit was charged.`
    );
    this.name = 'LlmTruncatedError';
  }
}

/**
 * The model or a provider safety classifier declined. Nothing was charged; the
 * call is still in `AiUsageLog` (credits 0). Not retried: the same prompt is
 * declined the same way.
 */
export class LlmRefusalError extends Error {
  readonly digest = LLM_REFUSED_DIGEST;
  readonly code = LLM_REFUSED_DIGEST;
  constructor(
    readonly detail: LlmOutcomeDetail,
    /** `stop_details.category` when the provider gave one — informational only. */
    readonly category: string | null
  ) {
    super(
      `AI request for ${detail.module}:${detail.purpose} was declined by the model ` +
        `(stop_reason ${detail.stopReason}${category ? `, category ${category}` : ''}). No credit was charged.`
    );
    this.name = 'LlmRefusalError';
  }
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
  /** Epoch ms after which the provider request is abandoned and not retried. Unset: no limit. */
  deadlineAt?: number;
  /**
   * The caller reserved this run's price before the first call (`reserveAiAction`, FO-274), so
   * `generateCompletion` does not reserve it again. Without the flag `generateCompletion` reserves
   * the price itself, under the tenant credit lock, before the provider is called (FO-288).
   */
  creditsReserved?: boolean;
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
  baseDelay: number = 1000,
  deadlineAt?: number,
  signal?: AbortSignal
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
      // Past the deadline, or once the request's signal has fired (the clock and the signal can
      // disagree by a tick), a retry can only be cut off again, so it is not made.
      const pastDeadline = (deadlineAt !== undefined && Date.now() >= deadlineAt) || signal?.aborted === true;
      if (attempt > maxRetries || isClientError || pastDeadline) {
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

/**
 * The abort signal for one provider request. No deadline, no signal: callers that
 * set none keep the unbounded request they always had.
 */
function signalUntil(deadlineAt: number | undefined): AbortSignal | undefined {
  if (deadlineAt === undefined) return undefined;
  return AbortSignal.timeout(Math.max(1, deadlineAt - Date.now()));
}

// ── NG-209: the e2e fake provider ──────────────────────────────────────────────────────────────

type FakeAiEnv = { E2E_FAKE_AI?: string; NODE_ENV?: string };

/**
 * Whether this code was BUILT for production (`next build`). A direct `process.env.NODE_ENV` read
 * is replaced by a literal at build time, so starting a production build with another NODE_ENV
 * cannot change it — the same lock src/lib/demo-login.ts uses. Deliberately not a parameter of the
 * functions below (NG-209 sec F6): no caller can pass it open; tests load this module afresh
 * under a chosen NODE_ENV instead.
 */
const BUILT_FOR_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * The flag and NODE_ENV as the process declared them. `declaredNodeEnv`, not `env.NODE_ENV`: the
 * schema defaults an absent NODE_ENV to 'development', which would open the fake where nobody said
 * which environment this is. Read lazily, only once the flag is on.
 */
function currentFakeAiEnv(): FakeAiEnv {
  if (env.E2E_FAKE_AI !== 'true') return { E2E_FAKE_AI: env.E2E_FAKE_AI };
  return { E2E_FAKE_AI: env.E2E_FAKE_AI, NODE_ENV: declaredNodeEnv };
}

/** Default-deny: the only environments the fake may answer in. Anything else, unset included, is not one. */
function fakeAiEnvironmentAllowed(source: FakeAiEnv): boolean {
  return !BUILT_FOR_PRODUCTION && (source.NODE_ENV === 'development' || source.NODE_ENV === 'test');
}

/**
 * `E2E_FAKE_AI=true` — on the e2e web server (playwright.config.ts) the M18 calls listed in
 * {@link FAKE_ANSWERS} are answered by {@link fakeProviderAnswer} instead of a provider: no key, no
 * `fetch`, no model. Every other call — any other module, any other purpose — takes the real path
 * it takes without the flag (NG-209 sec F4). Everything around the provider request stays real:
 * the price, the reservation, the refund, the AiUsageLog row (provider `fake`, model `fake-e2e`).
 * The M18 website reader follows the same flag (enrichment.ts → site-fetch.ts `fakeSiteDeps`).
 *
 * Default-deny (NG-209 sec F1): on only for the literal flag `true`, in a build that is not a
 * production build, with NODE_ENV explicitly `development` or `test`. Every other NODE_ENV —
 * production, staging, preview, blank, unset — keeps it off, and {@link assertFakeAiAllowed}
 * refuses to start such a server with the flag on (src/instrumentation.ts).
 */
export function fakeAiEnabled(): boolean {
  return fakeAiEnabledFor(currentFakeAiEnv());
}

function fakeAiEnabledFor(source: FakeAiEnv): boolean {
  return source.E2E_FAKE_AI === 'true' && fakeAiEnvironmentAllowed(source);
}

/**
 * Tests only: {@link fakeAiEnabled} over a given flag/NODE_ENV pair. The exported checks take no
 * parameter (NG-209 sec F6), so production code cannot hand them a NODE_ENV of its choosing.
 */
export function testOnlyFakeAiEnabled(source: FakeAiEnv): boolean {
  return fakeAiEnabledFor(source);
}

export class FakeAiNotAllowedError extends Error {
  constructor(nodeEnv: string | undefined) {
    super(
      `E2E_FAKE_AI=true is allowed only on a development or test server (NODE_ENV=development or test, not a production build); this one has NODE_ENV=${nodeEnv === undefined ? '(unset)' : nodeEnv === '' ? '(blank)' : nodeEnv}${BUILT_FOR_PRODUCTION ? ' in a production build' : ''}. The M18 AI answers would come from the e2e fake provider, not a model. Remove the flag; the server will not start with it.`
    );
    this.name = 'FakeAiNotAllowedError';
  }
}

/** Run once at server start (src/instrumentation.ts): with the flag on, anything but a development or test server does not start. */
export function assertFakeAiAllowed(): void {
  assertFakeAiAllowedFor(currentFakeAiEnv());
}

function assertFakeAiAllowedFor(source: FakeAiEnv): void {
  if (source.E2E_FAKE_AI === 'true' && !fakeAiEnvironmentAllowed(source)) {
    throw new FakeAiNotAllowedError(source.NODE_ENV);
  }
}

/** Tests only: {@link assertFakeAiAllowed} over a given flag/NODE_ENV pair (sec F6). */
export function testOnlyAssertFakeAiAllowed(source: FakeAiEnv): void {
  assertFakeAiAllowedFor(source);
}

const FAKE_MODEL = 'fake-e2e';

/**
 * Canned answers by `module:purpose`, shaped like what the caller parses. Each one names the flag,
 * so a fake answer on screen cannot be mistaken for a model's. This list IS the scope of the fake
 * (NG-209 sec F4): M18 only, and only these purposes; there is no answer for anything else.
 */
const FAKE_ANSWERS: Readonly<Record<string, string>> = {
  'M18:enrich-organization-attempt': JSON.stringify({
    legalName: 'Acme Teknoloji A.Ş. (E2E_FAKE_AI)',
    district: 'Çankaya',
    sizeBand: 'SMALL',
    themes: ['dijital dönüşüm'],
    sectorCodes: ['J62.01'],
    sources: [],
  }),
  'M18:eligibility-pre-report-attempt':
    '### Özet / Summary\nE2E_FAKE_AI: sahte sağlayıcı yanıtı, hiçbir modele gidilmedi. / Fake provider answer; no model was called.',
};
/** The canned answer for this call, or undefined: the fake answers only what {@link FAKE_ANSWERS} lists. */
function fakeAnswerFor(module: string, purpose: string): string | undefined {
  return Object.hasOwn(FAKE_ANSWERS, `${module}:${purpose}`) ? FAKE_ANSWERS[`${module}:${purpose}`] : undefined;
}

/** The fake provider: a complete answer, at once, with no request made. */
function fakeProviderAnswer(
  canned: string,
  module: string,
  purpose: string,
  messages: LlmMessage[],
): ProviderResult & { refusalCategory?: string | null } {
  // M18 enrichment cites only pages it was given: the first `URL: ` line of the prompt, if any.
  let text = canned;
  if (module === 'M18' && purpose === 'enrich-organization-attempt') {
    const url = messages.map((m) => /^URL: (\S+)$/m.exec(m.content)?.[1]).find(Boolean);
    if (url) text = JSON.stringify({ ...JSON.parse(text), sources: [url] });
  }
  return {
    text,
    inputTokens: 0,
    outputTokens: 0,
    provider: 'fake',
    model: FAKE_MODEL,
    stopReason: 'end_turn',
    outcome: 'complete',
    refusalCategory: null,
  };
}

async function callProvider(
  messages: LlmMessage[],
  opts: { provider: LlmProvider; model: string; maxTokens: number; signal?: AbortSignal }
): Promise<ProviderResult & { refusalCategory?: string | null }> {
  const { provider, model, maxTokens, signal } = opts;

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
      signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmProviderError(`Anthropic API error ${res.status}: ${body}`, res.status);
    }

    const data = await res.json();
    // Read BEFORE the content: a refusal can arrive with an empty `content`,
    // and a `max_tokens` stop arrives with text that looks like an answer.
    const stopReason = typeof data?.stop_reason === 'string' ? data.stop_reason : null;
    const category = data?.stop_details?.category;
    return {
      text: textFromAnthropicContent(data?.content),
      inputTokens: data?.usage?.input_tokens || 0,
      outputTokens: data?.usage?.output_tokens || 0,
      provider: 'anthropic',
      model,
      stopReason,
      outcome: outcomeOf('anthropic', stopReason),
      refusalCategory: typeof category === 'string' ? category : null,
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
      signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new LlmProviderError(`OpenAI API error ${res.status}: ${body}`, res.status);
    }

    const data = await res.json();
    const finish = data?.choices?.[0]?.finish_reason;
    const stopReason = typeof finish === 'string' ? finish : null;
    return {
      text: data?.choices?.[0]?.message?.content || '',
      inputTokens: data?.usage?.prompt_tokens || 0,
      outputTokens: data?.usage?.completion_tokens || 0,
      provider: 'openai',
      model,
      stopReason,
      outcome: outcomeOf('openai', stopReason),
      refusalCategory: null,
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
 * The credit lock of one tenant (FO-274). A run checks the balance and reserves its price in one
 * step; two runs of the same tenant must not interleave that step, or both pass the check on the
 * same credits. Transaction-level: released at commit or rollback.
 */
export async function lockTenantCredits(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`;
}

/**
 * The balance as the caller's transaction sees it, including reservations it has already
 * written. Use this inside a locked transaction; {@link getCreditBalance} opens its own.
 */
export async function creditBalanceIn(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const result = await tx.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
  return result._sum.delta || 0;
}

/**
 * Reserves one AI action's price before its model calls (FO-274): one `CreditLedger` debit,
 * the same reason (`usage:<module>`) and price a delivered call is deducted at. Returns `false`, writing nothing, when the
 * balance does not cover it. Call with the tenant lock held ({@link lockTenantCredits}).
 */
export async function reserveAiAction(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; module: string; purpose: string; refId: string },
): Promise<boolean> {
  const { credits } = resolveCredits(params.module, params.purpose);
  if (credits <= 0) return true;
  if ((await creditBalanceIn(tx, params.tenantId)) < credits) return false;
  await tx.creditLedger.create({
    data: { tenantId: params.tenantId, delta: -credits, reason: `usage:${params.module}`, refId: params.refId },
  });
  return true;
}

/**
 * Gives a reservation back when the run did not deliver its result (FO-274): one `refund` row
 * that offsets the debit with the same `refId`. Idempotent; writes nothing when no debit exists
 * for `refId` or it was already refunded. Call with the tenant lock held.
 */
export async function releaseAiReservation(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; module: string; refId: string },
): Promise<void> {
  const debit = await tx.creditLedger.findFirst({
    where: { tenantId: params.tenantId, refId: params.refId, reason: `usage:${params.module}`, delta: { lt: 0 } },
    select: { delta: true },
  });
  if (!debit) return;
  const refunded = await tx.creditLedger.findFirst({
    where: { tenantId: params.tenantId, refId: params.refId, reason: `refund:${params.module}` },
    select: { id: true },
  });
  if (refunded) return;
  await tx.creditLedger.create({
    data: { tenantId: params.tenantId, delta: -debit.delta, reason: `refund:${params.module}`, refId: params.refId },
  });
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
export function hashMessages(messages: LlmMessage[]): string {
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
 * Takes the call's price out of the balance before the provider is called (FO-288). Under the
 * tenant credit lock, a priced call needs the balance to cover its price ({@link reserveAiAction});
 * an unpriced call keeps the old rule and is refused only on an empty balance. Two concurrent calls
 * therefore cannot both pass on the same credits.
 */
async function reserveCallCredits(options: LlmGenerateOptions, price: number, refId: string): Promise<void> {
  const refused = await withTenant(options.tenantId, async (tx) => {
    await lockTenantCredits(tx, options.tenantId);
    // NG-250: the NexaGrant plan's monthly AI allowance, under the same lock, before any credit
    // moves. Throws NgPlanLimitError (digest NG_PLAN_LIMIT_REACHED); a tenant without a
    // NexaGrant row is not counted (K-584603 = A).
    await assertNgAiQuota(tx, options.tenantId);
    if (price > 0) {
      const reserved = await reserveAiAction(tx, { tenantId: options.tenantId, module: options.module, purpose: options.purpose, refId });
      return !reserved;
    }
    return (await creditBalanceIn(tx, options.tenantId)) <= 0;
  });
  if (refused) throw new Error('Insufficient AI credits. Please purchase more credits or upgrade your plan.');
}

/** NG-250: the monthly AI allowance for a caller that reserved its credits itself (M17). */
async function assertNgAiQuotaLocked(tenantId: string): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await lockTenantCredits(tx, tenantId);
    await assertNgAiQuota(tx, tenantId);
  });
}

/** Gives back a reservation whose call delivered nothing (FO-288). Idempotent, see {@link releaseAiReservation}. */
async function releaseCallCredits(options: LlmGenerateOptions, refId: string): Promise<void> {
  await withTenant(options.tenantId, async (tx) => {
    await lockTenantCredits(tx, options.tenantId);
    await releaseAiReservation(tx, { tenantId: options.tenantId, module: options.module, refId });
  });
}

/** Refund writes tried before a reservation is left standing and alerted (FO-319). */
const REFUND_ATTEMPTS = 3;
const REFUND_RETRY_BASE_MS = 200;

/**
 * Gives a reservation back, retrying a failed write (FO-319 Y-3, Ö-3). Never throws: the caller's
 * own outcome — the provider error, or the truncated / refused answer — is what it reports, not a
 * bookkeeping fault. A refund that still fails leaves the debit standing; that is logged and
 * recorded as an `error` SystemAlert (`llm-refund`, deduplicated per reservation) so an
 * operator can reconcile it. The alert carries no tenant id: SystemAlert is outside RLS.
 */
async function refundOrAlert(options: LlmGenerateOptions, refId: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= REFUND_ATTEMPTS; attempt++) {
    try {
      await releaseCallCredits(options, refId);
      return;
    } catch (e) {
      lastError = e;
      if (attempt < REFUND_ATTEMPTS) {
        await new Promise(res => setTimeout(res, REFUND_RETRY_BASE_MS * attempt));
      }
    }
  }
  console.error('[generateCompletion] refund failed after retries; reservation debit left standing', {
    module: options.module,
    purpose: options.purpose,
    refId,
  }, lastError);
  try {
    await recordAlert({
      level: 'error',
      source: 'llm-refund',
      message: 'AI credit reservation could not be refunded; the debit stands until reconciled',
      meta: { module: options.module, purpose: options.purpose, reservation: refId },
      // Per reservation (FO-329): refId already carries module, purpose and a unique id, so two
      // unrefunded calls of the same module and purpose each keep their own open alert.
      dedupeKey: `llm-refund:${refId}`,
    });
  } catch {
    // Best-effort: an alert that cannot be written must not replace the caller's outcome.
  }
}

/**
 * Call the model, record the call in `AiUsageLog`, deduct the credits.
 *
 * The price is reserved under the tenant credit lock before the provider is called (FO-288), so
 * this throws when the balance cannot cover it, and it reaches no provider. A reservation whose
 * call delivers nothing is refunded. Also throws when the provider rejects the request after
 * retries. Throws {@link LlmTruncatedError} when the answer hit the output ceiling and
 * {@link LlmRefusalError} when it was declined — both
 * after writing a credits-0 usage row and moving no credit. Returns the usage
 * the call actually produced —
 * including the credits charged — so a caller that wants to show the cost reads
 * it from here instead of recomputing the formula.
 *
 * Throws {@link AiUsageLogWriteError} — and only then — when the model answered
 * but the `AiUsageLog` row or the `CreditLedger` deduction could not be written:
 * the one failure where the tenant's prompt has already left the building and
 * the provider is owed for it. Any other throw from this function means nothing
 * was spent (TASK-MTVBM0C2QWPCL).
 *
 * A reservation that cannot be refunded changes none of this: the refund is retried, then recorded
 * as an `llm-refund` SystemAlert, and the error thrown is still the one described above (FO-319).
 */
export async function generateCompletion(options: LlmGenerateOptions): Promise<LlmCompletion> {
  const provider = options.provider || DEFAULT_PROVIDER;
  const maxTokens = maxTokensFor(options.module, options.purpose, options.maxTokens);
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
  const { credits: price } = resolveCredits(options.module, options.purpose);

  // NG-209 sec F4: the e2e fake answers only the M18 calls it has a canned answer for; every
  // other call goes the real way below, flag or not (no key → the usual hard failure).
  const fakeAnswer = fakeAiEnabled() ? fakeAnswerFor(options.module, options.purpose) : undefined;
  if (fakeAnswer === undefined) requireApiKey(provider);

  // FO-288 — the price is reserved BEFORE the provider is called, under the tenant's credit lock,
  // the same model M17 uses (FO-274). The old check read the balance outside any lock and only then
  // called the model, so two concurrent calls could both pass it and drive the balance below zero.
  // A caller that reserved already (M17) passes `creditsReserved` and is not reserved twice.
  const reservation = options.creditsReserved ? undefined : `${options.module}:${options.purpose}:${crypto.randomUUID()}`;
  if (reservation) await reserveCallCredits(options, price, reservation);
  else await assertNgAiQuotaLocked(options.tenantId);

  // One signal for the whole request: every attempt gives up at the same instant.
  const signal = signalUntil(options.deadlineAt);
  const { outcome, refusalCategory, ...result } = await withRetry(
    // NG-209: the e2e fake provider replaces the request and nothing else.
    async () =>
      fakeAnswer !== undefined
        ? fakeProviderAnswer(fakeAnswer, options.module, options.purpose, messages)
        : callProvider(messages, { provider, model, maxTokens, signal }),
    3,
    1000,
    options.deadlineAt,
    signal
  ).catch(async (e: unknown) => {
    // No answer came back, so nothing was delivered: give the reservation back before rethrowing.
    // The rethrown error is the provider's, whatever happens to the refund (FO-319 Ö-3).
    if (reservation) await refundOrAlert(options, reservation);
    throw e;
  });

  // A truncated or refused answer is not the product the tenant paid for, so
  // the ledger does not move (TASK-MUN4PSBP19RKK). The usage row is still
  // written below with credits 0: the prompt reached the provider either way,
  // and CLAUDE.md rule 5 / GDPR art. 30 want every such call on record.
  const credits = outcome === 'complete' ? price : 0;

  const promptHash = hashMessages(messages);

  // The provider has been called and the bill is incurred — the record and the
  // deduction are now mandatory, not best-effort. Everything from here down is
  // wrapped so a failure arrives as AiUsageLogWriteError: above this line a
  // database fault means nothing was spent, below it the prompt has already
  // reached the provider, and a raw Prisma error cannot tell the two apart.
  // The try starts *here* deliberately — widening it upwards would label the
  // balance read's own failure as a paid-but-unrecorded call.
  // Two writes, two transactions (FO-288 review, Y-1). The usage row (and, for a caller that did not
  // reserve, the deduction) is one transaction. The refund of a reservation whose answer was cut off
  // or refused is another, idempotent, transaction of its own. A failing usage row must not roll the
  // refund back: the tenant would then pay for an answer it never received.
  const writeFailures: unknown[] = [];
  try {
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
      // A reserved call's price is already debited; a delivered answer keeps it. An unreserved caller
      // (M17, `creditsReserved`) is deducted here as before.
      if (!reservation && credits > 0) {
        await tx.creditLedger.create({
          data: {
            tenantId: options.tenantId,
            delta: -credits,
            reason: `usage:${options.module}`,
            refId: options.proposalId,
          },
        });
      }
    });
  } catch (e) {
    writeFailures.push(e);
  }
  // FO-319 Y-3: the refund is not a usage-log write. When the row above was written and only the
  // refund failed, the usage row exists — so it must not be reported as "could not be written".
  if (reservation && credits === 0) {
    await refundOrAlert(options, reservation);
  }
  if (writeFailures.length > 0) {
    console.error('[generateCompletion] AiUsageLog write failed after a provider call', ...writeFailures);
    throw new AiUsageLogWriteError(
      'Completion call completed but its AiUsageLog row and credit deduction could not be written',
      writeFailures[0]
    );
  }

  if (outcome !== 'complete') {
    const detail: LlmOutcomeDetail = {
      module: options.module,
      purpose: options.purpose,
      provider: result.provider,
      model: result.model,
      stopReason: result.stopReason,
      outputTokens: result.outputTokens,
      maxTokens,
    };
    // No tenant content: ids and counts only, so an operator can see which
    // action is hitting the ceiling without reading anyone's document.
    console.warn('[generateCompletion] unusable outcome', { outcome, ...detail, refusalCategory });
    throw outcome === 'truncated' ? new LlmTruncatedError(detail) : new LlmRefusalError(detail, refusalCategory ?? null);
  }

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
// The RAG path used to call OpenAI directly from `src/lib/rag.ts` and its twin
// `src/lib/ai/rag.ts` (merged away in TASK-MTU6KE36HAFJR), so the full text of
// every uploaded document left the
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
 *
 * Both provider paths raise it — {@link embedText} and
 * {@link generateCompletion}. It is the marker for "we paid and recorded
 * nothing"; a failure raised *before* the provider is reached must never wear
 * it, or the distinction it exists for is gone.
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
    // Carries the status so a caller can tell one refused input (400) from an outage.
    throw new LlmProviderError(`OpenAI embeddings error ${res.status}: ${body}`, res.status);
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

