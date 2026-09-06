import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fabrika - European Fund Management Platform',
  description: 'Manage European fund calls, consortium building, and project evaluation in one platform.',
  openGraph: {
    title: 'Fabrika - European Fund Management Platform',
    description: 'Manage European fund calls, consortium building, and project evaluation in one platform.',
    type: 'website',
    url: 'https://fabrika.eu',
    images: [
      {
        url: 'https://fabrika.eu/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Fabrika Platform',
      },
    ],
  },
};

export default async function LandingPage() {
  const t = await getTranslations();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header Navigation */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-slate-900">Fabrika</div>
          <div className="flex gap-6">
            <Link href="/pricing" className="text-slate-600 hover:text-slate-900 font-medium">
              {t('nav.pricing')}
            </Link>
            <Link href="/calls/turkey" className="text-slate-600 hover:text-slate-900 font-medium">
              {t('nav.calls')}
            </Link>
            <Link
              href="/login"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
            >
              {t('nav.login')}
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
              {t('landing.hero.title')}
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex gap-4">
              <Link
                href="/pricing"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
              >
                {t('landing.hero.cta')}
              </Link>
              <Link
                href="/calls/turkey"
                className="border-2 border-slate-300 text-slate-900 px-6 py-3 rounded-lg hover:border-slate-900 font-semibold"
              >
                {t('landing.hero.secondary')}
              </Link>
            </div>
          </div>
          <div className="bg-blue-100 rounded-xl h-80 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold text-blue-600">📊</div>
              <p className="text-slate-600 mt-4">{t('landing.hero.image_alt')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-slate-900 text-white py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold mb-12 text-center">{t('landing.features.title')}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: '🔍', title: 'landing.features.discovery', desc: 'landing.features.discovery_desc' },
              { icon: '👥', title: 'landing.features.consortium', desc: 'landing.features.consortium_desc' },
              { icon: '📈', title: 'landing.features.evaluation', desc: 'landing.features.evaluation_desc' },
              { icon: '📊', title: 'landing.features.analytics', desc: 'landing.features.analytics_desc' },
            ].map((feature, i) => (
              <div key={i} className="bg-slate-800 p-6 rounded-lg">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-semibold mb-2">{t(feature.title)}</h3>
                <p className="text-slate-400">{t(feature.desc)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-slate-900 mb-4">{t('landing.pricing.title')}</h2>
        <p className="text-slate-600 mb-12 text-lg">{t('landing.pricing.subtitle')}</p>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              name: 'landing.pricing.starter',
              price: '€99',
              features: ['landing.pricing.starter_f1', 'landing.pricing.starter_f2', 'landing.pricing.starter_f3'],
            },
            {
              name: 'landing.pricing.professional',
              price: '€299',
              features: ['landing.pricing.pro_f1', 'landing.pricing.pro_f2', 'landing.pricing.pro_f3'],
            },
            {
              name: 'landing.pricing.enterprise',
              price: 'Custom',
              features: ['landing.pricing.ent_f1', 'landing.pricing.ent_f2', 'landing.pricing.ent_f3'],
            },
          ].map((plan, i) => (
            <div key={i} className="border border-slate-300 rounded-lg p-8">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">{t(plan.name)}</h3>
              <div className="text-3xl font-bold text-blue-600 mb-6">{plan.price}</div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center text-slate-600">
                    <span className="mr-2">✓</span>
                    {t(f)}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="block text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold"
              >
                {t('landing.pricing.learn_more')}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">{t('landing.cta.title')}</h2>
          <p className="text-xl mb-8 opacity-90">{t('landing.cta.subtitle')}</p>
          <Link
            href="/pricing"
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg hover:bg-slate-100 font-semibold"
          >
            {t('landing.cta.button')}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="text-white font-bold mb-4">Fabrika</div>
              <p className="text-sm">{t('landing.footer.tagline')}</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">{t('landing.footer.product')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/pricing" className="hover:text-white">
                    {t('nav.pricing')}
                  </Link>
                </li>
                <li>
                  <Link href="/calls/turkey" className="hover:text-white">
                    {t('nav.calls')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">{t('landing.footer.company')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="hover:text-white">
                    {t('landing.footer.privacy')}
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white">
                    {t('landing.footer.terms')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">{t('landing.footer.legal')}</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/compliance" className="hover:text-white">
                    {t('landing.footer.compliance')}
                  </Link>
                </li>
                <li>
                  <a href="mailto:info@fabrika.eu" className="hover:text-white">
                    {t('landing.footer.contact')}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-sm text-center">
            <p>&copy; 2026 Fabrika. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
