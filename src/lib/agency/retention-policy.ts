/**
 * The agency report retention numbers (NG-341, NG-345; veri sorumlusu kararı 23.11.2026).
 *
 * Kept in their own file, with no database import, so the screen (a server component) and the
 * document exporter can read the same numbers the job enforces. A change here is a change to the
 * promise the screen makes: the text is generated from these constants, never typed by hand.
 */

/** Months an agency report is kept. User decision of 23.11.2026; not a default to tune. */
export const AGENCY_REPORT_RETENTION_MONTHS = 12;
/** How often the expired reports are destroyed together: 1 January and 1 July, UTC. */
export const AGENCY_REPORT_PURGE_INTERVAL_MONTHS = 6;
/** Minimum years a deletion record is kept, then pruned (add-agency-report-deletion-log-no-cascade.sql). */
export const AGENCY_REPORT_DELETION_LOG_RETENTION_YEARS = 3;
/** The legal basis written on every deletion record. */
export const AGENCY_REPORT_RETENTION_BASIS = 'retention-12m';
/**
 * Seconds every cutoff is moved back past its calendar mark. The database refuses a cutoff that
 * is not at least 12 (or 3 years) back by ITS clock; a worker whose clock runs ahead of the
 * database's would otherwise trip that floor. Moving the cutoff back keeps a report a minute
 * longer, never shorter (NG-345 Ö2: "kesim birkaç saniye geri alınsın").
 */
export const AGENCY_REPORT_CUTOFF_MARGIN_SECONDS = 60;

/**
 * Fills the `{months}` and `{interval}` placeholders of a retention sentence from the constants.
 * The catalogues use plain ICU simple arguments; the document exporter reads them as raw JSON
 * (no next-intl there), so the substitution is done here, the same way `withBrand` does it.
 */
export function agencyRetentionNote(template: string): string {
  return template
    .replaceAll('{months}', String(AGENCY_REPORT_RETENTION_MONTHS))
    .replaceAll('{interval}', String(AGENCY_REPORT_PURGE_INTERVAL_MONTHS));
}
