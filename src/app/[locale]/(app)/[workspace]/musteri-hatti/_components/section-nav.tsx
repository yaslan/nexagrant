import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** Tab strip shared by the M18 screens. Server-rendered; the active tab is marked for AT. */
export async function SectionNav({
  locale,
  workspace,
  active,
}: {
  locale: string;
  workspace: string;
  active: 'panel' | 'leads' | 'pipeline' | 'tasks';
}) {
  const t = await getTranslations({ locale, namespace: 'm18' });
  const base = `/${locale}/${workspace}/musteri-hatti`;
  const items: { key: 'panel' | 'leads' | 'pipeline' | 'tasks'; href: string }[] = [
    { key: 'panel', href: base },
    { key: 'leads', href: `${base}/leads` },
    { key: 'pipeline', href: `${base}/pipeline` },
    { key: 'tasks', href: `${base}/tasks` },
  ];
  return (
    <nav aria-label={t('title')}>
      <ul className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-sm">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={item.key === active ? 'page' : undefined}
              className={
                item.key === active
                  ? 'rounded bg-slate-900 px-3 py-1.5 font-medium text-white'
                  : 'rounded px-3 py-1.5 text-slate-700 hover:bg-slate-100'
              }
            >
              {t(`tabs.${item.key}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
