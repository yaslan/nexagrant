import React from 'react';
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
  const [result, prefs] = await Promise.all([listNotifications(), getNotificationPreferences()]);

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
      {prefs.ok ? <NotificationPreferences preferences={prefs.preferences} /> : null}
    </div>
  );
}
