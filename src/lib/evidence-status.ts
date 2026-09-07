/**
 * What badge an evidence document earns.
 *
 * `Evidence.status` is a real verification column — the schema documents it as
 * `UNVERIFIED | VALID | EXPIRING_SOON | EXPIRED | REJECTED` — but nothing read it.
 * The evidence list computed its badge from `validUntil` alone and fell through to a
 * green tick for everything that had not expired, so a document nobody had checked was
 * shown as verified and valid. That is the same failure as an invented certificate
 * number: a statement on screen that no record backs (CLAUDE.md §7).
 *
 * The decision lives here, as one pure function, so it can be tested without a browser
 * and so the list, the drawer and the health score cannot drift apart.
 */

/** The states in which a document has actually passed verification. */
const VERIFIED_STATUSES = new Set(['VALID', 'EXPIRING_SOON']);

export type EvidenceBadgeKind =
  | 'EXPIRED'
  | 'REJECTED'
  | 'UNVERIFIED'
  | 'EXPIRING_SOON'
  | 'VALID';

export interface EvidenceBadge {
  kind: EvidenceBadgeKind;
  /** Only set for EXPIRING_SOON. */
  daysLeft?: number;
}

export interface EvidenceStatusInput {
  status?: string | null;
  validUntil?: Date | string | null;
}

/**
 * True only when the record positively states that the document passed verification.
 *
 * A missing or unrecognised status is *not* verified. The default has to fall that way:
 * treating "we do not know" as "verified" is exactly the bug being fixed here.
 */
export function isVerifiedStatus(status?: string | null): boolean {
  return status !== null && status !== undefined && VERIFIED_STATUSES.has(status);
}

/** Days from `now` until `validUntil`, rounded up. */
function daysUntil(validUntil: Date, now: Date): number {
  return Math.ceil((validUntil.getTime() - now.getTime()) / (1000 * 3600 * 24));
}

/**
 * Decide the badge for one document.
 *
 * Order matters. Expiry is a fact carried by the date column, so it outranks the
 * verification state — an expired certificate is expired whether or not anyone checked
 * it. A refusal (`REJECTED`) is reported as a refusal rather than folded into
 * "unverified", because the two mean different things to the user. Everything that is
 * not positively verified is `UNVERIFIED`, and only a verified document can reach the
 * two green outcomes.
 */
export function evidenceBadge(
  item: EvidenceStatusInput,
  now: Date = new Date(),
): EvidenceBadge {
  const expiry = item.validUntil ? new Date(item.validUntil) : null;
  const hasExpiry = expiry !== null && !Number.isNaN(expiry.getTime());

  if (item.status === 'EXPIRED' || (hasExpiry && expiry.getTime() < now.getTime())) {
    return { kind: 'EXPIRED' };
  }

  if (item.status === 'REJECTED') {
    return { kind: 'REJECTED' };
  }

  if (!isVerifiedStatus(item.status)) {
    return { kind: 'UNVERIFIED' };
  }

  if (hasExpiry) {
    const daysLeft = daysUntil(expiry, now);
    if (daysLeft > 0 && daysLeft <= 30) {
      return { kind: 'EXPIRING_SOON', daysLeft };
    }
  }

  return { kind: 'VALID' };
}
