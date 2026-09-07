import React from 'react';
import { prisma } from '@/lib/db';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isTr = locale === 'tr';

  return {
    title: isTr ? 'Türkiye\'ye Açık Horizon Çağrıları' : 'Open Horizon Calls for Turkey',
    description: isTr
      ? 'Türkiye\'nin katıla bildiği tüm Horizon Europe çağrılarını keşfedin. Deadline\'lar, bütçe aralıkları ve başvuru linklerini inceleyin.'
      : 'Discover all open Horizon Europe calls available for Turkish organizations. Explore deadlines, budgets, and apply now.',
    openGraph: {
      title: isTr ? 'Türkiye\'ye Açık Horizon Çağrıları' : 'Open Horizon Calls for Turkey',
      description: isTr
        ? 'Türkiye\'nin katılabileceği açık Horizon Europe fonları'
        : 'Open Horizon Europe funding opportunities for Turkey',
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_US',
      url: `https://fabrika.app/${locale}/calls/turkey`,
    },
    twitter: {
      card: 'summary_large_image',
      title: isTr ? 'Türkiye\'ye Açık Horizon Çağrıları' : 'Open Horizon Calls for Turkey',
      description: isTr
        ? 'Türkiye\'nin katılabileceği açık Horizon Europe fonları'
        : 'Open Horizon funding opportunities for Turkey',
    },
  };
}

/**
 * The Call columns this page renders.
 *
 * NOTE: none of `country`, `isOpen`, `deadline`, `description` or
 * `budgetEstimate` exist on `model Call` in prisma/schema.prisma, so the query
 * below can only ever throw into its catch and the page renders empty. Recorded
 * in the TASK-MTQ60SGW45T0X report; the shape here is what the markup reads.
 */
interface TurkeyCallRow {
  id: string;
  title: string;
  description?: string | null;
  /** Always present in practice: the query filters on `deadline > now`. */
  deadline: Date | string;
  budgetEstimate?: string | null;
  url?: string | null;
}

export default async function TurkeyCalls({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isTr = locale === 'tr';

  let calls: TurkeyCallRow[] = [];
  try {
    calls = await prisma.call.findMany({
      where: {
        country: 'TR',
        isOpen: true,
        deadline: { gt: new Date() },
      },
      take: 20,
      orderBy: { deadline: 'asc' },
    });
  } catch (error) {
    console.error('Error fetching calls:', error);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      <PublicNavbar locale={locale} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        <div className="space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-ink">
              {isTr ? 'Türkiye\'ye Açık Horizon Çağrıları' : 'Open Horizon Calls for Turkey'}
            </h1>
            <p className="text-muted text-lg">
              {isTr
                ? `${calls.length} aktif çağrı bulundu`
                : `${calls.length} active calls found`}
            </p>
          </div>

          {/* Calls Grid */}
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {calls.map((call) => (
              <div
                key={call.id}
                className="bg-surface border border-border rounded-lg p-6 hover:border-accent/50 transition space-y-4"
              >
                <div>
                  <h3 className="font-semibold text-ink text-lg">{call.title}</h3>
                  <p className="text-sm text-muted mt-1">
                    {call.description?.substring(0, 100)}...
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">
                      {isTr ? 'Deadline:' : 'Deadline:'}
                    </span>
                    <span className="font-mono font-semibold">
                      {new Date(call.deadline).toLocaleDateString(
                        locale === 'tr' ? 'tr-TR' : 'en-US'
                      )}
                    </span>
                  </div>
                  {call.budgetEstimate && (
                    <div className="flex justify-between">
                      <span className="text-muted">
                        {isTr ? 'Bütçe:' : 'Budget:'}
                      </span>
                      <span className="font-mono font-semibold">
                        €{call.budgetEstimate.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>

                <a
                  href={call.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-accent text-white text-center py-2 rounded-lg hover:opacity-90 text-sm font-semibold transition"
                >
                  {isTr ? 'Detayları Gör' : 'View Details'}
                </a>
              </div>
            ))}
          </div>

          {calls.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted text-lg">
                {isTr
                  ? 'Şu anda Türkiye\'ye açık çağrı bulunamadı.'
                  : 'No open calls for Turkey at the moment.'}
              </p>
            </div>
          )}
        </div>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}
