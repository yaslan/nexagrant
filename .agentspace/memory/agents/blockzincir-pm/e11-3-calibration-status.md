---
name: e11-3-calibration-status
description: E11.3 ESR calibration — fixture 80%, real accuracy pending (2026-09-20)
metadata:
  type: project
  updatedAt: 2026-09-07
---

## E11.3 ESR Calibration: Durumu

**Başarı kriteri:** G0 accuracy ≥ %85

**Mevcut ölçüm (fixture, 20 örnek):**
- Rule A (composite ≥ 70 + 3 hard rules): **80.0%** ← **KRİTER KARŞILANMIYOR**
- Rule B (PROJECT.md:75 literal reading): 90.0%
- Best threshold (sweep 40–90): 54 → 95.0%

**Yanlış sınıflandırmalar (A kuralı):**
- FN=3: S04 CULTHER (64.6 score < 70), S07 BATTREC (59.55), S10 HEALTHEQ (54.53) — tümü gerçekte GO (above_threshold/reserve)
- FP=1: S19 NETSUPP (74.90, high base rate) — gerçekte NO_GO (below)

**Beta ortak anketi:**
- Gönderiliyor: 10 ortağa 4'er örnek, round-robin (her örnek 2 görüş)
- Yanıt son tarihi: **2026-09-20**
- Şu anki durum: render edildi, yer tutuculu adreslerden gönderilemedii (emniyete)
- Yanıtlar alındığında: `pnpm beta:esr-calibration --responses=<csv>` koşulup doğruluk yeniden ölçülecek

**Sonraki durum:** Anket yanıtları 2026-09-20'den sonra gelene kadar kart `review` durumunda kalacak.

## Bilgi kaynakları
- Komut çıktısı: docs/CORDIS-SAMPLE-CALIBRATION.md (üretilmiş)
- Ölçüm matematiği: src/lib/scoring/calibration.ts, tests/esr-calibration.test.ts
- Anket: src/lib/beta/esr-survey.ts, docs/BETA_DATA/beta-partners.csv
