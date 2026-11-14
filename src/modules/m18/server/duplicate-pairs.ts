import { findDuplicates, normaliseOrgName, type DuplicateReason, type ExistingOrganization } from './duplicates';

/**
 * Candidate pairs for the `/duplicates` screen (NG-135 / F3 phase B). The matching rule is
 * F2's `findDuplicates`, reused unchanged; this file only decides which organisations get
 * compared with each other. Blocking by the first word of the normalised name keeps the work
 * near-linear: "Ankara Kooperatifi" is compared with "Ankara …" names, never with all 5.000.
 * The known cost: "Kooperatif Ankara" and "Ankara Kooperatifi" land in different blocks.
 */

export interface DuplicatePair {
  aId: string;
  bId: string;
  reason: DuplicateReason;
  similarity: number;
  strength: 'EXACT' | 'LIKELY' | 'POSSIBLE';
}

export function findCandidatePairs(orgs: readonly ExistingOrganization[], limit = 100): DuplicatePair[] {
  const blocks = new Map<string, ExistingOrganization[]>();
  for (const org of orgs) {
    const first = normaliseOrgName(org.name).split(' ')[0] ?? '';
    if (!first) continue;
    const list = blocks.get(first);
    if (list) list.push(org);
    else blocks.set(first, [org]);
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];
  for (const block of blocks.values()) {
    if (block.length < 2) continue;
    for (const org of block) {
      for (const hit of findDuplicates(org, block)) {
        if (hit.id === org.id) continue;
        const [aId, bId] = org.id < hit.id ? [org.id, hit.id] : [hit.id, org.id];
        const pairKey = `${aId}|${bId}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        pairs.push({ aId, bId, reason: hit.reason, similarity: hit.similarity, strength: hit.strength });
      }
    }
  }
  return pairs.sort((x, y) => y.similarity - x.similarity || x.aId.localeCompare(y.aId)).slice(0, limit);
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
