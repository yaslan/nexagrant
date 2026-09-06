---
name: fabrika-feedback-triage-e11
description: E11.2 beta geri bildirim sistemi — öncelik kuralları nerede, SLA sayıları rehberle bağlı, autoPriority neden korunuyor
metadata:
  type: project
  updatedAt: 2026-09-06
---

E11.2'de kurulan beta geri bildirim + triyaj sistemi (`TASK-MTQ3DLVLT42VF`). İleride buna
dokunacak olan için kalıcı olanlar:

**Öncelik kuralı üç katmanlı** (`src/lib/feedback/triage.ts`, saf fonksiyon):
1. Bildirenin etki beyanı taban verir (BLOCKER→P0 … IDEA→P3).
2. Metindeki TR/EN anahtar kelimeler **yükseltir** (veri kaybı, kiracı sızıntısı, giriş
   yapılamıyor, tam kesinti → P0).
3. Kategori **tavan** koyar: FEATURE_REQUEST asla P3'ün, UX/OTHER asla P2'nin, PERFORMANCE asla
   P1'in üstüne çıkamaz. BUG ve DATA_QUALITY'de tavan yok.

Hangi kuralın çalıştığı `triageReason` alanına yazılır (`keyword:data-loss`,
`impact:BLOCKER>capped:UX`). Karar denetlenebilir olsun diye — ve kural yanlışsa hangisi olduğu
görünsün diye.

**`autoPriority` asla ezilmez.** İnsan `priority`'yi değiştirdiğinde kuralın ilk kararı satırda
kalır. `autoPriority ≠ priority` olan satırlar = kuralların yanıldığı yerler; beta boyunca
kalibrasyon verisi bu.

**SLA sayıları koda gömülü DEĞİL, rehberle bağlı.** `PRIORITY_SLA_HOURS` (P0:2, P1:24, P2:48,
P3:168) `docs/BETA_GUIDE.md § 5` tablosunu izler — o tablo ortaklara verilmiş taahhüt. Bir test
eşitliği sabitliyor; ikisi **birlikte** değişir. (İlk yazdığımda kod 4 saat diyordu, rehber
2 saat; rehberi doğru kabul edip kodu uydurdum.)

**Türkçe eşleştirme:** `normalise()` küçük harfe çevirip diakritikleri katlıyor
(`veri kaybı` → `veri kaybi`), böylece tek terim listesi iki yazımı da yakalıyor.
`toLocaleLowerCase('tr-TR')` şart — aksi halde `İ` yanlış katlanıyor.

**i18n-check tuzağı:** `t(\`category${c}\`)` gibi interpolasyonlu anahtar `scripts/i18n-check.ts`
tarafından görülmez, iki dilde birden "eksik anahtar" olarak raporlanır ve gate 1 döner.
`switch` ile literal `t('categoryBUG')` çağrılarına çevir.

İlgili: [[fabrika-sentry-envelope-without-sdk]] · [[fabrika-runtime-verification-recipe]] ·
[[fabrika-parallel-agent-file-race]]
