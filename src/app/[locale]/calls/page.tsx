import { getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import Link from 'next/link';

interface CallCardProps {
  call: {
    title: string;
    budgetCents: bigint;
    currency: string;
  };
  topic: {
    identifier: string;
    destination: string;
    status: string;
    nextDeadlineAt: Date | null;
  };
  locale: string;
}

function CallCard({ call, topic, locale }: CallCardProps) {
  const budget = Number(call.budgetCents) / 100;
  const deadline = topic.nextDeadlineAt ? new Date(topic.nextDeadlineAt).toLocaleDateString() : 'TBA';
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
          <p className="text-xs text-slate-500 mb-1">Budget</p>
          <p className="text-lg font-bold text-slate-900">
            {budget.toLocaleString()} {call.currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Deadline</p>
          <p className="text-lg font-bold text-slate-900">{deadline}</p>
        </div>
      </div>
      <Link
        href={`/${locale}/calls/${topic.identifier}`}
        className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold text-sm"
      >
        View Details
      </Link>
    </div>
  );
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
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href={`/${locale}`} className="text-2xl font-bold text-slate-900">
            Fabrika
          </Link>
          <Link href={`/${locale}`} className="text-slate-600 hover:text-slate-900 font-medium">
            Back
          </Link>
        </nav>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">{t('title')}</h1>
        <p className="text-xl text-slate-600 mb-12">{t('subtitle')}</p>

        <div className="space-y-12">
          {Object.entries(groupedByCountry).map(([country, countryTopics]) => (
            <div key={country}>
              <h2 className="text-2xl font-bold text-slate-900 mb-6">{country === 'TR' ? '🇹🇷 Turkey' : country}</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {countryTopics.map((topic) => (
                  <CallCard key={topic.id} call={topic.call} topic={topic} locale={locale} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
