import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';

import { auth } from '@/lib/auth';
import { configuredOAuthProviders, isDemoLoginEnabled } from '@/lib/demo-login';
import { PRIVACY_NOTICE, TERMS_OF_SERVICE } from '@/lib/legal/consent-documents';
import { getPublicRoute } from '@/lib/routes';
import { readParkedInvitation } from '@/lib/invitations/accept-cookie';
import {
  isInvitingTenantReadOnly,
  membershipRoleOf,
  lookupInvitation,
  maskEmail,
  sameEmail,
} from '@/lib/invitations/accept';

import { landingPathFor } from '@/lib/landing';

import AcceptInviteActions from './AcceptInviteActions';

/**
 * The accept screen of a tenant invitation (TASK-MUN2793A57Z9I). Reached only
 * through `/<locale>/accept-invite?token=…`, which parks the token in a cookie
 * and redirects here — so this URL never carries it. It shows one of:
 * invalid, cancelled, expired, already used, read-only (expired pilot), the
 * wrong account, or the invitation with the one next step (Google sign-in or
 * "accept"). The rules are in src/lib/invitations/accept.ts.
 */

const ERROR_CODES = new Set([
  'email_mismatch',
  'email_unverified',
  'disclosure_required',
  'pilot_expired',
]);

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'AcceptInvite' });
  return { title: t('metaTitle'), referrer: 'no-referrer', robots: { index: false, follow: false } };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-edge sm:px-4 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-400">{children}</div>
      </div>
    </main>
  );
}

export default async function AcceptInviteContinuePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale: requested } = await params;
  const locale = requested === 'en' ? 'en' : 'tr';
  await connection();
  const t = await getTranslations({ locale, namespace: 'AcceptInvite' });
  const { error } = await searchParams;
  const errorMessage = error && ERROR_CODES.has(error) ? t(`errors.${error}`) : null;

  const parked = await readParkedInvitation();
  const state = await lookupInvitation(parked?.token ?? null);
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? null;

  const home = (
    <Link href={getPublicRoute('home', locale)} className="inline-block text-accent underline underline-offset-2">
      {t('backHome')}
    </Link>
  );

  if (state.status === 'invalid' || state.status === 'revoked') {
    return (
      <Card title={t(`${state.status}Title`)}>
        <p>{t(`${state.status}Body`)}</p>
        {home}
      </Card>
    );
  }

  const { invitation } = state;
  const org = invitation.tenantName;
  const matches = userId !== null && sameEmail(invitation.email, userEmail);

  // Joined already (this link, or a second click on it): straight to the workspace.
  if (matches && userId) {
    const memberRole = await membershipRoleOf(invitation.tenantId, userId);
    if (memberRole) redirect(landingPathFor(memberRole, locale));
  }

  if (state.status === 'expired' || state.status === 'used') {
    return (
      <Card title={t(`${state.status}Title`)}>
        <p>{t(`${state.status}Body`)}</p>
        {home}
      </Card>
    );
  }

  if (await isInvitingTenantReadOnly(invitation.tenantId)) {
    return (
      <Card title={t('pilotExpiredTitle')}>
        <p>{t('pilotExpiredBody', { org })}</p>
        {home}
      </Card>
    );
  }

  const dateFormat = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    dateStyle: 'long',
    timeZone: 'Europe/Istanbul',
  });

  if (userId && !matches) {
    return (
      <Card title={t('mismatchTitle')}>
        <p>{t('mismatchBody', { invited: maskEmail(invitation.email), current: userEmail ?? '—' })}</p>
        <AcceptInviteActions locale={locale} mode="switch" />
      </Card>
    );
  }

  return (
    <Card title={t('pendingTitle', { org })}>
      <p>{t('pendingIntro', { org, role: t(`roles.${invitation.role}`) })}</p>
      <p className="text-xs">{t('pendingExpires', { date: dateFormat.format(invitation.expires) })}</p>
      {errorMessage && (
        <p role="alert" data-testid="accept-invite-error" className="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">
          {errorMessage}
        </p>
      )}
      {userId ? (
        <>
          <p>{t('signedInAs', { email: userEmail ?? '—' })}</p>
          <AcceptInviteActions locale={locale} mode="accept" />
        </>
      ) : (
        <>
          <p>{t('signInIntro')}</p>
          <AcceptInviteActions
            locale={locale}
            mode="signIn"
            googleAvailable={configuredOAuthProviders().google}
            privacyHref={PRIVACY_NOTICE.href(locale)}
            termsHref={TERMS_OF_SERVICE.href(locale)}
            demoSignInHref={
              isDemoLoginEnabled()
                ? `${getPublicRoute('login', locale)}?callbackUrl=${encodeURIComponent(`/${locale}/accept-invite/continue`)}`
                : null
            }
          />
        </>
      )}
    </Card>
  );
}
