/**
 * Beta roster parsing (E11.1).
 *
 * The roster is a CSV kept under `docs/BETA_DATA/` so a non-engineer can edit it.
 * Parsing is separated from the CLI so the validation rules — including the guard
 * that stops a live send to placeholder addresses — are unit-testable.
 */

import { parse } from 'csv-parse/sync';

export const BETA_ORG_TYPES = [
  'SME',
  'LARGE',
  'UNIVERSITY',
  'RESEARCH',
  'PUBLIC',
  'NGO',
  'CONSULTANCY',
  'CLUSTER',
  'MUNICIPALITY',
] as const;

export type BetaOrgType = (typeof BETA_ORG_TYPES)[number];

export interface BetaPartner {
  slug: string;
  orgName: string;
  country: string;
  orgType: BetaOrgType;
  contactName: string;
  contactEmail: string;
  locale: 'tr' | 'en';
  timezone: string;
  segment: string;
  notes: string;
}

/** Reserved TLDs (RFC 2606 / RFC 6761) — never deliverable, so never sendable. */
const UNDELIVERABLE = /\.(invalid|example|test|localhost)$/i;

export function isPlaceholderEmail(email: string): boolean {
  const domain = email.split('@')[1] ?? '';
  return UNDELIVERABLE.test(domain) || /^example\.(com|net|org)$/i.test(domain);
}

export function parseBetaRoster(csv: string): BetaPartner[] {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    comment: '#',
  }) as Record<string, string>[];

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const line = index + 1;
    const required = ['slug', 'orgName', 'country', 'orgType', 'contactName', 'contactEmail', 'locale'];
    for (const key of required) {
      if (!row[key]) throw new Error(`Roster row ${line}: "${key}" is required`);
    }

    const slug = String(row.slug);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      throw new Error(`Roster row ${line}: slug "${slug}" must be lowercase kebab-case`);
    }
    if (seen.has(slug)) throw new Error(`Roster row ${line}: duplicate slug "${slug}"`);
    seen.add(slug);

    const orgType = String(row.orgType).toUpperCase();
    if (!BETA_ORG_TYPES.includes(orgType as BetaOrgType)) {
      throw new Error(`Roster row ${line}: orgType "${orgType}" is not a known OrgType`);
    }

    const locale = String(row.locale).toLowerCase();
    if (locale !== 'tr' && locale !== 'en') {
      throw new Error(`Roster row ${line}: locale must be "tr" or "en", got "${locale}"`);
    }

    const contactEmail = String(row.contactEmail).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new Error(`Roster row ${line}: "${contactEmail}" is not an email address`);
    }

    return {
      slug,
      orgName: String(row.orgName),
      country: String(row.country).toUpperCase(),
      orgType: orgType as BetaOrgType,
      contactName: String(row.contactName),
      contactEmail,
      locale,
      timezone: row.timezone || 'Europe/Istanbul',
      segment: row.segment || 'other',
      notes: row.notes || '',
    };
  });
}
