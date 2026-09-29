// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import AuthCard from '@/app/[locale]/login/AuthCard';

/**
 * İNCELEME-14 K-3 (TASK-MUMAC1VT7DT5Q) — Auth.js sends its own sign-in errors
 * to the sign-in page as `?error=<type>` (pages.signIn in src/lib/auth.ts;
 * @auth/core only lets OAuthAccountNotLinked, OAuthCallbackError, … through
 * and turns the rest into `Configuration`). AuthCard used to map only our three
 * signIn-callback codes, so every Auth.js error left a silent login card.
 */

const { searchParams } = vi.hoisted(() => ({ searchParams: { current: new URLSearchParams() } }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// Server actions pull in NextAuth and Prisma; the card only needs the names.
vi.mock('@/lib/actions/auth', () => ({
  loginWithCredentialsAction: vi.fn(),
  loginWithSocialAction: vi.fn(),
}));

function renderCard(locale: 'tr' | 'en', query: string) {
  searchParams.current = new URLSearchParams(query);
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'tr' ? trMessages : enMessages}>
      <AuthCard locale={locale} demoLoginEnabled={false} oauthProviders={{ google: true, microsoft: false }} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe('AuthCard ?error= messages', () => {
  test('OAuthAccountNotLinked gets its own message', () => {
    renderCard('tr', 'error=OAuthAccountNotLinked');
    expect(screen.getByRole('alert').textContent).toContain(trMessages.Auth.signInError.OAuthAccountNotLinked);
    expect(screen.queryByText(/OAuthAccountNotLinked/)).toBeNull();
  });

  test.each(['OAuthCallbackError', 'Configuration', 'AccessDenied'])('%s gets the generic message', (code) => {
    renderCard('tr', `error=${code}`);
    expect(screen.getByRole('alert').textContent).toContain(trMessages.Auth.signInError.generic);
  });

  test('an unknown code shows the generic message, never its own text', () => {
    renderCard('en', 'error=Your_account_is_suspended_call_0850');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(enMessages.Auth.signInError.generic);
    expect(alert.textContent).not.toContain('suspended');
  });

  test.each(['invite_invalid', 'disclosure_required', 'email_unverified'] as const)(
    'our own code %s keeps its message',
    (code) => {
      renderCard('tr', `error=${code}`);
      expect(screen.getByRole('alert').textContent).toContain(trMessages.Auth.signInError[code]);
    },
  );

  test('no or empty error parameter, no alert', () => {
    renderCard('tr', '');
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    renderCard('tr', 'error=');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('the dismiss button is labelled and clears the alert', () => {
    renderCard('tr', 'error=OAuthCallbackError');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
