/**
 * E11.3 — audit trail for the one irreversible step of the ESR calibration survey
 * (TASK-MTQ2KL3JO4MK2).
 *
 * `scripts/esr-calibration.ts --survey --send` puts mail in front of ten real design partners.
 * Until now that left no trace at all: the rendered `.html`/`.txt` worksheets look identical
 * whether they were mailed or only written to disk, so "has the survey actually gone out?" was
 * unanswerable after the fact — and it is exactly the question that decides whether waiting for
 * responses is meaningful. The send now writes a receipt, and `--preflight` reads it.
 *
 * PII: the receipt lands under `docs/BETA_DATA/generated/` (gitignored) and still stores the
 * address masked. The slug identifies the partner for operations; the full address does not need
 * to be written down a second time to prove a message was accepted.
 */

export interface SurveySendRecipient {
  /** Roster slug — the operational identity of the partner. */
  slug: string;
  /** Masked recipient address, e.g. `p*****@partner.example`. */
  emailMasked: string;
  /** Provider message id, when the provider returned one. */
  messageId: string | null;
  /** Survey items this partner was asked about. */
  items: number;
  sentAt: string;
}

export interface SurveySendReceipt {
  /** ISO timestamp of the last accepted send in this run. */
  sentAt: string;
  /** Deadline the recipients were given — the date that is now a commitment. */
  deadline: string;
  /** Scoring rules the worksheets were rendered from. */
  ruleVersion: string;
  /** Roster file the addresses came from, so a later run can tell which roster went out. */
  rosterPath: string;
  recipients: SurveySendRecipient[];
}

/**
 * Mask an address for the audit trail: first character of the local part, then the domain.
 * A one-character local part still yields exactly one visible character, never the whole address.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/**
 * Read a receipt back, tolerating every way the file can be wrong.
 *
 * A malformed or truncated receipt must read as "no proof of a send", not as a crash and not as a
 * pass: the preflight's job is to be certain, and an unreadable receipt is not certainty.
 */
export function parseSendReceipt(json: string): SurveySendReceipt | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<SurveySendReceipt>;
  if (typeof candidate.sentAt !== 'string' || !Array.isArray(candidate.recipients)) return null;
  if (candidate.recipients.length === 0) return null;
  return {
    sentAt: candidate.sentAt,
    deadline: typeof candidate.deadline === 'string' ? candidate.deadline : '(unknown)',
    ruleVersion: typeof candidate.ruleVersion === 'string' ? candidate.ruleVersion : '(unknown)',
    rosterPath: typeof candidate.rosterPath === 'string' ? candidate.rosterPath : '(unknown)',
    recipients: candidate.recipients as SurveySendRecipient[],
  };
}
