/**
 * CORDIS's embeddable project-list widget on the landing page (FO-169).
 *
 * The embed parameters are the ones the owner handed over (2026-10-26). The
 * search is defined once, here, and both the widget and the fallback link use it,
 * so the link always opens the list the widget would have shown.
 */

const CORDIS_DATALAB = 'https://cordis.europa.eu/datalab/visualisations';

export const CORDIS_WIDGET_LOADER_URL = `${CORDIS_DATALAB}/widget/js/widgetLoader.js`;
export const CORDIS_WIDGET_CSS_URL = `${CORDIS_DATALAB}/themes/web-ecl/css/widgetSearchResultTable.css`;

/** Horizon Europe projects with a participant from Türkiye. */
export const CORDIS_PROJECT_QUERY =
  "contenttype='project' AND frameworkProgramme='HORIZON' AND relatedRegion/region/euCode=='TR'";
export const CORDIS_PROJECT_SORT = '/project/contentUpdateDate:decreasing';
export const CORDIS_PROJECT_COUNT = 6;

/** The same search on cordis.europa.eu — the fallback when the widget cannot show. */
export const CORDIS_SEARCH_URL = `https://cordis.europa.eu/search?${new URLSearchParams({
  q: CORDIS_PROJECT_QUERY,
  p: '1',
  num: '10',
  srt: CORDIS_PROJECT_SORT,
}).toString()}`;

/** How long the table may take before the fallback link replaces it. */
export const CORDIS_WIDGET_TIMEOUT_MS = 8_000;

/**
 * Languages the widget has labels for. Checked against CORDIS on 2026-10-26:
 * `language/en/lab-common.json` answers 200, `language/tr/...` 404 — there is no
 * Turkish, so the Turkish page gets the English widget inside Turkish framing.
 */
const CORDIS_WIDGET_LANGS = new Set(['en', 'de', 'fr', 'it', 'es', 'pl']);

export function cordisWidgetLang(locale: string): string {
  return CORDIS_WIDGET_LANGS.has(locale) ? locale : 'en';
}
