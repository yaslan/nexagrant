'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { Building, Sparkles, Key, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { getWorkspaceRoute } from '@/lib/routes';
import { updateTenantProfile } from './actions';

export default function TenantProfilePage() {
  const params = useParams();
  const locale = (params?.locale as string) || 'tr';
  const workspace = (params?.workspace as string) || 'default';
  const isTr = locale === 'tr';

  const [capabilities, setCapabilities] = useState(
    isTr
      ? 'Yapay zeka algoritmaları, derin öğrenme, AB Horizon Europe Cluster 4 ve Cluster 5 projeleri deneyimi, TRL 4-7 prototipleme.'
      : 'Artificial intelligence algorithms, deep learning, experience in EU Horizon Europe Cluster 4 & 5 projects, TRL 4-7 prototyping.'
  );
  const [keywords, setKeywords] = useState('Artificial Intelligence, Horizon Europe, Green Energy, Robotics, TRL 6');
  const [trlMin, setTrlMin] = useState(3);
  const [trlMax, setTrlMax] = useState(8);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(false);
    setError('');

    const result = await updateTenantProfile({
      capabilities,
      keywords,
      trlMin,
      trlMax,
    });

    setSaving(false);

    if (result.ok) {
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } else {
      const errorMessages: Record<string, string> = {
        forbidden: isTr ? 'Bu işlem için yetkiniz yok' : 'You do not have permission to perform this action',
        invalid: isTr ? 'Lütfen tüm alanları doğru şekilde doldurun' : 'Please fill all fields correctly',
        failed: isTr ? 'Profil kaydedilemedi' : 'Failed to save profile',
        pilotExpired: isTr ? 'Pilot süresi doldu' : 'Pilot period has ended',
      };
      setError(errorMessages[result.error] || (isTr ? 'Bir hata oluştu' : 'An error occurred'));
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8 sm:px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-muted mb-4">
        <Link href={getWorkspaceRoute('dashboard', locale, workspace)} className="hover:text-ink transition-colors">
          {isTr ? 'Panel' : 'Dashboard'}
        </Link>
        <span>/</span>
        <Link href={getWorkspaceRoute('settingsModules', locale, workspace)} className="hover:text-ink transition-colors">
          {isTr ? 'Ayarlar' : 'Settings'}
        </Link>
        <span>/</span>
        <span className="text-accent font-semibold">{isTr ? 'Kurumsal Profil' : 'Organization Profile'}</span>
      </div>

      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
            {isTr ? 'Kurumsal Profil & Ar-Ge Yetkinlikleri' : 'Organization Profile & R&D Capabilities'}
          </h1>
          <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">
            {isTr
              ? 'Kurumunuzun teknik yeteneklerini, patentlerini ve ilgi alanlarını tanımlayın. YZ motoru bu profili açık AB çağrıları ve konsorsiyum eşleştirmelerinde kullanır.'
              : 'Define your organization capabilities, patents, and focus areas. The AI engine uses this profile to match open EU calls and consortium seats.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={getWorkspaceRoute('settingsBilling', locale, workspace)}
            className="text-xs font-semibold text-ink-2 bg-surface hover:bg-surface-hover border border-border px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {isTr ? 'Faturalama' : 'Billing'}
          </Link>
          <Link
            href={getWorkspaceRoute('settingsApiKeys', locale, workspace)}
            className="text-xs font-semibold text-accent-ink bg-accent/10 hover:bg-accent/20 border border-accent/30 px-3 py-2 rounded-lg transition shadow-2xs"
          >
            {isTr ? 'API Anahtarları' : 'API Keys'}
          </Link>
        </div>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-ok/10 border border-ok/30 text-ok flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <CheckCircle className="w-4 h-4 text-ok shrink-0" />
          <span>
            {isTr
              ? 'Kurumsal profil başarıyla güncellendi ve YZ eşleştirme vektörleri yeniden hesaplandı!'
              : 'Organization profile successfully updated and AI matching embeddings recalculated!'}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-bad/10 border border-bad/30 text-bad flex items-center gap-3 text-xs font-semibold animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-bad shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-surface p-6 md:p-8 rounded-2xl border border-border shadow-xs">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Building className="w-3.5 h-3.5 text-accent" />
            <span>{isTr ? 'Teknik Yetenekler ve Ar-Ge Uzmanlığı' : 'Technical Capabilities & R&D Expertise'}</span>
          </label>
          <textarea
            required
            rows={5}
            value={capabilities}
            onChange={(e) => setCapabilities(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent leading-relaxed"
            placeholder={
              isTr
                ? 'Teknik altyapınızı, laboratuvar imkanlarınızı ve geçmiş AB proje deneyimlerinizi detaylandırın...'
                : 'Describe your technical infrastructure, laboratory facilities, and past EU project experience in detail...'
            }
          />
          <p className="text-[11px] text-muted mt-1">
            {isTr
              ? 'M1 CORDIS ve M8 Konsorsiyum Eşleştirici için anlamsal arama vektörüne dönüştürülür.'
              : 'Converted to semantic search vectors for M1 CORDIS and M8 Consortium Matcher.'}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink mb-1.5 flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-accent" />
            <span>{isTr ? 'Anahtar Kelimeler (Virgülle Ayrılmış)' : 'Keywords (Comma Separated)'}</span>
          </label>
          <input
            type="text"
            required
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full bg-ground border border-border p-3 rounded-xl text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="e.g. AI, Machine Learning, Robotics, Green Energy"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-ground border border-border rounded-xl">
            <label className="block text-xs font-bold text-ink mb-1">
              {isTr ? 'Minimum TRL (Teknoloji Hazırlık Seviyesi)' : 'Minimum TRL (Technology Readiness Level)'}
            </label>
            <input
              type="number"
              min="1"
              max="9"
              value={trlMin}
              onChange={(e) => setTrlMin(Number(e.target.value))}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {isTr ? '1: Temel İlkeler — 9: Kanıtlanmış Sistem' : '1: Basic Principles — 9: Proven System'}
            </p>
          </div>

          <div className="p-4 bg-ground border border-border rounded-xl">
            <label className="block text-xs font-bold text-ink mb-1">
              {isTr ? 'Maksimum TRL (Teknoloji Hazırlık Seviyesi)' : 'Maximum TRL (Technology Readiness Level)'}
            </label>
            <input
              type="number"
              min="1"
              max="9"
              value={trlMax}
              onChange={(e) => setTrlMax(Number(e.target.value))}
              className="w-full bg-surface border border-border p-2.5 rounded-lg text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent font-mono font-bold"
            />
            <p className="text-[10px] text-muted mt-1">
              {isTr ? 'Çağrı filtrelerinde hedeflenen tavan seviye' : 'Target ceiling level for call filters'}
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent text-white font-semibold text-xs py-2.5 px-6 rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              {saving
                ? isTr
                  ? 'YZ Vektörleri Hesaplanıyor...'
                  : 'Generating AI Embeddings...'
                : isTr
                ? 'Profili Kaydet'
                : 'Save Profile'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
