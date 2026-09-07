// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import { BillingClient } from '@/app/[locale]/(app)/[workspace]/settings/billing/BillingClient';
import { CartProvider } from '@/components/cart/CartContext';
import { NO_DISCOUNT_TIER, LIFETIME_LICENCE_CAP } from '@/lib/billing/catalog';
import { lifetimeScarcity, type LifetimeScarcity } from '@/lib/billing/lifetime-licence';

/**
 * The lifetime scarcity badge on /settings/billing.
 *
 * Until TASK-MTR962OV5YGVX this panel printed two fixed strings out of the
 * message catalogue — "5 lisans sahibi · Sıradaki lisans #6" — with nothing
 * counting anything. `/pricing` was bound to `LifetimeLicence` rows first; this
 * pins the second surface to the same state so the two panels cannot disagree
 * about how many licences are left (CLAUDE.md rule 7).
 *
 * The catalogues are the real ones: a key deleted or renamed fails here rather
 * than shipping as a blank badge.
 */
const ENTITLEMENTS = {
  allowedModules: ['M1'],
  seats: 6,
  usedSeats: 3,
  workspaces: 5,
  usedWorkspaces: 1,
  aiCreditsMonthly: 1000,
  aiCreditsRemaining: 500,
};

function renderPanel(scarcity: LifetimeScarcity, locale: 'tr' | 'en' = 'tr') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'tr' ? trMessages : enMessages}
      timeZone="Europe/Istanbul"
    >
      <CartProvider activeTier={NO_DISCOUNT_TIER}>
        <BillingClient
          workspace="fabrika-beta"
          locale={locale}
          tenantId="tenant-1"
          tenantName="FonBridge Demo"
          currentPlanId="team"
          activeTier={NO_DISCOUNT_TIER}
          lifetimeScarcity={scarcity}
          entitlements={ENTITLEMENTS}
        />
      </CartProvider>
    </NextIntlClientProvider>
  );
}

function badge() {
  return screen.getByTestId('settings-lifetime-scarcity');
}

afterEach(cleanup);

describe('settings billing — lifetime scarcity badge', () => {
  it('claims no owner count when the count could not be read', () => {
    renderPanel(lifetimeScarcity(null));

    expect(badge().dataset.scarcity).toBe('unknown');
    expect(badge().textContent).toContain(String(LIFETIME_LICENCE_CAP));
    // The bug being fixed: an unreadable count must not read as "0 owners",
    // and must not promise a next licence number.
    expect(badge().textContent).not.toMatch(/#\d/);
  });

  it('says nobody has bought one yet, and offers licence #1', () => {
    renderPanel(lifetimeScarcity(0));

    expect(badge().dataset.scarcity).toBe('none');
    expect(badge().textContent).toContain('Henüz lisans sahibi yok');
    expect(badge().textContent).toContain('#1');
  });

  it('counts the recorded licences and numbers the next one', () => {
    renderPanel(lifetimeScarcity(7));

    expect(badge().dataset.scarcity).toBe('available');
    expect(badge().textContent).toContain('7 lisans sahibi');
    expect(badge().textContent).toContain('#8');
    // The number that used to be typed in is gone from the screen.
    expect(badge().textContent).not.toContain('5 lisans sahibi');
  });

  it('stops promising a next licence once the run is full', () => {
    renderPanel(lifetimeScarcity(LIFETIME_LICENCE_CAP));

    expect(badge().dataset.scarcity).toBe('sold-out');
    expect(badge().textContent).toContain(`${LIFETIME_LICENCE_CAP}/${LIFETIME_LICENCE_CAP}`);
    expect(badge().textContent).not.toMatch(/#\d/);
  });

  it('renders the counted figures in English too', () => {
    renderPanel(lifetimeScarcity(7), 'en');

    expect(badge().textContent).toContain('7 licence owners');
    expect(badge().textContent).toContain('#8');
  });
});
