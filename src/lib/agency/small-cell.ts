/**
 * The two numbers of the agency funnel's small-cell rule, in a module with no
 * server imports, so the dashboard (a client component) can read them too.
 * funnel.ts re-exports both.
 */

/**
 * docs/legal/agency-channel-notice-addendum.md §3.1 (HUKUK-5): one threshold for the
 * dashboard and the report. 10 since NG-339 (HUKUK-5 5c, decided 23.11.2026); it was 5 until
 * then. Every shown number is a multiple of {@link FUNNEL_ROUND_STEP} and at least this value.
 */
export const SMALL_CELL_THRESHOLD = 10;

/**
 * The unit every shown number is rounded to (FO-398, K-577799). It was 5 (HUKUK-5) until the
 * attacker of funnel.attack.test.ts showed that a step of 5 is not enough once an agency knows
 * some of its own codes' uses exactly: with 5-30 organisations it registered itself on a fresh
 * code it reads another code's hidden 1..4 uses back in 60 of 900 simulated tables (D = 0,
 * several provinces), 74 of 900 with the 500 records of a limit-filled code. At 10 all three
 * ways read 0 of 900. The threshold is {@link SMALL_CELL_THRESHOLD} (10 since NG-339); a group
 * under it is still masked.
 *
 * A shown number is within -5..+4 of the truth. With the threshold at 10 a shown 10 means
 * 10..14 (a true 5..9 is masked, not shown as 10).
 */
export const FUNNEL_ROUND_STEP = 10;

/**
 * The range a shown number stands for, in whole organisations (for the text that explains the
 * rounding). A shown {@link FUNNEL_ROUND_STEP} is at least the threshold and below 1.5 steps.
 */
export function shownRange(): { step: number; low: number; high: number } {
  return {
    step: FUNNEL_ROUND_STEP,
    low: Math.max(SMALL_CELL_THRESHOLD, FUNNEL_ROUND_STEP / 2),
    high: FUNNEL_ROUND_STEP + FUNNEL_ROUND_STEP / 2 - 1,
  };
}
