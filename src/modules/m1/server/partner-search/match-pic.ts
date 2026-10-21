/**
 * PIC matching for partner-search announcements (FO-58 / TASK-MVCH1YZXDOED).
 *
 * An announcing organisation is linked to a CordisOrganization in three steps:
 *   1. exact PIC (`organisationId` is the PIC),
 *   2. name + country fuzzy match, accepted at `threshold` (default 0.9),
 *   3. otherwise unmatched → an UnmatchedOrganization row keyed by `matchKeyFor`.
 *
 * Pure: the caller loads the candidate organisations (same country is enough
 * for step 2) and writes the result. No DB, no I/O.
 */
import { normalizeOrgName } from '@/lib/k2-cordis/cordisSchema';

export const DEFAULT_PIC_MATCH_THRESHOLD = 0.9;

export interface AnnouncingOrganization {
  pic?: string | null;
  name: string;
  country?: string | null;
}

export interface CandidateOrganization {
  organisationId: string;
  name: string;
  country?: string | null;
}

export type PicMatch =
  | { kind: 'exact'; pic: string; score: 1 }
  | { kind: 'fuzzy'; pic: string; score: number }
  | { kind: 'unmatched'; matchKey: string; bestScore: number };

/** PICs are 9 digits; the portal sometimes sends them with spaces or as numbers. */
export function normalizePic(pic: string | null | undefined): string | null {
  const digits = (pic ?? '').replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

/** normalizeOrgName after stripping diacritics it does not cover (é, ñ, ø → e, n, o). */
export function matchableName(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o')
    .replace(/ß/g, 'SS');
  return normalizeOrgName(ascii);
}

function normalizeCountry(country: string | null | undefined): string | null {
  const c = (country ?? '').trim().toUpperCase();
  return c.length > 0 ? c : null;
}

/** 1 − Levenshtein distance / longer length; 1 means identical, 0 nothing in common. */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return 1 - (prev[b.length] ?? 0) / Math.max(a.length, b.length);
}

/** Stable UnmatchedOrganization.matchKey: the PIC when there is one, else country + name. */
export function matchKeyFor(org: AnnouncingOrganization): string {
  const pic = normalizePic(org.pic);
  if (pic) return `pic:${pic}`;
  return `name:${normalizeCountry(org.country) ?? '--'}:${matchableName(org.name)}`;
}

export function matchPic(
  org: AnnouncingOrganization,
  candidates: readonly CandidateOrganization[],
  threshold: number = DEFAULT_PIC_MATCH_THRESHOLD
): PicMatch {
  const pic = normalizePic(org.pic);
  if (pic) {
    const exact = candidates.find((c) => normalizePic(c.organisationId) === pic);
    if (exact) return { kind: 'exact', pic: exact.organisationId, score: 1 };
  }

  // Fuzzy only within the same country: without a country two different
  // "University of X" entities are too easy to merge.
  const country = normalizeCountry(org.country);
  const name = matchableName(org.name);
  let best: { pic: string; score: number } | null = null;
  let tied = false;
  if (country && name) {
    for (const c of candidates) {
      if (normalizeCountry(c.country) !== country) continue;
      const score = nameSimilarity(name, matchableName(c.name));
      if (!best || score > best.score) {
        best = { pic: c.organisationId, score };
        tied = false;
      } else if (score === best.score && c.organisationId !== best.pic) {
        tied = true;
      }
    }
  }

  // Two organisations equally close is not a match: picking one would be a guess.
  if (best && best.score >= threshold && !tied) return { kind: 'fuzzy', pic: best.pic, score: best.score };
  return { kind: 'unmatched', matchKey: matchKeyFor(org), bestScore: best?.score ?? 0 };
}
