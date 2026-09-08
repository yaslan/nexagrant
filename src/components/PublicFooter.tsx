import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPublicRoute, getWorkspaceRoute } from '@/lib/routes';

interface PublicFooterProps {
  locale: string;
}

export default function PublicFooter({ locale }: PublicFooterProps) {
  const isTr = locale === 'tr';

  return (
    <footer className="bg-ground border-t border-border text-muted text-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10">
          {/* Col 1: Brand */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="FonBridge Logo" width={72} height={72} className="object-contain" />
            </div>
            <p className="text-muted text-xs leading-relaxed max-w-sm">
              {isTr
                ? 'Horizon Europe, Digital Europe ve Eurostars fonlama süreçlerinde fikirden teslimata uçtan uca akıllı yönetim platformu. CORDIS ağ analitiği ve hakem simülasyonu ile teklifinizi güçlendirin.'
                : 'End-to-end intelligent proposal and consortium management platform for Horizon Europe, Digital Europe, and Eurostars. Strengthen your proposal with CORDIS graph analytics and AI evaluator simulation.'}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-muted">
              <span className="flex items-center gap-1 text-[11px] bg-surface border border-border px-2.5 py-1 rounded-md text-ok font-mono">
                ● EU Cloud & GDPR Compliant
              </span>
              <span className="text-[11px] bg-surface border border-border px-2.5 py-1 rounded-md text-muted font-mono">
                CORDIS 2026 Ready
              </span>
            </div>
          </div>

          {/* Col 2: Platform & Yetenekler */}
          <div className="space-y-3">
            <h3 className="text-ink font-bold text-sm tracking-wide">
              {isTr ? 'Yetenekler' : 'Platform'}
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href={getWorkspaceRoute('pipeline', locale, 'default')} className="hover:text-ink transition">
                  {isTr ? 'G0-G4 Kapı Modeli' : 'G0-G4 Stage-Gate'}
                </Link>
              </li>
              <li>
                <Link href={getWorkspaceRoute('partners', locale, 'default')} className="hover:text-ink transition">
                  {isTr ? 'CORDIS Ortak İstihbaratı' : 'CORDIS Partner Intelligence'}
                </Link>
              </li>
              <li>
                <Link href={getWorkspaceRoute('conceptNotes', locale, 'default')} className="hover:text-ink transition">
                  {isTr ? 'Yapay Zeka Konsept Notu' : 'AI Concept Notes'}
                </Link>
              </li>
              <li>
                <Link href={getWorkspaceRoute('pipeline', locale, 'default')} className="hover:text-ink transition">
                  {isTr ? 'Konsorsiyum Masası' : 'Consortium Matching'}
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('modules', locale)} className="hover:text-ink transition">
                  {isTr ? 'Modül Kataloğu (M1-M11)' : 'Module Catalog'}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Programlar & Çağrılar */}
          <div className="space-y-3">
            <h4 className="text-ink font-bold text-sm tracking-wide">
              {isTr ? 'Hibe Programları' : 'Programmes'}
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href={getPublicRoute('openCalls', locale)} className="hover:text-ink transition">
                  Horizon Europe (Pillar II)
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('openCalls', locale)} className="hover:text-ink transition">
                  EIC Accelerator & Pathfinder
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('openCalls', locale)} className="hover:text-ink transition">
                  Digital Europe Programme
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('openCalls', locale)} className="hover:text-ink transition">
                  Eureka / Eurostars 3
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('openCalls', locale)} className="hover:text-ink transition">
                  TÜBİTAK 1071 İkili İşbirlikleri
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 4: Kurumsal & Güvenlik */}
          <div className="space-y-3">
            <h4 className="text-ink font-bold text-sm tracking-wide">
              {isTr ? 'Kurumsal & Yasal' : 'Legal & Trust'}
            </h4>
            <ul className="space-y-2">
              <li>
                <Link href={getPublicRoute('pricing', locale)} className="hover:text-ink transition">
                  {isTr ? 'Fiyatlandırma & Planlar' : 'Pricing'}
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('privacy', locale)} className="hover:text-ink transition">
                  {isTr ? 'Gizlilik Politikası (KVKK/GDPR)' : 'Privacy Policy'}
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('terms', locale)} className="hover:text-ink transition">
                  {isTr ? 'Kullanım Koşulları' : 'Terms of Service'}
                </Link>
              </li>
              <li>
                <Link href={getPublicRoute('dpa', locale)} className="hover:text-ink transition">
                  {isTr ? 'Veri İşleme Sözleşmesi (DPA)' : 'Data Processing Agreement'}
                </Link>
              </li>
              <li>
                <a href="mailto:info@usfinbridge.com" className="hover:text-ink transition">
                  {isTr ? 'İletişim & Demo Talebi' : 'Contact Support'}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-muted">
          <div>
            {isTr
              ? `© ${new Date().getFullYear()} FonBridge (FonBridge SaaS). Tüm hakları saklıdır.`
              : `© ${new Date().getFullYear()} FonBridge (FonBridge SaaS). All rights reserved.`}
          </div>
          <div className="flex items-center gap-6">
            <span>🇪🇺 Frankfurt & Istanbul Data Centers</span>
            <span>256-bit AES Encryption</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
