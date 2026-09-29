import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Database, Key } from 'lucide-react';
import { SmtpSettingsForm } from './smtp-form';
import { DEFAULT_MODELS } from '@/lib/llm';
import { PLAN_GRANTS } from '@/lib/billing/catalog';
import { smtpConfigFromEnv } from '@/lib/email/mailer';

/**
 * What the SMTP card may show. The password never leaves the server: only
 * whether one is set.
 */
function smtpSummary() {
  const config = smtpConfigFromEnv();
  if (!config) return null;
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth?.user ?? null,
    from: config.from,
  };
}

export default async function AdminSettingsPage({
  params,
}: {
  params: Promise<{ locale?: string }>;
}) {
  const { locale = 'tr' } = await params;
  const t = await getTranslations({ locale, namespace: 'adminSettings' });
  const defaultPlan = PLAN_GRANTS.find((p) => p.planId === 'free');

  return (
    <div className="space-y-6">
      <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-border shadow-2xs">
        <h1 className="text-xl sm:text-2xl font-bold text-ink">Sistem & Küresel Konfigürasyon</h1>
        <p className="text-xs sm:text-sm text-muted mt-0.5">Platform geneli SMTP e-posta sunucusu, AI model sağlayıcıları ve veritabanı RLS politikaları.</p>
      </div>

      {/* SMTP E-posta Sunucu Ayarları */}
      <SmtpSettingsForm smtp={smtpSummary()} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xs space-y-4">
          <h3 className="font-bold text-ink flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <span>Veritabanı & RLS Güvenliği</span>
          </h3>
          <div className="space-y-2 text-xs text-ink-2">
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
              <span>{t('defaultLlmModelLabel')}</span>
              <strong className="text-purple-400 font-mono">{DEFAULT_MODELS.anthropic} / {DEFAULT_MODELS.openai}</strong>
            </div>
            {defaultPlan && (
              <div className="flex justify-between p-2 bg-ground rounded-xl border border-border">
                <span>{t('defaultPlanCreditsLabel')}</span>
                <strong className="text-ink font-mono">{defaultPlan.aiCreditsMonthly} {t('creditsUnit')} ({defaultPlan.name})</strong>
              </div>
            )}
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

