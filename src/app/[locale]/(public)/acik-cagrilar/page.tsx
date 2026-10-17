import React from 'react';
import TurkiyeyeAcikCagrilarPage from '../turkiyeye-acik-cagrilar/page';

export default async function OpenCallsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  return <TurkiyeyeAcikCagrilarPage params={params} />;
}
