import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { execSync } from 'child_process';

const withNextIntl = createNextIntlPlugin();

// Pre-build i18n check: warn if translation gaps exist
function checkI18n() {
  try {
    console.log('\n🌐 Checking i18n translations...');
    const output = execSync('tsx scripts/i18n-check.ts', { encoding: 'utf-8' });
    const lines = output.split('\n');
    // Extract JSON from output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const report = JSON.parse(jsonMatch[0]);
      const { summary } = report;
      if (summary.missingInBoth.length > 0) {
        console.warn(
          `⚠️  i18n gaps found:\n` +
          `   Missing in BOTH: ${summary.missingInBoth.length}\n` +
          `   Build will proceed but fix these before shipping.`
        );
      } else if (summary.missingInTurkish.length > 0 || summary.missingInEnglish.length > 0) {
        console.warn(
          `⚠️  Partial translation gaps:\n` +
          `   Missing in Turkish: ${summary.missingInTurkish.length}\n` +
          `   Missing in English: ${summary.missingInEnglish.length}`
        );
      } else {
        console.log('✅ All translations complete!');
      }
    }
  } catch (error) {
    console.warn('⚠️  Could not run i18n check:', error instanceof Error ? error.message : String(error));
    // Don't block build on check failure
  }
}

checkI18n();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pdf-parse', 'inngest'],
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
      { source: '/tr/veri-isleme-sozlesmesi', destination: '/tr/dpa' },

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

export default withNextIntl(nextConfig);
