import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import path from 'path';
import {
  API_CONTENT_SECURITY_POLICY,
  STATIC_FILE_CONTENT_SECURITY_POLICY,
  STATIC_SECURITY_HEADERS,
  publicAssetHostIsLoopback,
  publicAssetImagePattern,
  staticFileNotFoundSource,
} from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin();

/**
 * Pre-build i18n gate (CLAUDE.md rule 8).
 *
 * This used to be a try/catch that turned any failure into "⚠️  Could not run i18n check"
 * and let the build continue. scripts/i18n-check.ts exited 1 on every run — it read the
 * 28 template-literal `t(`ns.${value}`)` calls as literal keys — so that warning fired on
 * every single build and the gate never once ran to a verdict. A gate that cannot fail is
 * not a gate, so nothing is caught here any more: a non-zero exit throws and takes the
 * build down with it.
 *
 * `next dev` is deliberately exempt (see the phase check at the bottom of this file):
 * a missing translation should not stop someone from starting the dev server, and the
 * check costs a couple of seconds on every restart. `next build`, `pnpm gate` and the
 * i18n-check GitHub workflow are the three places that block.
 */
function checkI18n() {
  console.log('\n🌐 Checking i18n translations...');
  execFileSync('tsx', ['scripts/i18n-check.ts'], { stdio: 'inherit' });
}

// The metadata files Next serves by name from the top of src/app.
const APP_METADATA_FILE =
  /^(?:favicon\.ico|(?:icon|apple-icon|opengraph-image|twitter-image)\d*\.(?:ico|jpe?g|png|gif|svg)|robots\.txt|sitemap\.xml|manifest\.(?:json|webmanifest))$/;

/**
 * The files that really answer a static-file path: everything in public/ and the
 * metadata files at the top of src/app (`/favicon.ico`; Next serves those by name).
 * Read when `headers()` runs — at build time; the list is baked into
 * routes-manifest.json like the rest of it, so a public/ file added without a
 * rebuild gets the (harmless) 404 policy. A generated one (`app/robots.ts`) is not
 * listed either and gets it too: a CSP on a text/plain or XML body changes nothing.
 */
function servedStaticFiles(root: string = process.cwd()): string[] {
  const underPublic = readdirSync(path.join(root, 'public'), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(path.join(root, 'public'), path.join(e.parentPath, e.name)));
  const appRoot = readdirSync(path.join(root, 'src/app'), { withFileTypes: true })
    .filter((e) => e.isFile() && APP_METADATA_FILE.test(e.name))
    .map((e) => e.name);
  return [...underPublic, ...appRoot].map((f) => `/${f.split(path.sep).join('/')}`).sort();
}

const nextConfig: NextConfig = {
  output: 'standalone',
  /** D-2 (TASK-MUN66T2HM4A4E): no `X-Powered-By: Next.js` fingerprint. */
  poweredByHeader: false,
  /**
   * `forbidden()` (next/navigation) is still behind this flag in Next 16. It lets a
   * page answer a signed-in user who may never see it with a real 403 instead of a
   * 404 or a redirect — first used by the agency dashboard (TASK-MULRQSJFB8RWJ).
   * The screen is src/app/forbidden.tsx.
   */
  experimental: {
    authInterrupts: true,
  },
  serverExternalPackages: ['pg', 'pdf-parse', 'graphile-worker'],
  /**
   * Hosts `next/image` is allowed to optimise from.
   *
   * ca73ced migrated 16 `<img>` elements to `next/image` to clear the `no-img-element` lint
   * warnings, but the blog's images are remote (`src/lib/blog.ts` and the admin blog form both
   * carry `images.unsplash.com` URLs) and `next/image` refuses an unlisted host by throwing.
   * The result was a 500 on `/tr`, `/en` and `/tr/blog` — the public landing page — and, because
   * Playwright's `webServer.url` probe never saw a status below 400, `pnpm test:e2e` could not
   * start either. Measured and recorded in
   * docs/agent-results/TASK-MTQ63RR8Z0G8E-blok-zincir-denet-i-2.md.
   *
   * Listed host by host on purpose: a wildcard would let any URL pasted into the blog admin form
   * run through the image optimiser.
   *
   * `lh3.googleusercontent.com` is the Google profile picture Auth.js stores in `User.image`
   * for a Google sign-in; the app shell renders it through `next/image`. Without it every
   * Google user's avatar was a 400 `"url" parameter is not allowed` (TASK-MUNRB2037NA5V,
   * İNCELEME-57 Ö-5). https only, that one host; it is still served from `/_next/image`, so
   * the CSP `img-src 'self'` covers it and needs no new host.
   */
  images: {
    // Only for a public bucket on loopback (local/CI MinIO); see the helper.
    dangerouslyAllowLocalIP: publicAssetHostIsLoopback(process.env.R2_PUBLIC_HOST),
    remotePatterns: [
      // `port: ''` = the default https port only. Left out, it means any port:
      // lh3…:8443 was accepted and the optimizer waited out a 504 upstream
      // (TASK-MUNWZGWA70P16, İNCELEME-71 B-5).
      { protocol: 'https', hostname: 'images.unsplash.com', port: '' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', port: '' },
      // Uploaded blog images (TASK-MUU20NSV2TETW): the public bucket's host
      // from R2_PUBLIC_HOST, `blog/` objects only. Read when this file loads,
      // so a standalone build needs the variable at `next build` time too.
      ...[publicAssetImagePattern(process.env.R2_PUBLIC_HOST)].filter((p) => p !== null),
    ],
  },
  /**
   * Ask the browser for the OS colour-scheme preference on every request.
   *
   * The root layout resolves the theme server-side (src/app/layout.tsx). A returning
   * visitor has the `fabrika-theme` cookie and needs nothing else; a first-time
   * visitor has no cookie, and `Sec-CH-Prefers-Color-Scheme` is the only signal the
   * server can read. `Accept-CH` opts into the hint; `Critical-CH` makes the browser
   * retry the very first navigation with it attached, so even the first paint is
   * right instead of the second.
   *
   * Chrome and Edge send it. Safari and Firefox implement no client hints and ignore
   * both headers — there the fallback is light, corrected after hydration.
   *
   * No `Vary: Sec-CH-Prefers-Color-Scheme` here, deliberately: it was tried and
   * measured away. Next.js writes its own `Vary` on every app-router response
   * (`rsc, next-router-state-tree, …, Accept-Encoding`) and replaces the configured
   * one, so the line looked like cache protection while providing none. Nothing
   * caches these documents today — every app route is `ƒ` and carries
   * `Cache-Control: no-cache, must-revalidate` — but a CDN put in front of this app
   * has to be told to vary on the hint, because one URL now has two bodies.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Accept-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
          { key: 'Critical-CH', value: 'Sec-CH-Prefers-Color-Scheme' },
          // Y-2 (TASK-MUN80T8IVTPM7): HSTS, framing, nosniff, referrer, permissions.
          // The page CSP carries a per-request nonce and is set by src/proxy.ts.
          ...STATIC_SECURITY_HEADERS,
        ],
      },
      // The proxy does not run for /api, so its CSP never reaches these responses.
      {
        source: '/api/:path*',
        headers: [{ key: 'Content-Security-Policy', value: API_CONTENT_SECURITY_POLICY }],
      },
      // Nor for static-file extensions, /_next and /_vercel: a `/yok.png`, `/robots.txt`
      // or `/_next/yok` with no file behind it is Next's app 404 (İNCELEME-78 Y-1).
      // Real files are left out of the source and go out as before. Where the proxy
      // runs as well (`/yok.PNG` — this match ignores case, the matcher does not), its
      // header replaces this one. Ignoring case also leaves out `/Logo.png` and
      // `/_next/Image`; the proxy covers those (İNCELEME-98 Y-1, src/proxy.ts).
      {
        source: staticFileNotFoundSource(servedStaticFiles()),
        headers: [{ key: 'Content-Security-Policy', value: STATIC_FILE_CONTENT_SECURITY_POLICY }],
      },
      // TASK-MUN2793A57Z9I (se-fb (d)) — the invitation link carries a bearer
      // token in its query. The GET handler moves it into a cookie at once;
      // these pages still never send a Referer and are never cached. Listed after
      // the `/:path*` entry on purpose: for the same key the later entry wins, so
      // `no-referrer` here overrides the global `strict-origin-when-cross-origin`.
      {
        source: '/:locale(tr|en)/accept-invite/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // ─── Migrate locale-less marketing pages to [locale] ───
      { source: '/pricing', destination: '/tr/pricing', permanent: true },
      { source: '/privacy', destination: '/tr/privacy', permanent: true },
      { source: '/terms', destination: '/tr/terms', permanent: true },
      { source: '/compliance/dpa', destination: '/tr/compliance/dpa', permanent: true },
      { source: '/calls/:region', destination: '/tr/calls/:region', permanent: true },
      { source: '/portal/partner/:token', destination: '/tr/portal/partner/:token', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // ─── Public Marketing Pages (TR SEO Slugs) ───
      { source: '/tr/fiyatlandirma', destination: '/tr/pricing' },
      { source: '/tr/acik-cagrilar', destination: '/tr/turkiyeye-acik-cagrilar' },
      { source: '/en/open-calls', destination: '/en/turkiyeye-acik-cagrilar' },
      { source: '/en/open-calls-turkiye', destination: '/en/turkiyeye-acik-cagrilar' },
      { source: '/tr/giris', destination: '/tr/login' },
      { source: '/tr/kayit', destination: '/tr/register' },
      { source: '/tr/kullanim-kosullari', destination: '/tr/terms' },
      { source: '/tr/gizlilik-politikasi', destination: '/tr/privacy' },
      // The published DPA lives at /compliance/dpa, which renders
      // docs/legal/dpa-{locale}.md. A second, superseded copy used to sit at
      // /dpa and was what the public footer actually linked to — it named the
      // processor "FonBridge", a product name this platform no longer carries.
      // Both old URLs now resolve to the one document that is maintained.
      { source: '/tr/veri-isleme-sozlesmesi', destination: '/tr/compliance/dpa' },
      { source: '/tr/dpa', destination: '/tr/compliance/dpa' },
      { source: '/en/dpa', destination: '/en/compliance/dpa' },

      // ─── Workspace App Routes (TR SEO Slugs) ───
      { source: '/tr/:workspace/panel', destination: '/tr/:workspace/dashboard' },
      { source: '/tr/:workspace/cagrilar', destination: '/tr/:workspace/calls' },
      { source: '/tr/:workspace/cagrilar/:id', destination: '/tr/:workspace/calls/:id' },
      { source: '/tr/:workspace/firsatlar', destination: '/tr/:workspace/pipeline' },
      { source: '/tr/:workspace/ortaklar', destination: '/tr/:workspace/partners' },
      { source: '/tr/:workspace/ortaklar/liderler', destination: '/tr/:workspace/partners/leaders' },
      { source: '/tr/:workspace/ortaklar/:pic', destination: '/tr/:workspace/partners/:pic' },
      { source: '/tr/:workspace/iliskiler', destination: '/tr/:workspace/relationships' },
      { source: '/tr/:workspace/kanitlar', destination: '/tr/:workspace/evidence' },
      { source: '/tr/:workspace/konsept-notlar', destination: '/tr/:workspace/concept-notes' },
      { source: '/tr/:workspace/konsept-notlar/:id', destination: '/tr/:workspace/concept-notes/:id' },
      { source: '/tr/:workspace/onay-merkezi', destination: '/tr/:workspace/approvals' },
      { source: '/tr/:workspace/tto-hizlandirici', destination: '/tr/:workspace/tto' },
      { source: '/tr/:workspace/ayarlar', destination: '/tr/:workspace/settings/modules' },
      { source: '/tr/:workspace/ayarlar/profil', destination: '/tr/:workspace/settings/profile' },
      { source: '/tr/:workspace/ayarlar/moduller', destination: '/tr/:workspace/settings/modules' },
      { source: '/tr/:workspace/ayarlar/faturalama', destination: '/tr/:workspace/settings/billing' },
      { source: '/tr/:workspace/ayarlar/api-anahtarlari', destination: '/tr/:workspace/settings/api-keys' },
      { source: '/tr/:workspace/ayarlar/kapilar', destination: '/tr/:workspace/settings/gates' },
      { source: '/tr/:workspace/ayarlar/uyeler', destination: '/tr/:workspace/settings/members' },
      { source: '/tr/:workspace/ayarlar/sso', destination: '/tr/:workspace/settings/sso' },
    ];
  },
};

// Phase-aware so the gate blocks `next build` without blocking `next dev`.
const config = (phase: string) => {
  if (phase === PHASE_PRODUCTION_BUILD) checkI18n();
  return withNextIntl(nextConfig);
};

export default config;
