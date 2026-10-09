/**
 * A generation that reached the provider but did not produce a usable answer,
 * as both sides of a server action see it (TASK-MUN4PSBP19RKK).
 *
 * Two outcomes, and neither is charged:
 *
 * - **truncated** — the model hit the output-token ceiling (`stop_reason:
 *   "max_tokens"` / `"model_context_window_exceeded"`, OpenAI `finish_reason:
 *   "length"`). Until this card `src/lib/llm.ts` never read the stop reason, so
 *   a document cut off mid-clause ("…and will notify TÜB") was saved, shown and
 *   billed as if it were complete — measured on M10 AWARD_PACK 2/3 runs with
 *   the default model (docs/agent-results/TASK-MUN3FWZWT11MX-se-fb.md §2).
 * - **refused** — the model or a provider safety classifier declined
 *   (`stop_reason: "refusal"`, OpenAI `finish_reason: "content_filter"`).
 *
 * The server-side errors (`LlmTruncatedError`, `LlmRefusalError` in
 * src/lib/llm.ts) carry the digest below. Next.js keeps a digest that is
 * already set, and in production that digest is the only thing the browser
 * receives, so this is the one place the client recognises either outcome —
 * the same mechanism as src/lib/pilot-expired.ts. No server-only import here:
 * client components import it too.
 */

export const LLM_TRUNCATED_DIGEST = 'LLM_TRUNCATED';
export const LLM_REFUSED_DIGEST = 'LLM_REFUSED';

function digestOf(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const { code, digest } = error as { code?: unknown; digest?: unknown };
  return digest ?? code;
}

/** True for a generation cut off at the output-token ceiling, in any shape it reaches us. */
export function isLlmTruncated(error: unknown): boolean {
  return digestOf(error) === LLM_TRUNCATED_DIGEST;
}

/** True for a generation the model or a safety classifier declined. */
export function isLlmRefused(error: unknown): boolean {
  return digestOf(error) === LLM_REFUSED_DIGEST;
}

/** Either of the two: the provider answered, the answer is not usable, nothing was charged. */
export function isLlmUnusableOutcome(error: unknown): boolean {
  return isLlmTruncated(error) || isLlmRefused(error);
}
