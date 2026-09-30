'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { auth, signIn, signOut, unstable_update } from '@/lib/auth';
import { setRegistrationInviteCookie } from '@/lib/agency/registration-invite-cookie';
import { acknowledgementMatchesCurrent } from '@/lib/legal/consent-documents';
import {
  clearRegistrationAcknowledgementCookie,
  setRegistrationAcknowledgementCookie,
} from '@/lib/legal/registration-ack-cookie';
import { setRegistrationProvinceCookie } from '@/lib/registration-province-cookie';
import { setRegistrationReadinessCookie } from '@/lib/registration-readiness-cookie';
import { clearInvitationAcceptCookie, readParkedInvitation } from '@/lib/invitations/accept-cookie';
import { acceptInvitation } from '@/lib/invitations/accept';

/**
 * Server actions of the accept screen (TASK-MUN2793A57Z9I). The token never
 * travels as an argument: every action reads it from the httpOnly cookie the
 * e-mail link's GET handler parked.
 */

function safeLocale(locale: string): 'tr' | 'en' {
  return locale === 'en' ? 'en' : 'tr';
}

function continuePath(locale: 'tr' | 'en'): string {
  return `/${locale}/accept-invite/continue`;
}

/** Where the person lands after joining — the same default the sign-in screen uses. */
function workspacePath(locale: 'tr' | 'en'): string {
  return `/${locale}/default/dashboard`;
}

/**
 * Signed-out: start Google sign-in and come back to the accept screen. The
 * acknowledgement is parked like on the registration screen (it is needed only
 * if Google sign-in turns out to open a new account); every other registration
 * cookie is cleared so no earlier attempt rides along. The signIn callback
 * (decideOAuthSignIn) sees the parked invitation and never lets this become a
 * registration with a tenant of its own.
 */
export async function startInvitationSignInAction(
  locale: string,
  acknowledgement?: string
): Promise<{ error: string } | void> {
  const lang = safeLocale(locale);
  if (!(await readParkedInvitation())) {
    const t = await getTranslations({ locale: lang, namespace: 'AcceptInvite' });
    return { error: t('errors.invalid') };
  }
  if (acknowledgementMatchesCurrent(acknowledgement)) {
    await setRegistrationAcknowledgementCookie();
  } else {
    await clearRegistrationAcknowledgementCookie();
  }
  await setRegistrationInviteCookie(null);
  await setRegistrationProvinceCookie(null);
  await setRegistrationReadinessCookie(null);
  await signIn('google', { redirectTo: continuePath(lang) });
}

/** Signed-in with the invited address: join, then go to the workspace. */
export async function acceptInvitationAction(locale: string): Promise<{ error: string } | void> {
  const lang = safeLocale(locale);
  const t = await getTranslations({ locale: lang, namespace: 'AcceptInvite' });
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: t('errors.sign_in_required') };

  const parked = await readParkedInvitation();
  let outcome: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    outcome = await acceptInvitation({ token: parked?.token ?? null, userId, userEmail: session.user?.email });
  } catch (error) {
    // Nothing from the error is logged: it can carry the database URL, and the
    // token is never logged anywhere (se-fb (d)).
    console.error(`[AcceptInvite] accept failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return { error: t('errors.failed') };
  }
  if (!outcome.ok) return { error: t(`errors.${outcome.reason}`) };
  await clearInvitationAcceptCookie();
  // Accepting is the person choosing this tenant, so the session moves there
  // now (TASK-MUNWZA26VGK0B, İNCELEME-68 Y-1). The token otherwise stays bound
  // to the tenant it was signed in with: someone removed from that one sat
  // tenantless until they signed in again, and the workspace this redirect
  // opens showed the old tenant. The jwt callback checks the membership; if
  // this fails the membership still stands and the next sign-in finds it.
  try {
    await unstable_update({ tenantId: outcome.tenantId });
  } catch (error) {
    console.error(`[AcceptInvite] session rebind failed: ${error instanceof Error ? error.name : 'unknown'}`);
  }
  redirect(workspacePath(lang));
}

/** Signed in with the wrong account: sign out and come back here, invitation still parked. */
export async function signOutForInvitationAction(locale: string): Promise<void> {
  await signOut({ redirectTo: continuePath(safeLocale(locale)) });
}
