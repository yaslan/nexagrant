import { notFound } from 'next/navigation';
import { moduleGate } from '@/lib/modules/guard';

// Placeholder for the "Yakında" M17 Interreg pre-assessment (FO-186). While the
// manifest says `statusBadge: 'soon'`, the gate answers with the coming-soon page;
// the upload and report screens (fe-fb, F2/F3) replace this file.
export default async function InterregReviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const locked = await moduleGate('M17', locale);
  if (locked) return locked;
  notFound();
}
