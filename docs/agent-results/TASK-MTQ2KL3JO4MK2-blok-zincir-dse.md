# E11.3 ESR Calibration — Fixture Yeniden Üretme

**Ajan:** DSE-EN (Designer) · **Tip:** runtime · **Görev:** TASK-MTQ2KL3JO4MK2 · **Sprint:** S10

## Yapılanlar

1. **Fixture yeniden üretimi:** S10 çökümünde silinmiş olan `esr-calibration` kiracısı ve 20 örnek fırsat, `pnpm beta:esr-calibration --apply` ile veritabanına yazıldı (idempotent upsert).

2. **Doğruluk ölçümleri:**
   - **A kuralı** (bileşik skor ≥70 + 3 sert kural): **80.0%** ← kriter %85 **karşilanmıyor**
   - **B kuralı** (PROJECT.md:75 düz okuması): **90.0%** ✅
   - **En iyi eşik** (tarama): 54 → **95.0%** (Wilson aralığı geniş, overfit riski)

3. **Beta ortak anketi:** 10 ortak için 40 anket maddesine (4 örnek/ortak) çalışma sayfaları render edildi. Son tarih: **2026-09-21**. Yanıtlar bekleniyor.

4. **Rapor çıktısı:** `docs/CORDIS-SAMPLE-CALIBRATION.md` — kural A/B karşılaştırması, karışıklık matrisi, eşik taraması, 4 yanlış sınıflandırma analizi ve üç-bant tasarım önerisi.

## Kanıt

Veritabanı yazılması başarılı:
```
[db] before: {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
[db] after : {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
[report] written → docs/CORDIS-SAMPLE-CALIBRATION.md
```

Doğruluk ölçümleri (A kuralı — kiter karşılanmıyor):
```
[score] rule A (composite ≥ 70): accuracy 80.0%
[score] rule B (spec literal, no composite): accuracy 90.0%
[sweep] best threshold 54 → accuracy 95.0%
```

## Değişen dosyalar

- **Veritabanı:** `Opportunity` (20), `Proposal` (20), `GateDecision` (20), `CordisProject` (20) upsert edildi
- **Raporlar:**
  - `docs/CORDIS-SAMPLE-CALIBRATION.md` — ölçüm raporu
  - `docs/BETA_DATA/generated/esr-calibration/calibration-summary.json` — makine-okunabilir özet
  - `docs/BETA_DATA/generated/esr-calibration/survey/*.{html,txt,csv}` — 10 ortak anket maddesi

## Riskler

1. **Fixture doğruluğu < kriter:** A kuralı %80 (kriter %85). B kuralı %90 olduğundan kural tercihinde fark var. Rapor şunu belirtiyor: "PROJECT.md:75 kapıyı üç sert kural olarak tanımlıyor, ayarlar ekranı aynı sayıyı etiketliyor, `gates/evaluate.ts` ise bileşik skora uyguluyor — üçü aynı değil, %10 doğruluk farkı var."
2. **Ortak anketi yanıtları:** Son tarih 2026-09-21 (iki haftaya). Yanıtlardan sonra `pnpm beta:esr-calibration --responses=<csv>` ile rapor yeniden üretilecek. O zamana kadar görev **bloke durumda kalır.**

## Açık sorular

1. **Kural seçimi:** A ve B arasındaki %10'luk doğruluk farkının kim çözeceği belirtilmiş mi? Rapor "Açık kararlar #8" referansı veriyor.
2. **Anket yanıt süresi:** 2026-09-21'e kadar yanıt alınamadığında plan nedir?

## Sonraki adım

Bloke durumda, ortak anket yanıtları bekleniyor. Yanıtlar geldiğinde:
```
pnpm beta:esr-calibration --responses=docs/BETA_DATA/generated/esr-calibration/responses.csv
```
Rapor otomatik yeniden üretilir ve doğruluk yeniden ölçülür. Criteron sağlanıp sağlanmadığı kontrol edilir.
