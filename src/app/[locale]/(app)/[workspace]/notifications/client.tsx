'use client';

import React, { useMemo } from 'react';
import { Bell, CheckCircle2, AlertTriangle, Sparkles, Clock, ArrowLeft, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useOptionalSession } from '@/lib/hooks/use-optional-session';
import {
  applyReadState,
  markNotificationsRead,
  notificationStorageKey,
  useReadNotificationIds,
} from '@/lib/hooks/use-read-notifications';

interface NotificationItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: string;
  unread: boolean;
  link?: string;
}

interface NotificationsClientProps {
  initialNotifications: NotificationItem[];
  locale: string;
  workspace: string;
}

export default function NotificationsClient({
  initialNotifications,
  locale,
  workspace,
}: NotificationsClientProps) {
  const session = useOptionalSession();
  const storageKey = notificationStorageKey(session?.user?.email);
  const isTr = locale === 'tr';

  // The read overlay is a browser-only store, so it is subscribed to and derived during render
  // rather than copied into state by an effect. See `use-read-notifications`.
  const readIds = useReadNotificationIds(storageKey);
  const notifications: NotificationItem[] = useMemo(
    () => applyReadState(initialNotifications, readIds),
    [initialNotifications, readIds]
  );

  const unreadCount = notifications.filter((n) => n.unread).length;

  const handleMarkAllRead = () => {
    markNotificationsRead(
      storageKey,
      initialNotifications.map((n) => n.id)
    );
  };

  const handleMarkSingleRead = (id: string) => {
    markNotificationsRead(storageKey, [id]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border gap-4">
        <div className="flex items-center space-x-3">
          <Link
            href={`/${locale}/${workspace}/dashboard`}
            className="p-2 text-ink-2 hover:text-ink hover:bg-surface-hover rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-ink flex items-center space-x-2">
              <Bell className="w-5 h-5 text-accent" />
              <span>{isTr ? 'Bildirimler' : 'Notifications'}</span>
            </h1>
            <p className="text-xs text-muted mt-0.5">
              {isTr
                ? 'Çalışma alanınızla ilgili tüm sistem uyarıları, eşleşmeler ve güncellemeler.'
                : 'System alerts, match findings, and workspace updates.'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {unreadCount > 0 ? (
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold bg-bad/10 text-bad border border-bad/20 px-3 py-1 rounded-full">
                {unreadCount} {isTr ? 'Okunmamış Bildirim' : 'Unread Notifications'}
              </span>
              <button
                onClick={handleMarkAllRead}
                className="bg-surface hover:bg-surface-hover border border-border text-ink font-bold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition flex items-center space-x-1.5"
              >
                <CheckCheck className="w-4 h-4 text-ok" />
                <span>{isTr ? 'Tümünü Okundu İşaretle' : 'Mark All as Read'}</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold bg-good/10 text-good border border-good/20 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isTr ? 'Tüm Bildirimler Okundu' : 'All Notifications Read'}</span>
            </span>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-surface border border-border rounded-xl shadow-xs divide-y divide-border overflow-hidden">
        {/* No notification store exists yet (see page.tsx). An empty feed is the
            honest state; it used to be filled with four invented items. */}
        {notifications.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <Bell className="w-6 h-6 text-muted mx-auto" />
            <p className="font-semibold text-sm text-ink">
              {isTr ? 'Henüz bildiriminiz yok.' : 'You have no notifications yet.'}
            </p>
            <p className="text-xs text-muted">
              {isTr
                ? 'Eşleşmeler, kanıt belgesi uyarıları ve kredi hareketleri burada görünecek.'
                : 'Match findings, evidence alerts and credit activity will appear here.'}
            </p>
          </div>
        )}

        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => handleMarkSingleRead(n.id)}
            className={`p-4 flex items-start justify-between space-x-4 transition-colors cursor-pointer hover:bg-surface-hover ${
              n.unread ? 'bg-accent/5' : ''
            }`}
          >
            <div className="flex items-start space-x-3.5">
              <div className="mt-0.5">
                {n.type === 'match' && (
                  <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
                {n.type === 'warning' && (
                  <div className="w-8 h-8 rounded-full bg-bad/15 text-bad flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                )}
                {n.type === 'credit' && (
                  <div className="w-8 h-8 rounded-full bg-good/15 text-good flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                {n.type === 'info' && (
                  <div className="w-8 h-8 rounded-full bg-ink/10 text-ink-2 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-sm text-ink">{n.title}</h3>
                  {n.unread && (
                    <span className="w-2 h-2 rounded-full bg-accent" />
                  )}
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">{n.desc}</p>
                <div className="flex items-center space-x-1 text-[11px] text-muted pt-1">
                  <Clock className="w-3 h-3" />
                  <span>{n.time}</span>
                </div>
              </div>
            </div>

            {n.link && (
              <Link
                href={n.link}
                className="text-xs font-semibold text-accent hover:underline shrink-0 self-center"
              >
                {isTr ? 'Görüntüle' : 'View'}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
