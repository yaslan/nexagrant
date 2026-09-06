import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getPublicRoute } from '@/lib/routes';

/**
 * Where a signed-in user without a tenant membership lands.
 *
 * `requireTenantPage()` in src/lib/tenant.ts sends people here rather than
 * inventing a tenant for them. Before that change a session with no membership
 * was handed a hardcoded demo tenant — which is a real row — so this screen is
 * the visible half of that fix and must exist for the redirect to make sense.
 */
export default async function NoWorkspacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'NoWorkspace' });

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md w-full text-center">
        <p className="text-5xl mb-6" aria-hidden="true">
          🔑
        </p>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t('title')}
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">{t('description')}</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">{t('hint')}</p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={getPublicRoute('login', locale)}
            className="px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            {t('signInAgain')}
          </Link>
          <Link
            href={getPublicRoute('home', locale)}
            className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {t('backHome')}
          </Link>
        </div>
      </div>
    </main>
  );
}
