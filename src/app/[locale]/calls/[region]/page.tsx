import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Metadata } from 'next';

const REGIONS: Record<string, { name: string; code: string }> = {
  turkey: { name: 'Türkiye', code: 'TR' },
  germany: { name: 'Almanya', code: 'DE' },
  belgium: { name: 'Belçika', code: 'BE' },
  france: { name: 'Fransa', code: 'FR' },
  italy: { name: 'İtalya', code: 'IT' },
};

type RegionParam = keyof typeof REGIONS;

interface PageProps {
  params: Promise<{
    locale: string;
    region: string;
  }>;
}

export async function generateStaticParams() {
  return Object.keys(REGIONS).map((region) => ({
    region,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { region } = await params;
  const regionInfo = REGIONS[region as RegionParam];
  const regionLabel = regionInfo?.name || region;

  return {
    title: `${regionLabel} Horizon Çağrıları — Fabrika`,
    description: `${regionLabel}'deki açık Horizon çağrıları. Deadline, bütçe ve uygunluk bilgisi.`,
    openGraph: {
      title: `${regionLabel} Horizon Çağrıları — Fabrika`,
      description: `${regionLabel}'deki açık Horizon çağrıları.`,
    },
  };
}

type TopicRow = {
  id: string;
  identifier: string;
  title: string;
  nextDeadlineAt: Date | null;
  budgetPerProjectCents: bigint | null;
  call: { id: string; title: string };
};

export default async function CallsPage({ params }: PageProps) {
  const { region, locale } = await params;
  const regionInfo = REGIONS[region as RegionParam];
  const regionLabel = regionInfo?.name || region;

  const t = await getTranslations('calls_region');

  const calls = (await prisma.topic.findMany({
    where: {
      status: 'OPEN',
      nextDeadlineAt: { gt: new Date() },
    },
    take: 20,
    orderBy: { nextDeadlineAt: 'asc' },
    select: {
      id: true,
      identifier: true,
      title: true,
      nextDeadlineAt: true,
      budgetPerProjectCents: true,
      call: {
        select: { id: true, title: true },
      },
    },
  })) as TopicRow[];

  const totalBudget = calls.reduce((sum: bigint, c: TopicRow) => sum + (c.budgetPerProjectCents ?? 0n), 0n);
  const totalBudgetEur = Number(totalBudget) / 100;

  return (
    <div className="bg-gray-50 dark:bg-slate-900 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href={`/${locale}`} className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">
          ← {t('back')}
        </Link>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white my-4">
          {regionLabel} {t('title')}
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-400 mb-6">
          {calls.length} {t('open_calls')} · {t('total_budget')}: €{totalBudgetEur.toLocaleString(locale)}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="space-y-4">
          {calls.length > 0 ? (
            calls.map((call: TopicRow) => {
              const deadlineDate = call.nextDeadlineAt
                ? new Date(call.nextDeadlineAt).toLocaleDateString(locale)
                : '—';
              const budget = call.budgetPerProjectCents
                ? `€${(Number(call.budgetPerProjectCents) / 100).toLocaleString(locale)}`
                : '—';

              return (
                <div
                  key={call.id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border border-gray-200 dark:border-slate-700 hover:shadow-lg transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {call.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {call.identifier}
                      </p>
                      <div className="flex gap-6 mt-4 text-sm text-gray-700 dark:text-gray-400">
                        <span>📅 {t('deadline')}: {deadlineDate}</span>
                        <span>💰 {t('budget')}: {budget}</span>
                      </div>
                    </div>
                    <Link
                      href={`/${locale}/login?redirect=/dashboard`}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium whitespace-nowrap ml-4"
                    >
                      {t('view_details')}
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
              <p className="text-gray-700 dark:text-gray-400 text-lg">
                {t('no_calls', { region: regionLabel })}
              </p>
              <p className="text-gray-600 dark:text-gray-500 mt-2 text-sm">
                {t('no_calls_hint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
