import React from 'react';
import TurkiyeyeAcikCagrilarPage, { generateMetadata } from '../turkiyeye-acik-cagrilar/page';

export { generateMetadata };

export default async function OpenCallsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  return <TurkiyeyeAcikCagrilarPage params={params} />;
}
