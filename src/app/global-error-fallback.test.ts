import { describe, expect, it } from 'vitest';

import fallback from '../../messages/global-error-fallback.json';
import tr from '../../messages/tr.json';
import en from '../../messages/en.json';

/**
 * global-error.tsx shows these texts when the catalog chunk cannot load, so they must stay
 * identical to the `globalError` block of the catalogs. Otherwise a catalog edit silently
 * leaves the error screen with stale or mismatched copy.
 */
describe('global-error fallback texts', () => {
  it('match the globalError block of tr.json', () => {
    expect(fallback.tr).toEqual(tr.globalError);
  });

  it('match the globalError block of en.json', () => {
    expect(fallback.en).toEqual(en.globalError);
  });
});
