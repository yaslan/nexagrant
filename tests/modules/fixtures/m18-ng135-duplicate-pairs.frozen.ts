/**
 * FROZEN copy of the NG-135 duplicate review, as it was before NG-197 (`721fd71b`):
 * `src/modules/m18/server/duplicates.ts` (`findDuplicates` and the helpers it reads) and
 * `src/modules/m18/server/duplicate-pairs.ts` (`findCandidatePairs`). Nothing here imports product
 * code, so a change to the product rule (`classifyPair`, `prepareSubject`, the normalisers) cannot
 * leak into the reference it is compared with. Do not "fix" or refactor this file: it is the
 * yardstick. Edits against `721fd71b`: the name caches are dropped (they never changed a result),
 * `normalisePlateCode` is inlined with its 81-province bound, and the scan is not exported as
 * product API. Used by `tests/modules/m18-duplicate-pairs.test.ts`.
 */

const LIKELY_DUPLICATE_SIMILARITY = 0.85;
const POSSIBLE_DUPLICATE_SIMILARITY = 0.7;
const PROVINCE_COUNT = 81;

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

const NOISE_WORDS = new Set([
  'as', 'aş', 'anonim', 'limited', 'ltd', 'sti', 'şti', 'sirketi', 'şirketi',
  'san', 'sanayi', 'tic', 'ticaret', 've', 'and', 'inc', 'llc', 'gmbh',
]);

export interface FrozenOrganization {
  id: string;
  name: string;
  taxNumber?: string | null;
  provinceCode?: string | null;
  dedupeKey?: string | null;
}

export interface FrozenPair {
  aId: string;
  bId: string;
  reason: 'TAX_NUMBER' | 'DEDUPE_KEY' | 'SIMILAR_NAME';
  similarity: number;
  strength: 'EXACT' | 'LIKELY' | 'POSSIBLE';
}

function normalisePlateCode(code: string | number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const text = String(code).trim();
  if (!/^\d{1,2}$/.test(text)) return null;
  const n = Number(text);
  if (n < 1 || n > PROVINCE_COUNT) return null;
  return String(n).padStart(2, '0');
}

export function frozenNormaliseOrgName(name: string | null | undefined): string {
  const lowered = (name ?? '').toLocaleLowerCase('tr-TR').replace(/&/g, ' ve ').replace(/\./g, '');
  const words = lowered
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w !== '' && !NOISE_WORDS.has(w));
  return words.join(' ').replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch);
}

function normaliseTaxNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/[\s.-]/g, '');
  return /^\d{10,11}$/.test(digits) ? digits : null;
}

function dedupeKey(subject: Omit<FrozenOrganization, 'id' | 'dedupeKey'>): string | null {
  const tax = normaliseTaxNumber(subject.taxNumber);
  if (tax) return `tax:${tax}`;
  const name = frozenNormaliseOrgName(subject.name);
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

function nameSimilarity(a: string, b: string): number {
  const na = frozenNormaliseOrgName(a);
  const nb = frozenNormaliseOrgName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = trigrams(na);
  const gb = trigrams(nb);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return shared / (ga.size + gb.size - shared);
}

function findDuplicates(
  candidate: Omit<FrozenOrganization, 'id' | 'dedupeKey'>,
  existing: readonly FrozenOrganization[],
): Array<Omit<FrozenPair, 'aId' | 'bId'> & { id: string }> {
  const tax = normaliseTaxNumber(candidate.taxNumber);
  const key = dedupeKey(candidate);
  const plate = normalisePlateCode(candidate.provinceCode);
  const found: Array<Omit<FrozenPair, 'aId' | 'bId'> & { id: string }> = [];

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

/**
 * The NG-135 `findCandidatePairs`, synchronous, unchanged order rule: similarity descending, then
 * `aId`; `Array.prototype.sort` is stable, so pairs equal on both keep the order they were first
 * seen in (block order, then `findDuplicates` order) — there is no `bId` tie-break.
 */
export function frozenFindCandidatePairs(orgs: readonly FrozenOrganization[], limit = 100): FrozenPair[] {
  const blocks = new Map<string, FrozenOrganization[]>();
  for (const org of orgs) {
    const first = frozenNormaliseOrgName(org.name).split(' ')[0] ?? '';
    if (!first) continue;
    const list = blocks.get(first);
    if (list) list.push(org);
    else blocks.set(first, [org]);
  }

  const seen = new Set<string>();
  const pairs: FrozenPair[] = [];
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
