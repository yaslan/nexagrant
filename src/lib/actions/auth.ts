'use server';

import { signIn, signOut } from '@/lib/auth';
import { AuthError, CredentialsSignin } from 'next-auth';
import { INVALID_INVITE_CODE } from '@/lib/agency/invite-signin-error';
import { isNextRedirectError } from '@/lib/errors';
import { setRegistrationAcknowledgementCookie } from '@/lib/legal/registration-ack-cookie';
import { acknowledgementMatchesCurrent } from '@/lib/legal/consent-documents';
import { setRegistrationInviteCookie } from '@/lib/agency/registration-invite-cookie';
import { setRegistrationProvinceCookie } from '@/lib/registration-province-cookie';
import { setRegistrationReadinessCookie } from '@/lib/registration-readiness-cookie';
import { isDemoLoginEnabled } from '@/lib/demo-login';

/**
 * @param acknowledgement The version stamp of the privacy notice and terms the
 *   form had on screen when the box was ticked, or `undefined` when it was not.
 *   Passed straight through to `authorize`, which needs it only when this
 *   address has no account yet — that is the registration, and TASK-MTSWLANXSU0IG
 *   refuses one that cannot be shown to have been disclosed. Signing in to an
 *   existing account never needs it.
 */
export async function loginWithCredentialsAction(
  email: string,
  password: string,
  redirectTo: string,
  locale: string = 'tr',
  acknowledgement?: string,
  inviteCode?: string,
  /** TASK-MULV3JXS1AW5X — optional; `authorize` keeps it only if it is one of TR_PROVINCES. */
  province?: string,
  /**
   * FB KAMU B6 (TASK-MULRR8P7HIII4) — the scorecard result code, only when the
   * "add my result to my account" box was ticked. `authorize` stores it on a
   * NEW tenant only; signing in to an existing account ignores it.
   */
  readiness?: string
) {
  // TASK-MULSCEK4JHK8X — no Credentials provider is registered with demo sign-in
  // off; say so plainly instead of letting `signIn` fail with a configuration error.
  if (!isDemoLoginEnabled()) {
    return {
      error:
        locale === 'tr'
          ? 'E-posta ile giriş bu ortamda kapalı.'
          : 'E-mail sign-in is disabled in this environment.',
    };
  }
  try {
    await signIn('credentials', {
      email,
      password: password || 'demo1234',
      acknowledgement: acknowledgement ?? '',
      inviteCode: inviteCode ?? '',
      province: province ?? '',
      readiness: readiness ?? '',
      redirect: false,
    });
    return { success: true };
  } catch (error) {
    // FB KAMU B1 — one message for every unusable invite code, so the reply
    // never tells a guesser which codes exist (TASK-MULRQJQYM0NAM).
    if (error instanceof CredentialsSignin && error.code === INVALID_INVITE_CODE) {
      return {
        error:
          locale === 'tr'
            ? 'Davet kodu geçersiz ya da artık kullanılamıyor.'
            : 'This invite code is invalid or can no longer be used.',
      };
    }
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return {
            error:
              locale === 'tr'
                ? 'Giriş başarısız. Lütfen bilgilerinizi kontrol edin.'
                : 'Login failed. Please check credentials.',
          };
        default:
          return {
            error:
              locale === 'tr'
                ? 'Giriş işlemi sırasında bir hata oluştu.'
                : 'An error occurred during sign in.',
          };
      }
    }

    // Catch internal NEXT_REDIRECT exception and treat as successful login
    if (
      isNextRedirectError(error)
    ) {
      return { success: true };
    }

    // Generic error fallback
    return { success: true };
  }
}

/**
 * @param acknowledgement The same version stamp as above. The browser is about
 *   to leave for Google/Microsoft and will come back into NextAuth's callback
 *   route, where nothing of ours can see the form any more — so if the box was
 *   ticked, the stamp is parked in an httpOnly cookie here, on the server, and
 *   the signIn callback and `events.createUser` pick it up on the way back
 *   (src/lib/legal/registration-ack-cookie.ts).
 * @returns `{ error }` when the redirect is refused before it starts; otherwise
 *   it redirects and does not return.
 */
export async function loginWithSocialAction(
  provider: 'google' | 'microsoft-entra-id',
  redirectTo: string,
  acknowledgement?: string,
  /**
   * TASK-MULV3JXS1AW5X — the optional province of a registration. The cookie is
   * written or cleared on every OAuth start, so an earlier choice never carries
   * over to this one.
   */
  province?: string,
  /** FB KAMU B6 — as above: written or cleared on every OAuth start. */
  readiness?: string,
  /**
   * TASK-MUM676F010E9G (ADR-0006) — the agency invite code of a registration
   * from `/kayit?kod=…`. Carried to the callback in a signed cookie together
   * with the acknowledgement, which must then name the agency addendum.
   */
  inviteCode?: string,
  locale: string = 'tr'
): Promise<{ error: string } | void> {
  const code = typeof inviteCode === 'string' ? inviteCode.trim().slice(0, 32) : '';
  // A code without the addendum-bearing tick never leaves for the provider:
  // "onaysız OAuth başlatılamaz". The callback checks again (the addendum could
  // be republished during the round trip), but refusing here costs nobody a
  // trip to Google to learn it.
  if (code && !acknowledgementMatchesCurrent(acknowledgement, { agency: true })) {
    return {
      error:
        locale === 'tr'
          ? 'Devam edebilmek için aydınlatma metnini ve ajans kanalı ekini okuduğunuzu, kullanım koşullarını kabul ettiğinizi onaylamanız gerekir.'
          : 'To continue, please confirm that you have read the privacy notice and the agency channel addendum, and that you accept the terms of service.',
    };
  }
  // Without a code only a current stamp counts; anything else is "not ticked".
  const acknowledged = !code && acknowledgementMatchesCurrent(acknowledgement);
  try {
    // Set before `signIn`, which redirects and never returns. Every cookie is
    // written or cleared on every start, so nothing from an earlier attempt on
    // a shared machine rides along.
    if (acknowledged) {
      await setRegistrationAcknowledgementCookie();
    }
    await setRegistrationInviteCookie(
      code ? { code, acknowledgement: acknowledgement as string, locale: locale === 'en' ? 'en' : 'tr' } : null
    );
    const registering = acknowledged || Boolean(code);
    await setRegistrationProvinceCookie(registering ? province : null);
    await setRegistrationReadinessCookie(registering ? readiness : null);
    await signIn(provider, { redirectTo });
  } catch (error) {
    if (
      isNextRedirectError(error)
    ) {
      throw error; // OAuth redirect needs to bubble up
    }
    throw error;
  }
}

export async function logoutAction(locale: string = 'tr') {
  const targetPath = locale === 'tr' ? 'giris' : 'login';
  await signOut({ redirectTo: `/${locale}/${targetPath}` });
}
