// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * FO-157 (TASK-MVP5XXVKAVA1R) — FO-41 made Discover's M1 read only and
 * `generateApiKey` refuses with READ_ONLY_PLAN, but the form stayed open. Pinned
 * here: a read-only plan gets a locked form with the READ_ONLY_PLAN sentence and
 * an upgrade link; a full plan gets the open form; a refusal that still comes
 * back (the plan changed under an open page) is shown and the page re-rendered.
 */

const { generateApiKey, refresh } = vi.hoisted(() => ({ generateApiKey: vi.fn(), refresh: vi.fn() }));

vi.mock('@/app/[locale]/(app)/[workspace]/settings/api-keys/actions', () => ({
  generateApiKey,
  revokeApiKey: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { ApiKeysClient, type ApiKeysReadOnly } from '@/app/[locale]/(app)/[workspace]/settings/api-keys/client';

const READ_ONLY: ApiKeysReadOnly = {
  moduleName: 'Partner Intelligence Database',
  plans: ['Pro', 'Ultra'],
  upgradeHref: '/tr/main/settings/billing',
};

function renderClient(readOnly: ApiKeysReadOnly | null, locale: 'tr' | 'en' = 'tr') {
  const messages = locale === 'tr' ? trMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApiKeysClient apiKeys={[]} apiBaseUrl="https://example.test" readOnly={readOnly} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  generateApiKey.mockReset();
  refresh.mockReset();
});
afterEach(cleanup);

describe('API keys form on a read-only M1 plan (FO-157)', () => {
  it('locks the form and shows the READ_ONLY_PLAN sentence with an upgrade link', () => {
    renderClient(READ_ONLY);
    const notice = screen.getByTestId('api-keys-read-only');
    expect(notice.textContent).toContain(trMessages.ApiKeysSettings.readOnly.title);
    expect(notice.textContent).toContain('Partner Intelligence Database modülü planınızda salt okunur');
    expect(notice.textContent).toContain('Pro, Ultra');
    const link = screen.getByRole('link', { name: trMessages.ApiKeysSettings.readOnly.upgrade });
    expect(link.getAttribute('href')).toBe('/tr/main/settings/billing');

    // A disabled <fieldset> disables its controls without setting their own attribute.
    expect(screen.getByRole('textbox').matches(':disabled')).toBe(true);
    const submit = screen.getByRole('button', { name: /API Key Oluştur/ }) as HTMLButtonElement;
    expect(submit.matches(':disabled')).toBe(true);
    fireEvent.submit(submit.form!);
    expect(generateApiKey).not.toHaveBeenCalled();
  });

  it('speaks English on an English page', () => {
    renderClient(READ_ONLY, 'en');
    expect(screen.getByTestId('api-keys-read-only').textContent).toContain(
      'Your plan includes the Partner Intelligence Database module read only',
    );
    expect(screen.getByRole('link', { name: enMessages.ApiKeysSettings.readOnly.upgrade })).toBeTruthy();
  });

  it('NG-3: the page shell follows the language, with no Turkish left on the English page', () => {
    const { unmount } = renderClient(null, 'en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('API Keys & B2B Developer Portal');
    expect(screen.getByRole('button', { name: 'Create API key (fp_live_...)' })).toBeTruthy();
    expect(document.body.textContent).toContain('requests / min');
    expect(document.body.textContent).not.toMatch(/Anahtar|istek \/ dk|Yetkilendirme|Güvenlik/);
    unmount();

    renderClient(null, 'tr');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('API Anahtarları');
    expect(document.body.textContent).toContain('istek / dk');
  });

  it('leaves the form open on a plan that grants M1 in full', async () => {
    generateApiKey.mockResolvedValue({
      apiKeyRecord: { id: 'k1', name: 'ERP', prefix: 'fp_live_abcd', lastUsedAt: null, createdAt: new Date() },
      rawKey: 'fp_live_abcd1234',
    });
    renderClient(null);
    expect(screen.queryByTestId('api-keys-read-only')).toBeNull();
    const input = screen.getByRole('textbox');
    expect(input.matches(':disabled')).toBe(false);
    fireEvent.change(input, { target: { value: 'ERP' } });
    fireEvent.click(screen.getByRole('button', { name: /API Key Oluştur/ }));
    await waitFor(() => expect(generateApiKey).toHaveBeenCalledWith({ name: 'ERP' }));
  });

  it('shows the module refusal and re-renders the page when the server still says no', async () => {
    // What a rejected action gives the browser in production: the digest only.
    generateApiKey.mockRejectedValue(Object.assign(new Error('x'), { digest: 'MODULE_ACCESS_DENIED' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderClient(null);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ERP' } });
    fireEvent.click(screen.getByRole('button', { name: /API Key Oluştur/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(trMessages.Common.moduleUnavailable);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
