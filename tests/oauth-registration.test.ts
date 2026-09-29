import { describe, expect, test, vi } from 'vitest';

import {
  INVITE_COOKIE_MAX_AGE_SECONDS,
  decodeRegistrationInvite,
  encodeRegistrationInvite,
} from '../src/lib/agency/registration-invite-cookie';
import type { RegistrationInviteRead } from '../src/lib/agency/registration-invite-cookie';
import {
  AGENCY_CHANNEL_ADDENDUM,
  acknowledgementMatchesCurrent,
  registrationAcknowledgementToken,
  registrationConsentRows,
} from '../src/lib/legal/consent-documents';
import {
  type OAuthSignInDeps,
  decideOAuthSignIn,
  providerVerifiedEmail,
} from '../src/lib/oauth-registration';

/**
 * TASK-MUM676F010E9G (ADR-0006) — OAuth-only registration, no database. The
 * live half (the real Auth.js callback behind a fake provider, on fabrika_app)
 * is tests/oauth-registration.live.test.ts.
 */

const SECRET = 'unit-test-secret-not-a-real-one';
const AGENCY_ACK = registrationAcknowledgementToken({ agency: true });
const PLAIN_ACK = registrationAcknowledgementToken();

describe('agency channel addendum on the consent record', () => {
  test('a registration with a code acknowledges three documents, one without it two', () => {
    const withCode = registrationConsentRows({ tenantId: 't', userId: 'u', locale: 'tr', agency: true });
    const without = registrationConsentRows({ tenantId: 't', userId: 'u', locale: 'tr' });
    expect(withCode.map((r) => r.documentId)).toEqual([
      'privacy-notice',
      'terms-of-service',
      'agency-channel-addendum',
    ]);
    expect(without.map((r) => r.documentId)).toEqual(['privacy-notice', 'terms-of-service']);
    const addendum = withCode[2]!;
    expect(addendum.documentVersion).toBe(AGENCY_CHANNEL_ADDENDUM.version);
    expect(addendum.kind).toBe('DISCLOSURE_ACK');
    expect(addendum.purpose).toBe('ACCOUNT_REGISTRATION');
  });

  test('a stamp that never showed the addendum cannot open a registration with a code', () => {
    expect(acknowledgementMatchesCurrent(PLAIN_ACK, { agency: true })).toBe(false);
    expect(acknowledgementMatchesCurrent(AGENCY_ACK, { agency: true })).toBe(true);
    // …and the addendum stamp is not a plain one either: the sets must match exactly.
    expect(acknowledgementMatchesCurrent(AGENCY_ACK)).toBe(false);
    const stale = AGENCY_ACK.replace(AGENCY_CHANNEL_ADDENDUM.version, '1999-01-01.1');
    expect(acknowledgementMatchesCurrent(stale, { agency: true })).toBe(false);
  });
});

describe('signed invite cookie', () => {
  const invite = { code: 'ABCD-EFGH-JKMN', acknowledgement: AGENCY_ACK, locale: 'tr' };

  test('round trip', () => {
    const now = 1_700_000_000_000;
    const value = encodeRegistrationInvite(invite, SECRET, now);
    expect(decodeRegistrationInvite(value, SECRET, now + 1000)).toEqual({ status: 'ok', invite });
  });

  test('no cookie is "none", not "invalid"', () => {
    expect(decodeRegistrationInvite(undefined, SECRET)).toEqual({ status: 'none' });
    expect(decodeRegistrationInvite('', SECRET)).toEqual({ status: 'none' });
  });

  test('expires after 15 minutes whatever the browser keeps', () => {
    expect(INVITE_COOKIE_MAX_AGE_SECONDS).toBeLessThanOrEqual(15 * 60);
    const now = 1_700_000_000_000;
    const value = encodeRegistrationInvite(invite, SECRET, now);
    expect(decodeRegistrationInvite(value, SECRET, now + 15 * 60 * 1000 - 1).status).toBe('ok');
    expect(decodeRegistrationInvite(value, SECRET, now + 15 * 60 * 1000).status).toBe('invalid');
  });

  test('a changed code, a changed acknowledgement or another key is refused', () => {
    const value = encodeRegistrationInvite(invite, SECRET);
    const [body, sig] = value.split('.') as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), code: 'ZZZZ-ZZZZ-ZZZZ' })
    ).toString('base64url');
    expect(decodeRegistrationInvite(`${forged}.${sig}`, SECRET).status).toBe('invalid');
    expect(decodeRegistrationInvite(value, 'another-secret').status).toBe('invalid');
    expect(decodeRegistrationInvite(`${body}.`, SECRET).status).toBe('invalid');
    expect(decodeRegistrationInvite('garbage', SECRET).status).toBe('invalid');
    expect(decodeRegistrationInvite(`${body}.${sig}x`, SECRET).status).toBe('invalid');
  });
});

describe('providerVerifiedEmail — what account linking rests on', () => {
  const email = 'Person@Example.com';

  test('Google: only email_verified === true for the same address', () => {
    expect(providerVerifiedEmail('google', { email, email_verified: true }, email)).toBe(true);
    expect(providerVerifiedEmail('google', { email, email_verified: false }, email)).toBe(false);
    expect(providerVerifiedEmail('google', { email, email_verified: 'true' }, email)).toBe(false);
    expect(providerVerifiedEmail('google', { email }, email)).toBe(false);
    expect(
      providerVerifiedEmail('google', { email: 'other@example.com', email_verified: true }, email)
    ).toBe(false);
  });

  // ADR-0006 (owner decision 29.09): Entra was removed, so none of its claims —
  // even the verified-address ones — let a login link to an existing account.
  test('Entra (removed): no claim counts as verified', () => {
    expect(providerVerifiedEmail('microsoft-entra-id', { email }, email)).toBe(false);
    expect(providerVerifiedEmail('microsoft-entra-id', { email, xms_edov: true }, email)).toBe(false);
    expect(
      providerVerifiedEmail('microsoft-entra-id', { verified_primary_email: ['person@example.com'] }, email)
    ).toBe(false);
  });

  test('anything else fails closed', () => {
    expect(providerVerifiedEmail('github', { email, email_verified: true }, email)).toBe(false);
    expect(providerVerifiedEmail('google', undefined, email)).toBe(false);
    expect(providerVerifiedEmail('google', { email_verified: true }, null)).toBe(false);
  });
});

/** A fake provider's view of the world, with every dependency observable. */
function fakeDeps(over: Partial<OAuthSignInDeps> & { invite?: RegistrationInviteRead } = {}) {
  const deps = {
    accountExists: vi.fn(async () => false),
    userExistsByEmail: vi.fn(async () => false),
    readInvite: vi.fn(async () => over.invite ?? ({ status: 'none' } as RegistrationInviteRead)),
    readAcknowledged: vi.fn(async () => false),
    probeInviteCode: vi.fn(async () => true),
    noteRejection: vi.fn(async () => {}),
    clearInvite: vi.fn(async () => {}),
    ...over,
  } satisfies OAuthSignInDeps;
  return deps;
}

const googleNewUser = {
  provider: 'google',
  providerAccountId: 'g-123',
  email: 'new@example.com',
  profile: { email: 'new@example.com', email_verified: true },
};
const okInvite = (ack = AGENCY_ACK, locale = 'tr'): RegistrationInviteRead => ({
  status: 'ok',
  invite: { code: 'ABCD-EFGH-JKMN', acknowledgement: ack, locale },
});

describe('decideOAuthSignIn (fake provider)', () => {
  test('a new user with a valid code and the addendum acknowledgement is let through', async () => {
    const deps = fakeDeps({ invite: okInvite() });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({ allow: true });
    expect(deps.probeInviteCode).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
    // The cookie is still needed by createUser, which uses the code.
    expect(deps.clearInvite).not.toHaveBeenCalled();
  });

  test('a code carried with a stamp that did not show the addendum is refused', async () => {
    const deps = fakeDeps({ invite: okInvite(PLAIN_ACK, 'en') });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({
      allow: false,
      redirect: '/en/kayit?error=disclosure_required',
    });
    expect(deps.probeInviteCode).not.toHaveBeenCalled();
    expect(deps.clearInvite).toHaveBeenCalled();
  });

  test('a new user with no acknowledgement at all is refused before any row exists', async () => {
    const deps = fakeDeps();
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({
      allow: false,
      redirect: '/tr/kayit?error=disclosure_required',
    });
  });

  test('a new user with the plain acknowledgement and no code registers as before', async () => {
    const deps = fakeDeps({ readAcknowledged: vi.fn(async () => true) });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({ allow: true, plainRegistration: true });
  });

  test('an expired or tampered cookie gets the one invite message', async () => {
    const deps = fakeDeps({ invite: { status: 'invalid' } });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({
      allow: false,
      redirect: '/tr/kayit?error=invite_invalid',
    });
    expect(deps.clearInvite).toHaveBeenCalled();
  });

  test('a code that does not redeem gets the same message, is counted and the cookie is gone', async () => {
    const deps = fakeDeps({ invite: okInvite(), probeInviteCode: vi.fn(async () => false) });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({
      allow: false,
      redirect: '/tr/kayit?error=invite_invalid',
    });
    expect(deps.noteRejection).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
    expect(deps.clearInvite).toHaveBeenCalled();
  });

  test('a returning login ignores the code (no agency link for an existing account)', async () => {
    const deps = fakeDeps({ invite: okInvite(), accountExists: vi.fn(async () => true) });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({ allow: true });
    expect(deps.probeInviteCode).not.toHaveBeenCalled();
    expect(deps.clearInvite).toHaveBeenCalled();
  });

  test('linking to an existing address needs a verified e-mail from the provider', async () => {
    const existing = { userExistsByEmail: vi.fn(async () => true) };
    const unverified = await decideOAuthSignIn(
      { ...googleNewUser, profile: { email: 'new@example.com', email_verified: false } },
      fakeDeps(existing)
    );
    expect(unverified).toEqual({ allow: false, redirect: '/tr/giris?error=email_unverified' });

    const entraPlain = await decideOAuthSignIn(
      { provider: 'microsoft-entra-id', providerAccountId: 'm-1', email: 'new@example.com', profile: { email: 'new@example.com' } },
      fakeDeps(existing)
    );
    expect(entraPlain).toEqual({ allow: false, redirect: '/tr/giris?error=email_unverified' });

    const deps = fakeDeps({ ...existing, invite: okInvite() });
    expect(await decideOAuthSignIn(googleNewUser, deps)).toEqual({ allow: true });
    // Linking never uses the code either.
    expect(deps.probeInviteCode).not.toHaveBeenCalled();
  });
});
