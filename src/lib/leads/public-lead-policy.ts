/**
 * FB KAMU (TASK-MULR765AR5G0C) — the rules of the readiness contact form that the
 * browser needs too: the retention period, the consent text version, the sources
 * and the result codes. No server import, so the form component can read it; the
 * server half is ./public-lead.ts.
 */

/**
 * How long a contact request is kept: 12 months from when it was left.
 *
 * Decided: owner decision (patron kararı) 29.09.2026, 12 months — the question
 * was raised in docs/agent-results/TASK-MULR765AR5G0C-fe-fb.md §5. This constant is
 * the one place it lives; the purge, the admin screen and the notice all read it.
 * Why 12 months: a municipality's EU application cycle is annual (most calls
 * open once a year and the readiness gaps take months to close), so a request
 * left after one call should still be answerable at the next; anything older
 * describes a readiness state that is no longer true.
 */
export const PUBLIC_LEAD_RETENTION_DAYS = 365;

/**
 * The explicit-consent text the visitor ticks (KVKK md.5/1, GDPR art.6(1)(a)).
 * Same rule as src/lib/legal/consent-documents.ts: change the copy behind
 * `messageKey` or `withdrawKey` in messages/*.json (or PUBLIC_LEAD_RETENTION_DAYS, which the text
 * states) and bump `version` in the same commit, so a stored row never claims
 * agreement to a text nobody saw. Enforced: public-lead.test.ts pins each version
 * to the SHA-256 of the rendered tr/en text.
 */
export const PUBLIC_LEAD_CONSENT = {
  id: 'public-lead-contact',
  // 2026-10-31.1: the consent text names the product, which became NexaGrant (FO-275).
  version: '2026-10-31.1',
  messageKey: 'readiness.lead.consent_label',
  /** The line printed right under the box; part of what the visitor agrees with (İNCELEME-61 Ö-3). */
  withdrawKey: 'readiness.lead.consent_withdraw',
} as const;

/**
 * The separate, optional box that passes the visitor's request on to the consultancy
 * organisation of their province (NG-179; text: docs/legal/drafts/transfer-consent-v1.md, §4/§5).
 * Its own id and version: it is never merged with PUBLIC_LEAD_CONSENT. Unticked by default; the
 * server writes the version and time only when the box is ticked AND the province has an
 * organisation (see public-lead.ts). Not in use until the lawyer's written approval (patron, 14.11.2026).
 */
export const PUBLIC_LEAD_TRANSFER_CONSENT = {
  /** Which document the consent is for (never shown to the visitor). */
  id: 'lead-intake-transfer',
  version: 'transfer-consent-v1-2026-11',
  messageKey: 'readiness.lead.transfer_label',
} as const;

/** Where a visitor withdraws consent; the same address the site footer shows. */
export const PUBLIC_CONTACT_EMAIL = 'info@nexagrant.com';

/** Funnel pages that may carry the form. */
export const PUBLIC_LEAD_SOURCES = ['fon-hazirlik'] as const;

const DAYS_PER_MONTH = 365.25 / 12;

/** {@link PUBLIC_LEAD_RETENTION_DAYS} in whole months, for the texts that state it. */
export function publicLeadRetentionMonths(days: number = PUBLIC_LEAD_RETENTION_DAYS): number {
  return Math.round(days / DAYS_PER_MONTH);
}

export type PublicLeadField = 'name' | 'email' | 'organisation' | 'province' | 'district';

export type PublicLeadResult =
  | { ok: true }
  | { ok: false; error: 'invalid'; fields: PublicLeadField[] }
  | { ok: false; error: 'consent_required' }
  | { ok: false; error: 'consent_outdated' }
  | { ok: false; error: 'rate_limited' }
  | { ok: false; error: 'server' };
