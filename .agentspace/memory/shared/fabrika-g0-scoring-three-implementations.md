---
name: fabrika-g0-scoring-three-implementations
description: G0 skoru için üç ayrı ve çelişkili gerçeklik var (rastgele sayı, 0-10 model, PROJECT.md'nin 0-100 ağırlıkları) ve 70 eşiğinin hangisine uygulandığı karara bağlı
metadata:
  type: project
  updatedAt: 2026-09-06
---

Fabrika'da "G0 skoru" tek bir şey değil; üç ayrı yerde üç farklı tanım yaşıyor. Bir görev
G0 puanlamasına dokunuyorsa önce hangisinin canlı olduğuna bak.

1. **Ürünün gerçekten yazdığı değer:** `src/app/[locale]/(app)/[workspace]/pipeline/actions.ts`
   içinde `Math.floor(Math.random() * 15 + 80)`. `Opportunity.g0Score`'a yazılan sayı **rastgele**.
   Panoda ve kapı kararında görünen skor budur.
2. **`src/lib/scoring/g0.ts:calculateG0Score`** — 4 faktörlü, **0–10** skalalı ayrı bir model.
   `gates/evaluate.ts` bunu yalnız yedek (fallback) olarak kullanıyordu ve sonucunu 0–100'lük
   `minScore: 70` eşiğiyle karşılaştırıyordu (7.5 < 70), yani puanlanmamış her fırsat uydurma bir
   gerekçeyle düşüyordu. E11.3'te bu dal düzeltildi ("skor henüz hesaplanmadı" der).
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

**How to apply:** yeni bir dördüncü hesap yazma. Puanlama gerekiyorsa `g0-canonical.ts`'i çağır.
Kapı eşiğini değiştirmeden önce Açık karar #8'in kapandığını doğrula. Ölçüm için hazır hat var:
`pnpm beta:esr-calibration` (bkz. `docs/CORDIS-SAMPLE-CALIBRATION.md`). Aynı "ikiye bölünmüş metrik"
deseni için [[fabrika-m5-kpi-duplicate-implementations]] ve [[fabrika-g0-conversion-rate-formula]].
