'use client';

import React, { useState, useRef, useEffect, useMemo, useId, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { signOut as clientSignOut } from 'next-auth/react';
import { useOptionalSession } from '@/lib/hooks/use-optional-session';
import { listNotifications, markNotificationsRead } from '@/actions/user/notifications';
import type { NotificationItem } from '@/lib/notifications/store';
import { renderNotification } from '@/lib/notifications/render';
import {
  User,
  Settings,
  CreditCard,
  Globe,
  Key,
  Users,
  ShieldCheck,
  HelpCircle,
  LogOut,
  ChevronDown,
  Building2,
  Check,
  Bell,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from './ThemeProvider';
import { getWorkspaceRoute, getPublicRoute } from '@/lib/routes';
import { displayUserName, displayRoleName } from '@/lib/user-display';
import { isNextRedirectError } from '@/lib/errors';
import { switchLocalePath } from '@/lib/routes';

export interface UserMenuWorkspace {
  slug: string;
  name: string;
}

interface UserMenuProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
  creditsBalance?: number;
  workspaces?: UserMenuWorkspace[];
  canManageModules?: boolean;
  canManageUsers?: boolean;
}

export default function UserMenu({
  locale = 'tr',
  userName: propUserName,
  userEmail: propUserEmail,
  userImage: propUserImage,
  roleName: propRoleName,
  creditsBalance = 500,
  workspaces = [],
  canManageModules = false,
  canManageUsers = false,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const notifPanelId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();

  const sessionData = useOptionalSession();

  const tCommon = useTranslations('Common');
  const tIdentity = useTranslations('UserIdentity');
  const tNav = useTranslations('Navigation');
  const tPrivacy = useTranslations('settings.privacy');
  const t = useTranslations();

  const effectiveUserEmail = propUserEmail || sessionData?.user?.email;
  const effectiveUserName = displayUserName(
    propUserName || sessionData?.user?.name,
    effectiveUserEmail,
    tCommon('unnamedUser')
  );
  const effectiveUserImage = propUserImage || sessionData?.user?.image;
  const effectiveRole = propRoleName;
  const effectiveRoleName = displayRoleName(effectiveRole, tCommon('unassigned') || 'Unassigned');

  const routeWorkspace = workspaces[0]?.slug;

  // Load notifications when dropdown opens
  useEffect(() => {
    if (isNotifOpen && effectiveUserEmail) {
      setIsLoadingNotifications(true);
      listNotifications().then((result) => {
        if (result.ok) {
          setNotifications(result.notifications);
          setUnreadCount(result.unreadCount);
        }
        setIsLoadingNotifications(false);
      }).catch(() => {
        setIsLoadingNotifications(false);
      });
    }
  }, [isNotifOpen, effectiveUserEmail]);

  // Clean up old localStorage keys on mount (one-time)
  useEffect(() => {
    if (typeof window !== 'undefined' && effectiveUserEmail) {
      try {
        localStorage.removeItem('fonbridge_read_notifs_guest');
        localStorage.removeItem(`fonbridge_read_notifs_${effectiveUserEmail}`);
      } catch {
        // Storage might be disabled
      }
    }
  }, [effectiveUserEmail]);

  const renderedNotifications = useMemo(() => {
    return notifications.map((n) => {
      const rendered = renderNotification(n.type, n.payload, (key: string) => t(key));
      if (!rendered) return null;

      return {
        id: n.id,
        title: rendered.title,
        description: rendered.description,
        time: new Date(n.createdAt),
        unread: !n.readAt,
      };
    }).filter((n): n is NonNullable<typeof n> => n !== null);
  }, [notifications, t]);

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    const isTr = locale === 'tr';
    if (minutes < 1) return isTr ? 'Şimdi' : 'now';
    if (minutes < 60) return `${minutes}${isTr ? 'd' : 'm'}`;
    if (hours < 24) return `${hours}${isTr ? 's' : 'h'}`;
    if (days < 7) return `${days}${isTr ? 'g' : 'd'}`;

    return date.toLocaleDateString(isTr ? 'tr-TR' : 'en-US');
  };

  const handleMarkAllRead = async () => {
    startTransition(async () => {
      const response = await markNotificationsRead('all');
      if (response.ok) {
        // Refetch
        const result = await listNotifications();
        if (result.ok) {
          setNotifications(result.notifications);
          setUnreadCount(result.unreadCount);
        }
      }
    });
  };

  const handleMarkSingleRead = async (id: string) => {
    startTransition(async () => {
      const response = await markNotificationsRead([id]);
      if (response.ok) {
        // Refetch
        const result = await listNotifications();
        if (result.ok) {
          setNotifications(result.notifications);
          setUnreadCount(result.unreadCount);
        }
      }
    });
  };

  const handleLogout = async (targetPath: string = '/') => {
    try {
      const publicPath = getPublicRoute('login', locale);
      const loginPath = new URL(publicPath, process.env.NEXTAUTH_URL || 'http://localhost:3000').pathname;

      const targetUrl =
        targetPath === '/'
          ? loginPath
          : loginPath + `?redirect=${encodeURIComponent(targetPath)}`;

      try {
        await clientSignOut({ callbackUrl: targetUrl, redirect: true });
      } catch (_clientErr) {
        router.push(targetUrl);
      }
    } catch (logoutErr) {
      if (isNextRedirectError(logoutErr)) throw logoutErr;
      console.error('[user-menu] logout error', logoutErr);
    }
  };

  const isTr = locale === 'tr';

  if (!effectiveUserEmail) {
    return (
      <Link
        href={getPublicRoute('login', locale)}
        className="text-xs font-bold bg-accent hover:opacity-90 text-white px-4 py-2 rounded-xl shadow-xs transition-all transform hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer"
        style={{ backgroundColor: '#003D5C' }}
        aria-label={isTr ? 'Giriş / Kayıt Ol' : 'Sign In / Register'}
      >
        <span>{isTr ? 'Giriş / Kayıt Ol' : 'Sign In / Register'}</span>
        <span>→</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {/* Notifications Dropdown */}
      <div className="sm:relative" ref={notifRef}>
        <button
          ref={notifButtonRef}
          type="button"
          onClick={() => {
            setIsNotifOpen(!isNotifOpen);
            setIsOpen(false);
          }}
          className="relative p-2 text-ink-2 hover:text-ink hover:bg-surface-hover rounded-full transition-all focus:outline-none"
          title={isTr ? 'Bildirimler' : 'Notifications'}
          aria-label={isTr ? 'Bildirimler' : 'Notifications'}
          aria-haspopup="dialog"
          aria-expanded={isNotifOpen}
          aria-controls={isNotifOpen ? notifPanelId : undefined}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-bad rounded-full ring-2 ring-surface animate-pulse" />
          )}
        </button>

        {isNotifOpen && (
          <div
            id={notifPanelId}
            role="dialog"
            aria-label={isTr ? 'Bildirimler' : 'Notifications'}
            className="absolute inset-x-4 top-full sm:inset-x-auto sm:top-auto sm:right-0 mt-2 sm:w-80 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
              <h3 className="font-bold text-sm text-ink">{isTr ? 'Bildirimler' : 'Notifications'}</h3>
              {unreadCount > 0 ? (
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-semibold bg-bad/10 text-bad px-2 py-0.5 rounded-full">
                    {unreadCount} {isTr ? 'Okunmamış' : 'Unread'}
                  </span>
                  <button
                    onClick={handleMarkAllRead}
                    disabled={isPending}
                    className="text-[10px] text-accent hover:underline font-semibold disabled:opacity-50"
                    title={isTr ? 'Tümünü okundu işaretle' : 'Mark all as read'}
                  >
                    {isTr ? 'Tümünü Okundu İşaretle' : 'Mark All Read'}
                  </button>
                </div>
              ) : (
                <span className="text-[11px] font-semibold bg-ok/10 text-ok px-2 py-0.5 rounded-full">
                  {isTr ? 'Tümü Okundu' : 'All Read'}
                </span>
              )}
            </div>

            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {isLoadingNotifications && (
                <p className="p-4 text-xs text-muted text-center">
                  {isTr ? 'Yükleniyor...' : 'Loading...'}
                </p>
              )}

              {!isLoadingNotifications && renderedNotifications.length === 0 && (
                <p className="p-4 text-xs text-muted text-center">
                  {isTr ? 'Henüz bildiriminiz yok.' : 'You have no notifications yet.'}
                </p>
              )}

              {renderedNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkSingleRead(n.id)}
                  className={`p-3 text-xs hover:bg-surface-hover transition-colors cursor-pointer ${n.unread ? 'bg-accent/5' : ''}`}
                >
                  <div className="font-semibold text-ink flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      {n.title}
                      {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />}
                    </span>
                    <span className="text-[10px] text-muted font-normal">{formatTime(n.time)}</span>
                  </div>
                  <p className="text-ink-2 mt-0.5">{n.description}</p>
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-border text-center">
              <Link href={getWorkspaceRoute('notifications', locale, routeWorkspace ?? undefined)} className="text-xs font-semibold text-accent hover:underline">
                {isTr ? 'Tüm bildirimleri gör' : 'View all notifications'}
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Main User Avatar & Menu Dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            setIsNotifOpen(false);
          }}
          className="flex items-center space-x-2 p-1.5 rounded-full hover:bg-surface-hover transition-all border border-border shadow-2xs focus:outline-none"
        >
          <div className="relative">
            {effectiveUserImage ? (
              <Image
                src={effectiveUserImage}
                alt={effectiveUserName}
                width={32}
                height={32}
                className="rounded-full object-cover ring-2 ring-accent/30"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-ink text-white font-bold text-xs flex items-center justify-center shadow-inner">
                {getInitials(effectiveUserName)}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-ok border-2 border-surface rounded-full" />
          </div>

          <span className="hidden md:block font-semibold text-xs text-ink max-w-[120px] truncate">
            {effectiveUserName}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* User Profile Header */}
            <div className="px-4 py-3 border-b border-border bg-ground/50 rounded-t-xl">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent to-accent-ink text-white font-bold text-sm flex items-center justify-center shadow">
                  {getInitials(effectiveUserName)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-sm text-ink truncate">{effectiveUserName}</h4>
                  <p className="text-xs text-muted truncate">{effectiveUserEmail}</p>
                  <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded font-mono ${effectiveRole?.trim() ? 'bg-accent/15 text-accent-ink border border-accent/20' : 'bg-surface-hover text-muted border border-border'}`}>
                    {effectiveRoleName}
                  </span>
                </div>
              </div>
            </div>

            {/* Account & Profile Items */}
            <div className="py-1 text-xs">
              <Link
                href={getWorkspaceRoute('settingsProfile', locale, routeWorkspace ?? undefined)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <User className="w-4 h-4 text-muted" />
                <span>{isTr ? 'Profil & Hesap Ayarları' : 'Profile & Account Settings'}</span>
              </Link>

              <Link
                href={getWorkspaceRoute('settingsBilling', locale, routeWorkspace ?? undefined)}
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center space-x-2.5">
                  <CreditCard className="w-4 h-4 text-muted" />
                  <span>{isTr ? 'Abonelik & Krediler' : 'Subscription & Credits'}</span>
                </div>
                <span className="text-[10px] font-bold bg-accent/15 text-accent-ink px-1.5 py-0.5 rounded font-mono">
                  {creditsBalance} {isTr ? 'Kredi' : 'Credits'}
                </span>
              </Link>

              {canManageUsers && (
                <Link
                  href={getWorkspaceRoute('settingsMembers', locale, routeWorkspace ?? undefined)}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
                >
                  <Users className="w-4 h-4 text-muted" />
                  <span>{isTr ? 'Üyeler & Roller' : 'Members & Roles'}</span>
                </Link>
              )}

              <button
                onClick={() => {
                  setIsOpen(false);
                  const newLocale = isTr ? 'en' : 'tr';
                  router.push(switchLocalePath(pathname, newLocale));
                }}
                className="w-full flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <Globe className="w-4 h-4 text-muted" />
                <span>{isTr ? 'English' : 'Türkçe'}</span>
              </button>

              <button
                onClick={() => {
                  const themes: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
                  const currentIndex = themes.indexOf((theme || 'system') as any);
                  const nextTheme = themes[(currentIndex + 1) % themes.length] as 'light' | 'dark' | 'system';
                  setTheme(nextTheme);
                }}
                className="w-full flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                {theme === 'light' && <Sun className="w-4 h-4 text-muted" />}
                {theme === 'dark' && <Moon className="w-4 h-4 text-muted" />}
                {theme === 'system' && <Monitor className="w-4 h-4 text-muted" />}
                <span>
                  {theme === 'light' ? (isTr ? 'Açık' : 'Light') : ''}
                  {theme === 'dark' ? (isTr ? 'Koyu' : 'Dark') : ''}
                  {theme === 'system' ? (isTr ? 'Sistem' : 'System') : ''}
                </span>
              </button>
            </div>

            {/* Support & Documentation */}
            <div className="py-1 border-t border-border text-xs">
              <a
                href="https://docs.fonbridge.org"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-muted" />
                <span>{isTr ? 'Yardım ve Dokümantasyon' : 'Help & Docs'}</span>
              </a>

              <Link
                href={getPublicRoute('privacy', locale)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <Key className="w-4 h-4 text-muted" />
                <span>{tPrivacy('title')}</span>
              </Link>
            </div>

            {/* Logout */}
            <div className="py-1 border-t border-border text-xs">
              <button
                onClick={() => handleLogout()}
                className="w-full flex items-center space-x-2.5 px-4 py-2 text-bad hover:bg-bad/5 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>{isTr ? 'Oturumu Kapat' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
    .slice(0, 2);
}
