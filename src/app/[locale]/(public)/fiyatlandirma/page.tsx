import React from 'react';
import PricingPage from '../pricing/page';

export default async function FiyatlandirmaPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  return <PricingPage params={params} />;
}
