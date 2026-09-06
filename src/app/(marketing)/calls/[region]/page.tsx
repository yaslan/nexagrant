import { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';

const REGIONS: Record<string, string> = {
  turkey: 'Türkiye',
  germany: 'Almanya',
  belgium: 'Belçika',
  france: 'Fransa',
  italy: 'İtalya',
};

type RegionParam = keyof typeof REGIONS;

interface PageProps {
  params: {
    region: string;
  };
}

export async function generateStaticParams() {
  return Object.keys(REGIONS).map((region) => ({
    region,
  }));
}

function getCountryCode(region: string): string {
  const codes: Record<RegionParam, string> = {
    turkey: 'TR',
    germany: 'DE',
    belgium: 'BE',
    france: 'FR',
    italy: 'IT',
  };
  return codes[region as RegionParam] || 'TR';
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const regionLabel = REGIONS[params.region as RegionParam] || params.region;

  return {
    title: `${regionLabel} Horizon Çağrıları — Fabrika`,
    description: `${regionLabel}'deki açık Horizon 2024-2025 ve EUREKA çağrıları. Deadline, bütçe ve uygunluk bilgisi.`,
    openGraph: {
      title: `${regionLabel} Horizon Çağrıları — Fabrika`,
      description: `${regionLabel}'deki açık Horizon 2024-2025 çağrıları.`,
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
  const region = params.region as RegionParam;
  const regionLabel = REGIONS[region] || region;
  const countryCode = getCountryCode(region);

  // Fetch K1 calls dynamically
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
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href="/" className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">
          ← Geri
        </Link>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white my-4">
          {regionLabel} Horizon Çağrıları
        </h1>
        <p className="text-lg text-gray-700 dark:text-gray-400 mb-6">
          {calls.length} açık çağrı · Toplam Bütçe: €{totalBudgetEur.toLocaleString('tr-TR')}
        </p>
      </div>

      {/* Calls List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="space-y-4">
          {calls.length > 0 ? (
            calls.map((call: TopicRow) => {
              const deadlineDate = call.nextDeadlineAt
                ? new Date(call.nextDeadlineAt).toLocaleDateString('tr-TR')
                : '—';
              const budget = call.budgetPerProjectCents
                ? `€${(Number(call.budgetPerProjectCents) / 100).toLocaleString('tr-TR')}`
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
                        <span>📅 Deadline: {deadlineDate}</span>
                        <span>💰 Bütçe: {budget}</span>
                      </div>
                    </div>
                    <Link
                      href={`/auth/signin?redirect=/dashboard`}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-medium whitespace-nowrap ml-4"
                    >
                      Detayları Gör
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg">
              <p className="text-gray-700 dark:text-gray-400 text-lg">
                Şu anda {regionLabel} için açık çağrı yok.
              </p>
              <p className="text-gray-600 dark:text-gray-500 mt-2 text-sm">
                Diğer ülkeleri gözlemleyin ya da panelden kayıtlı arama oluşturun.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
