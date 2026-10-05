---
name: e11-3-calibration-status
description: E11.3 ESR Calibration mevcut durumu (fixture yeniden üretildi, doğruluk ölçümleri tamamlandı, ortak anketi yanıtları bekleniyor)
metadata:
  type: project
  updatedAt: 2026-09-07
---

# E11.3 ESR Calibration: Durumu

**Başarı kriteri:** G0 accuracy ≥ %85

**Mevcut ölçüm (fixture, 20 örnek):**
- Rule A (composite ≥ 70 + 3 hard rules): **80.0%** ← **KRİTER KARŞILANMIYOR**
- Rule B (PROJECT.md:75 literal okuması): **90.0%** ✅
- Best threshold sweep: 54 → **95.0%** (Wilson %95 aralığı 51.4–98.5%, n=20 için overfit riski)

**Kural tercihinde fark:** Rapor belirttiği üzere PROJECT.md:75 kapısı, ayarlar ekranı ve gates/evaluate.ts üçü farklı kuralları uyguluyor — A ile B arasında %10 doğruluk farkı var. Karar #8 "Açık kararlar"da kayıtlı.

**Fixture durum:** 
- S10 çökümünde silinmişti → 2026-09-07 `pnpm beta:esr-calibration --apply` ile yeniden yazıldı
- Opportunity/Proposal/GateDecision/CordisProject: 20/20 her biri
- Rapor: `docs/CORDIS-SAMPLE-CALIBRATION.md`

**Beta ortak anketi:**
- 10 ortak × 4 örnek = 40 anket maddesi
- Son tarih: **2026-09-21**
- Yanıtlar geldiğinde: `pnpm beta:esr-calibration --responses=<csv>` ile rapor yeniden üretilir

**Kural uygulaması (2026-09-07):** Açık karar #8 'bileşik skor + hard rules' uygulanmış — `src/lib/scoring/defaults.ts`'e minAlignment eklendi, `src/lib/gates/evaluate.ts`'de hard rules kontrol mekanizması eklendi, testler ✓.

**Sonraki adım:** Ortak yanıtları bekleniyor (2026-09-21). O zamana kadar görev **BLOKE** durumda kalır. Yanıtlardan sonra doğruluk %85 sağlanıp sağlanmadığı tekrar ölçülecek (raporlar `pnpm beta:esr-calibration --responses=<csv>` ile otomatik yeniden üretilir).
