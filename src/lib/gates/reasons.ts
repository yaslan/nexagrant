/**
 * Why a gate refused, as data the screen can put into its own language.
 *
 * The engine's `reasons` strings are English and stay as they are: the scorer stores its copy in
 * the decision's evidence, and logs and tests read them. A screen reads these codes instead, through
 * `use-gate-reason-text.ts`, and each code has one sentence in the `GateReason` message namespace.
 * Never persisted, so the `GateDecision` record format does not depend on this list.
 */
export type GateReason =
  | { code: 'G0_NO_EVIDENCE' }
  | { code: 'G0_SCORE_BELOW'; values: { score: number; min: number } }
  | { code: 'G0_ALIGNMENT_BELOW'; values: { value: number; min: number } }
  | { code: 'G0_BASE_RATE_BELOW'; values: { value: number; min: number } }
  | { code: 'G0_COUNTRY_NOT_ELIGIBLE' }
  | { code: 'G1_G0_NOT_DECIDED' }
  | { code: 'G1_G0_LAST_FAILED' }
  | { code: 'G1_NO_CRITICAL_SEAT' }
  | { code: 'G1_SEAT_NO_ORGANISATION'; values: { role: string } }
  | { code: 'G1_SEAT_NOT_FILLED'; values: { role: string; status: string } }
  | { code: 'G1_NO_BACKUP'; values: { role: string } }
  | { code: 'G2_OPEN_SEATS'; values: { count: number } }
  | { code: 'G3_CRITERION_BELOW'; values: { score: number; min: number } }
  | { code: 'G3_TOTAL_BELOW'; values: { score: number; min: number } }
  | { code: 'G4_STATUS_BLOCKED'; values: { status: string } };
