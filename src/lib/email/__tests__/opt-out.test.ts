import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';

import { sendMail, type MailMessage, type SmtpConfig } from '../mailer';
import { emailOptOutHash, signOptOutToken, verifyOptOutToken, withOptOut } from '../opt-out';

/**
 * NG-42 — the opt-out link of a first message. `jsonTransport` runs nodemailer's
 * own message builder without a socket, so the header assertions read what
 * would really go out.
 */

const secret = 'test-secret-at-least-thirty-two-characters';
const baseUrl = 'https://app.example.invalid';
const message: MailMessage = { to: 'Invitee@Example.invalid', subject: 's', html: '<p>h</p>', text: 'h' };
const config: SmtpConfig = { host: 'h', port: 25, secure: false, auth: null, from: 'x <x@example.invalid>' };
const payload = { kind: 'unsubscribe', hash: emailOptOutHash('a@example.invalid'), source: 'invitation', tenantId: 't1' } as const;

function urlsIn(text: string): string[] {
  return [...text.matchAll(/https:\/\/\S+/g)].map((m) => m[0]);
}

describe('emailOptOutHash', () => {
  it('is the same for any case and surrounding space, and never contains the address', () => {
    const hash = emailOptOutHash('  A.Person@Example.invalid ');
    expect(hash).toBe(emailOptOutHash('a.person@example.invalid'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    'Ayşe Yılmaz <a.person@example.invalid>',
    '"Yılmaz, Ayşe" <A.Person@Example.invalid>',
    '"a <b@example.invalid>" <a.person@example.invalid>',
    '  <a.person@example.invalid>  ',
  ])('hashes the address inside %s', (to) => {
    expect(emailOptOutHash(to)).toBe(emailOptOutHash('a.person@example.invalid'));
  });

  it('does not change the hash of a bare address', () => {
    // A recorded opt-out is found by this value, so it may never move.
    expect(emailOptOutHash('a.person@example.invalid')).toBe(
      createHash('sha256').update('fonbridge:email-opt-out:v1:a.person@example.invalid', 'utf8').digest('hex')
    );
  });
});

describe('emailOptOutSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function secretWith(values: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries({ NEXTAUTH_SECRET: undefined, ...values })) vi.stubEnv(key, value);
    vi.resetModules();
    return (await import('@/lib/env')).emailOptOutSecret();
  }

  const OPT_OUT = 'o'.repeat(32);
  const AUTH = 'a'.repeat(32);

  it('uses its own key when one is set, so rotating AUTH_SECRET leaves the links alone', async () => {
    expect(await secretWith({ EMAIL_OPTOUT_SECRET: OPT_OUT, AUTH_SECRET: AUTH })).toBe(OPT_OUT);
    expect(await secretWith({ EMAIL_OPTOUT_SECRET: OPT_OUT, AUTH_SECRET: 'b'.repeat(32) })).toBe(OPT_OUT);
  });

  it.each([undefined, '', '   '])('falls back to AUTH_SECRET when EMAIL_OPTOUT_SECRET is %j', async (value) => {
    expect(await secretWith({ EMAIL_OPTOUT_SECRET: value, AUTH_SECRET: AUTH })).toBe(AUTH);
  });

  it('is null when neither is set', async () => {
    expect(await secretWith({ EMAIL_OPTOUT_SECRET: undefined, AUTH_SECRET: undefined })).toBeNull();
  });
});

describe('opt-out token', () => {
  it('round-trips what it signed', () => {
    expect(verifyOptOutToken(signOptOutToken(payload, secret), secret)).toEqual(payload);
  });

  it('carries no address in the clear', () => {
    const token = signOptOutToken(payload, secret);
    expect(Buffer.from(token.split('.')[0]!, 'base64url').toString()).not.toContain('@');
  });

  it('refuses a changed body, a changed signature and another secret', () => {
    const token = signOptOutToken(payload, secret);
    const [body, sig] = token.split('.') as [string, string];
    const other = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), t: 't2' })).toString('base64url');
    expect(verifyOptOutToken(`${other}.${sig}`, secret)).toBeNull();
    expect(verifyOptOutToken(`${body}.${sig.slice(0, -1)}A`, secret)).toBeNull();
    expect(verifyOptOutToken(token, `${secret}x`)).toBeNull();
  });

  it.each([null, undefined, 42, '', 'no-dot', '.', 'a.b', `${'x'.repeat(5000)}.y`])('refuses %s', (raw) => {
    expect(verifyOptOutToken(raw, secret)).toBeNull();
  });
});

describe('withOptOut', () => {
  const out = withOptOut(message, { baseUrl, secret, source: 'invitation', tenantId: 't1' });

  it('keeps the message and points the header at the one-click endpoint', () => {
    expect(out).toMatchObject({ to: message.to, subject: 's' });
    expect(out.listUnsubscribe).toMatch(/^https:\/\/app\.example\.invalid\/api\/email\/opt-out\?t=/);
  });

  it('puts a decline link and an unsubscribe link in both bodies, each with its own kind', () => {
    const links = urlsIn(out.text!);
    expect(links).toHaveLength(2);
    const kinds = links.map((l) => verifyOptOutToken(new URL(l).searchParams.get('t'), secret)?.kind);
    expect(kinds.sort()).toEqual(['decline', 'unsubscribe']);
    for (const link of links) expect(out.html).toContain(link);
  });

  it('hashes the recipient the same way the suppression check does', () => {
    const token = new URL(out.listUnsubscribe!).searchParams.get('t');
    expect(verifyOptOutToken(token, secret)?.hash).toBe(emailOptOutHash('invitee@example.invalid'));
  });

  it('gives a "Name <address>" recipient the hash the suppression check looks up', () => {
    const named = withOptOut({ ...message, to: 'Davetli Kişi <Invitee@Example.invalid>' }, { baseUrl, secret, source: 'invitation', tenantId: 't1' });
    const token = new URL(named.listUnsubscribe!).searchParams.get('t');
    expect(verifyOptOutToken(token, secret)?.hash).toBe(emailOptOutHash('invitee@example.invalid'));
  });
});

describe('sendMail with an opt-out', () => {
  it('writes List-Unsubscribe and the RFC 8058 one-click header on the raw message', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    let raw = '';
    await sendMail(
      {
        sendMail: async (m) => {
          const info = (await transport.sendMail(m)) as unknown as { message: Buffer; messageId: string };
          raw = info.message.toString();
          return { messageId: info.messageId };
        },
      },
      config,
      withOptOut(message, { baseUrl, secret, source: 'invitation', tenantId: 't1' })
    );
    // nodemailer folds the long value onto a continuation line; the URL stays whole.
    expect(raw).toMatch(/^List-Unsubscribe:\s+<https:\/\/app\.example\.invalid\/api\/email\/opt-out\?t=[^\s>]+>$/m);
    expect(raw).toMatch(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m);
  });

  it('adds neither header to a mail without an opt-out', async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
    let raw = '';
    await sendMail(
      {
        sendMail: async (m) => {
          const info = (await transport.sendMail(m)) as unknown as { message: Buffer; messageId: string };
          raw = info.message.toString();
          return { messageId: info.messageId };
        },
      },
      config,
      message
    );
    expect(raw).not.toMatch(/List-Unsubscribe/i);
  });
});
