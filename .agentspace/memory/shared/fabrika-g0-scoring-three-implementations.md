---
name: fabrika-g0-scoring-three-implementations
description: G0'ın üç çelişkili gerçekliğinden ikisi 2026-09-07'de silindi; geriye PROJECT.md'nin 7 faktörlü modeli kaldı ama 70 eşiğinin bileşiğe mi uyum alt-skoruna mı ait olduğu hâlâ açık karar #8
metadata:
  type: project
  updatedAt: 2026-09-07
---

Fabrika'da "G0 skoru" uzun süre tek bir şey değildi; üç ayrı yerde üç farklı tanım yaşıyordu.
**2026-09-07 itibarıyla yalnız 3. madde canlı** — ilk ikisi silindi. Dosya tarihçe olarak duruyor,
çünkü eski raporlar ve kartlar hâlâ o iki modele atıf yapıyor.

1. ~~**Rastgele sayı**~~ — `pipeline/actions.ts` içindeki `Math.floor(Math.random() * 15 + 80)`
   **2026-09-07'de silindi**; artık kanonik yoldan hesaplanıyor.
2. ~~**`src/lib/scoring/g0.ts:calculateG0Score`**~~ — 4 faktörlü 0–10 model, referanssız ölü koddu,
   **2026-09-07'de dosyayla birlikte silindi**. Ölçek çelişkisi (7.5 < 70) böylece kapandı.
3. **PROJECT.md:81'in bağlayıcı tanımı** — 7 faktör / 100 puan (uyum 30, taban oran 15, koordinatör
   geçmişi 15, araştırma+son kullanıcı 12, ağ merkeziliği 10, bütçe/rol ekonomisi 10,
   lump-sum/iki aşamalı 8). Ağırlıklar `src/lib/scoring/defaults.ts`'te duruyordu ama **onları
   kullanan fonksiyon yoktu**; E11.3'te `src/lib/scoring/g0-canonical.ts` olarak yazıldı
   (`scoreG0` + `decideG0`).

**Çözülmemiş belirsizlik (ROADMAP · Açık kararlar #8):** PROJECT.md:75 kapıyı "uyum ≥ 70 **ve**
taban oran ≥ %8 **ve** ülke uygun" diye tanımlıyor — yani 70 **uyum alt-skoruna** ait ve bileşik
skorun eşiği yok. `/settings/gates` ekranı da aynı sayıyı "Minimum AI Alignment Score" diye
etiketliyor. Ama `gates/evaluate.ts` 70'i **bileşik** skora uyguluyor. E11.3 kalibrasyonunda bu iki
okuma arasında 20 örnek üzerinde **10 puanlık doğruluk farkı** ölçüldü (bileşik eşik %80, düz okuma
%90); bileşik eşik, ESR eşiğini gerçekten geçmiş 3 teklifi eliyordu.

**Why:** üç tanım aynı isimle dolaştığı için "G0 skorunu düzelt" gibi bir görev kolayca yanlış
dosyayı hedefler; ayrıca kapı davranışını değiştirmek ürün kararı gerektiriyor, kod kararı değil.

**How to apply:** yeni bir hesap yazma. Puanlama gerekiyorsa `g0-compute.ts`'i çağır
(`computeG0ForOpportunity` / `rescoreOpportunityG0`); özellikleri kayıtlardan çıkaran katman
`g0-features.ts`, matematiği `g0-canonical.ts`. Bkz. [[fabrika-g0-score-never-computed]].
Kapı eşiğini değiştirmeden önce Açık karar #8'in kapandığını doğrula. Ölçüm için hazır hat var:
`pnpm beta:esr-calibration` (bkz. `docs/CORDIS-SAMPLE-CALIBRATION.md`). Aynı "ikiye bölünmüş metrik"
deseni için [[fabrika-m5-kpi-duplicate-implementations]] ve [[fabrika-g0-conversion-rate-formula]].
