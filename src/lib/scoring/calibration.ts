/**
 * Binary-classifier calibration maths for the G0 gate — E11.3.
 *
 * Pure functions, no I/O, no Prisma: the confusion matrix a report prints and the one a unit test
 * asserts on must be produced by the same code, otherwise the report is decoration.
 *
 * Convention throughout: the *positive* class is GO ("this opportunity is worth pursuing"), because
 * that is the decision that costs a team eight weeks of effort. A false positive therefore means
 * wasted work, a false negative a missed grant — asymmetric costs that the report has to name.
 */

import type { G0Decision } from './g0-canonical';

export interface LabelledPrediction {
  id: string;
  predicted: G0Decision;
  actual: G0Decision;
  score: number;
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  total: number;
}

export interface CalibrationMetrics extends ConfusionMatrix {
  /** (TP + TN) / total. `null` when there is nothing to score. */
  accuracy: number | null;
  /** TP / (TP + FP) — of the opportunities we said GO to, how many were worth it. */
  precision: number | null;
  /** TP / (TP + FN) — of the opportunities that were worth it, how many we caught. */
  recall: number | null;
  /** Harmonic mean of precision and recall. */
  f1: number | null;
}

export function confusionMatrix(predictions: LabelledPrediction[]): ConfusionMatrix {
  const m: ConfusionMatrix = {
    truePositive: 0,
    falsePositive: 0,
    trueNegative: 0,
    falseNegative: 0,
    total: predictions.length,
  };
  for (const p of predictions) {
    if (p.predicted === 'GO' && p.actual === 'GO') m.truePositive++;
    else if (p.predicted === 'GO' && p.actual === 'NO_GO') m.falsePositive++;
    else if (p.predicted === 'NO_GO' && p.actual === 'NO_GO') m.trueNegative++;
    else m.falseNegative++;
  }
  return m;
}

export function metrics(predictions: LabelledPrediction[]): CalibrationMetrics {
  const m = confusionMatrix(predictions);
  const { truePositive: tp, falsePositive: fp, trueNegative: tn, falseNegative: fn } = m;
  return {
    ...m,
    accuracy: m.total === 0 ? null : (tp + tn) / m.total,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: tp + fn === 0 ? null : tp / (tp + fn),
    f1: tp === 0 ? (fp + fn === 0 ? null : 0) : (2 * tp) / (2 * tp + fp + fn),
  };
}

export interface SweepPoint {
  threshold: number;
  metrics: CalibrationMetrics;
}

/**
 * Sweep one threshold and report the metrics at each value.
 *
 * `decide(threshold)` is supplied by the caller so the sweep does not need to know whether the
 * threshold is a composite minimum, an alignment minimum or a base rate — the hard rules stay in
 * `decideG0` and this function only varies one number.
 */
export function sweepThreshold(
  thresholds: number[],
  decide: (threshold: number) => LabelledPrediction[],
): SweepPoint[] {
  return thresholds.map((threshold) => ({ threshold, metrics: metrics(decide(threshold)) }));
}

/**
 * The best point of a sweep. Ties are broken toward the *higher* threshold: with a handful of
 * samples several thresholds score identically, and the stricter one lets fewer weak proposals
 * through, which is the cheaper mistake to keep making while the sample is still small.
 */
export function bestSweepPoint(points: SweepPoint[]): SweepPoint | null {
  let best: SweepPoint | null = null;
  for (const point of points) {
    const acc = point.metrics.accuracy;
    if (acc === null) continue;
    const bestAcc = best?.metrics.accuracy ?? -1;
    if (acc > bestAcc || (acc === bestAcc && point.threshold > (best?.threshold ?? -Infinity))) {
      best = point;
    }
  }
  return best;
}

/**
 * Wilson score interval for a proportion — the honest companion to any accuracy computed on a
 * sample this small. At n = 20 the 95 % interval around 0.90 is roughly [0.70, 0.97]; printing the
 * point estimate alone would overstate what 20 samples can prove.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return {
    low: Math.max(0, (centre - spread) / denom),
    high: Math.min(1, (centre + spread) / denom),
  };
}

export function formatPercent(value: number | null, digits = 1): string {
  return value === null ? '—' : `${(value * 100).toFixed(digits)}%`;
}
