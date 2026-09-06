'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, Theme } from './ThemeProvider';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown' | 'segmented';
  className?: string;
  locale?: string;
}

export default function ThemeToggle({
  variant = 'button',
  className = '',
  locale = 'tr',
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const labels = {
    tr: {
      light: 'Açık Mod',
      dark: 'Koyu Mod',
      system: 'Sistem',
      toggleTooltip: resolvedTheme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç',
    },
    en: {
      light: 'Light Mode',
      dark: 'Dark Mode',
      system: 'System',
      toggleTooltip: resolvedTheme === 'dark' ? 'Switch to Light' : 'Switch to Dark',
    },
  };

  const t = labels[locale as 'tr' | 'en'] || labels.tr;

  if (!mounted) {
    // Render placeholder to avoid hydration mismatch
    return (
      <div className={`w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center opacity-0 ${className}`} />
    );
  }

  // 1. Simple 1-click Toggle Button
  if (variant === 'button') {
    return (
      <button
        onClick={toggleTheme}
        className={`p-2 rounded-full text-ink-2 hover:text-ink hover:bg-surface-hover border border-border/80 shadow-2xs transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent ${className}`}
        title={t.toggleTooltip}
        aria-label={t.toggleTooltip}
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-4.5 h-4.5 text-amber-400 animate-in spin-in-180 duration-300" />
        ) : (
          <Moon className="w-4.5 h-4.5 text-slate-700 animate-in spin-in-180 duration-300" />
        )}
      </button>
    );
  }

  // 2. Segmented 3-Way Controller
  if (variant === 'segmented') {
    const options: { key: Theme; label: string; icon: React.ReactNode }[] = [
      { key: 'light', label: t.light, icon: <Sun className="w-3.5 h-3.5" /> },
      { key: 'dark', label: t.dark, icon: <Moon className="w-3.5 h-3.5" /> },
      { key: 'system', label: t.system, icon: <Monitor className="w-3.5 h-3.5" /> },
    ];

    return (
      <div className={`inline-flex items-center p-1 bg-ground border border-border rounded-xl gap-1 ${className}`}>
        {options.map((opt) => {
          const isSelected = theme === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setTheme(opt.key)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-surface text-ink font-semibold shadow-xs border border-border/60'
                  : 'text-muted hover:text-ink hover:bg-surface/50'
              }`}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 3. Dropdown Menu
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-surface-hover border border-border/80 transition-colors focus:outline-none"
        aria-label="Theme selector"
      >
        {theme === 'system' ? (
          <Monitor className="w-4 h-4 text-accent" />
        ) : resolvedTheme === 'dark' ? (
          <Moon className="w-4 h-4 text-amber-400" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
        <span className="text-xs font-medium">
          {theme === 'system' ? t.system : resolvedTheme === 'dark' ? t.dark : t.light}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-36 bg-surface border border-border rounded-xl shadow-xl py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <button
            onClick={() => {
              setTheme('light');
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
              theme === 'light' ? 'bg-accent/10 text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>{t.light}</span>
            </div>
            {theme === 'light' && <Check className="w-3.5 h-3.5 text-accent" />}
          </button>

          <button
            onClick={() => {
              setTheme('dark');
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
              theme === 'dark' ? 'bg-accent/10 text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Moon className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.dark}</span>
            </div>
            {theme === 'dark' && <Check className="w-3.5 h-3.5 text-accent" />}
          </button>

          <button
            onClick={() => {
              setTheme('system');
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors ${
              theme === 'system' ? 'bg-accent/10 text-accent-ink font-semibold' : 'text-ink-2 hover:bg-surface-hover hover:text-ink'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Monitor className="w-3.5 h-3.5 text-accent" />
              <span>{t.system}</span>
            </div>
            {theme === 'system' && <Check className="w-3.5 h-3.5 text-accent" />}
          </button>
        </div>
      )}
    </div>
  );
}
