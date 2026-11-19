/**
 * NG-250 — the fixed refusal codes of the NexaGrant plan gate and counters. Pure, no server
 * import: the browser reads them out of a 403 body and translates them (`ngGate.<code>` in
 * messages/*.json).
 */
export const NG_GATE_CODES = {
  notInPlan: 'NG_FEATURE_NOT_IN_PLAN',
  roleForbidden: 'NG_ROLE_FORBIDDEN',
  moduleClosed: 'NG_MODULE_CLOSED',
} as const;

export type NgGateCode = (typeof NG_GATE_CODES)[keyof typeof NG_GATE_CODES];

/** A counted plan limit is used up (seats, monthly AI operations). */
export const NG_PLAN_LIMIT_REACHED = 'NG_PLAN_LIMIT_REACHED';

export type NgRefusalCode = NgGateCode | typeof NG_PLAN_LIMIT_REACHED;

const ALL: readonly string[] = [...Object.values(NG_GATE_CODES), NG_PLAN_LIMIT_REACHED];

/** The NexaGrant refusal code of a parsed 403 body, or null when it is not one. */
export function ngRefusalCodeOf(body: unknown): NgRefusalCode | null {
  if (typeof body !== 'object' || body === null) return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && ALL.includes(code) ? (code as NgRefusalCode) : null;
}
