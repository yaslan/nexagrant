/**
 * K4 outreach — pure builders for the partner card (TASK-MULQLF067H75P).
 *
 * Two things live here, both free of I/O so they run the same on the server and in
 * the browser and can be unit tested:
 *
 *   1. External partner-search deep links (F&T Portal, EEN, Ideal-ist, GREENET).
 *      Each URL was checked against the live site on 30.09.2026:
 *        - F&T Portal partner search reads `?keywords=` and pre-fills the search box.
 *        - Ideal-ist `/partner-search` filters on `topic_id` (prefix) and `title`.
 *        - EEN partnering opportunities uses a POST facet form and ignores query
 *          strings, and the GREENET tool is a b2match community behind a login, so
 *          both get their plain search page plus a copyable search text.
 *   2. First-contact e-mail templates: placeholder filling and a `mailto:` link with
 *      an empty recipient. Nothing is ever sent from the app.
 *
 * Privacy rule: only the organisation name, its country and a topic ever reach a URL.
 * Anything that looks like an e-mail address or a phone number is stripped before a
 * query is built, so a person's contact data can never leak into a third-party URL
 * (and from there into that site's logs and the browser history).
 */

export type PartnerSearchSourceId = 'ft' | 'een' | 'idealist' | 'greenet';

export interface PartnerSearchInput {
  /** Organisation (legal) name, e.g. "Fraunhofer-Gesellschaft". */
  orgName: string;
  /** ISO 3166 alpha-2 country code as CORDIS stores it, e.g. "DE". Optional. */
  country?: string | null;
  /** Topic the user wants to search around. Optional. */
  topic?: { code: string; title?: string | null } | null;
}

export interface PartnerSearchLink {
  id: PartnerSearchSourceId;
  url: string;
  /** True when the target site receives the query in the URL itself. */
  prefilled: boolean;
  /** Text to paste into the target site's own search box. Empty when nothing to add. */
  searchText: string;
}

export const PARTNER_SEARCH_BASE_URLS: Readonly<Record<PartnerSearchSourceId, string>> = {
  ft: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/how-to-participate/partner-search',
  een: 'https://een.ec.europa.eu/partnering-opportunities',
  idealist: 'https://www.ideal-ist.eu/partner-search',
  greenet: 'https://greenet-partner-search-tool.b2match.io/',
};

export const PARTNER_SEARCH_SOURCES: readonly PartnerSearchSourceId[] = [
  'ft',
  'een',
  'idealist',
  'greenet',
];

const EMAIL_RE = /[^\s@]+@[^\s@]+/g;
// A run of digits with phone-style separators that is not glued to a word (so the
// "3-01-05" tail of "HORIZON-CL5-2024-D3-01-05" is not a candidate) and holds at least
// nine digits: catches "+90 532 123 45 67" and "0212-555-1234".
const PHONE_RE = /(?<![\w-])\+?\d[\d\s().\/-]{5,}\d/g;
const MIN_PHONE_DIGITS = 9;
const MAX_QUERY_LENGTH = 200;

/**
 * Normalises free text for use in a search query: removes contact-looking fragments,
 * collapses whitespace and caps the length. Returns '' when nothing usable is left.
 */
export function sanitizeQueryText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, (match) => (match.replace(/\D/g, '').length >= MIN_PHONE_DIGITS ? ' ' : match))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

function withQuery(base: string, params: Record<string, string>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== '');
  if (entries.length === 0) return base;
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${base}?${query}`;
}

function countryName(code: string | null | undefined): string {
  const clean = sanitizeQueryText(code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  try {
    // English on purpose: all four target sites search in English.
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(clean) ?? clean;
  } catch {
    return clean;
  }
}

/**
 * Builds the four external partner-search links for one organisation.
 * Order follows PARTNER_SEARCH_SOURCES.
 */
export function buildPartnerSearchLinks(input: PartnerSearchInput): PartnerSearchLink[] {
  const orgName = sanitizeQueryText(input.orgName);
  const topicCode = sanitizeQueryText(input.topic?.code);
  const topicTitle = sanitizeQueryText(input.topic?.title);
  const country = countryName(input.country);

  // What to type on sites that cannot take a URL query: the subject first, then where.
  const topicText = topicTitle || topicCode;
  const topicSearchText = [topicText, country].filter(Boolean).join(' ');

  const idealistParams: Record<string, string> = topicCode ? { topic_id: topicCode } : {};

  return [
    {
      id: 'ft',
      url: withQuery(PARTNER_SEARCH_BASE_URLS.ft, { keywords: orgName }),
      prefilled: orgName !== '',
      searchText: orgName,
    },
    {
      id: 'een',
      url: PARTNER_SEARCH_BASE_URLS.een,
      prefilled: false,
      searchText: topicSearchText,
    },
    {
      id: 'idealist',
      url: withQuery(PARTNER_SEARCH_BASE_URLS.idealist, idealistParams),
      prefilled: topicCode !== '',
      searchText: topicCode ? '' : topicSearchText,
    },
    {
      id: 'greenet',
      url: PARTNER_SEARCH_BASE_URLS.greenet,
      prefilled: false,
      searchText: topicSearchText,
    },
  ];
}

// ── E-mail templates ───────────────────────────────────────────────────────────────

export type OutreachTemplateId = 'invite' | 'info' | 'followup';
export const OUTREACH_TEMPLATE_IDS: readonly OutreachTemplateId[] = ['invite', 'info', 'followup'];

export interface OutreachTemplateValues {
  institution: string;
  callCode: string;
  projectTitle: string;
}

/**
 * Replaces `{institution}`, `{callCode}` and `{projectTitle}` in a template.
 * An empty value leaves the placeholder visible, so the user sees what is still missing
 * instead of a sentence with a silent gap.
 */
export function fillTemplate(template: string, values: OutreachTemplateValues): string {
  return template.replace(/\{(institution|callCode|projectTitle)\}/g, (match, key: keyof OutreachTemplateValues) => {
    const value = values[key].trim();
    return value === '' ? match : value;
  });
}

/**
 * `mailto:` link with an EMPTY recipient: the user picks the address in their own mail
 * client. Encoded with encodeURIComponent (RFC 6068 wants %20, not "+", and line breaks
 * as %0D%0A).
 */
export function buildMailto(subject: string, body: string): string {
  const crlfBody = body.replace(/\r?\n/g, '\r\n');
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlfBody)}`;
}
