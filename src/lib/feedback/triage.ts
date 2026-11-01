/**
 * E11.2 — beta feedback triage rules.
 *
 * Pure functions, no I/O: the P0–P3 verdict has to be reproducible in a unit
 * test and explainable to the partner who filed the report. The rule that fired
 * is returned alongside the priority and stored on the row (`triageReason`), so
 * when a human overrides the verdict we can measure which rule was wrong.
 *
 * Priority ladder (docs/BETA_GUIDE.md, "Hata triyajı"):
 *   P0 — nobody can work: data loss, security, auth down, whole app 500s.
 *   P1 — a major function is unusable and there is no workaround.
 *   P2 — broken but survivable, or a UX defect that costs real time.
 *   P3 — ideas, cosmetics, nice-to-haves.
 */

export type FeedbackCategoryValue =
  | 'BUG'
  | 'FEATURE_REQUEST'
  | 'UX'
  | 'PERFORMANCE'
  | 'DATA_QUALITY'
  | 'OTHER';

export type FeedbackImpactValue = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'IDEA';

export type FeedbackPriorityValue = 'P0' | 'P1' | 'P2' | 'P3';

export interface TriageInput {
  category: FeedbackCategoryValue;
  impact: FeedbackImpactValue;
  title: string;
  body: string;
}

export interface TriageVerdict {
  priority: FeedbackPriorityValue;
  /** Machine-readable trace of the rule that decided it. */
  reason: string;
}

/**
 * Phrases that escalate a report regardless of what the reporter picked.
 * Turkish and English side by side because the beta cohort writes in both.
 * Matched on a normalised (lowercase, diacritic-folded) haystack, so `veri
 * kaybi` also catches `veri kaybı`.
 */
const ESCALATION_PATTERNS: Array<{ tag: string; terms: string[] }> = [
  {
    tag: 'data-loss',
    terms: [
      'veri kaybi', 'verilerim gitti', 'veri gitti', 'kayboldu', 'silindi',
      'data loss', 'lost my data', 'data disappeared', 'wiped',
    ],
  },
  {
    tag: 'security',
    terms: [
      'guvenlik acigi', 'sizinti', 'baska kiracinin', 'baska firmanin verisi',
      'security', 'data leak', 'another tenant', 'cross-tenant', 'unauthorized access',
    ],
  },
  {
    tag: 'auth-down',
    terms: [
      'giris yapamiyorum', 'oturum acilmiyor', 'hesabima giremiyorum',
      'cannot log in', 'can not log in', "can't log in", 'login broken', 'locked out',
    ],
  },
  {
    tag: 'total-outage',
    terms: [
      'tum sistem', 'hicbir sey calismiyor', 'uygulama acilmiyor', 'beyaz ekran',
      'whole app', 'nothing works', 'app will not open', 'white screen',
      '500 error', 'internal server error',
    ],
  },
];

/** Signals a broken-but-survivable defect: enough for P2, never for P0. */
const DEFECT_PATTERNS: Array<{ tag: string; terms: string[] }> = [
  {
    tag: 'crash',
    terms: ['cokuyor', 'coktu', 'hata veriyor', 'crash', 'crashes', 'exception', 'stack trace'],
  },
  {
    tag: 'wrong-number',
    terms: ['yanlis hesapl', 'yanlis rakam', 'tutmuyor', 'wrong number', 'incorrect total', 'mismatch'],
  },
];

/** Lowercase and strip Turkish diacritics so one term list covers both spellings. */
export function normalise(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findTag(haystack: string, table: Array<{ tag: string; terms: string[] }>): string | null {
  for (const { tag, terms } of table) {
    if (terms.some((term) => haystack.includes(term))) return tag;
  }
  return null;
}

const PRIORITY_ORDER: FeedbackPriorityValue[] = ['P0', 'P1', 'P2', 'P3'];

/** The more severe of two priorities (P0 is most severe). */
export function mostSevere(
  a: FeedbackPriorityValue,
  b: FeedbackPriorityValue
): FeedbackPriorityValue {
  return PRIORITY_ORDER.indexOf(a) <= PRIORITY_ORDER.indexOf(b) ? a : b;
}

/** What the reporter's own impact choice is worth on its own. */
function impactBaseline(impact: FeedbackImpactValue): FeedbackPriorityValue {
  switch (impact) {
    case 'BLOCKER':
      return 'P0';
    case 'MAJOR':
      return 'P1';
    case 'MINOR':
      return 'P2';
    case 'IDEA':
      return 'P3';
  }
}

/**
 * A category ceiling: no keyword can make a feature request urgent. Bugs and
 * data-quality reports have no ceiling — they are the reports that can be P0.
 */
function categoryFloor(category: FeedbackCategoryValue): FeedbackPriorityValue {
  switch (category) {
    case 'FEATURE_REQUEST':
      return 'P3';
    case 'UX':
    case 'OTHER':
      return 'P2';
    case 'PERFORMANCE':
      return 'P1';
    case 'BUG':
    case 'DATA_QUALITY':
      return 'P0';
  }
}

/** Least severe of two priorities — used to apply the category ceiling. */
function leastSevere(
  a: FeedbackPriorityValue,
  b: FeedbackPriorityValue
): FeedbackPriorityValue {
  return PRIORITY_ORDER.indexOf(a) >= PRIORITY_ORDER.indexOf(b) ? a : b;
}

/**
 * Decide P0–P3 for one report.
 *
 * The verdict is the most severe of (a) what the reporter's impact choice
 * implies and (b) what the text escalates to — then capped by what the category
 * can ever justify. A "feature request" that says "nothing works" stays P3; a
 * "minor" bug that says "another tenant's data" becomes P0.
 */
export function triageFeedback(input: TriageInput): TriageVerdict {
  const haystack = normalise(`${input.title} ${input.body}`);

  const baseline = impactBaseline(input.impact);
  let priority = baseline;
  let reason = `impact:${input.impact}`;

  const escalationTag = findTag(haystack, ESCALATION_PATTERNS);
  if (escalationTag) {
    const escalated = mostSevere(priority, 'P0');
    if (escalated !== priority) reason = `keyword:${escalationTag}`;
    else reason = `impact:${input.impact}+keyword:${escalationTag}`;
    priority = escalated;
  } else {
    const defectTag = findTag(haystack, DEFECT_PATTERNS);
    if (defectTag) {
      const escalated = mostSevere(priority, 'P2');
      if (escalated !== priority) reason = `keyword:${defectTag}`;
      priority = escalated;
    }
  }

  const floor = categoryFloor(input.category);
  const capped = leastSevere(priority, floor);
  if (capped !== priority) {
    reason = `${reason}>capped:${input.category}`;
    priority = capped;
  }

  return { priority, reason };
}

/**
 * First-response budget per priority, in hours.
 *
 * These are the numbers already published to beta partners in
 * docs/BETA_GUIDE.md § 5 — the table there is the commitment, this constant
 * follows it. Change both together or the product will quietly promise
 * something different from the guide.
 */
export const PRIORITY_SLA_HOURS: Record<FeedbackPriorityValue, number> = {
  P0: 2,    // same-day, "do not wait" territory
  P1: 24,   // one working day
  P2: 48,   // two working days
  P3: 168,  // picked up at the weekly sync
};
