'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME, type ResolvedTheme, type Theme } from '@/lib/theme';

// Re-exported for the components that already import the type from here (ThemeToggle).
export type { ResolvedTheme, Theme };

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * The preference lives in a cookie (src/lib/theme.ts), not in localStorage.
 *
 * It used to live in localStorage, which the server cannot read, so the correct
 * theme could only be applied by a blocking <script> in <head> that ran at parse
 * time. React logs "Encountered a script tag" for any script node it finds in the
 * tree it is hydrating, and all three ways of injecting that script (next/script
 * beforeInteractive, an inline dangerouslySetInnerHTML node, a plain src script,
 * in <head> and in <body>) produced the warning — React's condition is the
 * unmatched node, not the shape of the script. Moving the preference to a cookie
 * lets the root layout resolve the theme on the server and render the class onto
 * <html> directly, so there is no script to warn about and no flash.
 */
function writeThemeCookie(theme: Theme) {
  // `secure` only where it is meaningful: on plain http (a LAN dev host) a secure
  // cookie is dropped silently and the preference would never reach the server.
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${THEME_COOKIE_NAME}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

export function ThemeProvider({
  children,
  initialTheme,
  initialResolvedTheme,
}: {
  children: React.ReactNode;
  /** What the cookie said, resolved server-side in src/app/layout.tsx. */
  initialTheme: Theme;
  /** What the server already painted onto <html>; the initial state must agree with it. */
  initialResolvedTheme: ResolvedTheme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(initialResolvedTheme);

  // Nothing carries the old localStorage preference over into the cookie, on purpose.
  // Such a carry-over was written and then dropped: it can only run in an effect
  // (localStorage must not be read during render) and it has to call setState to show
  // the recovered choice — which is precisely what `react-hooks/set-state-in-effect`
  // rejects, and `pnpm gate` went red on it. The cost is one-off and bounded: whoever
  // had explicitly picked light or dark picks it once more, and the cookie holds after.

  // Keep the DOM in step with later changes: a toggle, or the OS flipping while
  // "system" is selected. The first paint is already correct — the server wrote it.
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const activeTheme: ResolvedTheme =
        theme === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : theme;

      setResolvedTheme(activeTheme);

      if (activeTheme === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'light');
      }
    };

    applyTheme();

    const listener = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    writeThemeCookie(newTheme);
  };

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
