'use client';

import React, { useEffect, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, CheckCircle2, AlertTriangle, Sparkles, Clock, ArrowLeft, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { markNotificationsRead } from '@/actions/user/notifications';
import type { NotificationItem } from '@/lib/notifications/store';
import { formatNotificationTime, renderNotification } from '@/lib/notifications/render';

interface NotificationsClientProps {
  notifications: NotificationItem[];
  unreadCount: number;
  locale: string;
  workspace: string;
}

export default function NotificationsClient({
  notifications,
  unreadCount,
  locale,
  workspace,
}: NotificationsClientProps) {
  const t = useTranslations();
  const tNotif = useTranslations('Notifications');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // The list comes from the server page; after a write, or when the tab regains
  // focus (another tab may have marked items read), the page is re-rendered.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);

  // Plain text only: `searchName` is user input (see renderNotification).
  const renderedNotifications = useMemo(
    () =>
      notifications.map((n) => ({
        id: n.id,
        ...renderNotification(n.type, n.payload, tNotif),
        time: formatNotificationTime(n.createdAt, locale),
        unread: n.readAt === null,
      })),
    [notifications, tNotif, locale]
  );

  const markRead = (target: string[] | 'all') => {
    startTransition(async () => {
      const response = await markNotificationsRead(target);
      if (response.ok) router.refresh();
      else console.error('[notifications] mark read failed:', response.error);
    });
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
              <span>{t('Notifications.title')}</span>
            </h1>
            <p className="text-xs text-muted mt-0.5">
              {t('Notifications.description')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {unreadCount > 0 ? (
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold bg-bad/10 text-bad border border-bad/20 px-3 py-1 rounded-full">
                {t('Notifications.unreadBadge', { count: unreadCount })}
              </span>
              <button
                onClick={() => markRead('all')}
                disabled={isPending}
                className="bg-surface hover:bg-surface-hover border border-border text-ink font-bold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition flex items-center space-x-1.5"
              >
                <CheckCheck className="w-4 h-4 text-ok" />
                <span>{t('Notifications.markAllRead')}</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold bg-good/10 text-good border border-good/20 px-3 py-1 rounded-full flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t('Notifications.allRead')}</span>
            </span>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-surface border border-border rounded-xl shadow-xs divide-y divide-border overflow-hidden">
        {renderedNotifications.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <Bell className="w-6 h-6 text-muted mx-auto" />
            <p className="font-semibold text-sm text-ink">
              {t('Notifications.noNotifications')}
            </p>
            <p className="text-xs text-muted">
              {t('Notifications.noNotificationsDesc')}
            </p>
          </div>
        )}

        {renderedNotifications.map((n) => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => markRead([n.id])}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                markRead([n.id]);
              }
            }}
            className={`p-4 flex items-start justify-between space-x-4 transition-colors cursor-pointer hover:bg-surface-hover ${
              n.unread ? 'bg-accent/5' : ''
            }`}
          >
            <div className="flex items-start space-x-3.5 min-w-0">
              <div className="mt-0.5">
                {n.icon === 'match' && (
                  <div className="w-8 h-8 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}
                {n.icon === 'warning' && (
                  <div className="w-8 h-8 rounded-full bg-bad/15 text-bad flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                )}
                {n.icon === 'credit' && (
                  <div className="w-8 h-8 rounded-full bg-good/15 text-good flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                )}
                {n.icon === 'info' && (
                  <div className="w-8 h-8 rounded-full bg-ink/10 text-ink-2 flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                )}
              </div>

              <div className="space-y-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-sm text-ink">{n.title}</h3>
                  {n.unread && (
                    <span className="w-2 h-2 rounded-full bg-accent" />
                  )}
                </div>
                <p className="text-xs text-ink-2 leading-relaxed break-words">{n.description}</p>
                <div className="flex items-center space-x-1 text-[11px] text-muted pt-1">
                  <Clock className="w-3 h-3" />
                  <span>{n.time}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
