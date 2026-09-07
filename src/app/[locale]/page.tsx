import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import React from 'react';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import PublicFooter from '@/components/PublicFooter';
import BlogSection from '@/components/BlogSection';
import { getPublicRoute, getWorkspaceRoute } from '@/lib/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'landing' });
  const title = t('metaTitle');
  const description = t('metaDescription');

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
  const isTr = locale === 'tr';

  return (
    <div className="min-h-screen flex flex-col bg-background text-ink selection:bg-accent selection:text-white">
      {/* Top Public Navigation */}
      <PublicNavbar locale={locale} />

      <main className="flex-1">
        {/* ─── HERO SECTION ─── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-surface via-ground/40 to-ground/80 pt-16 pb-24 lg:pt-24 lg:pb-32 border-b border-border">
          {/* Subtle background glow effect */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-accent/10 via-teal-500/10 to-accent-ink/10 blur-3xl pointer-events-none -z-10 rounded-full"></div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent-ink text-xs font-semibold shadow-2xs">
                <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span>
                <span>
                  {isTr
                    ? 'Horizon Europe • Digital Europe • Eurostars İçin Uçtan Uca Platform'
                    : 'End-to-End Operating System for EU Funding Programmes'}
                </span>
              </div>

              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold font-heading text-ink tracking-tight leading-[1.15]">
                {isTr ? (
                  <>
                    AB Projelerinizi Fikirden Fonlamaya,{' '}
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent via-teal-400 to-accent-ink">
                      Baştan Sona Yönetin
                    </span>
                  </>
                ) : (
                  <>
                    From Concept to Grant Agreement:{' '}
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-accent via-teal-400 to-accent-ink">
                      Master Your EU Projects
                    </span>
                  </>
                )}
              </h1>

              {/* Subtitle */}
              <p className="text-sm sm:text-base text-muted leading-relaxed">
                {isTr
                  ? 'Çağrı keşfinden CORDIS ortak istihbaratına, yapay zeka destekli konsept notu üretiminden AB hakem simülasyonu ve konsorsiyum masasına kadar tüm aşama-kapı (Stage-Gate) süreçlerini tek platformda birleştirin.'
                  : 'Combine open call discovery, CORDIS network intelligence, AI-assisted concept drafting, evaluator scoring simulation, and consortium seat matching in one integrated platform.'}
              </p>

              {/* CTA Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                <Link
                  href={getPublicRoute('register', locale)}
                  className="w-full sm:w-auto bg-accent hover:opacity-90 text-white font-bold text-xs sm:text-sm px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  style={{ backgroundColor: '#003D5C' }}
                >
                  <span>{isTr ? 'Ücretsiz Çalışma Alanı Başlatın' : 'Launch Free Workspace'}</span>
                  <span>→</span>
                </Link>

                <Link
                  href={getPublicRoute('openCalls', locale)}
                  className="w-full sm:w-auto bg-surface hover:bg-surface-hover text-ink font-bold text-xs sm:text-sm px-6 py-4 rounded-xl border border-border shadow-xs transition flex items-center justify-center gap-2"
                >
                  <span>🔍</span>
                  <span>{isTr ? 'Açık Çağrıları İncele' : 'Explore Open Calls'}</span>
                </Link>
              </div>

              {/* Trust Metrics Pill */}
              <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-muted">
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{isTr ? '150.000+ CORDIS Kurumu' : '150k+ CORDIS Profiles'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{isTr ? '11 Özel Ar-Ge Modülü (M1-M11)' : '11 Integrated R&D Modules'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{isTr ? 'AB Hakem Puanlama Simülatörü' : 'Evaluator Lens Simulation'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ok font-bold text-sm">✓</span>
                  <span>{isTr ? 'GDPR / KVKK Uyumlu Güvenli Bulut' : 'GDPR & EU Cloud Ready'}</span>
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
                      fabrika.eu/tr/default/pipeline
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-ok/15 text-ok border border-ok/20 px-2 py-0.5 rounded font-mono font-bold text-[10px]">
                      LIVE SYSTEM
                    </span>
                  </div>
                </div>

                {/* Simulated Kanban Columns inside Hero */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-2">
                  {/* Column 1 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-blue-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>G0: Triage & Fizibilite</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">2</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-purple-500/15 text-purple-400 border border-purple-500/20 font-bold px-1.5 py-0.5 rounded">👑 Koordinatör</span>
                        <span className="text-ok font-bold font-mono">⭐ 94/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        FLEX-GRID: Decarbonised Smart Grid Flexibility
                      </div>
                      <div className="text-[10px] text-muted font-mono bg-ground border border-border px-1.5 py-0.5 rounded truncate">
                        HORIZON-CL5-2024-D3-01
                      </div>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-teal-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>G1: Konsept Notu</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-accent/15 text-accent-ink border border-accent/20 font-bold px-1.5 py-0.5 rounded">🤝 Ortak</span>
                        <span className="text-ok font-bold font-mono">⭐ 88/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        TWIN-HYDRO: AI Digital Twins for Hydrogen
                      </div>
                      <div className="text-[10px] text-muted font-mono bg-ground border border-border px-1.5 py-0.5 rounded truncate">
                        HORIZON-CL4-2024-TWIN
                      </div>
                    </div>
                  </div>

                  {/* Column 3 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-purple-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>G2: Konsorsiyum</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-purple-500/15 text-purple-400 border border-purple-500/20 font-bold px-1.5 py-0.5 rounded">👑 Koordinatör</span>
                        <span className="text-ok font-bold font-mono">⭐ 91/100</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        CIRC-PACK: Circular Bio Polymers for Packaging
                      </div>
                      <div className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-semibold">
                        7 Ortak • 5 Ülke Onaylı
                      </div>
                    </div>
                  </div>

                  {/* Column 4 */}
                  <div className="bg-ground/60 rounded-xl p-3 border-t-4 border-t-emerald-500 space-y-2.5 border border-border">
                    <div className="flex justify-between items-center text-xs font-bold text-ink">
                      <span>G3: Hakem İncelemesi</span>
                      <span className="bg-ground border border-border px-1.5 py-0.5 rounded-full text-[10px] text-muted">1</span>
                    </div>
                    <div className="bg-surface p-3 rounded-lg border border-border shadow-2xs space-y-2 ring-1 ring-ok/20">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="bg-ok/15 text-ok border border-ok/20 font-bold px-1.5 py-0.5 rounded">Hakem Puanı</span>
                        <span className="text-ok font-bold font-mono">14.5 / 15.0</span>
                      </div>
                      <div className="font-bold text-xs text-ink leading-tight">
                        CLEAN-PORT: Zero-Emission Coastal Freight
                      </div>
                      <div className="text-[10px] text-ok bg-ok/10 border border-ok/20 px-1.5 py-0.5 rounded font-semibold">
                        ✓ Part B Taslağı Onaylandı
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
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                {isTr ? 'Metodoloji' : 'Methodology'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {isTr
                  ? 'Fikirden Hibe İmzasına: 5 Aşamalı Kapı Modeli'
                  : '5-Stage Gate Proposal Pipeline Architecture'}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {isTr
                  ? 'Başarısız başvurulara boşa harcanan adam-gün eforunu sonlandırın. Her aşamada matematiksel eşikler ve yapay zeka puanlamasıyla ilerleyin.'
                  : 'Eliminate wasted person-days on doomed proposals. Progress systematically with mathematical gate filters and AI evaluations.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              {[
                {
                  gate: 'G0',
                  title: isTr ? 'Triage & Filtre' : 'Triage & Feasibility',
                  desc: isTr
                    ? 'Hedef çağrıya uyum skoru, TRL aralığı ve geçmiş başarı oranına (Base Rate) göre stratejik eleme.'
                    : 'Strategic alignment scoring, TRL verification, and historical baseline win-rate triage.',
                  color: 'bg-blue-600',
                },
                {
                  gate: 'G1',
                  title: isTr ? 'Konsept Notu' : 'Concept Note (M2)',
                  desc: isTr
                    ? 'Mükemmeliyet (Excellence), Etki (Impact) ve Uygulama mimarisi AB standartlarında yapılandırılır.'
                    : 'Draft Excellence, Impact, and Implementation sections with EU policy alignment.',
                  color: 'bg-teal-700',
                },
                {
                  gate: 'G2',
                  title: isTr ? 'Konsorsiyum' : 'Consortium Desk (M8)',
                  desc: isTr
                    ? '150k+ CORDIS profilinden eksik yetkinlik koltukları, koordinatör ve partnerler eşleştirilir.'
                    : 'Match optimal coordinators and partners from 150k+ CORDIS profiles by centrality and topic history.',
                  color: 'bg-purple-700',
                },
                {
                  gate: 'G3',
                  title: isTr ? 'Hakem Simülasyonu' : 'Evaluator Lens (M6)',
                  desc: isTr
                    ? 'Teklif metni, bağımsız AB hakemi perspektifiyle 15 puan üzerinden taranır ve zayıf noktalar raporlanır.'
                    : 'Deep AI evaluator simulation grading against official 15-point criteria with actionable fixes.',
                  color: 'bg-amber-700',
                },
                {
                  gate: 'G4',
                  title: isTr ? 'Nihai Teslim' : 'Final Submission',
                  desc: isTr
                    ? 'Bütçe tabloları, PIC doğrulamaları ve Part A/B dosyaları AB Funding Portal formatında teslimata hazır hale gelir.'
                    : 'Final budget verification, PIC validations, and complete application submission readiness.',
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

        {/* ─── MODÜLLER VE YETENEKLER (M1-M11) ─── */}
        <section id="moduller" className="py-20 lg:py-28 bg-ground/50 border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                {isTr ? 'Entegre Modül Mimarisi' : 'Modular Powerhouse'}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {isTr
                  ? 'AB Proje Yönetiminin 11 Güçlü Modülü'
                  : '11 Integrated Engines for EU Proposal Production'}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {isTr
                  ? 'Teklif yazımından ortak istihbaratına kadar her ihtiyaca özel tasarlanmış modüler araç seti.'
                  : 'A purpose-built suite of tools designed for every phase of EU research and innovation lifecycle.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  id: 'M1',
                  name: isTr ? 'CORDIS Ortak İstihbaratı' : 'Partner Intelligence',
                  desc: isTr
                    ? '150.000+ Avrupalı kurumun geçmiş projeleri, aldığı AB hibesi (€) ve ağ merkezilik puanı.'
                    : 'CORDIS graph analytics, past projects, coordinator track record, and eigenvector centrality.',
                  icon: '🌐',
                  tier: 'Team / Business',
                },
                {
                  id: 'M2',
                  name: isTr ? 'Konsept Notu Mimarisi' : 'Concept Note Architectures',
                  desc: isTr
                    ? 'Horizon Europe, Eurostars ve ikili çağrılar için kör değerlendirme ve şablonlu konsept üretici.'
                    : 'Template-driven and AI-assisted concept drafting tailored to EU work programmes.',
                  icon: '📝',
                  tier: 'Starter+',
                },
                {
                  id: 'M3',
                  name: isTr ? 'Kanıt Paketi Deposu' : 'Evidence Pack Vault',
                  desc: isTr
                    ? 'AB politika hedefleri (Green Deal, Digital Decade), etki verileri ve istatistik deposu.'
                    : 'EU policy references, impact data points, and structured evidence bank for proposals.',
                  icon: '📊',
                  tier: 'Starter+',
                },
                {
                  id: 'M4',
                  name: isTr ? 'Focal Point CRM' : 'Focal Point CRM',
                  desc: isTr
                    ? 'Konsorsiyum ortakları, irtibat kişileri ve 60 günlük soğuma uyarıları ile kurumsal hafıza.'
                    : 'Partner relationship management with 60-day stale alerts and interaction timeline.',
                  icon: '👥',
                  tier: 'Team+',
                },
                {
                  id: 'M5',
                  name: isTr ? 'Aşama-Kapı Boru Hattı' : 'Proposal Workflows',
                  desc: isTr
                    ? 'G0-G4 Kanban panosu, adam-gün takip aracı ve görev dağıtım takvimi.'
                    : 'Stage-gate Kanban, T-6 deadline schedules, and person-day effort tracking.',
                  icon: '🚦',
                  tier: 'Discover+',
                },
                {
                  id: 'M6',
                  name: isTr ? 'Evaluator Lens (Hakem Simülatörü)' : 'Evaluator Lens AI',
                  desc: isTr
                    ? 'Resmi AB hakem kriterleriyle Mükemmeliyet, Etki ve Uygulama bölümlerine yapay zeka denetimi.'
                    : 'Rigorous 15-point scoring simulation mimicking official EU expert evaluators.',
                  icon: '🔬',
                  tier: 'Business / Add-on',
                },
                {
                  id: 'M7',
                  name: isTr ? 'TTO Hızlandırıcısı' : 'TTO Accelerator',
                  desc: isTr
                    ? 'Üniversite ve araştırma merkezlerinin patent portföyünü AB çağrılarıyla otomatik eşleştirir.'
                    : 'Maps university patent & technology portfolios directly to matching Horizon Europe calls.',
                  icon: '🚀',
                  tier: 'Enterprise',
                },
                {
                  id: 'M8',
                  name: isTr ? 'Konsorsiyum Eşleştirme' : 'Consortium Seat Matching',
                  desc: isTr
                    ? 'Coğrafi dağılım, bütçe kısıtları ve rol yetkinliklerine göre en uygun ortak önerileri.'
                    : 'Calculates optimal consortia balance factoring in geography, role history, and topic expertise.',
                  icon: '🎯',
                  tier: 'Team+',
                },
                {
                  id: 'M11',
                  name: isTr ? 'Tam Başvuru Üreticisi' : 'Full Application Production',
                  desc: isTr
                    ? 'Part A ve Part B başvuru dosyalarını resmi AB formatında tam metin olarak üreten motor.'
                    : 'Generates complete compliant Part A & Part B draft documents with work packages and deliverables.',
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
                    <span>Erişim:</span>
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
                <span>{isTr ? 'Tüm Modül ve Eklenti Detaylarını İncele' : 'View Complete Module Manifest'}</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </section>

        {/* ─── CORDIS İSTİHBARAT & GRAF ANALİTİĞİ ─── */}
        <section id="cordis" className="py-20 lg:py-28 bg-surface border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <span className="text-xs font-bold text-accent uppercase tracking-widest bg-accent/10 border border-accent/20 px-3 py-1 rounded-full">
                  {isTr ? 'Ağ & Ortak İstihbaratı' : 'Network Graph Analytics'}
                </span>
                <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink leading-tight">
                  {isTr ? (
                    <>
                      150.000+ CORDIS Kurumu ile{' '}
                      <span className="text-accent">En Güçlü Konsorsiyumu</span> Kurun
                    </>
                  ) : (
                    <>
                      Build Winning Consortia with{' '}
                      <span className="text-accent">150k+ CORDIS Network Nodes</span>
                    </>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-muted leading-relaxed">
                  {isTr
                    ? 'Avrupa Komisyonu geçmiş fonlama verileri üzerinde çalışan ağ analitiğimiz, hangi kurumların çağrılarda en yüksek koordinasyon ve kazanma oranına sahip olduğunu gösterir. PIC kodları, eigenvector merkeziliği ve ülke dağılımını tek tıkla analiz edin.'
                    : 'Our network graph analytics over official European Commission funding data surfaces top coordinators and partners. Evaluate PIC codes, eigenvector centrality, and geographic consortium balances instantly.'}
                </p>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-ground border border-border rounded-xl">
                    <div className="text-2xl font-extrabold text-accent">150K+</div>
                    <div className="text-xs text-muted mt-0.5">
                      {isTr ? 'Kayıtlı CORDIS Kurumu' : 'Verified EU Organizations'}
                    </div>
                  </div>
                  <div className="p-4 bg-ground border border-border rounded-xl">
                    <div className="text-2xl font-extrabold text-teal-400">€60B+</div>
                    <div className="text-xs text-muted mt-0.5">
                      {isTr ? 'İncelenen AB Proje Bütçesi' : 'Analyzed EU Grant Budgets'}
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Link
                    href={getWorkspaceRoute('partners', locale, 'default')}
                    className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold px-6 py-3.5 rounded-xl shadow-2xs transition"
                  >
                    <span>{isTr ? 'Ortak Arama Motorunu Dene' : 'Open Partner Search'}</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Visual Card Mockup */}
              <div className="bg-ground/90 rounded-2xl p-6 text-ink shadow-2xl space-y-4 border border-border font-sans">
                <div className="flex justify-between items-center border-b border-border pb-3">
                  <span className="text-xs font-mono text-muted">CORDIS Node Analytics</span>
                  <span className="text-[10px] bg-ok/15 text-ok border border-ok/20 px-2 py-0.5 rounded font-mono font-bold">
                    CENTRALITY: 0.9412
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-base text-ink">Fraunhofer-Gesellschaft</h3>
                      <p className="text-xs text-muted">PIC: 999984059 • Almanya (DE) • REC</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">Koordinatörlük</div>
                      <div className="text-base font-bold text-ink mt-0.5">342 Proje</div>
                    </div>
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">Toplam Katılım</div>
                      <div className="text-base font-bold text-ink mt-0.5">1.840 Proje</div>
                    </div>
                    <div className="bg-surface p-2.5 rounded-lg border border-border">
                      <div className="text-[10px] text-muted">Alınan Fon</div>
                      <div className="text-base font-bold text-ok mt-0.5">€940M+</div>
                    </div>
                  </div>

                  <div className="p-3 bg-surface rounded-lg border border-border text-xs text-ink-2">
                    <span className="text-amber font-bold">💡 Konsorsiyum Etkisi:</span> Bu kurumun ortak olarak yer
                    alması, projenin G3 Hakem Mükemmeliyet puanını ortalama <strong>+1.8 puan</strong> yükseltmektedir.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── KİMLER İÇİN İDEAL? (TARGET AUDIENCES) ─── */}
        <section className="py-20 lg:py-28 bg-ground/50 border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl sm:text-4xl font-extrabold font-heading text-ink">
                {isTr ? 'Tüm Ekosistem Paydaşları İçin Tek Çözüm' : 'Built for the Entire Innovation Ecosystem'}
              </h2>
              <p className="text-xs sm:text-sm text-muted">
                {isTr
                  ? 'İster bağımsız bir danışman olun, ister büyük bir üniversite; FonBridge iş akışınızı hızlandırır.'
                  : 'From high-growth SMEs to university TTOs and international research consortia.'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[
                {
                  title: isTr ? 'KOBİ’ler & Startuplar' : 'SMEs & Deep Tech',
                  desc: isTr
                    ? 'Eurostars, EIC Accelerator ve Horizon çağrılarına düşük adam-gün maliyeti ve yüksek puanla başvurun.'
                    : 'Accelerate EIC and Eurostars applications with minimal overhead and high evaluation scores.',
                  icon: '🚀',
                },
                {
                  title: isTr ? 'Üniversiteler & TTO’lar' : 'Universities & TTOs',
                  desc: isTr
                    ? 'Akademik buluş ve patent portföyünüzü Horizon Europe Cluster çağrılarıyla otomatik eşleştirin.'
                    : 'Match research IP and patent databases automatically with open EU call topics.',
                  icon: '🎓',
                },
                {
                  title: isTr ? 'AB Proje Danışmanları' : 'EU Grant Consultancies',
                  desc: isTr
                    ? 'Çoklu müşteri çalışma alanlarını (Multi-tenant) tek panelden yönetin, teklif yazımını 10 kat hızlandırın.'
                    : 'Manage multi-client workspaces with isolated tenants, stage-gates, and fast proposal generation.',
                  icon: '💼',
                },
                {
                  title: isTr ? 'Konsorsiyum Liderleri' : 'Consortia Coordinators',
                  desc: isTr
                    ? 'Çok ortaklı bütçe dağılımı, toplantı tutanakları (MoM) ve teslim takvimini eksiksiz yürütün.'
                    : 'Coordinate multi-partner work packages, budgets, agendas, and meeting minutes effortlessly.',
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
        <section className="py-20 lg:py-24 bg-gradient-to-br from-accent/90 via-accent-ink to-slate-950 text-white relative overflow-hidden">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-6 relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-heading tracking-tight">
              {isTr
                ? 'Bir Sonraki Horizon Europe Projenizi Bugün Başlatın'
                : 'Start Your Next Horizon Europe Winner Today'}
            </h2>
            <p className="text-xs sm:text-base text-white/80 max-w-2xl mx-auto leading-relaxed">
              {isTr
                ? 'FonBridge ile teklif hazırlama sürenizi haftalardan günlere indirin, CORDIS analitiği ile kazanma şansınızı en üst seviyeye taşıyın.'
                : 'Accelerate proposal writing timelines from months to days with verified CORDIS network data and evaluator grade precision.'}
            </p>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={getPublicRoute('register', locale)}
                className="w-full sm:w-auto bg-surface text-ink hover:bg-surface-hover text-xs sm:text-sm font-bold px-8 py-4 rounded-xl shadow-xl transition-all transform hover:-translate-y-0.5"
              >
                {isTr ? 'Hemen Ücretsiz Başlayın →' : 'Launch Workspace Now →'}
              </Link>
              <Link
                href={getPublicRoute('pricing', locale)}
                className="w-full sm:w-auto bg-transparent hover:bg-surface/10 text-white text-xs sm:text-sm font-bold px-6 py-4 rounded-xl border border-white/20 transition"
              >
                {isTr ? 'Fiyatlandırmayı İncele' : 'Explore Pricing'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Public Footer */}
      <PublicFooter locale={locale} />
    </div>
  );
}
