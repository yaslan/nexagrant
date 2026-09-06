import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import { addBudgetLineByToken } from '@/modules/m11/server/actions';

export default async function PartnerPortalPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) return notFound();

  // This page is unauthenticated — the token is the credential. An unknown or
  // expired token must render nothing. The previous fallback invented a budget
  // table (with real-looking partner names and figures) for *any* token string,
  // so a stranger saw a working partner portal and a DB outage was invisible.
  let part: any = null;
  try {
    part = await prisma.applicationPart.findUnique({
      where: { magicToken: token },
      include: { opportunity: true }
    });
  } catch (e: any) {
    console.warn(`[PartnerPortalPage] DB query failed: ${e.message}`);
    return notFound();
  }

  if (!part || part.part !== 'PART_A') return notFound();

  const opp = part.opportunity;

  return (
    <div className="min-h-screen bg-ground flex flex-col items-center pt-16 pb-20 px-4 font-sans">
      <div className="w-full max-w-2xl bg-surface shadow-md rounded-2xl p-8 border border-border">
        <div className="mb-8 text-center border-b pb-6">
          <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-3 py-1 rounded-full uppercase tracking-wider">
            Consortium Partner Portal
          </span>
          <h1 className="text-2xl font-bold text-ink mt-3 font-heading">Partner Portal</h1>
          <p className="text-muted text-sm mt-1">Bütçe ve efor girişi: <strong className="text-ink">{opp.title}</strong></p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50/80 text-blue-900 p-4 rounded-xl text-xs border border-blue-200 leading-relaxed">
            🔒 Bu güvenli bağlantı (magic link) aracılığıyla proje başvurusu (Part A) için idari bilgilerinizi ve efor (Kişi/Ay) bütçenizi girebilirsiniz. Toplam bütçeniz Horizon Europe katsayılarına göre otomatik hesaplanacaktır.
          </div>

          <form action={async (fd) => {
            'use server';
            // The magic token, not a part id, is what authorises this write —
            // `addBudgetLine` now requires a session and would reject the partner.
            await addBudgetLineByToken(
              token,
              fd.get('partnerName') as string,
              parseInt(fd.get('pm') as string, 10)
            );
          }} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Kurum Adı (PIC)</label>
              <input type="text" name="partnerName" placeholder="Örn: Siemens AG (999984059)" required className="w-full border border-border p-3 rounded-lg text-sm shadow-xs focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-2 mb-1">Efor (Person-Months / Kişi-Ay)</label>
              <input type="number" name="pm" placeholder="Örn: 24" required className="w-full border border-border p-3 rounded-lg text-sm shadow-xs focus:ring-2 focus:ring-blue-500" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg shadow-sm hover:bg-blue-700 transition text-sm">
              Bütçeyi Kaydet ve Gönder
            </button>
          </form>

          <div className="mt-8">
            <h3 className="font-semibold text-sm text-ink mb-3">Güncel Bütçe Tablosu</h3>
            <div className="border rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-ground border-b text-ink-2 font-semibold">
                  <tr>
                    <th className="p-3">Partner</th>
                    <th className="p-3">PM</th>
                    <th className="p-3 text-right">Talep Edilen Hibe</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {((part.content as any)?.budget || []).map((b: any, idx: number) => (
                    <tr key={idx} className="bg-surface hover:bg-ground">
                      <td className="p-3 font-bold text-ink">{b.partnerName}</td>
                      <td className="p-3 font-mono text-ink-2">{b.personMonths} PM</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">€{Number(b.requestedTotal).toLocaleString()}</td>
                    </tr>
                  ))}
                  {((part.content as any)?.budget || []).length === 0 && (
                    <tr className="bg-surface">
                      <td colSpan={3} className="p-4 text-center text-muted">Henüz giriş yapılmamış.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-6 text-muted text-xs font-mono">Secured by FonBridge SaaS — Horizon Europe Engine</p>
    </div>
  );
}
