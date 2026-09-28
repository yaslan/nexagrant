'use server';

import { signIn, signOut } from '@/lib/auth';
import { AuthError, CredentialsSignin } from 'next-auth';
import { INVALID_INVITE_CODE } from '@/lib/agency/invite-signin-error';
import { isNextRedirectError } from '@/lib/errors';
import { setRegistrationAcknowledgementCookie } from '@/lib/legal/registration-ack-cookie';

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
  inviteCode?: string
) {
  try {
    await signIn('credentials', {
      email,
      password: password || 'demo1234',
      acknowledgement: acknowledgement ?? '',
      inviteCode: inviteCode ?? '',
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
 *   `events.createUser` picks it up on the way back
 *   (src/lib/legal/registration-ack-cookie.ts).
 */
export async function loginWithSocialAction(
  provider: 'google' | 'microsoft-entra-id',
  redirectTo: string,
  acknowledgement?: string
) {
  try {
    // Set before `signIn`, which redirects and never returns.
    if (acknowledgement) {
      await setRegistrationAcknowledgementCookie();
    }
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
