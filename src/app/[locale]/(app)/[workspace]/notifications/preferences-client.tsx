'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { setNotificationPreference } from '@/actions/user/notifications';
import type { PreferenceView } from '@/lib/notifications/preferences';
import type { NotificationChannel, NotificationEvent, NotificationFrequency } from '@prisma/client';

interface NotificationPreferencesProps {
  preferences: PreferenceView[];
}

const PANEL_FREQUENCIES = ['INSTANT', 'OFF'] as const satisfies readonly NotificationFrequency[];
const EMAIL_FREQUENCIES = ['INSTANT', 'WEEKLY', 'OFF'] as const satisfies readonly NotificationFrequency[];

/**
 * Per-event channel and frequency choice (spec §13, NG-8). A change is saved at
 * once through `setNotificationPreference`, which takes the user from the
 * session; this component never sends a user id.
 */
export default function NotificationPreferences({ preferences }: NotificationPreferencesProps) {
  const t = useTranslations('Notifications.preferences');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const change = (event: NotificationEvent, channel: NotificationChannel, frequency: NotificationFrequency) => {
    setStatus(null);
    startTransition(async () => {
      const response = await setNotificationPreference({ event, channel, frequency });
      if (response.ok) {
        setStatus({ kind: 'ok', text: t('saved') });
        router.refresh();
      } else {
        console.error('[notifications] preference save failed:', response.error);
        setStatus({ kind: 'error', text: t('saveFailed') });
      }
    });
  };

  const frequencyLabel = (f: NotificationFrequency) =>
    f === 'INSTANT' ? t('freqInstant') : f === 'WEEKLY' ? t('freqWeekly') : t('freqOff');

  return (
    <section aria-labelledby="notification-preferences-title" className="max-w-4xl mx-auto space-y-4">
      <div>
        <h2 id="notification-preferences-title" className="text-lg font-bold text-ink">
          {t('title')}
        </h2>
        <p className="text-xs text-muted mt-0.5">{t('description')}</p>
      </div>

      <div className="bg-surface border border-border rounded-xl shadow-xs overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="p-3 font-semibold">{t('eventColumn')}</th>
              <th scope="col" className="p-3 font-semibold">{t('channelPanel')}</th>
              <th scope="col" className="p-3 font-semibold">{t('channelEmail')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preferences.map(({ event, delivery }) => (
              <tr key={event}>
                <th scope="row" className="p-3 text-left font-medium text-ink">
                  {t(`events.${event}`)}
                </th>
                <td className="p-3">
                  <select
                    aria-label={`${t(`events.${event}`)} — ${t('channelPanel')}`}
                    value={delivery.PANEL}
                    disabled={isPending}
                    onChange={(e) => change(event, 'PANEL', e.target.value as NotificationFrequency)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink min-h-10"
                  >
                    {PANEL_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{frequencyLabel(f)}</option>
                    ))}
                  </select>
                </td>
                <td className="p-3">
                  <select
                    aria-label={`${t(`events.${event}`)} — ${t('channelEmail')}`}
                    value={delivery.EMAIL}
                    disabled={isPending}
                    onChange={(e) => change(event, 'EMAIL', e.target.value as NotificationFrequency)}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink min-h-10"
                  >
                    {EMAIL_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{frequencyLabel(f)}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p role="status" aria-live="polite" className={status?.kind === 'error' ? 'text-xs text-bad' : 'text-xs text-good'}>
        {status?.text ?? ''}
      </p>
    </section>
  );
}
