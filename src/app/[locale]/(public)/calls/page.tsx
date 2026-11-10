import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { publicCallDetailHref } from '@/lib/routes';
import { appUrl } from '@/lib/app-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'callsPage' });
  const title = t('pageTitle');
  const description = t('pageDescription');

  const baseUrl = appUrl();
  const canonicalUrl = `${baseUrl}/${locale}/calls`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'tr': `${baseUrl}/tr/calls`,
        'en': `${baseUrl}/en/calls`,
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: canonicalUrl,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function CallsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'callsIndex' });

  const topics = await prisma.topic.findMany({
    where: {
      status: { in: ['OPEN', 'FORTHCOMING'] },
    },
    include: {
      call: {
        select: {
          id: true,
          title: true,
          budgetCents: true,
          currency: true,
        },
      },
    },
    take: 50,
  });

  const groupedByCountry: Record<string, Array<typeof topics[0]>> = {};
  topics.forEach((topic: typeof topics[0]) => {
    const country = topic.destination || 'EU';
    if (!groupedByCountry[country]) groupedByCountry[country] = [];
    groupedByCountry[country].push(topic);
  });

  return (
    <main id="main" className="flex-1 bg-white">
      <section className="max-w-6xl mx-auto px-edge sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">{t('title')}</h1>
        <p className="text-xl text-slate-600 mb-12">{t('subtitle')}</p>

        <div className="space-y-12">
          {Object.entries(groupedByCountry).map(([country, countryTopics]) => (
            <div key={country}>
              <h2 className="text-2xl font-bold text-slate-900 mb-6">{country === 'TR' ? t('country_tr') : country}</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {countryTopics.map((topic) => (
                  <CallCard key={topic.id} call={topic.call} topic={topic} locale={locale} t={t} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

interface CallCardProps {
  call: {
    title: string;
    budgetCents: bigint | null;
    currency: string;
  };
  topic: {
    identifier: string;
    destination: string | null;
    status: string;
    nextDeadlineAt: Date | null;
  };
  locale: string;
  t: (key: 'budget' | 'deadline' | 'tba' | 'view_details') => string;
}

function CallCard({ call, topic, locale, t }: CallCardProps) {
  const budget = call.budgetCents ? Number(call.budgetCents) / 100 : 0;
  const deadline = topic.nextDeadlineAt ? new Date(topic.nextDeadlineAt).toLocaleDateString() : t('tba');
  const statusColor = topic.status === 'OPEN' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800';

  return (
    <div className="border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-semibold text-slate-900 flex-1">{call.title}</h3>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>{topic.status}</span>
      </div>
      <p className="text-slate-600 text-sm mb-4">{topic.identifier}</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 mb-1">{t('budget')}</p>
          <p className="text-lg font-bold text-slate-900">
            {budget.toLocaleString()} {call.currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">{t('deadline')}</p>
          <p className="text-lg font-bold text-slate-900">{deadline}</p>
        </div>
      </div>
      <Link
        href={publicCallDetailHref(locale, topic.identifier)}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold text-sm"
      >
        {t('view_details')}
      </Link>
    </div>
  );
}
