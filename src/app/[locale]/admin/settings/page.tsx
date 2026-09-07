import React from 'react';
import { Sliders, Database, Key } from 'lucide-react';
import { SmtpSettingsForm } from './smtp-form';

export default async function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-4 sm:p-6 rounded-2xl border border-border shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">Sistem & Küresel Konfigürasyon</h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">Platform geneli SMTP e-posta sunucusu, AI model sağlayıcıları ve veritabanı RLS politikaları.</p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs shrink-0 self-start sm:self-auto">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Config Active</span>
        </div>
      </div>

      {/* SMTP E-posta Sunucu Ayarları */}
      <SmtpSettingsForm />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4">
          <h3 className="font-bold text-ink flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Veritabanı & RLS Güvenliği</span>
          </h3>
          <div className="space-y-2 text-xs text-ink-2">
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>RLS Policy Kapsam:</span>
              <strong className="text-emerald-400 font-mono">30 / 30 Tablo (%100)</strong>
            </div>
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>Driver Adapter:</span>
              <strong className="text-ink font-mono">@prisma/adapter-pg (Prisma 7)</strong>
            </div>
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>Vector Extension:</span>
              <strong className="text-ink font-mono">pgvector 1536d</strong>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4">
          <h3 className="font-bold text-ink flex items-center gap-2">
            <Key className="w-4 h-4 text-purple-400" />
            <span>YZ (AI) Model Yapılandırması</span>
          </h3>
          <div className="space-y-2 text-xs text-ink-2">
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>Varsayılan LLM Model:</span>
              <strong className="text-purple-400 font-mono">Claude 3.5 Sonnet / GPT-4o</strong>
            </div>
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>Aylık Varsayılan Kredi:</span>
              <strong className="text-ink font-mono">500 Kredi (Team Plan)</strong>
            </div>
            <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
              <span>Inngest Cron Suite:</span>
              <strong className="text-ink font-mono">7 Aktif Görev</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

