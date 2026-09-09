/**
 * The theme contract, shared by the server and the browser.
 *
 * It cannot live in src/components/ThemeProvider.tsx: that file is `'use client'`,
 * so every one of its exports becomes a client reference and the root layout got
 * "Attempted to call parseTheme() from the server but parseTheme is on the client"
 * (a 500 on /tr and /en) the moment it tried to use one. Neither may the cookie
 * name be written twice — the server reads it and the browser writes it, and two
 * copies of that string drift.
 */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Read by src/app/layout.tsx on the server, written by ThemeProvider in the browser. */
export const THEME_COOKIE_NAME = 'fabrika-theme';

/** A preference is a long-lived choice; a session cookie would drop it on browser close. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Narrows an untrusted string (a cookie value, an old localStorage entry) to a Theme. */
export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
