'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calendar, Trash2, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { disconnectCalendar } from '@/modules/m9/server/calendar-actions';

const PROVIDERS = {
  google: { label: 'Google Calendar', color: 'blue' },
  outlook: { label: 'Microsoft Outlook Calendar', color: 'cyan' },
  ics: { label: '.ics File Import', color: 'green' },
} as const;

interface CalendarConnection {
  id: string;
  provider: string;
  isConnected: boolean;
  lastSyncAt: Date | null;
}

interface CalendarClientProps {
  connections: CalendarConnection[];
  locale: string;
  workspace: string;
}

export function CalendarClient({ connections, locale }: CalendarClientProps) {
  const t = useTranslations('settings.calendar');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const handleDisconnect = async (connectionId: string) => {
    if (!confirm(t('confirmDisconnect'))) return;
    setIsDisconnecting(true);
    try {
      await disconnectCalendar(connectionId);
      window.location.reload();
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnect = async (provider: string) => {
    setIsConnecting(true);
    setSelectedProvider(provider);
    try {
      // TODO: Redirect to OAuth flow for the selected provider
      // For now, we show a placeholder message
      console.log(`Connecting to ${provider}...`);
      // In production: window.location.href = `/api/calendar/oauth/${provider}?redirect=${workspace}`;
    } catch (error) {
      console.error(`Failed to connect ${provider}:`, error);
    } finally {
      setIsConnecting(false);
      setSelectedProvider(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink">
          {t('title')}
        </h1>
        <p className="text-xs md:text-sm text-muted mt-1 max-w-2xl">
          {t('description')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {Object.entries(PROVIDERS).map(([provider, { label, color }]) => {
          const connection = connections.find((c) => c.provider === provider);
          const isConnected = connection?.isConnected;

          return (
            <div
              key={provider}
              className="bg-surface border border-border rounded-2xl p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl bg-${color}-50 border border-${color}-200 flex items-center justify-center`}>
                  <Calendar className={`w-5 h-5 text-${color}-600`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-ink text-sm">{label}</h3>
                    {isConnected && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-ok bg-ok/10 px-2 py-1 rounded-full">
                        <CheckCircle className="w-3 h-3" />
                        {t('connected')}
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">
                    {isConnected && connection?.lastSyncAt
                      ? t('lastSync', {
                          date: new Date(connection.lastSyncAt).toLocaleDateString(
                            locale === 'tr' ? 'tr-TR' : 'en-US'
                          ),
                        })
                      : t('notConnected')}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                {isConnected ? (
                  <button
                    onClick={() => handleDisconnect(connection!.id)}
                    disabled={isDisconnecting}
                    className="text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('disconnect')}
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(provider)}
                    disabled={isConnecting && selectedProvider === provider}
                    className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-2 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('connect')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-800">
          <p className="font-semibold mb-1">{t('infoTitle')}</p>
          <p className="text-blue-700">{t('infoText')}</p>
        </div>
      </div>
    </div>
  );
}
