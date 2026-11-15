import {
  classifyPair,
  normaliseOrgName,
  prepareSubject,
  type DuplicateReason,
  type ExistingOrganization,
  type PreparedSubject,
} from './duplicates';

/**
 * Candidate pairs for the `/duplicates` screen (NG-135 / F3 phase B). The matching rule is
 * F2's `classifyPair` (the rule behind `findDuplicates`), reused unchanged; this file only decides
 * which organisations get compared with each other. Blocking by the first word of the normalised
 * name keeps the work near-linear: "Ankara Kooperatifi" is compared with "Ankara …" names, never
 * with all 5.000. The known cost: "Kooperatif Ankara" and "Ankara Kooperatifi" land in different
 * blocks.
 *
 * NG-197: a block can still hold a thousand rows (an import whose names share the first word), and
 * then the review is a million comparisons. It runs in the request process, so it is async and
 * gives the event loop back every {@link COMPARISONS_PER_SLICE} comparisons: held for seconds,
 * the loop let Prisma's `maxWait` timer of a concurrent `withTenant` (the workspace layout's) fire
 * before its BEGIN answer was read — P2028 and the error boundary in the M18 merge e2e on CI.
 * Each unordered pair is compared once, and only the best `limit` pairs are kept while scanning,
 * instead of collecting every hit and sorting them all.
 */

export interface DuplicatePair {
  aId: string;
  bId: string;
  reason: DuplicateReason;
  similarity: number;
  strength: 'EXACT' | 'LIKELY' | 'POSSIBLE';
}

/**
 * Measured, not guessed (NG-197, Apple M3 Pro, Node 26, the event-loop test's 0 ms timer probe): on the
 * 1.002-row e2e data a slice holds the loop 1.6 ms median, 8–27 ms at worst; on one 5.002-row block
 * 31–55 ms at worst (68 ms in review). The spikes are GC/JIT, still far from the 2 s `maxWait`.
 */
export const COMPARISONS_PER_SLICE = 5_000;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The list order: strongest first, then by the pair's ids, so equal pairs never swap between renders. */
function before(x: DuplicatePair, y: DuplicatePair): boolean {
  if (x.similarity !== y.similarity) return x.similarity > y.similarity;
  const byA = x.aId.localeCompare(y.aId);
  return byA !== 0 ? byA < 0 : x.bId.localeCompare(y.bId) < 0;
}

/** Keeps `top` sorted by {@link before} and at most `limit` long. */
function keepBest(top: DuplicatePair[], pair: DuplicatePair, limit: number): void {
  if (top.length >= limit) {
    const worst = top[top.length - 1];
    if (!worst || !before(pair, worst)) return;
    top.pop();
  }
  let lo = 0;
  let hi = top.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = top[mid];
    if (at && before(at, pair)) lo = mid + 1;
    else hi = mid;
  }
  top.splice(lo, 0, pair);
}

interface Entry {
  org: ExistingOrganization;
  prepared: PreparedSubject;
}

export async function findCandidatePairs(
  orgs: readonly ExistingOrganization[],
  limit = 100,
): Promise<DuplicatePair[]> {
  const blocks = new Map<string, Entry[]>();
  const ids = new Set<string>();
  for (const org of orgs) {
    if (ids.has(org.id)) continue; // first listing of an id wins; NG-135 compared every listing, so a repeat with other fields added pairs
    ids.add(org.id);
    const first = normaliseOrgName(org.name).split(' ')[0] ?? '';
    if (!first) continue;
    const entry = { org, prepared: prepareSubject(org) };
    const list = blocks.get(first);
    if (list) list.push(entry);
    else blocks.set(first, [entry]);
  }

  const top: DuplicatePair[] = [];
  let sinceYield = 0;
  for (const block of blocks.values()) {
    if (block.length < 2) continue;
    for (let i = 0; i < block.length; i += 1) {
      const a = block[i];
      if (!a) continue;
      for (let j = i + 1; j < block.length; j += 1) {
        const b = block[j];
        if (!b) continue;
        // The pair is judged with the earlier row as the candidate, as it was when every row was
        // run through findDuplicates in block order. Only the key test is one-sided (a row's
        // stored key may differ from its computed one), so the other direction adds just that.
        let hit = classifyPair(a.prepared, b.prepared);
        if (!hit && b.prepared.key && a.prepared.storedKey === b.prepared.key) {
          hit = { reason: 'DEDUPE_KEY', similarity: 1, strength: 'EXACT' };
        }
        if (hit) {
          const [aId, bId] = a.org.id < b.org.id ? [a.org.id, b.org.id] : [b.org.id, a.org.id];
          keepBest(top, { aId, bId, ...hit }, limit);
        }
        sinceYield += 1;
        if (sinceYield >= COMPARISONS_PER_SLICE) {
          sinceYield = 0;
          await yieldToEventLoop();
        }
      }
    }
  }
  return top;
}

/** Fields that are blank on the kept organisation and filled on the dropped one. Kept values always win. */
export const MERGE_FILL_FIELDS = ['legalName', 'district', 'website', 'provinceCode', 'sizeBand'] as const;

export function blankFieldsFrom(
  keep: Partial<Record<(typeof MERGE_FILL_FIELDS)[number], string | null>>,
  drop: Partial<Record<(typeof MERGE_FILL_FIELDS)[number], string | null>>,
): Partial<Record<(typeof MERGE_FILL_FIELDS)[number], string>> {
  const patch: Partial<Record<(typeof MERGE_FILL_FIELDS)[number], string>> = {};
  for (const field of MERGE_FILL_FIELDS) {
    const kept = keep[field];
    const dropped = drop[field];
    if ((kept === null || kept === undefined || kept === '') && dropped) patch[field] = dropped;
  }
  return patch;
}
