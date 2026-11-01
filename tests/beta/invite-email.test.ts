import { describe, it, expect, vi } from 'vitest';
import { renderBetaInviteEmail } from '@/lib/beta/invite-email';
import { PRODUCT_NAME } from '@/lib/brand';

const base = {
  contactName: 'Jane Doe',
  orgName: 'Acme BV',
  inviteUrl: 'https://app.fabrika.dev/en/invite/tok123',
  firstCheckinLabel: 'Monday 7 September 2026, 15:00',
  guideUrl: 'https://app.fabrika.dev/en/beta/guide',
  feedbackFormUrl: 'https://app.fabrika.dev/beta/feedback',
};

describe('renderBetaInviteEmail', () => {
  it('uses the Turkish subject required by the brief', () => {
    expect(renderBetaInviteEmail({ ...base, locale: 'tr' }).subject).toBe(
      `${PRODUCT_NAME} Beta — Sizi davet ediyoruz`
    );
  });

  it('uses a distinct English subject', () => {
    expect(renderBetaInviteEmail({ ...base, locale: 'en' }).subject).toBe(
      `${PRODUCT_NAME} Beta — you are invited`
    );
  });

  it.each(['tr', 'en'] as const)('covers every brief section in %s', (locale) => {
    const { html, text } = renderBetaInviteEmail({ ...base, locale });
    for (const body of [html, text]) {
      expect(body).toContain(base.inviteUrl);
      expect(body).toContain(base.guideUrl);
      expect(body).toContain(base.feedbackFormUrl);
      expect(body).toContain('info@nexagrant.com');
      expect(body).toContain('Acme BV');
      expect(body).toContain('Jane Doe');
    }
    expect(text).toContain('K1');
    expect(text).toContain('M5');
    expect(text).toContain('M2');
    expect(html).toContain(`<html lang="${locale}">`);
  });

  it('escapes recipient data so a name cannot inject markup', () => {
    const { html } = renderBetaInviteEmail({
      ...base,
      locale: 'en',
      orgName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders the two locales differently', () => {
    const tr = renderBetaInviteEmail({ ...base, locale: 'tr' });
    const en = renderBetaInviteEmail({ ...base, locale: 'en' });
    expect(tr.text).not.toBe(en.text);
  });
});

// P-9 (TASK-MUPIR7Y1P7AH4): with the env vars unset, both beta addresses fall
// back to the one mailbox that exists. The rendering test above cannot tell the
// two apart once they share a value, so pin each default on its own.
describe('beta contact defaults', () => {
  it('fall back to info@nexagrant.com when the env vars are unset', async () => {
    vi.stubEnv('BETA_SUPPORT_EMAIL', undefined);
    vi.stubEnv('BETA_FEEDBACK_EMAIL', undefined);
    vi.resetModules();
    try {
      const c = await import('@/lib/beta/constants');
      expect(c.BETA_SUPPORT_EMAIL).toBe('info@nexagrant.com');
      expect(c.BETA_FEEDBACK_EMAIL).toBe('info@nexagrant.com');
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
