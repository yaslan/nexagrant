import { describe, expect, test } from 'vitest';

import { issueSecretToken } from '@/lib/secret-token';
import { decideOAuthSignIn, type OAuthSignInDeps } from '@/lib/oauth-registration';

import { classifyInvitation, maskEmail, sameEmail, type InvitationLookupRow } from './accept';
import { decodeParkedInvitation, encodeParkedInvitation, parseInvitationToken } from './accept-cookie';
import type { InvitationSignInView } from './accept';

/** TASK-MUN2793A57Z9I — the pure rules of the invitation accept path. */

const NOW = new Date('2026-09-29T12:00:00Z');

function row(over: Partial<InvitationLookupRow> = {}, hash?: string): InvitationLookupRow {
  return {
    id: 'inv1',
    email: 'davetli@example.com',
    tenantId: 't1',
    role: 'WRITER',
    tokenHash: hash ?? 'x',
    expires: new Date(NOW.getTime() + 60_000),
    acceptedAt: null,
    tenant: { name: 'Kurum', deletedAt: null },
    ...over,
  };
}

describe('classifyInvitation', () => {
  const { raw, hash } = issueSecretToken();

  test('pending', () => {
    expect(classifyInvitation(row({}, hash), raw, NOW)).toMatchObject({
      status: 'pending',
      invitation: { id: 'inv1', tenantName: 'Kurum', role: 'WRITER' },
    });
  });
  test('no row, or a token that does not hash to the row: invalid', () => {
    expect(classifyInvitation(null, raw, NOW)).toEqual({ status: 'invalid' });
    expect(classifyInvitation(row({}, hash), issueSecretToken().raw, NOW)).toEqual({ status: 'invalid' });
  });
  test('deleted tenant: revoked, before anything else', () => {
    expect(
      classifyInvitation(row({ tenant: { name: 'K', deletedAt: NOW }, acceptedAt: NOW }, hash), raw, NOW).status
    ).toBe('revoked');
  });
  test('accepted: used, even when also expired', () => {
    expect(
      classifyInvitation(row({ acceptedAt: NOW, expires: new Date(NOW.getTime() - 1) }, hash), raw, NOW).status
    ).toBe('used');
  });
  test('expiry is exclusive: expires == now is expired', () => {
    expect(classifyInvitation(row({ expires: NOW }, hash), raw, NOW).status).toBe('expired');
    expect(classifyInvitation(row({ expires: new Date(NOW.getTime() + 1) }, hash), raw, NOW).status).toBe('pending');
  });
});

describe('cookie value', () => {
  const { raw } = issueSecretToken();
  test('round trip', () => {
    expect(decodeParkedInvitation(encodeParkedInvitation({ token: raw, locale: 'en' }))).toEqual({ token: raw, locale: 'en' });
  });
  test('anything else is null', () => {
    for (const v of [undefined, '', raw, `de.${raw}`, `tr.${raw.slice(1)}`, `tr.${raw}x`, `tr.${raw.toUpperCase()}z`]) {
      expect(decodeParkedInvitation(v)).toBeNull();
    }
  });
  test('parseInvitationToken accepts only 64 hex', () => {
    expect(parseInvitationToken(raw)).toBe(raw);
    expect(parseInvitationToken(` ${raw.toUpperCase()} `)).toBe(raw);
    expect(parseInvitationToken('abc')).toBeNull();
    expect(parseInvitationToken(null)).toBeNull();
    expect(parseInvitationToken(`${raw}' OR 1=1`)).toBeNull();
  });
});

describe('sameEmail / maskEmail', () => {
  test('case and outer spaces only', () => {
    expect(sameEmail(' Davetli@Example.com ', 'davetli@example.com')).toBe(true);
    expect(sameEmail('davetli@example.com', 'davetli@example.co')).toBe(false);
    expect(sameEmail(null, 'a@b.c')).toBe(false);
  });
  test('mask keeps the first letter and the domain', () => {
    expect(maskEmail('davetli@example.com')).toBe('d***@example.com');
    expect(maskEmail('nope')).toBe('***');
  });
});

describe('decideOAuthSignIn with a parked invitation', () => {
  const email = 'davetli@example.com';
  const verified = { email, email_verified: true };

  function deps(view: InvitationSignInView, over: Partial<OAuthSignInDeps> = {}): OAuthSignInDeps & { cleared: number } {
    const d = {
      cleared: 0,
      accountExists: async () => false,
      userExistsByEmail: async () => false,
      readInvite: async () => ({ status: 'none' as const }),
      readAcknowledged: async () => true,
      probeInviteCode: async () => true,
      noteRejection: async () => {},
      clearInvite: async () => {
        d.cleared += 1;
      },
      readInvitation: async () => view,
      ...over,
    };
    return d;
  }
  const pending: InvitationSignInView = { status: 'pending', locale: 'en', email, readOnly: false };
  const input = (e = email, profile: Record<string, unknown> = verified) => ({
    provider: 'google',
    providerAccountId: 'g1',
    email: e,
    profile,
  });

  test('a new, verified, matching, acknowledged address is let through — not as a plain registration', async () => {
    const d = deps(pending);
    expect(await decideOAuthSignIn(input(), d)).toEqual({ allow: true });
    expect(d.cleared).toBe(1);
  });
  test('another address: back to the accept screen, no account', async () => {
    const other = 'baska@example.com';
    expect(await decideOAuthSignIn(input(other, { email: other, email_verified: true }), deps(pending))).toEqual({
      allow: false,
      redirect: '/en/accept-invite/continue?error=email_mismatch',
    });
  });
  test('unverified address', async () => {
    expect(await decideOAuthSignIn(input(email, { email, email_verified: false }), deps(pending))).toEqual({
      allow: false,
      redirect: '/en/accept-invite/continue?error=email_unverified',
    });
  });
  test('no acknowledgement', async () => {
    expect(await decideOAuthSignIn(input(), deps(pending, { readAcknowledged: async () => false }))).toEqual({
      allow: false,
      redirect: '/en/accept-invite/continue?error=disclosure_required',
    });
  });
  test('expired pilot', async () => {
    expect(await decideOAuthSignIn(input(), deps({ ...pending, readOnly: true }))).toEqual({
      allow: false,
      redirect: '/en/accept-invite/continue?error=pilot_expired',
    });
  });
  test('an unusable invitation never falls through to a plain registration', async () => {
    expect(await decideOAuthSignIn(input(), deps({ status: 'unusable', locale: 'tr' }))).toEqual({
      allow: false,
      redirect: '/tr/accept-invite/continue',
    });
  });
  test('an existing account signs in as before; the page does the accept', async () => {
    expect(await decideOAuthSignIn(input(), deps(pending, { accountExists: async () => true }))).toEqual({ allow: true });
    expect(await decideOAuthSignIn(input(), deps(pending, { userExistsByEmail: async () => true }))).toEqual({
      allow: true,
    });
  });
  test('no invitation: the plain registration is unchanged', async () => {
    expect(await decideOAuthSignIn(input(), deps({ status: 'none' }))).toEqual({ allow: true, plainRegistration: true });
  });
});
