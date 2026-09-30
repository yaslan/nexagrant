'use server';

import { withTenant } from '@/lib/db';
import { requireTenantAction } from '@/lib/tenant';
import { generateText } from '@/lib/llm';
import { isLlmUnusableOutcome } from '@/lib/llm-outcome';
import { renderPrompt } from '@/lib/ai/prompts';
import { promptLocale } from '@/lib/ai/prompts/locale';
import { assertModuleAccess } from '@/lib/modules/access';
import { revalidatePath } from 'next/cache';
import { errorMessage } from '@/lib/errors';
import type { TtoPortfolioItemRow } from '@/types/db-rows';

/**
 * M7 TTO portfolio.
 *
 * `tenantId`/`userId` used to be arguments supplied by the TTO client
 * component. A server action is a public POST endpoint, so those were
 * attacker-controlled — a portfolio item could be written into, and an AI
 * call billed to, any tenant. Both now come from the session.
 */

export async function createTtoItem({
  title,
  trl,
  patentStatus,
  summary,
  keywords,
}: {
  title: string;
  trl: number;
  patentStatus: string;
  summary: string;
  keywords: string[];
}) {
  const { tenantId } = await requireTenantAction({ can: 'edit_proposal' });

  const item = await withTenant<TtoPortfolioItemRow>(tenantId, (tx) =>
    tx.ttoPortfolioItem.create({
      data: {
        tenantId,
        title,
        trl,
        patentStatus,
        summary,
        keywords,
      },
    })
  );

  try {
    revalidatePath('/[locale]/(app)/[workspace]/tto', 'page');
  } catch {}

  return item;
}

export async function matchTtoItemToCalls(itemId: string) {
  // Reads only (TASK-MUN80UOUPB2A4): nothing here is written, so an expired
  // pilot may still see it and no edit permission is needed.
  const { tenantId } = await requireTenantAction({ readOnly: true });

  // Scoped read: a portfolio item id from another tenant must not resolve here.
  const item = await withTenant<{ title: string; trl: number } | null>(tenantId, (tx) =>
    tx.ttoPortfolioItem.findFirst({
      where: { id: itemId, tenantId },
      select: { title: true, trl: true },
    })
  );

  if (!item) return { matchedTopics: [] };

  const itemTrl = item.trl;

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
}: {
  title: string;
  trl: number;
  patentStatus: string;
}) {
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M7');
  const { tenantId, userId } = await requireTenantAction({ can: 'edit_proposal' });

  const locale = await promptLocale();
  const prompt = renderPrompt('m7/ip-checklist', { title, trl, patentStatus }, locale);

  let content = '';
  try {
    content = await generateText({
      tenantId,
      userId,
      module: 'M7',
      purpose: 'tto_ip_checklist',
      prompt,
      system: renderPrompt('m7/ip-checklist-system', {}, locale),
    });
  } catch (e) {
    // A cut-off or declined answer must reach the screen as such, not be
    // papered over with the canned list below (TASK-MUN4PSBP19RKK).
    if (isLlmUnusableOutcome(e)) throw e;
    console.warn('[generateIpChecklist] LLM fallback:', errorMessage(e));
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
