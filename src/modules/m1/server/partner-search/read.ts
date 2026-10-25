/**
 * Read path of Partner Search announcement text (FO-137, FO-65 F3 remainder).
 *
 * The ingestor masks contact details before it stores the summary (ingestor.ts,
 * `maskRow`). A row written before that change, or by a later writer that forgets,
 * still holds them. So every place that sends a stored summary to a client, a
 * response body or a file calls this on the SERVER first; the browser must never
 * receive the raw text. The rule itself stays in mask.ts (`maskContact`): this file
 * adds no pattern of its own.
 *
 * tests/partner-search-read.test.ts holds every file that reaches stored announcements
 * (the delegate, the `Topic.partnerAnnouncements` relation, raw SQL) to this: it must
 * CALL `maskContact` / `toPublicSummary` and must not let the raw `description` out
 * beside it. That is a per-file scan of the code, not a type guarantee.
 *
 * Masking an already masked text is a no-op (`[email]` / `[phone]` match nothing),
 * so calling it on every read costs nothing and never double-masks.
 */
import { maskContact } from './mask';

/** The one column of `PartnerSearchAnnouncement` that carries organisation-written free text. */
export interface PartnerSearchSummaryRow {
  description: string | null;
}

/** The summary as a client may see it: contact details replaced, `null` stays `null`. */
export function toPublicSummary(row: PartnerSearchSummaryRow): string | null {
  return maskContact(row.description);
}
