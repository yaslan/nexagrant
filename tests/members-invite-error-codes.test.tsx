// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import trMessages from '../messages/tr.json';
import enMessages from '../messages/en.json';

/**
 * NG-89 — the members page shows an invite refusal in the reader's language,
 * from the `code` POST /api/invitations answers, not the Turkish `error`
 * sentence in the body. A body without a known code keeps the old behaviour.
 */

const locale = vi.hoisted(() => ({ current: 'en' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ locale: locale.current }) }));

import MembersSettingsPage from '@/app/[locale]/(app)/[workspace]/settings/members/members-client';

const TR_BODY = {
  ALREADY_MEMBER: 'Bu e-posta adresi zaten bu kurumun üyesidir.',
  INVALID_EMAIL: 'Geçerli bir e-posta adresi zorunludur.',
  INTERNAL_ERROR: 'İç Sunucu Hatası',
  SEAT_LIMIT_REACHED: 'Planınızın koltuk sınırına ulaşıldı (2 koltuk: 1 üye, 1 bekleyen davet).',
} as const;

function stubInviteRefusal(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: unknown, init?: { method?: string }) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
        : new Response(JSON.stringify({ me: { userId: 'u', role: 'TENANT_OWNER' }, members: [], invitations: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
    )
  );
}

async function submitInvite(lang: 'tr' | 'en'): Promise<string> {
  locale.current = lang;
  render(
    <NextIntlClientProvider locale={lang} messages={lang === 'tr' ? trMessages : enMessages}>
      <MembersSettingsPage />
    </NextIntlClientProvider>
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: lang === 'tr' ? trMessages.settings.members.page.submit : 'Send Invite' }));
  let text = '';
  await waitFor(() => {
    text = screen.getByRole('alert').textContent ?? '';
    expect(text).not.toBe('');
  });
  return text;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('members page — invite refusal codes (NG-89)', () => {
  test.each(['ALREADY_MEMBER', 'INVALID_EMAIL', 'INTERNAL_ERROR'] as const)(
    '%s: the catalogue sentence in both locales, never the Turkish body',
    async (code) => {
      const status = code === 'INTERNAL_ERROR' ? 500 : 400;
      stubInviteRefusal(status, { error: TR_BODY[code], code });
      const en = await submitInvite('en');
      expect(en).toBe(enMessages.settings.members.page.errors[code]);
      expect(en).not.toContain(TR_BODY[code]);
      cleanup();

      stubInviteRefusal(status, { error: TR_BODY[code], code });
      expect(await submitInvite('tr')).toBe(trMessages.settings.members.page.errors[code]);
    }
  );

  test('SEAT_LIMIT_REACHED: the numbers from `seats` in the reader’s language', async () => {
    const body = { error: TR_BODY.SEAT_LIMIT_REACHED, code: 'SEAT_LIMIT_REACHED', seats: { limit: 2, members: 1, pendingInvitations: 1 } };
    stubInviteRefusal(403, body);
    const en = await submitInvite('en');
    expect(en).toMatch(/seat limit/i);
    expect(en).toContain('2');
    expect(en).not.toMatch(/koltuk/);
    cleanup();

    stubInviteRefusal(403, body);
    expect(await submitInvite('tr')).toMatch(/koltuk sınırına/);
  });

  test('FORBIDDEN_ROLE: the shared role sentence in English', async () => {
    stubInviteRefusal(403, { error: 'Bu işlem için yetkiniz yok.', code: 'FORBIDDEN_ROLE' });
    expect(await submitInvite('en')).toBe(enMessages.Common.forbiddenRole);
  });

  test('no known code: the old behaviour (body text after the prefix)', async () => {
    stubInviteRefusal(400, { error: 'Invalid email' });
    expect(await submitInvite('en')).toBe('Error: Invalid email');
  });
});
