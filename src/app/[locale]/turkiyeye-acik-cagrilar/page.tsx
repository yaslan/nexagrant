import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import { errorMessage } from '@/lib/errors';

/** The Topic columns this listing renders, with its parent call. */
interface OpenTopicRow {
  id: string;
  identifier: string;
  title: string;
  status: string;
  typeOfAction: string | null;
  isLumpSum: boolean;
  call?: { program?: string | null } | null;
}

export default async function TurkiyeyeAcikCagrilarPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isTr = locale === 'tr';

  let topics: OpenTopicRow[] = [];
  try {
    const rawTopics = await prisma.topic.findMany({
      where: {
        status: 'OPEN',
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      include: {
        call: true
      }
    });
    topics = rawTopics as unknown as OpenTopicRow[];
  } catch (err) {
    console.warn(`[TurkiyeyeAcikCagrilar] DB query bypassed: ${errorMessage(err)}`);
  }

  // Fallback demo topics if DB is empty
  if (topics.length === 0) {
    topics = [
      {
        id: 't-1',
        identifier: 'HORIZON-CL5-2024-D3-01-01',
        title: 'Alternative renewable fuel technologies for maritime and aviation transport',
        status: 'OPEN',
        isLumpSum: true,
        typeOfAction: 'RIA (Research and Innovation Action)',
        call: { program: 'Horizon Europe (Climate, Energy and Mobility)' }
      },
      {
        id: 't-2',
        identifier: 'HORIZON-CL4-2024-DIGITAL-EMERGING-01',
        title: 'AI, Data and Robotics for automated industrial inspection and manufacturing',
        status: 'OPEN',
        isLumpSum: false,
        typeOfAction: 'IA (Innovation Action)',
        call: { program: 'Horizon Europe (Digital, Industry and Space)' }
      },
      {
        id: 't-3',
        identifier: 'HORIZON-CL6-2024-CIRCBIO-01-04',
        title: 'Circular bio-based systems and bio-refineries for high value industrial products',
        status: 'OPEN',
        isLumpSum: true,
        typeOfAction: 'RIA',
        call: { program: 'Horizon Europe (Bioeconomy & Environment)' }
      },
      {
        id: 't-4',
        identifier: 'EIC-ACCEL-2024-DEEPTECH-01',
        title: 'EIC Accelerator: Breakthrough deep-tech innovations for SME scale-up',
        status: 'OPEN',
        isLumpSum: false,
        typeOfAction: 'Blended Finance / Grant',
        call: { program: 'European Innovation Council (EIC)' }
      },
      {
        id: 't-5',
        identifier: 'EUREKA-EUROSTARS-3-CALL-6',
        title: 'Eurostars 3: Transnational R&D projects by innovative SMEs and research partners',
        status: 'OPEN',
        isLumpSum: true,
        typeOfAction: 'Market-Oriented R&D (TÜBİTAK 1071 Co-funded)',
        call: { program: 'Eureka / Eurostars' }
      }
    ];
  }

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink">
      <PublicNavbar locale={locale} />

      <main className="flex-1 max-w-5xl mx-auto py-12 px-edge sm:px-4 w-full">
        <div className="mb-10 text-center">
          <span className="bg-bad/15 text-bad text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full inline-block mb-3 border border-bad/20">
            {isTr ? 'Horizon Europe & Asosiye Ülkeler' : 'Horizon Europe Associated Countries'}
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-ink mb-3">
            {isTr ? 'Türkiye’deki Kuruluşlara Açık AB Hibe Çağrıları' : 'EU Funding Calls Open to Turkish Organizations'}
          </h1>
          <p className="text-muted max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed">
            {isTr
              ? 'Türkiye, Horizon Europe anlaşması kapsamında tam asosiye statüsündedir. Türk üniversiteleri, KOBİ’leri ve sanayi kuruluşları bu çağrılara koordinatör veya ortak olarak başvurabilir ve %100 doğrudan hibe alabilir.'
              : 'Under the Horizon Europe association agreement, Turkish entities are eligible to coordinate or partner in EU consortia and receive direct grant funding.'}
          </p>
        </div>

        <div className="space-y-4 mb-10">
          {topics.map((t) => (
            <div key={t.id} className="bg-surface border border-border rounded-xl p-6 hover:border-accent transition shadow-xs flex flex-col md:flex-row justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded font-semibold">{t.identifier}</span>
                  <span className="text-xs bg-ok/15 text-ok border border-ok/20 px-2 py-0.5 rounded font-semibold">{t.status}</span>
                  {t.isLumpSum && <span className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-semibold">Lump Sum</span>}
                </div>
                <h3 className="text-base font-bold text-ink">{t.title}</h3>
                <p className="text-xs text-muted font-medium">{t.call?.program || 'Horizon Europe'} • {t.typeOfAction || 'RIA / IA'}</p>
              </div>
              <div className="flex md:flex-col justify-between items-end md:justify-center gap-2 flex-shrink-0">
                <Link
                  href={`/${locale}/default/pipeline`}
                  className="bg-accent hover:opacity-90 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow-2xs"
                >
                  {isTr ? 'Fırsatı Başlat →' : 'Start Proposal →'}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      <PublicFooter locale={locale} />
    </div>
  );
}
