/**
 * The G0 outcome that counts for each opportunity: the latest decision on file.
 *
 * Input rows must be ordered newest first (`decidedAt desc, id desc`), the same order
 * `gates/evaluate.ts` uses for the G1 check. Only the first row per opportunity is kept, so an
 * older pass never outranks a fresh refusal, and the reverse.
 *
 * Opportunities with no decision are absent from the map; callers read that as `null`.
 */
export function latestG0PassedByOpportunity(
  decisionsNewestFirst: readonly { opportunityId: string; passed: boolean }[],
): Map<string, boolean> {
  const latest = new Map<string, boolean>();
  for (const d of decisionsNewestFirst) {
    if (!latest.has(d.opportunityId)) latest.set(d.opportunityId, d.passed);
  }
  return latest;
}

/** The latest saved G0 decision for one opportunity, as the detail page reads it. */
export type SavedG0Decision = { passed: boolean; decidedAt: Date };

/**
 * What the detail page's G0 box shows (NG-69, K-579051).
 *
 * At G0 the box is a live computation. Once the opportunity has left G0, the gate acted on the
 * saved decision, so the box shows that decision with its date and never the live number.
 */
export type G0BoxMode =
  | { kind: 'live' }
  | { kind: 'saved'; passed: boolean; decidedAt: Date }
  | { kind: 'none' };

export function g0BoxMode(stage: string, saved: SavedG0Decision | null): G0BoxMode {
  if (stage === 'G0') return { kind: 'live' };
  if (!saved) return { kind: 'none' };
  return { kind: 'saved', passed: saved.passed, decidedAt: saved.decidedAt };
}

/**
 * The live "Puan Gerekçeleri" list is the live computation's output, so it is shown only while
 * the box is live (at G0). After G1 the reasons would contradict the saved decision (NG-69).
 */
export function g0ReasonsVisible(mode: G0BoxMode): boolean {
  return mode.kind === 'live';
}
