'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Error boundary for the M6 panel route.
 *
 * Without one, a throw from the page (a closed module, an unreachable database, a
 * `listPanelScores` refusal) unwound past the segment and the user was left on the
 * workspace loading skeleton with no way to tell a slow page from a broken one. A
 * failure is now visible and retryable, and never dressed up as loading.
 *
 * `error.message` is deliberately not rendered: it can carry ids and query text from
 * the server. The message shown is a translated sentence; the detail goes to the
 * console for the developer, and the digest identifies the entry in the server log.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('m6');

  useEffect(() => {
    console.error('[m6:panel]', error);
  }, [error]);

  return (
    <section
      role="alert"
      aria-live="assertive"
      className="max-w-2xl mx-auto px-4 py-16 text-center"
      data-testid="m6-panel-error"
    >
      <p className="text-5xl mb-6" aria-hidden="true">
        ⚠️
      </p>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t('panel.errorTitle')}
      </h1>
      <p className="mt-3 text-slate-600 dark:text-slate-400">{t('panel.errorBody')}</p>
      {error.digest && (
        <p className="mt-2 text-xs text-slate-400" data-testid="m6-panel-error-digest">
          {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        data-testid="m6-panel-error-retry"
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
      >
        {t('panel.errorRetry')}
      </button>
    </section>
  );
}
