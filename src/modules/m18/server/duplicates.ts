import { normalisePlateCode } from './taxonomy';

/**
 * NG-137 (M18-F2). Duplicate detection for client organisations: a stable `dedupeKey`
 * (stored on `LeadOrganization.dedupeKey`, indexed with `tenantId`) for exact hits, and a
 * trigram similarity for "probably the same" suggestions during CSV import.
 *
 * Similarity is computed here in TypeScript over the candidate set the caller already
 * loaded through `withTenant`, so no `pg_trgm` extension and no migration are needed.
 * The thresholds are new (decision K-581471): HibeLead's `duplicates.ts` is gone.
 */

/** Similar names at or above this are offered as the same organisation. */
export const LIKELY_DUPLICATE_SIMILARITY = 0.85;
/** …and at or above this are shown as "possibly the same", never merged automatically. */
export const POSSIBLE_DUPLICATE_SIMILARITY = 0.7;

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/**
 * Words that tell nothing about which organisation it is: legal forms and the "sanayi ve
 * ticaret" filler of Turkish trade names. "Belediyesi", "Derneği", "Odası" stay — they
 * separate the municipality from the association that carries its town's name.
 */
const NOISE_WORDS = new Set([
  'as', 'aş', 'anonim', 'limited', 'ltd', 'sti', 'şti', 'sirketi', 'şirketi',
  'san', 'sanayi', 'tic', 'ticaret', 've', 'and', 'inc', 'llc', 'gmbh',
]);

export function normaliseOrgName(name: string | null | undefined): string {
  // Dots go first so "A.Ş." and "Ltd." become the single words "aş" and "ltd".
  const lowered = (name ?? '').toLocaleLowerCase('tr-TR').replace(/&/g, ' ve ').replace(/\./g, '');
  const words = lowered
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w !== '' && !NOISE_WORDS.has(w));
  return words
    .join(' ')
    .replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch);
}

/**
 * Turkish tax identifiers: VKN (10 digits, companies) or TCKN (11 digits, sole traders).
 * Spaces, dots and dashes are dropped; anything else returns `null` rather than a key that
 * would merge two different organisations.
 */
export function normaliseTaxNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[\s.-]/g, '');
  return /^\d{10,11}$/.test(digits) ? digits : null;
}

export interface DedupeSubject {
  name: string;
  taxNumber?: string | null;
  provinceCode?: string | null;
}

/**
 * `tax:<digits>` when a tax number is known (decisive), else `name:<normalised>|<plate|->`.
 * The province is part of the name key because "X Kooperatifi" exists in many provinces.
 */
export function dedupeKey(subject: DedupeSubject): string | null {
  const tax = normaliseTaxNumber(subject.taxNumber);
  if (tax) return `tax:${tax}`;
  const name = normaliseOrgName(subject.name);
  if (!name) return null;
  return `name:${name}|${normalisePlateCode(subject.provinceCode) ?? '-'}`;
}

function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of text.split(' ')) {
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i += 1) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity of word trigrams (the pg_trgm measure), 0–1, on normalised names. */
export function nameSimilarity(a: string, b: string): number {
  const na = normaliseOrgName(a);
  const nb = normaliseOrgName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = trigrams(na);
  const gb = trigrams(nb);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return shared / (ga.size + gb.size - shared);
}

export interface ExistingOrganization extends DedupeSubject {
  id: string;
  dedupeKey?: string | null;
}

export type DuplicateReason = 'TAX_NUMBER' | 'DEDUPE_KEY' | 'SIMILAR_NAME';

export interface DuplicateCandidate {
  id: string;
  reason: DuplicateReason;
  similarity: number;
  /** `LIKELY` may be offered as a one-click merge; `POSSIBLE` only as a hint. */
  strength: 'EXACT' | 'LIKELY' | 'POSSIBLE';
}

/**
 * Existing organisations that may be `candidate`, strongest first. Names are compared only
 * when the provinces agree or one of them is unknown: same name, different province is a
 * different body in Türkiye more often than not.
 */
export function findDuplicates(
  candidate: DedupeSubject,
  existing: readonly ExistingOrganization[]
): DuplicateCandidate[] {
  const tax = normaliseTaxNumber(candidate.taxNumber);
  const key = dedupeKey(candidate);
  const plate = normalisePlateCode(candidate.provinceCode);
  const found: DuplicateCandidate[] = [];

  for (const org of existing) {
    if (tax && normaliseTaxNumber(org.taxNumber) === tax) {
      found.push({ id: org.id, reason: 'TAX_NUMBER', similarity: 1, strength: 'EXACT' });
      continue;
    }
    if (key && (org.dedupeKey ?? dedupeKey(org)) === key) {
      found.push({ id: org.id, reason: 'DEDUPE_KEY', similarity: 1, strength: 'EXACT' });
      continue;
    }
    const otherPlate = normalisePlateCode(org.provinceCode);
    if (plate && otherPlate && plate !== otherPlate) continue;
    const similarity = nameSimilarity(candidate.name, org.name);
    if (similarity >= LIKELY_DUPLICATE_SIMILARITY) {
      found.push({ id: org.id, reason: 'SIMILAR_NAME', similarity, strength: 'LIKELY' });
    } else if (similarity >= POSSIBLE_DUPLICATE_SIMILARITY) {
      found.push({ id: org.id, reason: 'SIMILAR_NAME', similarity, strength: 'POSSIBLE' });
    }
  }
  return found.sort((x, y) => y.similarity - x.similarity);
}
