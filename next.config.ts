import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'pdf-parse', 'inngest'],
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
