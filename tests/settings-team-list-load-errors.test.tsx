// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';
import TeamList from '@/app/[locale]/(app)/[workspace]/settings/members/team-list';

/**
 * FO-153 (TASK-MVO8976S9DI6I) — the team list's load errors come from
 * `settings.members.teamList.errors.*` (CLAUDE.md rule 8), not from strings in
 * the component. Which error shows for which answer of `GET /api/team` is
 * unchanged: 401 → sessionOrMembership, 403 FORBIDDEN_ROLE → forbiddenRole,
 * anything else (or a network failure) → loadFailed.
 */

const messages = { tr: trMessages, en: enMessages } as const;

function renderList(locale: 'tr' | 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <TeamList isTr={locale === 'tr'} refreshKey={0} />
    </NextIntlClientProvider>,
  );
}

function answer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(['tr', 'en'] as const)('TeamList load errors (%s)', (locale) => {
  const errors = messages[locale].settings.members.teamList.errors;

  test('401 shows the session/membership message', async () => {
    const fetchMock = answer(401, { error: 'Unauthorized' });
    renderList(locale);
    expect((await screen.findByRole('alert')).textContent).toBe(errors.sessionOrMembership);
    // The effect depends on `t`; a new `t` per render would refetch forever.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('403 FORBIDDEN_ROLE shows the owner/admin-only message', async () => {
    answer(403, { error: 'Forbidden', code: 'FORBIDDEN_ROLE' });
    renderList(locale);
    expect((await screen.findByRole('alert')).textContent).toBe(errors.forbiddenRole);
  });

  test('another failure status shows the generic load message', async () => {
    answer(500, {});
    renderList(locale);
    expect((await screen.findByRole('alert')).textContent).toBe(errors.loadFailed);
  });

  test('a network failure shows the generic load message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    renderList(locale);
    expect((await screen.findByRole('alert')).textContent).toBe(errors.loadFailed);
  });
});

test('the three keys exist in both locales with different text', () => {
  for (const key of ['sessionOrMembership', 'forbiddenRole', 'loadFailed'] as const) {
    const tr = trMessages.settings.members.teamList.errors[key];
    const en = enMessages.settings.members.teamList.errors[key];
    expect(tr).toBeTruthy();
    expect(en).toBeTruthy();
    expect(tr).not.toBe(en);
  }
});
