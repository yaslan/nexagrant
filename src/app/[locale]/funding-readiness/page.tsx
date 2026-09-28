import React from 'react';
import FonHazirlikPage from '../fon-hazirlik/page';

export { generateMetadata } from '../fon-hazirlik/page';

export default async function FundingReadinessPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <FonHazirlikPage {...props} />;
}
