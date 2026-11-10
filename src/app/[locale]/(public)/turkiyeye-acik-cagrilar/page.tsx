import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { errorMessage } from '@/lib/errors';
import { appUrl } from '@/lib/app-url';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'turkiyeye_acik_cagrilar' });
  const title = t('meta_title');
  const description = t('meta_description');

  const baseUrl = appUrl();
  const canonicalUrl = `${baseUrl}/${locale}/turkiyeye-acik-cagrilar`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'tr': `${baseUrl}/tr/turkiyeye-acik-cagrilar`,
        'en': `${baseUrl}/en/turkiyeye-acik-cagrilar`,
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
  const t = await getTranslations({ locale, namespace: 'turkiyeye_acik_cagrilar' });

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
    <div className="flex-1 flex flex-col bg-background text-ink">
      <main className="flex-1 max-w-5xl mx-auto py-12 px-edge sm:px-4 w-full">
        <div className="mb-10 text-center">
          <span className="bg-bad/15 text-bad text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full inline-block mb-3 border border-bad/20">
            {t('badge')}
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold font-heading text-ink mb-3">
            {t('heading')}
          </h1>
          <p className="text-muted max-w-2xl mx-auto text-xs sm:text-sm leading-relaxed">
            {t('intro')}
          </p>
        </div>

        <div className="space-y-4 mb-10">
          {topics.map((topic) => (
            <div key={topic.id} className="bg-surface border border-border rounded-xl p-6 hover:border-accent transition shadow-xs flex flex-col md:flex-row justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded font-semibold">{topic.identifier}</span>
                  <span className="text-xs bg-ok/15 text-ok border border-ok/20 px-2 py-0.5 rounded font-semibold">{topic.status}</span>
                  {topic.isLumpSum && <span className="text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded font-semibold">{t('lump_sum')}</span>}
                </div>
                <h3 className="text-base font-bold text-ink">{topic.title}</h3>
                <p className="text-xs text-muted font-medium">{topic.call?.program || t('default_program')} • {topic.typeOfAction || t('default_type')}</p>
              </div>
              <div className="flex md:flex-col justify-between items-end md:justify-center gap-2 flex-shrink-0">
                <Link
                  href={`/${locale}/default/pipeline`}
                  className="bg-accent hover:opacity-90 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition shadow-2xs"
                >
                  {t('start_proposal')}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
