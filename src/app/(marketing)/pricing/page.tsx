import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing - Fabrika',
  description: 'Choose the perfect plan for your team. Flexible pricing for European fund management.',
};

export default async function PricingPage() {
  const t = await getTranslations();

  const plans = [
    {
      name: 'pricing.starter',
      price: '€99',
      description: 'pricing.starter_desc',
      features: [
        'pricing.starter_f1',
        'pricing.starter_f2',
        'pricing.starter_f3',
        'pricing.starter_f4',
      ],
      cta: 'pricing.get_started',
      highlighted: false,
    },
    {
      name: 'pricing.professional',
      price: '€299',
      description: 'pricing.pro_desc',
      features: [
        'pricing.pro_f1',
        'pricing.pro_f2',
        'pricing.pro_f3',
        'pricing.pro_f4',
        'pricing.pro_f5',
      ],
      cta: 'pricing.get_started',
      highlighted: true,
    },
    {
      name: 'pricing.business',
      price: '€599',
      description: 'pricing.business_desc',
      features: [
        'pricing.business_f1',
        'pricing.business_f2',
        'pricing.business_f3',
        'pricing.business_f4',
        'pricing.business_f5',
      ],
      cta: 'pricing.get_started',
      highlighted: false,
    },
    {
      name: 'pricing.enterprise',
      price: 'Custom',
      description: 'pricing.enterprise_desc',
      features: [
        'pricing.enterprise_f1',
        'pricing.enterprise_f2',
        'pricing.enterprise_f3',
        'pricing.enterprise_f4',
        'pricing.enterprise_f5',
      ],
      cta: 'pricing.contact_sales',
      highlighted: false,
    },
  ];

  const faqs = [
    {
      q: 'pricing.faq_1_q',
      a: 'pricing.faq_1_a',
    },
    {
      q: 'pricing.faq_2_q',
      a: 'pricing.faq_2_a',
    },
    {
      q: 'pricing.faq_3_q',
      a: 'pricing.faq_3_a',
    },
    {
      q: 'pricing.faq_4_q',
      a: 'pricing.faq_4_a',
    },
    {
      q: 'pricing.faq_5_q',
      a: 'pricing.faq_5_a',
    },
    {
      q: 'pricing.faq_6_q',
      a: 'pricing.faq_6_a',
    },
    {
      q: 'pricing.faq_7_q',
      a: 'pricing.faq_7_a',
    },
    {
      q: 'pricing.faq_8_q',
      a: 'pricing.faq_8_a',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-slate-200">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-slate-900">
            Fabrika
          </Link>
          <Link href="/" className="text-slate-600 hover:text-slate-900 font-medium">
            {t('nav.back')}
          </Link>
        </nav>
      </header>

      {/* Pricing Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-20">
          <h1 className="text-5xl font-bold text-slate-900 mb-4">{t('pricing.title')}</h1>
          <p className="text-xl text-slate-600">{t('pricing.subtitle')}</p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-xl border-2 p-8 transition-all ${
                plan.highlighted
                  ? 'border-blue-600 bg-gradient-to-br from-blue-50 to-white shadow-lg'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {plan.highlighted && (
                <div className="mb-4 inline-block bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                  {t('pricing.popular')}
                </div>
              )}
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{t(plan.name)}</h3>
              <p className="text-slate-600 text-sm mb-4">{t(plan.description)}</p>
              <div className="text-4xl font-bold text-slate-900 mb-2">{plan.price}</div>
              <p className="text-slate-600 text-sm mb-6">{t('pricing.per_month')}</p>
              <button className={`w-full py-2 rounded-lg font-semibold mb-8 transition-all ${
                plan.highlighted
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'border-2 border-slate-300 text-slate-900 hover:border-slate-900'
              }`}>
                {t(plan.cta)}
              </button>
              <ul className="space-y-3">
                {plan.features.map((feature, j) => (
                  <li key={j} className="flex items-start text-slate-600 text-sm">
                    <span className="mr-2 text-blue-600 font-bold">✓</span>
                    {t(feature)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-4xl font-bold text-slate-900 mb-12 text-center">{t('pricing.faq_title')}</h2>
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details
                key={i}
                className="group border border-slate-200 rounded-lg p-4 hover:border-slate-300 cursor-pointer"
              >
                <summary className="font-semibold text-slate-900 flex justify-between items-center">
                  {t(faq.q)}
                  <span className="transition-transform group-open:rotate-180">▼</span>
                </summary>
                <p className="text-slate-600 mt-4">{t(faq.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="bg-blue-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">{t('pricing.cta_title')}</h2>
          <p className="text-lg mb-8">{t('pricing.cta_subtitle')}</p>
          <button className="bg-white text-blue-600 px-8 py-3 rounded-lg hover:bg-slate-100 font-semibold">
            {t('pricing.contact_us')}
          </button>
        </div>
      </section>
    </div>
  );
}
