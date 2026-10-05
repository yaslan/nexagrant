---
name: an-audits-best-finding-hides-in-a-passing-clause
description: Bir kural denetiminde en degerli bulgu ihlal edilen maddede degil, GECEN maddenin ic tutarsizliginda cikar — madde madde hukum ver, PASS'i de kanitla
metadata:
  type: feedback
  updatedAt: 2026-09-09
---

Çok maddeli bir kuralı denetlerken ("rule 5 ihlal ediliyor mu") iki refleks de yanlış:
tek bir PASS/FAIL vermek, ve yalnız FAIL çıkan maddeyi raporlamak.

**Madde madde hüküm ver.** CLAUDE.md rule 5'in beş ayrı iddiası var (tek çıkış noktası ·
her çağrı loglanır · tek fiyat formülü · ikinci adaptör yok · prompt'lar dosyada). Dördü
geçti, biri (prompt'lar) düştü. "Rule 5 ihlal ediliyor" da "rule 5 tamam" da yalan olurdu.

**PASS'ı da kanıtla.** Geçen madde için grep çıktısını raporlamak, "eski regresyon
kapandı"yı commit mesajından varsaymak yerine ölçmek demektir — denetimin asıl ürünü budur.

**Ve asıl bulgu orada çıkar.** En değerli iki şey ihlal edilen maddeden gelmedi:
- `embedText` sağlayıcı çağrısından sonra log yazamazsa ADI OLAN bir hata fırlatıyor
  (`AiUsageLogWriteError`), `generateCompletion` fırlatmıyor — ikisi de "her çağrı
  loglanır" maddesini GEÇİYOR, ama biri ötekinin kapattığı deliği açık tutuyor. İki
  kardeş yol arasındaki ASİMETRİ, tek yolun ihlalinden daha çok şey söyler.
- Silinen bir kopya (`src/lib/ai/llm.ts`) bir alt katmanda kopyasını bırakabilir:
  `src/lib/ai/rag.ts` sağ kaldı ve `src/lib/rag.ts` ile aynı korpusu FARKLI chunk
  boyutunda (1000 vs 1500) yazıyor. Kural ihlali değil, kuralın yazılma SEBEBİ.

Kapsam dışı ama gerçek bir delik görürsen (burada: m2/m7/m10 `assertModuleAccess` olmadan
kredi harcıyor — rule 4) raporla, araştırma; ayrı kart öner. Denetim salt-okunur kalır.

İlgili: [[fabrika-a-count-is-not-coverage]] · [[fabrika-two-way-evidence-for-guard-tests]]
