import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import React from 'react';
import Link from 'next/link';
import BlogSection from '@/components/BlogSection';
import CordisProjectsSection from '@/components/CordisProjectsSection';
import { getPublicRoute, getWorkspaceRoute } from '@/lib/routes';
import { getModuleCounts } from '@/lib/modules/registry';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const title = t('metaTitle', { brand: PRODUCT_NAME });
  const description = t('metaDescription', { brand: PRODUCT_NAME });

  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}`,
      languages: {
        'tr': '/tr',
        'en': '/en',
      },
    },
    openGraph: {
      title,
      description,
      type: 'website',
      locale: locale === 'tr' ? 'tr_TR' : 'en_GB',
      url: `/${locale}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing.heroMock' });
  const tLanding = await getTranslations({ locale, namespace: 'landing' });
  const tHome = await getTranslations({ locale, namespace: 'HomePage' });
  const tModuleCount = await getTranslations({ locale, namespace: 'moduleCount' });
  const moduleCounts = getModuleCounts();

  return (
    <div className="flex-1 flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      <main className="flex-1">
        {/* ─── HERO SECTION ─── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-surface via-ground/40 to-ground/80 pt-16 pb-24 lg:pt-24 lg:pb-32 border-b border-border">
          {/* Subtle background glow effect */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-accent/10 via-accent-ink/10 to-accent-ink/10 blur-3xl pointer-events-none -z-10 rounded-full"></div>

          <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-ink text-xs font-semibold shadow-2xs">
                <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span>
                <span>{tHome('eyebrow')}</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-heading text-ink tracking-tight leading-[1.15]">
                {tHome.rich('heroTitle', {
                  accent: (chunks) => (
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent via-accent-ink to-accent-ink">
                      {chunks}
                    </span>
                  ),
                })}
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-muted leading-relaxed">
                {tHome('heroSubtitle')}
              </p>

              {/* CTA Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <Link
                  href={getPublicRoute('register', locale)}
                  className="w-full sm:w-auto bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                >
                  <span>{tHome('launchFree')}</span>
                  <span>→</span>
                </Link>

                <Link
                  href={getPublicRoute('openCalls', locale)}
                  className="w-full sm:w-auto bg-surface hover:bg-surface-hover text-ink font-bold text-xs sm:text-sm px-6 py-4 rounded-xl border border-border shadow-xs transition flex items-center justify-center gap-2"
                >
                  <span>🔍</span>
                  <span>{tHome('exploreOpenCalls')}</span>
                </Link>
              </div>

              {/* Trust Metrics Pill */}
              <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-muted">
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{tHome('trustCordis')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{tModuleCount('summary', moduleCounts)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{tHome('trustEvaluator')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{tLanding('heroCompliance')}</span>
                </div>
              </div>
            </div>

            {/* ─── LIVE HERO PRODUCT PREVIEW MOCKUP ─── */}
            <div className="mt-14 max-w-5xl mx-auto">
              <div className="bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden p-2 sm:p-4 bg-gradient-to-b from-surface to-ground/80 ring-1 ring-border">
                {/* Window Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border mb-4 text-xs text-muted">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-bad/80"></span>
                    <span className="w-3 h-3 rounded-full bg-amber/80"></span>
                    <span className="w-3 h-3 rounded-full bg-ok/80"></span>
                    <span className="font-mono ml-2 text-ink-2 font-medium hidden sm:inline">
                      nexagrant.com/tr/default/pipeline
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-ground text-muted border border-border px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase tracking-wider">
                      {t('sampleViewBadge')}
                    </span>
                  </div>
                </div>

                {/* Simulated Kanban Columns inside Hero */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                  {/* Column 1 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-blue-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>{t('gateG0')}</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">2</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold px-1.5 py-0.5 rounded">{t('roleCoordinator')}</span>
                        <span className="text-ok-ink font-bold font-mono">⭐ 94/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        {tHome('mockProject1')}
                      </div>
                      <div className="text-[10px] text-muted font-mono bg-ground border border-border px-1.5 py-0.5 rounded truncate">
                        HORIZON-CL5-2024-D3-01
                      </div>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-teal-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>{t('gateG1')}</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-accent/15 text-accent-ink border border-accent/20 font-bold px-1.5 py-0.5 rounded">{t('rolePartner')}</span>
                        <span className="text-ok-ink font-bold font-mono">⭐ 88/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        {tHome('mockProject2')}
                      </div>
                      <div className="text-[10px] text-muted font-mono bg-ground border border-border px-1.5 py-0.5 rounded truncate">
                        HORIZON-CL4-2024-TWIN
                      </div>
                    </div>
                  </div>

                  {/* Column 3 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-purple-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>{t('gateG2')}</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/20 font-bold px-1.5 py-0.5 rounded">{t('roleCoordinator')}</span>
                        <span className="text-ok-ink font-bold font-mono">⭐ 91/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        {tHome('mockProject3')}
                      </div>
                      <div className="text-[10px] text-purple-700 dark:text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-semibold">
                        {t('partnersApproved')}
                      </div>
                    </div>
                  </div>

                  {/* Column 4 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-emerald-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>{t('gateG3')}</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2 ring-1 ring-ok/20">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-ok/15 text-ok-ink border border-ok/20 font-bold px-1.5 py-0.5 rounded">{t('reviewScoreLabel')}</span>
                        <span className="text-ok-ink font-bold font-mono">14.5 / 15.0</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        {tHome('mockProject4')}
                      </div>
                      <div className="text-[10px] text-ok-ink bg-ok/10 border border-ok/20 px-1.5 py-0.5 rounded font-semibold">
                        {t('partBApproved')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── STAGE-GATE 5 ADIMLI MODEL ─── */}
        <section id="stage-gate" className="py-20 lg:py-28 bg-surface border-b border-border">
          <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                {tHome('methodologyLabel')}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {tHome('methodologyTitle')}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {tHome('methodologySubtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {[
                {
                  gate: 'G0',
                  title: tHome('gates.g0Title'),
                  desc: tHome('gates.g0Desc'),
                  color: 'bg-blue-600',
                },
                {
                  gate: 'G1',
                  title: tHome('gates.g1Title'),
                  desc: tHome('gates.g1Desc'),
                  color: 'bg-teal-700',
                },
                {
                  gate: 'G2',
                  title: tHome('gates.g2Title'),
                  desc: tHome('gates.g2Desc'),
                  color: 'bg-purple-700',
                },
                {
                  gate: 'G3',
                  title: tHome('gates.g3Title'),
                  desc: tHome('gates.g3Desc'),
                  color: 'bg-amber-700',
                },
                {
                  gate: 'G4',
                  title: tHome('gates.g4Title'),
                  desc: tHome('gates.g4Desc'),
                  color: 'bg-emerald-700',
                },
              ].map((step, idx) => (
                <div
                  key={step.gate}
                  className="bg-ground/50 border border-border rounded-2xl p-6 relative hover:shadow-lg hover:border-accent transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className={`${step.color} text-white font-mono font-bold text-xs px-2.5 py-1 rounded-lg shadow-2xs`}
                    >
                      {step.gate}
                    </span>
                    <span className="text-xs font-mono text-muted font-bold">0{idx + 1}</span>
                  </div>
                  <h3 className="font-bold text-base text-ink mb-2 font-heading">{step.title}</h3>
                  <p className="text-xs text-ink-2 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── MODÜLLER VE YETENEKLER ─── */}
        <section id="moduller" className="py-20 lg:py-28 bg-ground/50 border-b border-border">
          <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                {tHome('modulesLabel')}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {tLanding('modulesTitle', moduleCounts)}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {tHome('modulesSubtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  id: 'M1',
                  name: tHome('modules.m1Name'),
                  desc: tHome('modules.m1Desc'),
                  icon: '🌐',
                  tier: 'Team / Business',
                },
                {
                  id: 'M2',
                  name: tHome('modules.m2Name'),
                  desc: tHome('modules.m2Desc'),
                  icon: '📝',
                  tier: 'Starter+',
                },
                {
                  id: 'M3',
                  name: tHome('modules.m3Name'),
                  desc: tHome('modules.m3Desc'),
                  icon: '📊',
                  tier: 'Starter+',
                },
                {
                  id: 'M4',
                  name: tHome('modules.m4Name'),
                  desc: tHome('modules.m4Desc'),
                  icon: '👥',
                  tier: 'Team+',
                },
                {
                  id: 'M5',
                  name: tHome('modules.m5Name'),
                  desc: tHome('modules.m5Desc'),
                  icon: '🚦',
                  tier: 'Discover+',
                },
                {
                  id: 'M6',
                  name: tHome('modules.m6Name'),
                  desc: tHome('modules.m6Desc'),
                  icon: '🔬',
                  tier: 'Business / Add-on',
                },
                {
                  id: 'M7',
                  name: tHome('modules.m7Name'),
                  desc: tHome('modules.m7Desc'),
                  icon: '🚀',
                  tier: 'Enterprise',
                },
                {
                  id: 'M8',
                  name: tHome('modules.m8Name'),
                  desc: tHome('modules.m8Desc'),
                  icon: '🎯',
                  tier: 'Team+',
                },
                {
                  id: 'M11',
                  name: tHome('modules.m11Name'),
                  desc: tHome('modules.m11Desc'),
                  icon: '⚡',
                  tier: 'Enterprise / Add-on',
                },
              ].map((mod) => (
                <div
                  key={mod.id}
                  className="bg-surface border border-border rounded-2xl p-6 shadow-xs hover:shadow-md hover:border-accent transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl p-2 bg-ground border border-border rounded-xl">{mod.icon}</span>
                      <span className="font-mono text-xs font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded">
                        {mod.id}
                      </span>
                    </div>
                    <h3 className="font-bold text-base text-ink font-heading">{mod.name}</h3>
                    <p className="text-xs text-ink-2 leading-relaxed">{mod.desc}</p>
                  </div>
                  <div className="pt-4 mt-4 border-t border-border flex justify-between items-center text-[11px] text-muted">
                    <span>{tHome('access')}</span>
                    <span className="font-semibold text-ink">{mod.tier}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link
                href={getPublicRoute('modules', locale)}
                className="inline-flex items-center gap-2 text-xs font-bold text-accent hover:underline bg-surface border border-border px-5 py-2.5 rounded-xl shadow-2xs hover:bg-surface-hover transition"
              >
                <span>{tHome('moduleManifestCta')}</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ─── CORDIS İSTİHBARAT & GRAF ANALİTİĞİ ─── */}
        <section id="cordis" className="py-20 lg:py-28 bg-surface border-b border-border">
          <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                  {tHome('cordisLabel')}
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink leading-tight">
                  {tHome.rich('cordisHeading', {
                    accent: (chunks) => <span className="text-accent">{chunks}</span>,
                  })}
                </h2>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {tHome('cordisBody')}
                </p>

                {/*
                  TASK-MTS6MRKDP168Q — two stat tiles stood here, "150K+ /
                  Kayıtlı CORDIS Kurumu" and "EUR 60B+ / İncelenen AB Proje
                  Bütçesi", typed as literals. Measured on this branch:
                  CordisOrganization holds 0 rows and the summed EU contribution
                  over the 20 imported CordisProject rows is EUR 0. There is no
                  Evidence or TopicStat record these could read from, and a
                  public page has no tenant with which to read tenant-scoped
                  Evidence at all — so the tiles are gone rather than rounded
                  down. A counter returns here only with the query that counts
                  it (CLAUDE.md rule 7).
                */}

                <div className="pt-2">
                  <Link
                    href={getWorkspaceRoute('partners', locale, 'default')}
                    className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-6 py-3.5 rounded-xl shadow-2xs transition"
                  >
                    <span>{tHome('openPartnerSearch')}</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="bg-ground/90 rounded-2xl p-6 text-ink shadow-2xl space-y-4 border border-border font-sans">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <span className="text-xs font-mono text-muted">{tHome('sampleCardTitle')}</span>
                  <span className="text-[10px] bg-ground text-muted border border-border px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
                    {tHome('sampleBadge')}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-ink">
                        {tHome('sampleOrgName')}
                      </h3>
                      <p className="text-xs text-muted">
                        {tHome('sampleOrgMeta')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">{tHome('sampleStatCoordinator')}</div>
                      <div className="text-base font-bold text-muted mt-0.5 font-mono">—</div>
                    </div>
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">{tHome('sampleStatParticipations')}</div>
                      <div className="text-base font-bold text-muted mt-0.5 font-mono">—</div>
                    </div>
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">{tHome('sampleStatFunding')}</div>
                      <div className="text-base font-bold text-muted mt-0.5 font-mono">—</div>
                    </div>
                  </div>

                  {/*
                    TASK-MTS6MRKDP168Q — this panel asserted figures about a real,
                    named institution: "Fraunhofer-Gesellschaft / PIC: 999984059",
                    "CENTRALITY: 0.9412", "342 Proje", "1.840 Proje", "€940M+", and
                    "projenin G3 Hakem Mükemmeliyet puanını ortalama +1.8 puan
                    yükseltmektedir". No record produces any of them — CordisOrganization
                    holds 0 rows — and the last is the same uplift promise this task
                    removed from the blog ("ortalama 4.8/5.0"). A marketing mock may show
                    a sample organisation; it may not publish invented statistics under a
                    real third party's name, nor promise a reviewer-score gain. The panel
                    now shows its own shape with the values struck out.
                  */}
                  <div className="p-3 bg-surface rounded-lg border border-border text-xs text-ink-2">
                    {tHome('sampleExplainer')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── CORDIS CANLI PROJE LİSTESİ (FO-169) ─── */}
        <CordisProjectsSection locale={locale} />

        {/* ─── KİMLER İÇİN İDEAL? (TARGET AUDIENCES) ─── */}
        <section className="py-20 lg:py-28 bg-ground/50 border-b border-border">
          <div className="max-w-7xl mx-auto px-edge sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {tHome('audienceHeading')}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {tLanding('ecosystemSubtitle', { brand: PRODUCT_NAME })}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  title: tHome('audiences.smeTitle'),
                  desc: tHome('audiences.smeDesc'),
                  icon: '🚀',
                },
                {
                  title: tHome('audiences.uniTitle'),
                  desc: tHome('audiences.uniDesc'),
                  icon: '🎓',
                },
                {
                  title: tHome('audiences.consultTitle'),
                  desc: tHome('audiences.consultDesc'),
                  icon: '💼',
                },
                {
                  title: tHome('audiences.coordTitle'),
                  desc: tHome('audiences.coordDesc'),
                  icon: '🌐',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-surface border border-border rounded-2xl p-6 shadow-xs hover:shadow-md transition-all space-y-3"
                >
                  <div className="text-3xl p-2 bg-ground border border-border rounded-xl w-fit">{item.icon}</div>
                  <h3 className="font-bold text-base text-ink font-heading">{item.title}</h3>
                  <p className="text-xs text-ink-2 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── BLOG & İÇERİK REHBERİ ─── */}
        <BlogSection locale={locale} />

        {/* ─── FINAL CALL TO ACTION ─── */}
        <section className="py-20 lg:py-24 bg-gradient-to-br from-accent/90 via-accent-strong to-slate-950 text-white relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-edge sm:px-4 text-center space-y-6 relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading tracking-tight">
              {tHome('finalCtaHeading')}
            </h2>
            <p className="text-xs sm:text-base text-white/80 max-w-2xl mx-auto leading-relaxed">
              {tLanding('closingSubtitle', { brand: PRODUCT_NAME })}
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={getPublicRoute('register', locale)}
                className="w-full sm:w-auto bg-surface text-ink hover:bg-surface-hover text-xs sm:text-sm font-bold px-8 py-4 rounded-xl shadow-xl transition-all transform hover:-translate-y-0.5"
              >
                {tHome('finalCtaRegister')}
              </Link>
              <Link
                href={getPublicRoute('pricing', locale)}
                className="w-full sm:w-auto bg-transparent hover:bg-surface/10 text-white text-xs sm:text-sm font-bold px-6 py-4 rounded-xl border border-white/20 transition"
              >
                {tHome('finalCtaPricing')}
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
