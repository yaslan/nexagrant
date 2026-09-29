'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { registrationAcknowledgementToken } from '@/lib/legal/consent-documents';
import { isNextRedirectError } from '@/lib/errors';

import { acceptInvitationAction, signOutForInvitationAction, startInvitationSignInAction } from './actions';

type Props =
  | { locale: string; mode: 'accept' }
  | { locale: string; mode: 'switch' }
  | {
      locale: string;
      mode: 'signIn';
      googleAvailable: boolean;
      privacyHref: string;
      termsHref: string;
      /** Local development only (DEMO_LOGIN_ENABLED): the e-mail sign-in, back to this screen. */
      demoSignInHref: string | null;
    };

const buttonClass =
  'w-full rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white';

/** The one next step of the accept screen (TASK-MUN2793A57Z9I). */
export default function AcceptInviteActions(props: Props) {
  const t = useTranslations('AcceptInvite');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const run = (action: () => Promise<{ error: string } | void>) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res?.error) setError(res.error);
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        setError(t('errors.failed'));
      }
    });
  };

  const errorBox = error && (
    <p role="alert" data-testid="accept-invite-error" className="rounded-lg bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-300">
      {error}
    </p>
  );

  if (props.mode === 'accept') {
    return (
      <div className="space-y-3">
        {errorBox}
        <button
          type="button"
          data-testid="accept-invite-submit"
          className={buttonClass}
          disabled={pending}
          onClick={() => run(() => acceptInvitationAction(props.locale))}
        >
          {pending ? t('accepting') : t('acceptButton')}
        </button>
      </div>
    );
  }

  if (props.mode === 'switch') {
    return (
      <div className="space-y-3">
        {errorBox}
        <button
          type="button"
          data-testid="accept-invite-switch"
          className={buttonClass}
          disabled={pending}
          onClick={() => run(() => signOutForInvitationAction(props.locale))}
        >
          {t('signOutAndSwitch')}
        </button>
      </div>
    );
  }

  const link = (href: string) => {
    const Anchor = (chunks: React.ReactNode) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
        {chunks}
      </a>
    );
    return Anchor;
  };

  return (
    <div className="space-y-3">
      {errorBox}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          data-testid="accept-invite-ack"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent cursor-pointer"
        />
        <span className="text-xs leading-relaxed">
          {t.rich('disclosureAck', { privacy: link(props.privacyHref), terms: link(props.termsHref) })}
        </span>
      </label>
      <p className="text-[11px] text-slate-500">{t('disclosureAckHint')}</p>
      {props.googleAvailable && (
        <button
          type="button"
          data-testid="accept-invite-google"
          className={buttonClass}
          disabled={pending}
          onClick={() =>
            run(() =>
              startInvitationSignInAction(
                props.locale,
                acknowledged ? registrationAcknowledgementToken() : undefined
              )
            )
          }
        >
          {t('continueWithGoogle')}
        </button>
      )}
      {props.demoSignInHref && (
        <a href={props.demoSignInHref} data-testid="accept-invite-signin" className="block text-center text-accent underline underline-offset-2">
          {t('goToSignIn')}
        </a>
      )}
    </div>
  );
}
