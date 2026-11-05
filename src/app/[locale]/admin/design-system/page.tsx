import { getTranslations } from 'next-intl/server';
import { PRODUCT_NAME } from '@/lib/brand';
import DesignSystemPreview from './client';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'adminDesignSystem' });
  return { title: `${t('title')} · ${PRODUCT_NAME} Admin` };
}

/** Every shared primitive in src/components/ui on one page (NG-2). Gated by the admin layout. */
export default async function DesignSystemPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <DesignSystemPreview locale={locale} />;
}
