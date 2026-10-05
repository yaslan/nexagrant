'use client';

import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { signOut as clientSignOut } from 'next-auth/react';
import { useOptionalSession } from '@/lib/hooks/use-optional-session';
import {
  applyReadState,
  markNotificationsRead,
  notificationStorageKey,
  useReadNotificationIds,
} from '@/lib/hooks/use-read-notifications';
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

/** One entry of the workspace switcher, as it exists in the database. */
export interface UserMenuWorkspace {
  /** Workspace slug, the `[workspace]` URL segment. */
  slug: string;
  /** Workspace name as the tenant stored it. */
  name: string;
}

interface UserMenuProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
  creditsBalance?: number;
  /**
   * The workspaces this session is actually a member of, resolved server-side.
   * Absent or empty means the session has none, and the switcher says so —
   * see the switcher block below for what used to stand here.
   */
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
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const notifPanelId = useId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const sessionData = useOptionalSession();

  const tIdentity = useTranslations('UserIdentity');
  const tNav = useTranslations('Navigation');
  // The KVKK/GDPR console has its own copy in both locales already; this entry
  // reuses it rather than adding another hardcoded pair of strings.
  const tPrivacy = useTranslations('settings.privacy');

  const effectiveUserEmail = propUserEmail || sessionData?.user?.email;
  // Never invent an identity: the name falls back to the e-mail local part and then to a
  // translated "unnamed user" label, never onto somebody else's name and title.
  const effectiveUserName = displayUserName(
    propUserName || sessionData?.user?.name,
    effectiveUserEmail,
    tIdentity('unnamedUser')
  );
  const effectiveUserImage = propUserImage || sessionData?.user?.image;
  // Display only. Assuming TENANT_OWNER here would show an owner badge to a session that
  // carries no role; authorization is decided server-side from `session.role`.
  const effectiveRole = propRoleName || sessionData?.role || null;
  const effectiveRoleName = displayRoleName(effectiveRole, tIdentity('noRole'));

  // Extract active workspace from pathname. No fallback slug: outside a workspace
  // route ("/tr/admin", "/tr/pricing") no workspace is active, and pretending
  // 'demo-sme' is would tick a workspace the session may not even belong to.
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  // Read once into a local: `segments.length > 1` does not narrow a later index
  // read, and the slug was being computed from the same expression twice.
  const secondSegment = segments[1];
  const activeWorkspace = (secondSegment !== undefined && !['admin', 'pricing', 'register'].includes(secondSegment))
    ? secondSegment
    : null;

  // Where the menu's workspace-scoped links (settings, notifications) point. On a
  // workspace route it is the one being viewed; elsewhere — /admin, /pricing, the
  // public navbar — the session's first real workspace. It used to be the literal
  // 'demo-sme', so every one of these links led into a workspace the session may
  // never have been granted. With neither, `getWorkspaceRoute` falls back to
  // 'default', the slug auth.ts gives every tenant's first workspace; the route
  // itself then enforces the scope (requireTenantPage sends a tenantless session
  // to /no-workspace) rather than this menu guessing an organisation.
  const routeWorkspace = activeWorkspace ?? workspaces[0]?.slug ?? null;

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape closes the bell panel and hands focus back to the bell, so a keyboard
  // user is not left on a node that has just been unmounted.
  useEffect(() => {
    if (!isNotifOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsNotifOpen(false);
      notifButtonRef.current?.focus();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isNotifOpen]);

  const switchLanguage = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = switchLocalePath(pathname, newLocale);
    const query = searchParams?.toString() ? `?${searchParams.toString()}` : '';
    router.push(newPath + query);
  };

  const getInitials = (name: string) => {
    const cleanWords = name
      .replace(/^(Dr\.|Prof\.|Doç\.|Yrd\.|MSc\.|PhD\.)\s*/gi, '')
      .trim()
      .split(' ')
      .filter(Boolean);
    // Both ends read once. `.length >= 2` does not narrow an index read, and
    // `.filter(Boolean)` above already dropped empty strings, so a word that is
    // present necessarily has a first character.
    const firstWord = cleanWords[0];
    const lastWord = cleanWords[cleanWords.length - 1];
    if (firstWord && lastWord) {
      return ((firstWord[0] ?? '') + (lastWord[0] ?? '')).toUpperCase();
    }
    return (firstWord?.[0] || 'U').toUpperCase();
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch (e) {
        console.warn('Storage clear warning:', e);
      }
    }

    const targetUrl = `/${locale}/${locale === 'tr' ? 'giris' : 'login'}`;

    try {
      await logoutAction(locale);
    } catch (error) {
      if (
        isNextRedirectError(error)
      ) {
        return;
      }

      try {
        await clientSignOut({ callbackUrl: targetUrl, redirect: true });
      } catch (_clientErr) {
        router.push(targetUrl);
      }
    }
  };

  const isTr = locale === 'tr';

  /**
   * TASK-MTQYXISOPUJ53 — fabricated fallbacks.
   *
   * This held three notifications written in code — a "%92" call match, an SME
   * declaration "expiring in 15 days", "500 AI credits added to your account" —
   * and it is mounted in the app shell, so every tenant saw them on every page,
   * with a pulsing unread dot on the bell. prisma/schema.prisma has no
   * notification model, so none of it was ever a fallback for a query: there is
   * nothing to query yet. Two of the three are claims a user would act on.
   *
   * Empty until a notification store exists. Still memoised: it feeds the
   * derivation below, and a fresh array literal per render used to produce an
   * unbounded render loop ("Maximum update depth exceeded") across every page
   * carrying the shell.
   */
  const baseNotifications = useMemo<
    Array<{ id: string; title: string; desc: string; time: string; unread: boolean }>
  >(() => [], []);

  const storageKey = notificationStorageKey(effectiveUserEmail);

  // Same store as the notifications page: subscribed to and derived during render, not copied
  // into state by an effect. See `use-read-notifications`.
  const readIds = useReadNotificationIds(storageKey);
  const notificationsList = useMemo(
    () => applyReadState(baseNotifications, readIds),
    [baseNotifications, readIds]
  );

  const unreadCount = notificationsList.filter((n) => n.unread).length;

  const markAllAsRead = () => {
    markNotificationsRead(
      storageKey,
      baseNotifications.map((n) => n.id)
    );
  };

  const markSingleAsRead = (id: string) => {
    markNotificationsRead(storageKey, [id]);
  };

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
      {/* Notifications Dropdown. Below `sm` the wrapper is not positioned, so the panel
          anchors to the sticky header (full width minus the 16px gutters) instead of to
          the bell, which sits too far right for a 320px panel at 390px (B1). */}
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
                    onClick={markAllAsRead}
                    className="text-[10px] text-accent hover:underline font-semibold"
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
              {notificationsList.length === 0 && (
                <p className="p-4 text-xs text-muted text-center">
                  {isTr ? 'Henüz bildiriminiz yok.' : 'You have no notifications yet.'}
                </p>
              )}

              {notificationsList.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markSingleAsRead(n.id)}
                  className={`p-3 text-xs hover:bg-surface-hover transition-colors cursor-pointer ${n.unread ? 'bg-accent/5' : ''}`}
                >
                  <div className="font-semibold text-ink flex justify-between items-center">
                    <span className="flex items-center gap-1.5">
                      {n.title}
                      {n.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />}
                    </span>
                    <span className="text-[10px] text-muted font-normal">{n.time}</span>
                  </div>
                  <p className="text-ink-2 mt-0.5">{n.desc}</p>
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
          {/* Avatar Image / Initials */}
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
            {/* Green Online Badge */}
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-ok border-2 border-surface rounded-full" />
          </div>

          <span className="hidden md:block font-semibold text-xs text-ink max-w-[120px] truncate">
            {effectiveUserName}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-muted" />
        </button>

        {/* Dropdown Menu Panel */}
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
                  <span>{tNav('members')}</span>
                </Link>
              )}

              {canManageModules && (
                <Link
                  href={getWorkspaceRoute('settingsModules', locale, routeWorkspace ?? undefined)}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
                >
                  <Settings className="w-4 h-4 text-muted" />
                  <span>{isTr ? 'Modül Ayarları' : 'Module Settings'}</span>
                </Link>
              )}

              <Link
                href={getWorkspaceRoute('settingsApiKeys', locale, routeWorkspace ?? undefined)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <Key className="w-4 h-4 text-muted" />
                <span>{isTr ? 'API Anahtarları & Entegrasyonlar' : 'API Keys & Integrations'}</span>
              </Link>

              {/*
                KVKK md.11 / GDPR art.12 — the data subject console has to be
                reachable from the product, not only by typing the URL. It had a
                page and an API but no link anywhere in the navigation.
              */}
              <Link
                href={getWorkspaceRoute('settingsPrivacy', locale, routeWorkspace ?? undefined)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-muted" />
                <span>{tPrivacy('title')}</span>
              </Link>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Theme Selector */}
            <div className="px-4 py-1.5">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <Sun className="w-3 h-3" />
                <span>{isTr ? 'Tema Görünümü' : 'Appearance'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-1">
                <button
                  onClick={() => setTheme('light')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-all ${
                    theme === 'light'
                      ? 'bg-accent/15 text-accent-ink border border-accent/30 font-semibold'
                      : 'hover:bg-surface-hover text-ink-2 border border-transparent'
                  }`}
                  title={isTr ? 'Açık Mod' : 'Light Mode'}
                >
                  <Sun className="w-3 h-3 text-amber-500" />
                  <span className="text-[11px]">{isTr ? 'Açık' : 'Light'}</span>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-all ${
                    theme === 'dark'
                      ? 'bg-accent/15 text-accent-ink border border-accent/30 font-semibold'
                      : 'hover:bg-surface-hover text-ink-2 border border-transparent'
                  }`}
                  title={isTr ? 'Koyu Mod' : 'Dark Mode'}
                >
                  <Moon className="w-3 h-3 text-amber-400" />
                  <span className="text-[11px]">{isTr ? 'Koyu' : 'Dark'}</span>
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition-all ${
                    theme === 'system'
                      ? 'bg-accent/15 text-accent-ink border border-accent/30 font-semibold'
                      : 'hover:bg-surface-hover text-ink-2 border border-transparent'
                  }`}
                  title={isTr ? 'Sistem Teması' : 'System Theme'}
                >
                  <Monitor className="w-3 h-3 text-accent" />
                  <span className="text-[11px]">{isTr ? 'Oto' : 'Auto'}</span>
                </button>
              </div>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Language Selector */}
            <div className="px-4 py-1.5">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Globe className="w-3 h-3" />
                <span>{isTr ? 'Dil Seçeneği' : 'Language'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                <button
                  onClick={() => switchLanguage('tr')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center justify-between transition-colors ${
                    locale === 'tr' ? 'bg-accent/15 text-accent-ink border border-accent/20' : 'hover:bg-surface-hover text-ink-2'
                  }`}
                >
                  <span>Türkçe 🇹🇷</span>
                  {locale === 'tr' && <Check className="w-3 h-3 text-accent" />}
                </button>
                <button
                  onClick={() => switchLanguage('en')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center justify-between transition-colors ${
                    locale === 'en' ? 'bg-accent/15 text-accent-ink border border-accent/20' : 'hover:bg-surface-hover text-ink-2'
                  }`}
                >
                  <span>English 🇬🇧</span>
                  {locale === 'en' && <Check className="w-3 h-3 text-accent" />}
                </button>
              </div>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Workspace Selection */}
            <div className="px-4 py-1.5">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1 flex items-center space-x-1">
                <Building2 className="w-3 h-3" />
                <span>{isTr ? 'Çalışma Alanı' : 'Workspace'}</span>
              </div>
              {/*
                TASK-MTRNQHC3IV2BE — the switcher lists the session's own workspaces.

                Two entries were written in here, "Demo SME Consultancy" (demo-sme)
                and "Horizon Research Lab" (horizon-lab). Every tenant saw both, in
                the app shell, on every page: two organisations that are not theirs,
                offered as somewhere to switch to. The links went to
                /{locale}/demo-sme/... — routes their membership does not cover — so
                the honest-looking half of the menu was an invitation into another
                tenant's URL space. Nothing queried anything; there was no fallback
                being exercised, just two literals.

                Now: whatever the layout resolved from Membership -> Tenant ->
                Workspace, and an explicit "you have no workspace" line when that
                comes back empty.
              */}
              <div className="space-y-1 mt-1">
                {workspaces.length === 0 ? (
                  <div className="px-2.5 py-1 text-xs text-muted">
                    {tIdentity('noWorkspace')}
                  </div>
                ) : (
                  workspaces.map((ws) => (
                    <Link
                      key={ws.slug}
                      href={getWorkspaceRoute('dashboard', locale, ws.slug)}
                      onClick={() => setIsOpen(false)}
                      className={`w-full text-left px-2.5 py-1 rounded text-xs font-medium flex items-center justify-between transition-colors ${
                        activeWorkspace === ws.slug ? 'bg-surface-hover font-bold text-ink' : 'hover:bg-surface-hover text-ink-2'
                      }`}
                    >
                      <span>{ws.name}</span>
                      {activeWorkspace === ws.slug && <Check className="w-3 h-3 text-ok" />}
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Help & Support */}
            <div className="py-1 text-xs">
              <Link
                href={getPublicRoute('privacy', locale)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-muted" />
                <span>{isTr ? 'GDPR & Veri Gizliliği' : 'GDPR & Data Privacy'}</span>
              </Link>
              <a
                href="https://fonbridge.com/yardim"
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-muted" />
                <span>{isTr ? 'Yardım & Dokümantasyon' : 'Help & Documentation'}</span>
              </a>
            </div>

            <div className="my-1 border-t border-border" />

            {/* Logout Action */}
            <div className="pt-1 px-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-bold text-bad hover:bg-bad/10 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-bad" />
                <span>{isTr ? 'Çıkış Yap' : 'Sign Out'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
