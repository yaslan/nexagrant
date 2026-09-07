'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logoutAction } from '@/lib/actions/auth';
import { useSession, signOut as clientSignOut } from 'next-auth/react';
import { 
  User, 
  Settings, 
  CreditCard, 
  Globe, 
  Key, 
  ShieldCheck, 
  HelpCircle, 
  LogOut, 
  ChevronDown, 
  Building2, 
  Check,
  Bell,
  Sparkles,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { getWorkspaceRoute, getPublicRoute } from '@/lib/routes';
import { isNextRedirectError } from '@/lib/errors';

interface UserMenuProps {
  locale: string;
  userName?: string;
  userEmail?: string;
  userImage?: string;
  roleName?: string;
  creditsBalance?: number;
}

export default function UserMenu({
  locale = 'tr',
  userName: propUserName,
  userEmail: propUserEmail,
  userImage: propUserImage,
  roleName: propRoleName,
  creditsBalance = 500,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  let sessionData: any = null;
  try {
    const { data } = useSession();
    sessionData = data;
  } catch (e) {
    // Fallback if SessionProvider context not initialized
  }

  const effectiveUserEmail = propUserEmail || sessionData?.user?.email;
  const effectiveUserName =
    propUserName ||
    sessionData?.user?.name ||
    (effectiveUserEmail?.includes('ayse') ? 'Prof. Dr. Ayşe Kaya' : 'Dr. Mehmet Yılmaz');
  const effectiveUserImage = propUserImage || sessionData?.user?.image;
  const effectiveRoleName = propRoleName || sessionData?.role || 'TENANT_OWNER';

  // Extract active workspace from pathname
  const segments = pathname ? pathname.split('/').filter(Boolean) : [];
  const activeWorkspace = (segments.length > 1 && !['admin', 'pricing', 'register'].includes(segments[1]))
    ? segments[1]
    : 'demo-sme';

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

  const switchLanguage = (newLocale: string) => {
    if (newLocale === locale) return;
    const newPath = pathname ? pathname.replace(`/${locale}`, `/${newLocale}`) : `/${newLocale}`;
    router.push(newPath);
  };

  const getInitials = (name: string) => {
    const cleanWords = name
      .replace(/^(Dr\.|Prof\.|Doç\.|Yrd\.|MSc\.|PhD\.)\s*/gi, '')
      .trim()
      .split(' ')
      .filter(Boolean);
    if (cleanWords.length >= 2) {
      return (cleanWords[0][0] + cleanWords[cleanWords.length - 1][0]).toUpperCase();
    }
    return (cleanWords[0]?.[0] || 'U').toUpperCase();
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
      } catch (clientErr) {
        window.location.href = targetUrl;
      }
    }
  };

  const isTr = locale === 'tr';

  const baseNotifications = isTr
    ? [
        { id: '1', title: 'Yeni Çağrı Eşleşmesi', desc: 'HORIZON-CL5-2026-D3 %92 uyumlu', time: '10 dk önce', unread: true },
        { id: '2', title: 'Kanıt Belgesi Uyarısı', desc: 'SME Beyannamesi 15 gün içinde doluyor', time: '2 saat önce', unread: true },
        { id: '3', title: 'Kredi Yüklemesi', desc: 'Aylık 500 AI Kredisi hesabınıza tanımlandı', time: '1 gün önce', unread: false },
      ]
    : [
        { id: '1', title: 'New Call Match', desc: 'HORIZON-CL5-2026-D3 92% match', time: '10m ago', unread: true },
        { id: '2', title: 'Evidence Vault Alert', desc: 'SME Declaration expires in 15 days', time: '2h ago', unread: true },
        { id: '3', title: 'Credits Allocated', desc: 'Monthly 500 AI Credits added to account', time: '1d ago', unread: false },
      ];

  const storageKey = `fonbridge_read_notifs_${effectiveUserEmail || 'guest'}`;

  const [notificationsList, setNotificationsList] = useState(baseNotifications);

  // Sync notifications from localStorage
  const syncNotifications = () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      const rawGuest = localStorage.getItem('fonbridge_read_notifs_guest');
      const readIds: string[] = raw ? JSON.parse(raw) : [];
      const guestReadIds: string[] = rawGuest ? JSON.parse(rawGuest) : [];
      const combined = Array.from(new Set([...readIds, ...guestReadIds]));

      setNotificationsList(
        baseNotifications.map((n) => ({
          ...n,
          unread: combined.includes(n.id) ? false : n.unread,
        }))
      );
    } catch (e) {
      setNotificationsList(baseNotifications);
    }
  };

  useEffect(() => {
    syncNotifications();

    const handleUpdate = () => syncNotifications();
    window.addEventListener('fonbridge_notifications_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('fonbridge_notifications_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [locale, effectiveUserEmail]);

  const unreadCount = notificationsList.filter((n) => n.unread).length;

  const markAllAsRead = () => {
    if (typeof window === 'undefined') return;
    const allIds = baseNotifications.map((n) => n.id);
    try {
      const raw = localStorage.getItem(storageKey);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const updated = Array.from(new Set([...existing, ...allIds]));
      localStorage.setItem(storageKey, JSON.stringify(updated));
      window.dispatchEvent(new Event('fonbridge_notifications_updated'));
    } catch (e) {}
  };

  const markSingleAsRead = (id: string) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      const existing: string[] = raw ? JSON.parse(raw) : [];
      const updated = Array.from(new Set([...existing, id]));
      localStorage.setItem(storageKey, JSON.stringify(updated));
      window.dispatchEvent(new Event('fonbridge_notifications_updated'));
    } catch (e) {}
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
      {/* Notifications Dropdown */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => {
            setIsNotifOpen(!isNotifOpen);
            setIsOpen(false);
          }}
          className="relative p-2 text-ink-2 hover:text-ink hover:bg-surface-hover rounded-full transition-all focus:outline-none"
          title={isTr ? 'Bildirimler' : 'Notifications'}
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-bad rounded-full ring-2 ring-surface animate-pulse" />
          )}
        </button>

        {isNotifOpen && (
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface border border-border rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
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
              <Link href={getWorkspaceRoute('notifications', locale, activeWorkspace)} className="text-xs font-semibold text-accent hover:underline">
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
              <img
                src={effectiveUserImage}
                alt={effectiveUserName}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-accent/30"
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
                  <span className="inline-block mt-1 text-[10px] font-bold bg-accent/15 text-accent-ink border border-accent/20 px-2 py-0.5 rounded font-mono">
                    {effectiveRoleName}
                  </span>
                </div>
              </div>
            </div>

            {/* Account & Profile Items */}
            <div className="py-1 text-xs">
              <Link
                href={getWorkspaceRoute('settingsProfile', locale, activeWorkspace)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <User className="w-4 h-4 text-muted" />
                <span>{isTr ? 'Profil & Hesap Ayarları' : 'Profile & Account Settings'}</span>
              </Link>

              <Link
                href={getWorkspaceRoute('settingsBilling', locale, activeWorkspace)}
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

              <Link
                href={getWorkspaceRoute('settingsModules', locale, activeWorkspace)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <Settings className="w-4 h-4 text-muted" />
                <span>{isTr ? 'Modül Ayarları' : 'Module Settings'}</span>
              </Link>

              <Link
                href={getWorkspaceRoute('settingsApiKeys', locale, activeWorkspace)}
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-2.5 px-4 py-2 text-ink-2 hover:text-ink hover:bg-surface-hover transition-colors"
              >
                <Key className="w-4 h-4 text-muted" />
                <span>{isTr ? 'API Anahtarları & Entegrasyonlar' : 'API Keys & Integrations'}</span>
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
              <div className="space-y-1 mt-1">
                <Link
                  href={getWorkspaceRoute('dashboard', locale, 'demo-sme')}
                  onClick={() => setIsOpen(false)}
                  className={`w-full text-left px-2.5 py-1 rounded text-xs font-medium flex items-center justify-between transition-colors ${
                    activeWorkspace === 'demo-sme' ? 'bg-surface-hover font-bold text-ink' : 'hover:bg-surface-hover text-ink-2'
                  }`}
                >
                  <span>Demo SME Consultancy</span>
                  {activeWorkspace === 'demo-sme' && <Check className="w-3 h-3 text-ok" />}
                </Link>
                <Link
                  href={getWorkspaceRoute('dashboard', locale, 'horizon-lab')}
                  onClick={() => setIsOpen(false)}
                  className={`w-full text-left px-2.5 py-1 rounded text-xs font-medium flex items-center justify-between transition-colors ${
                    activeWorkspace === 'horizon-lab' ? 'bg-surface-hover font-bold text-ink' : 'hover:bg-surface-hover text-ink-2'
                  }`}
                >
                  <span>Horizon Research Lab</span>
                  {activeWorkspace === 'horizon-lab' && <Check className="w-3 h-3 text-ok" />}
                </Link>
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
                href="https://docs.fabrika.app"
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
