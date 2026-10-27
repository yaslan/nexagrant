/**
 * The shape of the privacy notice (FO-170): nine sections, in the order of the
 * owner's KVKK template (docs/legal-input/kvkk-aydinlatma-sablon-2026-10-27.md).
 * The words live in messages/{tr,en}.json under `legal.privacy.<section>`; this
 * file only says which rows, items and columns each section has, so the page and
 * the tests read one list.
 */

export const PRIVACY_TABLES = {
  s1: { columns: ['colItem', 'colValue'], cells: ['label', 'value'], rows: ['controller', 'address', 'taxId', 'mersis', 'email', 'kep', 'verbis'] },
  s2: {
    columns: ['colGroup', 'colCategory', 'colExamples'],
    cells: ['group', 'category', 'examples'],
    rows: ['visitorSecurity', 'visitorAnalytics', 'memberIdentity', 'memberContact', 'memberProfessional', 'memberTransaction', 'paidFinance', 'leadForm', 'expertPrereg'],
  },
  s3: {
    columns: ['colPurpose', 'colBasis'],
    cells: ['purpose', 'basis'],
    rows: ['account', 'matching', 'aiProcessing', 'assessment', 'expertPool', 'support', 'billing', 'trafficLogs', 'security', 'legalClaims', 'improvement', 'analytics', 'leadRequest', 'expertDirectory'],
  },
  s5: { columns: ['colRecipient', 'colLocation', 'colData'], cells: ['recipient', 'location', 'data'], rows: ['anthropic', 'google', 'stripe', 'openai', 'cloudflare', 'posthog'] },
  s6: { columns: ['colData', 'colPeriod'], cells: ['data', 'period'], rows: ['account', 'invoices', 'trafficLogs', 'leads', 'expertPrereg', 'invitations', 'notifications', 'records', 'browser'] },
  s7: { columns: ['colType', 'colPurpose', 'colConsent'], cells: ['type', 'purpose', 'consent'], rows: ['essential', 'analytics'] },
} as const;

export type PrivacyTableSection = keyof typeof PRIVACY_TABLES;

export const PRIVACY_LISTS = {
  s4: ['forms', 'uploads', 'contact', 'cookies', 'google', 'automated'],
  s5domestic: ['experts', 'advisors', 'authorities', 'hosting'],
  s8rights: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'],
  s8channels: ['post', 'kep', 'esign', 'email'],
  s9consents: ['analytics', 'lead', 'expert'],
} as const;

/**
 * Values the notice cannot state yet and must not invent. Each still reads as
 * the bracketed text below, in both languages, until the owner supplies it.
 * The publish gate (FO-140) must find this list empty; the test in
 * tests/privacy-notice.test.ts keeps it honest in both directions — every entry
 * is still in the copy, and no other bracketed placeholder is.
 */
export const PRIVACY_PLACEHOLDERS: readonly { key: string; tr: string; en: string }[] = [
  { key: 's1.rows.taxId.value', tr: '[VERGİ DAİRESİ / NO]', en: '[TAX OFFICE / NO]' },
  { key: 's1.rows.mersis.value', tr: '[MERSİS NO]', en: '[MERSIS NO]' },
  { key: 's1.rows.verbis.value', tr: '[Kayıtlı / Muaf]', en: '[Registered / Exempt]' },
  { key: 's9.effective', tr: '[YÜRÜRLÜK TARİHİ]', en: '[EFFECTIVE DATE]' },
];

/**
 * Not a placeholder but a stand-in: the KEP address is a demo value the owner
 * asked for (FO-149 v3) and must be replaced with the real one before FO-140.
 */
export const PRIVACY_DEMO_VALUES: readonly { key: string; value: string }[] = [
  { key: 's1.rows.kep.value', value: 'fonbridge@hs01.kep.tr' },
];
