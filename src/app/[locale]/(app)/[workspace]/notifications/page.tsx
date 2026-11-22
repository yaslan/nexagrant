import React from 'react';
import { getTranslations } from 'next-intl/server';
import { getNotificationPreferences, listNotifications } from '@/actions/user/notifications';
import type { NotificationItem } from '@/lib/notifications/store';
import NotificationsClient from './client';
import NotificationPreferences from './preferences-client';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const result = await listNotifications();
  const prefs = await getNotificationPreferences();
  // NG-330 (B-2): a failed read of the preferences shows a warning, not a silent gap.
  const tPrefs = await getTranslations('Notifications.preferences');

  const notifications: NotificationItem[] = result.ok ? result.notifications : [];
  const unreadCount: number = result.ok ? result.unreadCount : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <NotificationsClient
        notifications={notifications}
        unreadCount={unreadCount}
        locale={locale}
        workspace={workspace}
      />
      {prefs.ok ? (
        <NotificationPreferences preferences={prefs.preferences} />
      ) : (
        <div
          data-testid="notification-preferences-load-failed"
          role="alert"
          className="max-w-4xl mx-auto p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-sm"
        >
          {tPrefs('loadFailed')}
        </div>
      )}
    </div>
  );
}
