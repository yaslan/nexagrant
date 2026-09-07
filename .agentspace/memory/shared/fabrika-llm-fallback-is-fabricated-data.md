---
name: fabrika-llm-fallback-is-fabricated-data
description: LLM çağrısı düşünce yazılan "yedek" metin uydurma veridir — anahtar geçersizken (401) kullanıcının gördüğü TEK içerik odur; iddia içermeyen taslak yaz, kredi düşme, taslak olduğunu söyle
metadata:
  type: feedback
  updatedAt: 2026-09-07
---

`try { generateText(...) } catch { içerik = sabit metin }` kalıbı bu depoda **uydurma veri
üretme** kalıbıdır (CLAUDE.md md. 7 + `tests/fabricated-fallbacks.test.ts`). Sebep: bu makinede
`ANTHROPIC_API_KEY` geçersiz, `anthropic.messages.create` **401** dönüyor ve `withRetry`
istemci hatasında hemen fırlatıyor → **her çağrı yedeğe düşüyor**. Yani "nadir bir hata yolu"
sandığın metin, kullanıcının gördüğü tek metindir.

M9'da (2026-09-07) yedek, ortak hakkında ölçülmemiş iddialar yazıyordu — "Recognized participant
in EU Framework Programmes with strong technical capacity", "12 - 18 Person-Months" — ve
`CreditLedger`'dan **1 AI kredisi düşülüyordu**; başlıkta "1 AI Kredi / Brief" yazdığı hâlde
yapay zeka hiç çalışmamıştı.

Uygulanan kalıp (`src/modules/m9/brief-template.ts` + `server/actions.ts`):
1. `aiGenerated` bayrağı tut; yedek yoluna düşünce `false`.
2. Yedek içerik **iddia değil soru** olsun (doldurulacak boş çalışma belgesi).
3. `aiGenerated === false` iken **kredi düşme**.
4. İçeriğin ilk satırına makine işareti koy (`<!-- fabrika:template-draft -->`) → yeniden
   yükleme/yazdırma/.ics sonrası da taslak olduğu bilinir; şema değişikliği gerekmez.
5. Kullanıcıya görünen cümle **mesaj kataloğundan** gelsin (işaret asla ekrana çıkmaz);
   `role="status"` amber bant + listede "Taslak" rozeti.

Aynı kalıbı taşıyan başka modüller olabilir: `grep -rn "LLM call fallback\|catch" src/modules/*/server`
ile bak; yedeğin ölçülmemiş bir sayı/iddia içeriyorsa aynı beş adımı uygula.

İlgili: [[fabrika-g0-evidence-placeholder-laundering]]
