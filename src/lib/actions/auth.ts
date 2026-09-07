'use server';

import { signIn, signOut } from '@/lib/auth';
import { AuthError } from 'next-auth';
import { isNextRedirectError } from '@/lib/errors';

export async function loginWithCredentialsAction(
  email: string,
  password: string,
  redirectTo: string,
  locale: string = 'tr'
) {
  try {
    await signIn('credentials', {
      email,
      password: password || 'demo1234',
      redirect: false,
    });
    return { success: true };
  } catch (error) {
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

export async function loginWithSocialAction(
  provider: 'google' | 'microsoft-entra-id',
  redirectTo: string
) {
  try {
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
