/**
 * Google/Microsoft registration — the rules ADR-0006 puts on the only sign-in
 * production has (TASK-MUM676F010E9G).
 *
 * Two halves, both called from src/lib/auth.ts:
 *
 *   1. `decideOAuthSignIn` — the `signIn` callback. It runs after the provider
 *      has answered and BEFORE the adapter writes anything, so it is the one
 *      place an OAuth registration can be refused without deleting a user:
 *      no acknowledgement, a bad or expired invite, or an e-mail link the
 *      provider has not vouched for.
 *   2. `registerOAuthUserWithInvite` — the adapter's `createUser` when an
 *      invite code came along. User, code use, tenant, workspace, membership,
 *      consent rows and audit event are ONE transaction, as on the e-mail path:
 *      a code whose agency link could fail after the account exists would open
 *      exactly the unlinked account S2-a was avoiding.
 *
 * Kept free of NextAuth so the decision can be tested with a fake provider and
 * the transaction on the `fabrika_app` role.
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';

import { InviteCodeRejectedError, redeemInviteCode } from './agency/codes';
import type { RegistrationInviteRead } from './agency/registration-invite-cookie';
import { acknowledgementMatchesCurrent } from './legal/consent-documents';
import { bindTransactionToTenant, writeRegistrationConsent } from './legal/registration-consent';
import { readinessSettings } from './readiness/account';

/** Query values the registration screen turns into one message each. */
export const OAUTH_SIGNIN_ERROR = {
  /** Every unusable code, and an unreadable or expired invite cookie: one message. */
  inviteInvalid: 'invite_invalid',
  disclosureRequired: 'disclosure_required',
  emailUnverified: 'email_unverified',
} as const;

export type OAuthSignInError = (typeof OAUTH_SIGNIN_ERROR)[keyof typeof OAUTH_SIGNIN_ERROR];

/**
 * Has the provider itself vouched that this person controls `email`?
 *
 * This is what `allowDangerousEmailAccountLinking` is allowed to rest on
 * (ADR-0006). Auth.js links a new Google/Microsoft login to an existing User
 * purely because the addresses match; if the provider hands out addresses it
 * never verified, whoever claims the address takes over the account.
 *
 * - Google: the ID token's `email_verified`. Google sets it for Gmail and for
 *   Workspace addresses it has verified.
 * - Microsoft Entra ID: `email` is an unverified, admin-editable claim in v2
 *   tokens — Microsoft's own guidance is not to use it for authorisation. The
 *   verified forms are the optional claims `xms_edov` (the domain owner is
 *   verified) and `verified_primary_email`. Neither is sent unless the app
 *   registration asks for it, so until it does, Entra logins do NOT link to an
 *   existing account by e-mail. A first Entra login still registers normally.
 *
 * Anything else — an unknown provider, a missing or non-true claim — is "not
 * verified". Failing closed costs a person one extra step; failing open costs
 * them the account.
 */
export function providerVerifiedEmail(
  provider: string,
  profile: Record<string, unknown> | undefined,
  email: string | null | undefined
): boolean {
  if (!profile || !email) return false;
  const address = email.trim().toLowerCase();
  if (provider === 'google') {
    const claimed = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : null;
    return profile.email_verified === true && claimed === address;
  }
  if (provider === 'microsoft-entra-id') {
    if (profile.xms_edov === true || profile.xms_edov === 1 || profile.xms_edov === '1') return true;
    const verified = profile.verified_primary_email;
    return (
      Array.isArray(verified) &&
      verified.some((v) => typeof v === 'string' && v.trim().toLowerCase() === address)
    );
  }
  return false;
}

export interface OAuthSignInInput {
  provider: string;
  providerAccountId: string;
  /** The address the provider's profile maps to — what Auth.js looks users up by. */
  email: string | null | undefined;
  /** The raw ID-token / userinfo claims. */
  profile: Record<string, unknown> | undefined;
}

export interface OAuthSignInDeps {
  accountExists(provider: string, providerAccountId: string): Promise<boolean>;
  userExistsByEmail(email: string): Promise<boolean>;
  readInvite(): Promise<RegistrationInviteRead>;
  /** The plain (no-code) acknowledgement cookie is present and current. */
  readAcknowledged(): Promise<boolean>;
  /** Would this code be accepted right now? Must not use it up. */
  probeInviteCode(code: string): Promise<boolean>;
  noteRejection(code: string): Promise<void>;
  clearInvite(): Promise<void>;
}

/**
 * `plainRegistration` — let through as a registration without a code, the one
 * outcome that still needs the plain acknowledgement cookie (events.createUser
 * reads it into the consent rows). Every other outcome must spend that cookie
 * at once (İNCELEME-13 B-1).
 */
export type OAuthSignInDecision =
  | { allow: true; plainRegistration?: true }
  | { allow: false; redirect: string };

function refuse(locale: string, page: 'kayit' | 'giris', error: OAuthSignInError): OAuthSignInDecision {
  const safeLocale = locale === 'en' ? 'en' : 'tr';
  return { allow: false, redirect: `/${safeLocale}/${page}?error=${error}` };
}

/**
 * The `signIn` callback for an OAuth provider. See the module comment.
 *
 * - A returning login (this provider account is already linked) is let through
 *   untouched. An invite code is ignored: linking an existing tenant to an
 *   agency is not B1 (HUKUK-10), and a stale cookie must not do it silently.
 * - An address that already has an account links only if the provider verified
 *   it. The code is ignored here too.
 * - Anything else is a registration: it needs the acknowledgement, and with a
 *   code, the addendum-bearing acknowledgement and a code that would redeem.
 */
export async function decideOAuthSignIn(
  input: OAuthSignInInput,
  deps: OAuthSignInDeps
): Promise<OAuthSignInDecision> {
  const invite = await deps.readInvite();
  const locale = invite.status === 'ok' ? invite.invite.locale : 'tr';

  if (await deps.accountExists(input.provider, input.providerAccountId)) {
    await deps.clearInvite();
    return { allow: true };
  }

  const email = input.email?.trim().toLowerCase() || null;
  if (email && (await deps.userExistsByEmail(email))) {
    if (!providerVerifiedEmail(input.provider, input.profile, email)) {
      await deps.clearInvite();
      return refuse(locale, 'giris', OAUTH_SIGNIN_ERROR.emailUnverified);
    }
    await deps.clearInvite();
    return { allow: true };
  }

  // A registration.
  if (invite.status === 'invalid') {
    await deps.clearInvite();
    return refuse(locale, 'kayit', OAUTH_SIGNIN_ERROR.inviteInvalid);
  }
  if (invite.status === 'ok') {
    // The server action checked this before setting the cookie; checked again
    // because the addendum may have been republished during the round trip.
    if (!acknowledgementMatchesCurrent(invite.invite.acknowledgement, { agency: true })) {
      await deps.clearInvite();
      return refuse(locale, 'kayit', OAUTH_SIGNIN_ERROR.disclosureRequired);
    }
    if (!(await deps.probeInviteCode(invite.invite.code))) {
      await deps.noteRejection(invite.invite.code).catch(() => {});
      await deps.clearInvite();
      return refuse(locale, 'kayit', OAUTH_SIGNIN_ERROR.inviteInvalid);
    }
    return { allow: true };
  }
  if (!(await deps.readAcknowledged())) {
    return refuse(locale, 'kayit', OAUTH_SIGNIN_ERROR.disclosureRequired);
  }
  return { allow: true, plainRegistration: true };
}

/** Thrown by the probe's transaction to roll back the use it just made. */
class ProbeRollback extends Error {
  constructor(readonly accepted: boolean) {
    super('invite probe rollback');
  }
}

/**
 * Would `code` redeem right now? Answers by redeeming it inside a transaction
 * that is always rolled back, so the verdict is `redeem_agency_invite`'s own
 * (no second copy of its rules to drift) and nothing is counted. The real use
 * happens in `registerOAuthUserWithInvite`, which re-checks under its own lock.
 */
export async function probeInviteCode(client: PrismaClient, code: string): Promise<boolean> {
  try {
    await client.$transaction(async (tx) => {
      throw new ProbeRollback((await redeemInviteCode(tx, code)) !== null);
    });
  } catch (e) {
    if (e instanceof ProbeRollback) return e.accepted;
    throw e;
  }
  return false;
}

export interface OAuthTenantBootstrap {
  userId: string;
  userName: string | null | undefined;
  province: string | null;
  readiness: string | null;
  /** The agency the redeemed code belongs to, or null without a code. */
  agencyId: string | null;
  /** Write the consent rows: only when the acknowledgement really travelled. */
  acknowledged: boolean;
  /**
   * The language the notice was read in, when the round trip carried it (the
   * signed invite cookie does). Defaults to `tr` — see below.
   */
  locale?: 'tr' | 'en';
}

/**
 * Tenant, workspace, owner membership and — only with an acknowledgement —
 * the consent rows, inside the caller's transaction. With an agency the rows
 * include the addendum, and the redemption is audited in the new tenant.
 */
export async function bootstrapOAuthTenant(
  tx: Prisma.TransactionClient,
  input: OAuthTenantBootstrap
): Promise<string> {
  const tenant = await tx.tenant.create({
    data: {
      name: `${input.userName || 'My'} Organization`,
      slug: `org-${input.userId.slice(-6)}`,
      country: 'TR',
      orgType: 'SME',
      province: input.province,
      settings: readinessSettings(input.readiness),
      // No plan: a tenant without a subscription is on Discover, which is what a code grants.
      agencyId: input.agencyId,
    },
  });

  // Tenant-scoped writes need the tenant bound, or RLS refuses them off a
  // superuser connection (see bindTransactionToTenant).
  await bindTransactionToTenant(tx, tenant.id);

  const workspace = await tx.workspace.create({
    data: { tenantId: tenant.id, name: 'Default Workspace', slug: 'default' },
  });

  await tx.membership.create({
    data: {
      userId: input.userId,
      tenantId: tenant.id,
      role: 'TENANT_OWNER',
      workspaceIds: [workspace.id],
    },
  });

  if (input.acknowledged) {
    await writeRegistrationConsent(tx, {
      tenantId: tenant.id,
      userId: input.userId,
      // An invite registration carries the locale in its signed cookie
      // (İNCELEME-13 Ö-1). The plain round trip does not; `tr` is the app's
      // default and what the registration page serves without a prefix.
      // Guessing from an e-mail domain would be a guess recorded as a fact.
      locale: input.locale ?? 'tr',
      agency: input.agencyId !== null,
    });
  }

  if (input.agencyId) {
    await tx.auditEvent.create({
      data: {
        tenantId: tenant.id,
        actorId: input.userId,
        type: 'agency.invite.redeemed',
        data: { agencyId: input.agencyId },
      },
    });
  }

  return tenant.id;
}

export interface OAuthInviteRegistration {
  user: {
    email: string;
    name?: string | null;
    image?: string | null;
    emailVerified?: Date | null;
  };
  code: string;
  /** The locale from the signed invite cookie — the language the addendum was read in. */
  locale: 'tr' | 'en';
  province: string | null;
  readiness: string | null;
}

/**
 * The adapter's `createUser` for a registration that carries a code. One
 * transaction: if the code does not redeem, nothing is written and
 * `InviteCodeRejectedError` is thrown (the caller counts the refusal outside
 * the rolled-back transaction). No fallback user on a database error either —
 * the plain adapter's fake-user fallback would open an account with no agency
 * link and no record.
 */
export async function registerOAuthUserWithInvite(
  client: PrismaClient,
  input: OAuthInviteRegistration
): Promise<User> {
  return client.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.user.email,
        name: input.user.name ?? null,
        image: input.user.image ?? null,
        emailVerified: input.user.emailVerified ?? null,
      },
    });
    const agencyId = await redeemInviteCode(tx, input.code);
    if (!agencyId) throw new InviteCodeRejectedError();
    await bootstrapOAuthTenant(tx, {
      userId: user.id,
      userName: user.name,
      province: input.province,
      readiness: input.readiness,
      agencyId,
      locale: input.locale,
      // The signIn callback let this registration through only with the
      // addendum-bearing acknowledgement, so the rows are always written here.
      acknowledged: true,
    });
    return user;
  });
}
