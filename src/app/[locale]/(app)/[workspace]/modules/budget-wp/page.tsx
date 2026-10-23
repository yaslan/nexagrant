import { notFound } from 'next/navigation';
import { moduleGate } from '@/lib/modules/guard';

// Placeholder for the "Yakında" M13 module (FO-40). While the manifest says
// `statusBadge: 'soon'`, the gate answers with the coming-soon page; the module's
// real screens replace this file when it ships.
export default async function BudgetWpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const locked = await moduleGate('M13', locale);
  if (locked) return locked;
  notFound();
}
