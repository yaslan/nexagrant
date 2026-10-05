// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import PublicFooter from '@/components/PublicFooter';

/**
 * TASK-MUN2UXWTAX1AQ (İNCELEME-40 B-2) — the public footer told every visitor, municipalities
 * included, "🇪🇺 Frankfurt & Istanbul Data Centers". There is no Frankfurt data centre: the
 * owner's decision (29.09.2026) is Vulut, Türkiye, with only Anthropic, OpenAI and Google OAuth
 * leaving the country. The footer now says the *database* is in Türkiye — not "all data",
 * because docs/kamu/VERI-YERLESIMI.md lists "Tüm veri Türkiye'de kalır" among the things we do
 * not promise (the R2 bucket region is unverified).
 */
const CATALOGUES = { tr: trMessages, en: enMessages } as const;

/** Hosting claims that contradict the Vulut decision. */
const FALSE_HOSTING_CLAIM = /frankfurt|eu cloud|data cent(er|re)s?|veri merkez/i;

afterEach(cleanup);

describe('public footer — data residency', () => {
  it.each([
    ['tr', "🇹🇷 Veritabanı Türkiye'de barındırılır"],
    ['en', '🇹🇷 Database hosted in Türkiye'],
  ] as const)('states where the database is hosted, and nothing else (%s)', (locale, residency) => {
    const { container } = render(
      <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
        <PublicFooter locale={locale} />
      </NextIntlClientProvider>
    );

    expect(screen.getByText(residency)).toBeDefined();
    expect(container.textContent).not.toMatch(FALSE_HOSTING_CLAIM);
    // usfinbridge.com was voided on 29.09.2026; the live domain is fonbridge.com.
    const mail = container.querySelector('a[href^="mailto:"]');
    expect(mail?.getAttribute('href')).toBe('mailto:info@fonbridge.com');
  });

  it.each(['tr', 'en'] as const)('the %s catalogue carries no Frankfurt / EU-cloud claim', (locale) => {
    expect(JSON.stringify(CATALOGUES[locale])).not.toMatch(/frankfurt|eu cloud/i);
  });
});
