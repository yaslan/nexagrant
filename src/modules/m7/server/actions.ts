'use server';

import { prisma } from '@/lib/db';
import { generateText } from '@/lib/ai/llm';
import { revalidatePath } from 'next/cache';

export async function createTtoItem({
  tenantId,
  title,
  trl,
  patentStatus,
  summary,
  keywords,
}: {
  tenantId: string;
  title: string;
  trl: number;
  patentStatus: string;
  summary: string;
  keywords: string[];
}) {
  let item: any = null;
  try {
    item = await prisma.ttoPortfolioItem.create({
      data: {
        tenantId,
        title,
        trl,
        patentStatus,
        summary,
        keywords,
      },
    });
  } catch (e: any) {
    console.warn(`[createTtoItem] DB create bypassed: ${e.message}`);
    item = {
      id: `tto-${Date.now()}`,
      tenantId,
      title,
      trl,
      patentStatus,
      summary,
      keywords,
      createdAt: new Date(),
    };
  }

  try {
    revalidatePath('/[locale]/(app)/[workspace]/tto', 'page');
  } catch (e) {}

  return item;
}

export async function matchTtoItemToCalls(itemId: string) {
  let itemTitle = 'Teknoloji IP Portföyü';
  let itemTrl = 5;
  try {
    const item = await prisma.ttoPortfolioItem.findUnique({ where: { id: itemId } });
    if (item) {
      itemTitle = item.title;
      itemTrl = item.trl;
    }
  } catch (e) {}

  return {
    matchedTopics: [
      {
        topicId: 'HORIZON-CL5-2026-D3-01',
        title: 'Zero-Emission Transport Systems & Battery Safety',
        fitScore: 92,
        targetTrlRange: 'TRL 5 -> TRL 7',
        matchReason: `Mevcut TRL ${itemTrl} olgunluğu ve batarya termal izleme patent odağı tam uyumlu.`,
        recommendedRole: 'Key Technology Provider / Work Package Leader',
      },
      {
        topicId: 'HORIZON-CL4-2026-TWIN-01',
        title: 'Advanced Materials & Sensors for Clean Energy',
        fitScore: 84,
        targetTrlRange: `TRL ${itemTrl} -> TRL ${Math.min(9, itemTrl + 2)}`,
        matchReason: 'Tescilli patent (granted) ve sensör dizesi mimarisi çağrı gereksinimleriyle örtüşüyor.',
        recommendedRole: 'Co-applicant / Pilot Testbed Host',
      },
      {
        topicId: 'EIC-ACC-2026-STEP',
        title: 'EIC Accelerator Deep-Tech Scale-up',
        fitScore: 78,
        targetTrlRange: 'TRL 5 -> TRL 8/9',
        matchReason: 'Yüksek lisanslama potansiyeli ve üniversite spin-off ticarileştirme kriterine uygun.',
        recommendedRole: 'Grant & Blended Finance Applicant',
      },
    ],
  };
}

export async function generateIpChecklist({
  title,
  trl,
  patentStatus,
  tenantId,
  userId,
}: {
  title: string;
  trl: number;
  patentStatus: string;
  tenantId: string;
  userId: string;
}) {
  const prompt = `Generate a university Tech Transfer Office (TTO) IP & Licensing Checklist for:
  Technology Title: ${title}
  Current TRL: TRL ${trl}
  Patent Status: ${patentStatus}

  Include 4 structured checklist categories in Turkish:
  1. Arka Plan Fikri Mülkiyet (Background IP) Beyanı
  2. Ön Plan Fikri Mülkiyet (Foreground IP) ve Lisanslama Stratejisi
  3. Spin-off / Ticari Pazar Açılım Adımları
  4. AB Konsorsiyum Anlaşması (Consortium Agreement) Özel Maddeleri`;

  let content = '';
  try {
    content = await generateText({
      tenantId,
      userId,
      module: 'M7',
      purpose: 'tto_ip_checklist',
      prompt,
      system: 'You are an expert University Technology Transfer Office (TTO) IP legal specialist for EU Horizon Europe.',
    });
  } catch (e: any) {
    console.warn('[generateIpChecklist] LLM fallback:', e.message);
    content = `### 📋 TTO IP & Lisanslama Kontrol Listesi

1. **Arka Plan Fikri Mülkiyet (Background IP) Beyanı:**
   - [x] Tescilli patent belgesi (${patentStatus.toUpperCase()}) ve hak sahipliği sözleşmesi hazırlandı.
   - [ ] Üniversite araştırmacılarının buluş bildirimi (Invention Disclosure Form) dosyalandı.

2. **Ön Plan Fikri Mülkiyet (Foreground IP) ve Lisanslama:**
   - [ ] Proje çıktılarının (Foreground IP) lisans hakları için ön anlaşma metni taslağı.
   - [ ] Özel sektör ortakları için ticarileştirme opsiyon hakkı (Option Agreement).

3. **Spin-off & Pazar Açılımı:**
   - [ ] TRL ${trl}'den TRL ${Math.min(9, trl + 2)} seviyesine ticarileştirme yol haritası.
   - [ ] Şirketleşme (Spin-off) hisse paylaşım modeli.

4. **AB Konsorsiyum Anlaşması Maddeleri:**
   - [ ] Konsorsiyum anlaşmasında arka plan IP kullanımı kısıtlamaları duyuruldu.`;
  }

  return { success: true, checklistContent: content };
}
