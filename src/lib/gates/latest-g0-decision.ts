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
