import { beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer, { type SendMailOptions } from 'nodemailer';

/**
 * TASK-MUMLF57HOYFSB — outgoing mail over our own SMTP (nodemailer). The
 * transport is replaced by a fake, or by nodemailer's own `jsonTransport`,
 * which runs the real message builder without opening a socket. The real
 * SMTP round trip is proven against mailpit in the task's report.
 */

const env = vi.hoisted(() => ({
  NODE_ENV: 'test' as string,
  NEXT_PUBLIC_SMTP_FROM_ADDRESS: 'noreply@example.invalid',
}));
vi.mock('@/lib/env', () => ({ env }));

const recordAlert = vi.hoisted(() => vi.fn(async () => ({ status: 'recorded', id: 'a1' })));
vi.mock('@/lib/observability/system-alert', () => ({ recordAlert }));

const { smtpConfigFromEnv, sendMail, reportMailNotConfigured, MailSendError, MAIL_ALERT_SOURCE, createSmtpTransport } =
  await import('../mailer');
const { renderInvitationEmail, SUBJECT_ORG_MAX } = await import('../invitation-email');
const { invitationMailBaseUrl } = await import('../invitation-mail-policy');

const base = { NEXT_PUBLIC_SMTP_FROM_ADDRESS: 'noreply@example.invalid' };
const message = { to: 'invitee@example.invalid', subject: 's', html: '<p>h</p>' };

describe('smtpConfigFromEnv', () => {
  it('is null without SMTP_HOST — "cannot send", never a silent no-op', () => {
    expect(smtpConfigFromEnv({ ...base })).toBeNull();
  });

  it('defaults to STARTTLS on 587 and a branded from address', () => {
    expect(smtpConfigFromEnv({ ...base, SMTP_HOST: 'smtp.example.invalid' })).toEqual({
      host: 'smtp.example.invalid',
      port: 587,
      secure: false,
      auth: null,
      from: expect.stringContaining('<noreply@example.invalid>'),
    });
  });

  it('uses implicit TLS on 465 unless told otherwise, and needs both user and password for auth', () => {
    const on465 = smtpConfigFromEnv({ ...base, SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_USER: 'u' });
    expect(on465?.secure).toBe(true);
    expect(on465?.auth).toBeNull();
    const forced = smtpConfigFromEnv({
      ...base,
      SMTP_HOST: 'h',
      SMTP_PORT: '465',
      SMTP_SECURE: 'false',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      SMTP_FROM: 'Ops <ops@example.invalid>',
    });
    expect(forced).toMatchObject({ secure: false, auth: { user: 'u', pass: 'p' }, from: 'Ops <ops@example.invalid>' });
  });
});

describe('createSmtpTransport', () => {
  // Ö-1 of TASK-MUMMERMBJF1LM: requireTLS was proven live (ETLS against a
  // mailpit without STARTTLS) but pinned by no test, so dropping it survived
  // the suite. These read the options nodemailer is actually given.
  const optionsFor = (config: Parameters<typeof createSmtpTransport>[0]) => {
    const spy = vi.spyOn(nodemailer, 'createTransport');
    try {
      createSmtpTransport(config);
      return spy.mock.calls[0]?.[0] as Record<string, unknown>;
    } finally {
      spy.mockRestore();
    }
  };
  const common = { host: 'smtp.example.invalid', from: 'x <x@example.invalid>' };

  it('requires STARTTLS whenever credentials go over a non-implicit-TLS port', () => {
    const options = optionsFor({ ...common, port: 587, secure: false, auth: { user: 'u', pass: 'p' } });
    expect(options).toMatchObject({
      host: 'smtp.example.invalid',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('does not add requireTLS on implicit TLS, which is encrypted from the first byte', () => {
    const options = optionsFor({ ...common, port: 465, secure: true, auth: { user: 'u', pass: 'p' } });
    expect(options).toMatchObject({ secure: true, requireTLS: false });
  });

  it('leaves a credential-less local catcher reachable and sends no auth block', () => {
    const options = optionsFor({ ...common, port: 1025, secure: false, auth: null });
    expect(options).toMatchObject({ secure: false, requireTLS: false });
    expect(options).not.toHaveProperty('auth');
  });

  it('bounds how long a dead host can hold a request', () => {
    const options = optionsFor({ ...common, port: 587, secure: false, auth: null });
    expect(options).toMatchObject({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 });
  });
});

describe('sendMail', () => {
  const config = smtpConfigFromEnv({ ...base, SMTP_HOST: 'h' })!;

  it('hands the message to the transport with the configured sender and returns its id', async () => {
    const transport = { sendMail: vi.fn(async () => ({ messageId: '<m1@h>', rejected: [] })) };
    await expect(sendMail(transport, config, message)).resolves.toEqual({ messageId: '<m1@h>' });
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: config.from,
      to: message.to,
      subject: 's',
      html: '<p>h</p>',
    });
  });

  it('builds a real MIME message through nodemailer', async () => {
    const real = nodemailer.createTransport({ jsonTransport: true });
    let built: unknown;
    const transport = {
      sendMail: async (m: SendMailOptions) => {
        const info = (await real.sendMail(m)) as unknown as { messageId: string; message: string };
        built = JSON.parse(info.message);
        return info;
      },
    };
    const { messageId } = await sendMail(transport, config, { ...message, text: 'plain' });
    expect(messageId).toMatch(/@/);
    expect(built).toMatchObject({
      from: { address: 'noreply@example.invalid' },
      to: [{ address: message.to }],
      subject: 's',
      html: '<p>h</p>',
      text: 'plain',
    });
  });

  it('turns an SMTP refusal into MailSendError with codes only, never the reply text', async () => {
    const refusal = Object.assign(new Error(`550 5.1.1 <${message.to}>: user unknown`), {
      code: 'EENVELOPE',
      responseCode: 550,
      response: `550 5.1.1 <${message.to}>: user unknown`,
    });
    const transport = { sendMail: vi.fn(async () => Promise.reject(refusal)) };
    const failure = await sendMail(transport, config, message).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MailSendError);
    expect((failure as Error).message).toBe('smtp:EENVELOPE:550');
    expect((failure as Error).message).not.toContain(message.to);
  });

  it('treats a recipient listed as rejected as not delivered', async () => {
    const transport = { sendMail: vi.fn(async () => ({ messageId: '<m2@h>', rejected: [message.to] })) };
    await expect(sendMail(transport, config, message)).rejects.toThrow('smtp:EENVELOPE');
  });
});

describe('reportMailNotConfigured', () => {
  beforeEach(() => {
    recordAlert.mockClear();
    env.NODE_ENV = 'test';
  });

  it('logs an error but writes no alert outside production', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await reportMailNotConfigured('invitations');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('SMTP is not configured'));
    expect(recordAlert).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('writes one deduplicated error SystemAlert per caller in production', async () => {
    env.NODE_ENV = 'production';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await reportMailNotConfigured('invitations');
    expect(recordAlert).toHaveBeenCalledWith({
      level: 'error',
      source: MAIL_ALERT_SOURCE,
      message: expect.stringContaining('invitations'),
      meta: { caller: 'invitations' },
      dedupeKey: 'smtp-not-configured:invitations',
    });
  });
});

describe('renderInvitationEmail', () => {
  it('escapes the tenant-chosen name in HTML and keeps it on one header line', () => {
    const mail = renderInvitationEmail({
      to: message.to,
      tenantName: '<b>Acme</b>\r\nBcc: x@example.invalid',
      inviteLink: 'https://app.example.invalid/tr/accept-invite?token=abc',
      expires: new Date('2026-10-06T00:00:00Z'),
    });
    expect(mail.html).not.toContain('<b>Acme</b>');
    expect(mail.html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text).toContain('accept-invite?token=abc');
    expect(mail.text).toContain('2026-10-06');
  });

  it('cuts a long tenant name to SUBJECT_ORG_MAX characters in the Subject, not in the body', () => {
    const name = `${'Ş'.repeat(70)}${'😀'.repeat(40)}`;
    const mail = renderInvitationEmail({
      to: message.to,
      tenantName: name,
      inviteLink: 'https://app.example.invalid/tr/accept-invite?token=abc',
      expires: new Date('2026-10-06T00:00:00Z'),
    });
    const org = mail.subject.split(' — ')[0]!;
    expect(Array.from(org)).toHaveLength(SUBJECT_ORG_MAX);
    expect(org.endsWith('…')).toBe(true);
    expect(org).not.toMatch(/[\uD800-\uDBFF]…$/);
    expect(mail.text).toContain(name);
  });

  it('keeps a short tenant name whole', () => {
    const mail = renderInvitationEmail({
      to: message.to,
      tenantName: 'Acme',
      inviteLink: 'https://app.example.invalid/x',
      expires: new Date('2026-10-06T00:00:00Z'),
    });
    expect(mail.subject.startsWith('Acme — ')).toBe(true);
  });
});

describe('invitationMailBaseUrl', () => {
  // K-3 of TASK-MUMMERMBJF1LM: a localhost link must never be mailed in production.
  it('is null when NEXT_PUBLIC_APP_URL is unset or blank, in every environment', () => {
    expect(invitationMailBaseUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: undefined })).toBeNull();
    expect(invitationMailBaseUrl({ NODE_ENV: 'development', NEXT_PUBLIC_APP_URL: '  ' })).toBeNull();
  });

  it('is null for a loopback URL in production', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'http://app.localhost']) {
      expect(invitationMailBaseUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: url })).toBeNull();
    }
  });

  it('allows a loopback URL set on purpose outside production, and a real host anywhere', () => {
    expect(invitationMailBaseUrl({ NODE_ENV: 'development', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })).toBe(
      'http://localhost:3000'
    );
    expect(invitationMailBaseUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://app.example.invalid/' })).toBe(
      'https://app.example.invalid'
    );
  });

  it('is null for a value that is not a URL', () => {
    expect(invitationMailBaseUrl({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'app.example.invalid' })).toBeNull();
  });
});
