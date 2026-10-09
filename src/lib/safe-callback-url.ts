/**
 * A sign-in `callbackUrl` this app will follow, or `fallback`
 * (TASK-MUO12A7NHANOT; İNCELEME-76 D-1/D-2).
 *
 * The login page hands the query value to `window.location.href` after a
 * credentials sign-in, and demo sign-in is enabled outside production. So
 * `?callbackUrl=https://evil.example` or `//evil.example` sent the user off-site
 * after a successful login (measured by fe-fb on `next dev`). Auth.js's own
 * `redirect` callback guards only the OAuth path, and a value with a leading
 * space broke it into a "Configuration" error page.
 *
 * Only a same-origin path is kept: it starts with one `/` (not `//`, not `/\`,
 * which browsers read as `//`), holds no whitespace or control character, and
 * still resolves to the same origin — and is not `//` again — once parsed.
 */
export function safeCallbackUrl(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  const base = 'https://callback.invalid';
  try {
    const parsed = new URL(raw, base);
    if (parsed.origin !== base) return fallback;
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    // Dot segments can collapse into `//host` (`/a/../..//evil.com`), which is
    // protocol-relative again once it is handed back to the browser.
    return path.startsWith('//') ? fallback : path;
  } catch {
    return fallback;
  }
}
