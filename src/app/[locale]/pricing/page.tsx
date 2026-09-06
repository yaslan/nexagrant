import React from 'react';
import PricingClient from './PricingClient';

export default async function PricingPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PricingClient locale={locale} />;
}
