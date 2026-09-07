/**
 * M5 KPI derivations — pure, so the rule that separates "we have not measured this"
 * from "we measured zero" can be pinned by unit tests without a database.
 *
 * Why this distinction has its own type: an empty workspace used to read "Hit rate
 * 0.0 %", "Avg. score 0.0", "Person-days 0.0". Every one of those is a verdict on work
 * the tenant has done, and a tenant on its first day has done none. `?? 0` at the end
 * of a query is what turns absence into that verdict, so absence is carried out of the
 * read layer as a value the UI cannot accidentally format as a number.
 *
 * A measured zero is still zero: five opportunities scored at G0 and no submission is
 * a hit rate of 0 %, and the dashboard must say so.
 */

/** A KPI that may have no inputs yet. `measured: false` carries no number at all. */
export type MetricValue = { measured: true; value: number } | { measured: false };

export const measured = (value: number): MetricValue => ({ measured: true, value });
export const NOT_MEASURED: MetricValue = { measured: false };

/** Rounds to `places` decimals; KPI cards show one, exports keep two. */
const round = (value: number, places = 2) => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

/**
 * Hit rate: submissions as a share of the opportunities that cleared G0 scoring.
 *
 * The denominator is what decides measurability. No G0-scored opportunity means there
 * is no ratio to state — not a ratio that happens to be zero.
 */
export function hitRate(submittedProposals: number, g0ScoredOpportunities: number): MetricValue {
  if (g0ScoredOpportunities <= 0) return NOT_MEASURED;
  return measured(round((submittedProposals / g0ScoredOpportunities) * 100));
}

export interface LensMarks {
  excellence: number;
  impact: number;
  implementation: number;
}

/**
 * Mean of the three Evaluator Lens criteria across the readers who actually scored.
 *
 * Callers must pass only rows that carry marks (see `getKpiMetrics`): `Evaluation`
 * defaults excellence/impact/implementation to 0, so an unfilled row averaged in here
 * would pull a real average down with a number nobody entered.
 */
export function averageLensScore(rows: readonly LensMarks[]): MetricValue {
  if (rows.length === 0) return NOT_MEASURED;
  const sum = rows.reduce(
    (acc, r) => acc + (r.excellence + r.impact + r.implementation) / 3,
    0,
  );
  return measured(round(sum / rows.length));
}

/**
 * Effort per proposal (docs/ROADMAP.md: "kişi-gün/teklif").
 *
 * Logged hours with no proposal to divide by is not "0 person-days per proposal" — the
 * figure does not exist until there is a proposal.
 */
export function personDaysPerProposal(totalHours: number, totalProposals: number): MetricValue {
  if (totalProposals <= 0) return NOT_MEASURED;
  return measured(round(totalHours / 8 / totalProposals));
}

export interface GateDecisionPoint {
  opportunityId: string;
  gate: string;
  decidedAt: Date;
}

/**
 * Mean days between an opportunity's G0 and its G2 decision.
 *
 * Only opportunities holding *both* decisions can contribute. With none, the card stays
 * unmeasured rather than claiming opportunities cross the two gates on the same day —
 * which is what a rounded-down 0 said before.
 */
export function averageG0ToG2Days(decisions: readonly GateDecisionPoint[]): MetricValue {
  const g0 = new Map<string, Date>();
  const g2 = new Map<string, Date>();
  for (const d of decisions) {
    // Decisions arrive newest first; the earliest G0 and the earliest G2 bound the span.
    if (d.gate === 'G0') g0.set(d.opportunityId, d.decidedAt);
    else if (d.gate === 'G2') g2.set(d.opportunityId, d.decidedAt);
  }

  let totalDays = 0;
  let count = 0;
  for (const [opportunityId, g0At] of g0) {
    const g2At = g2.get(opportunityId);
    if (!g2At) continue;
    const days = (g2At.getTime() - g0At.getTime()) / (1000 * 60 * 60 * 24);
    // A G2 recorded before its G0 is bad data, not a negative duration; skip it rather
    // than let it drag the average below zero.
    if (days < 0) continue;
    totalDays += days;
    count += 1;
  }

  if (count === 0) return NOT_MEASURED;
  return measured(Math.round(totalDays / count));
}
