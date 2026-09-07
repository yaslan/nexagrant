---
name: e11-3-calibration-status
description: E11.3 ESR Calibration — Fixture tamamlandı, Rule A 80% (kriter karşılanmıyor), anket 2026-09-21 bekleniyor
metadata:
  type: project
  updatedAt: 2026-09-07
---

## E11.3 ESR Calibration: Durumu

**Başarı kriteri:** G0 accuracy ≥ %85

**Mevcut ölçüm (fixture, 20 örnek, TASK-MTQ2KL3JO4MK2):**
- Rule A (composite ≥ 70 + 3 hard rules): **80.0%** ← **KRİTER KARŞILANMIYOR** ❌
  - TP=9, FP=1, FN=3, TN=7
  - Precision 90%, Recall 75%, F1 81.8%
- Rule B (PROJECT.md:75 literal, composite yok): **90.0%** ✅
  - TP=12, FP=2, FN=0, TN=6
  - Precision 85.7%, Recall 100%, F1 92.3%
- Best threshold (eşik taraması): 54 → 95.0% (fakat n=20 için overfit riski)

**Yanlış sınıflandırılan (Rule A):**
1. S04 CULTHER — skor 64.60 < 70, tahmin NO_GO ama gerçek GO (above_threshold)
2. S07 BATTREC — skor 59.55 < 70, tahmin NO_GO ama gerçek GO (reserve)
3. S10 HEALTHEQ — skor 54.53 < 70, tahmin NO_GO ama gerçek GO (above_threshold)
4. S19 NETSUPP — skor 74.90, tahmin GO ama gerçek NO_GO (below) — yüksek baseRate sorunu

**Beta anketi:**
- 10 ortağa render edildi (4 örnek × ortak)
- docs/BETA_DATA/generated/esr-calibration/survey/ altında
- Yanıt deadline: **2026-09-21** (14 gün)

**Sonraki adım:**
Anket yanıtları alındığında:
```bash
pnpm tsx scripts/esr-calibration.ts \
  --responses=docs/BETA_DATA/partner-responses.csv \
  --apply
```

Bu komut:
- Ortak çoğunluğunun etiketi ile yeniden etiketleyecek
- Doğruluk yeniden ölçülecek
- Kriter (≥85%) karşılanıp karşılanmadığı netleşecek

**Açık belirsizlik:** PROJECT.md:75 okuması (Rule B) ile gates/evaluate.ts (Rule A) arasında 10 puanlık doğruluk farkı. Açık Karar #8'de kayıtlı — kapatılmadan eşik değiştirilmemeli.

**Rapor:** docs/agent-results/TASK-MTQ2KL3JO4MK2-geli-tirici.md
