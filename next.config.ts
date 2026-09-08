import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';
import { execFileSync } from 'child_process';

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

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pdf-parse', 'inngest'],
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
   */
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
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
      { source: '/tr/:workspace/pazar-yeri', destination: '/tr/:workspace/marketplace' },
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
