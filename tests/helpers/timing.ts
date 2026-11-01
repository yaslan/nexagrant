/**
 * Multiplier for the wall-clock thresholds and test timeouts of the timing
 * tests. Only the time budgets scale: every behaviour assertion (refusal code,
 * the bytes or pages that come out, the heap and inflated-byte caps) stays as
 * it is. 1 on an idle machine; `scripts/gate-isolated.sh` sets it from the load
 * average, so a gate run on a loaded machine does not refuse the same files for
 * being slow (FO-261).
 */
const raw = Number(process.env.TEST_TIMING_SLACK ?? '1');

export const TIMING_SLACK = Number.isFinite(raw) && raw >= 1 ? raw : 1;

/** A wall-clock budget in milliseconds, scaled by {@link TIMING_SLACK}. */
export function slack(ms: number): number {
  return Math.round(ms * TIMING_SLACK);
}
