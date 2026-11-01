import React from 'react';
import { listNotifications } from '@/actions/user/notifications';
import type { NotificationItem } from '@/lib/notifications/store';
import NotificationsClient from './client';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string; workspace: string }>;
}) {
  const { locale, workspace } = await params;
  const result = await listNotifications();

  const notifications: NotificationItem[] = result.ok ? result.notifications : [];
  const unreadCount: number = result.ok ? result.unreadCount : 0;

  return (
    <NotificationsClient
      notifications={notifications}
      unreadCount={unreadCount}
      locale={locale}
      workspace={workspace}
    />
  );
}
