// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import PublicFooter from '@/components/PublicFooter';
import { PRODUCT_NAME } from '@/lib/brand';

/**
 * TASK-MTSWM36QWC36Z — the brand-bearing surfaces render, in both languages.
 *
 * `pnpm i18n-check` proves a key exists in both catalogues; it cannot prove the message
 * renders. A `{brand}` placeholder whose caller forgets to pass `brand` throws inside
 * next-intl at render time — a blank or crashed footer in production that every static check
 * ashore of the browser reports as green. These two components carry the placeholder in the
 * copyright line and the logo alt text, so it is rendered against the real catalogues.
 *
 * `PublicNavbar` carries the same alt text but cannot be mounted here: it pulls `UserMenu`
 * and through it next-auth, which does not resolve under vitest. It is covered by the
 * catalogue and source assertions in `tests/retired-brand-name.test.ts` instead.
 */
const CATALOGUES = { tr: trMessages, en: enMessages } as const;

/**
 * The name the platform used to ship under. `tests/retired-brand-name.test.ts` guards the
 * sources and the catalogues against it; this file guards what the browser actually paints,
 * which is the only place a caller-side interpolation bug can show up. It is written as a
 * literal on purpose: a retired name is a fact of history, not a value that follows
 * `PRODUCT_NAME`.
 */
const RETIRED_BRAND = 'Fabrika';

afterEach(cleanup);

describe('brand surfaces', () => {
  it.each(['tr', 'en'] as const)('public footer renders the product name (%s)', (locale) => {
    render(
      <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
        <PublicFooter locale={locale} />
      </NextIntlClientProvider>
    );

    const copyright = screen.getByText(new RegExp(`©\\s*\\d{4}\\s*${PRODUCT_NAME}`));
    expect(copyright.textContent).toContain(PRODUCT_NAME);
    // The year is interpolated as a string: ICU would otherwise group it as "2.026".
    expect(copyright.textContent).not.toMatch(/[.,]\d{3}/);
    expect(copyright.textContent).not.toContain(RETIRED_BRAND);

    expect(screen.getByAltText(new RegExp(PRODUCT_NAME))).toBeDefined();
  });

});
