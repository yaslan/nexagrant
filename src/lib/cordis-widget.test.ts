import { describe, expect, it } from 'vitest';
import { CORDIS_PROJECT_QUERY, CORDIS_PROJECT_SORT, CORDIS_SEARCH_URL, cordisWidgetLang } from './cordis-widget';

describe('cordis-widget (FO-169)', () => {
  it('asks CORDIS for English on the Turkish page: the widget has no Turkish labels', () => {
    expect(cordisWidgetLang('tr')).toBe('en');
    expect(cordisWidgetLang('en')).toBe('en');
    expect(cordisWidgetLang('de')).toBe('de');
  });

  it('the fallback link opens the same search the widget runs, newest update first', () => {
    const url = new URL(CORDIS_SEARCH_URL);
    expect(url.origin + url.pathname).toBe('https://cordis.europa.eu/search');
    expect(url.searchParams.get('q')).toBe(CORDIS_PROJECT_QUERY);
    expect(url.searchParams.get('srt')).toBe(CORDIS_PROJECT_SORT);
  });
});
