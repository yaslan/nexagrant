'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createOpportunity } from '../../pipeline/actions';

const getCallDetails = (id: string, isTr: boolean) => {
  return {
    id: id,
    title: isTr 
      ? 'İklim Modellemesi ve Risk Tahmini İçin İleri Düzey YZ Çözümleri'
      : 'Advanced AI solutions for climate modeling',
    programme: isTr ? 'Ufuk Avrupa (Horizon Europe)' : 'Horizon Europe',
    status: isTr ? 'AÇIK (OPEN)' : 'OPEN',
    typeOfAction: 'RIA (Research & Innovation Action)',
    budgetPerProjectCents: 500000000,
    numProjects: 3,
    deadlines: [
      { stage: 1, at: '2026-09-15T17:00:00Z' },
      { stage: 2, at: '2027-02-15T17:00:00Z' }
    ],
    description: isTr 
      ? 'Bu çağrı başlığı, uzun vadeli iklim değişikliği kalıplarını yüksek doğrulukla tahmin edebilecek ileri düzey yapay zeka modellerini fonlamayı amaçlamaktadır. Başvurular mevcut meteorolojik modeller ile yenilikçi sinir ağı mimarilerinin birleştirilmesine odaklanmalıdır.\n\nBeklenen Çıktılar:\n- 10 yıllık yüksek doğrulukta iklim tahminleri\n- Açık kaynaklı yapay zeka model mimarisi\n- Çıkarım (inference) için düşürülmüş hesaplama ayak izi.'
      : 'This topic aims to fund advanced AI models that can accurately predict climate change patterns over long periods. Submissions should focus on combining existing weather models with novel neural architectures. \n\nExpected Outcomes: \n- High accuracy 10-year forecasts\n- Open source model architecture\n- Reduced compute footprint for inference.',
    keywords: isTr ? ['Yapay Zeka', 'İklim', 'Modelleme', 'Dünya Bilimleri'] : ['AI', 'Climate', 'Modeling', 'Earth Science'],
  };
};

export default function CallDetailsPage({ params }: { params: Promise<{ id: string, workspace: string, locale: string }> }) {
  const resolvedParams = React.use(params);
  const { id, workspace, locale } = resolvedParams;
  const isTr = locale === 'tr';
  const call = getCallDetails(id, isTr);
  const router = useRouter();
  const [isPending, setIsPending] = React.useState(false);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <Link 
          href={`/${locale}/${workspace}/cagrilar`} 
          className="text-accent hover:underline text-xs sm:text-sm font-medium flex items-center gap-1"
        >
          ← {isTr ? 'Çağrılara Geri Dön' : 'Back to Calls'}
        </Link>
      </div>

      <div className="bg-surface p-6 md:p-8 rounded-xl shadow-xs border border-border">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-xs font-semibold bg-accent/15 text-accent-ink border border-accent/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.programme}
              </span>
              <span className="text-xs font-semibold bg-ok/15 text-ok border border-ok/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.status}
              </span>
              <span className="text-xs font-semibold bg-ground text-ink-2 border border-border px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                {call.typeOfAction}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold font-heading text-ink mb-2">{call.title}</h1>
            <p className="text-muted font-mono text-xs sm:text-sm">{call.id}</p>
          </div>
          
          <button 
            disabled={isPending}
            onClick={async () => {
              setIsPending(true);
              try {
                await createOpportunity({ workspaceSlug: workspace, title: call.title, topicId: call.id });
                router.push(`/${locale}/${workspace}/firsatlar`);
              } catch (e) {
                console.error(e);
                alert(isTr ? 'Fırsat ekleme başarısız oldu' : 'Failed to create opportunity');
                setIsPending(false);
              }
            }}
            className="bg-accent hover:opacity-90 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition shadow-2xs shrink-0 text-xs sm:text-sm"
          >
            {isPending 
              ? (isTr ? 'Ekleniyor...' : 'Adding...') 
              : (isTr ? 'Fırsatlara / Pipet\'e Ekle' : 'Add to Pipeline')}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-t border-b border-border py-6">
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              {isTr ? 'Temel Metrikler' : 'Key Metrics'}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-ink-2">
              <li>
                <strong className="text-ink">{isTr ? 'Proje Başına Bütçe:' : 'Budget per Project:'}</strong> €{(call.budgetPerProjectCents / 100).toLocaleString()}
              </li>
              <li>
                <strong className="text-ink">{isTr ? 'Beklenen Proje Sayısı:' : 'Expected Projects:'}</strong> {call.numProjects}
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              {isTr ? 'Son Başvuru Tarihleri' : 'Deadlines'}
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-ink-2 font-mono">
              {call.deadlines.map(d => (
                <li key={d.stage}>
                  <strong className="text-ink font-sans">{isTr ? `${d.stage}. Aşama:` : `Stage ${d.stage}:`}</strong> {new Date(d.at).toLocaleDateString(isTr ? 'tr-TR' : 'en-US')}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h2 className="text-lg sm:text-xl font-bold text-ink mb-4 font-heading">
            {isTr ? 'Çağrı Detayı & Açıklaması' : 'Topic Description'}
          </h2>
          <div className="prose max-w-none text-ink-2 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
            {call.description}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            {isTr ? 'Anahtar Kelimeler' : 'Keywords'}
          </h3>
          <div className="flex flex-wrap gap-2">
            {call.keywords.map(kw => (
              <span key={kw} className="bg-ground border border-border text-ink-2 px-3 py-1 rounded-full text-xs font-medium">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
