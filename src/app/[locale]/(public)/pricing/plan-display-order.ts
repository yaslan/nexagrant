/**
 * The order the pricing page draws its plan cards in (TASK-MVDWBVWOAU34T).
 *
 * Until this existed the page had no order of its own: `listPublicPlans` and
 * `plansVisibleToTenant` read `Plan` with no `orderBy`, so the cards came out
 * in Postgres heap order. That order is not stable — every upsert (a reseed,
 * a studio publish, a test that reprices a row) rewrites the tuple and can
 * move it. Measured on 2026-10-18 the shared dev database drew Pro | Basic |
 * Ultra while a fresh seed draws Basic | Pro | Ultra.
 *
 * This is presentation only. Which plans a visitor may see is still decided by
 * the storefront; this list neither adds nor hides one, and changing it does
 * not touch a price or the "recommended" highlight.
 */
export const PLAN_DISPLAY_ORDER: readonly string[] = ['basic', 'pro', 'ultra'];

/**
 * Sorts by `PLAN_DISPLAY_ORDER`. A plan not named there (a private plan, one a
 * studio just published) goes after the named ones, keeping the relative order
 * it arrived in — so a new plan shows up rather than vanishing, and its place
 * is fixed by adding it to the list above.
 */
export function sortForDisplay<T>(items: readonly T[], planIdOf: (item: T) => string): T[] {
  const rank = (item: T): number => {
    const index = PLAN_DISPLAY_ORDER.indexOf(planIdOf(item));
    return index === -1 ? PLAN_DISPLAY_ORDER.length : index;
  };
  // Array.prototype.sort is stable, which is what keeps unnamed plans in order.
  return [...items].sort((a, b) => rank(a) - rank(b));
}
