import { moduleGate } from '@/lib/modules/guard';

import { InterregReviewClient } from './client';

// M17 Interreg pre-assessment (FO-189). The gate decides by plan and ModuleState;
// every read and write after that goes through the module's own API, which checks
// the same gate and the role again.
export default async function InterregReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const locked = await moduleGate('M17', locale);
  if (locked) return locked;
  return (
    <div className="max-w-5xl mx-auto py-8 sm:px-4">
      <InterregReviewClient />
    </div>
  );
}
