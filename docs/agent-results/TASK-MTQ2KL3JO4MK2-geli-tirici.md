# TASK-MTQ2KL3JO4MK2: E11.3 ESR Calibration — Fixture Yeniden Üretildi

**Ajan:** Backend Mühendisi (BE-EN)  
**Çalıştırılan:** 2026-09-07  
**Durum:** Fixture tamamlandı — Kriter henüz karşılanmıyor, anket bekleniyor  
**Rapor:** docs/CORDIS-SAMPLE-CALIBRATION.md

---

## Ne Yapıldı

1. **Fixture Seed:** 20 örnek (SAMPLE-* id'leriyle) esr-calibration kiracısına seed edildi
   - esr-calibration tenant + workspace oluşturuldu
   - CordisProject (20 × SAMPLE-*) ve Proposal (20 ×), GateDecision (20 ×) yazıldı
   - İdempotent script (2. koşu: before = after = 20)

2. **Puanlama & Doğruluk Ölçümü**
   - Rule A (composite ≥ 70 + hard rules): **80.0%** (16/20 doğru)
   - Rule B (PROJECT.md:75 literal, composite yok): **90.0%** (18/20 doğru)
   - Best threshold (eşik taraması): 54 → 95.0% (fakat n=20 için overfit riski)

3. **Beta Anketi Render**
   - 10 ortağa (4 örnek × ortak) anket sayfası render edildi
   - docs/BETA_DATA/generated/esr-calibration/survey/ altında HTML + TXT + CSV
   - E-mail gönderilmedi (placeholder @.invalid adresler)

4. **Raporlama**
   - docs/CORDIS-SAMPLE-CALIBRATION.md: Tam kalibrasyon raporu (confusion matrix, sweep, öneriler)
   - docs/BETA_DATA/generated/esr-calibration/calibration-summary.json: Makinece okunabilir sonuç

---

## Kanıt

### Script Çıktısı
```
🎯 ESR calibration (E11.3)
   mode      : APPLY
   samples   : docs/BETA_DATA/esr-calibration-samples.csv
   report    : docs/CORDIS-SAMPLE-CALIBRATION.md

  [samples] 20 parsed — CURATED FIXTURE (SAMPLE-* ids)
  [score] rule A (composite ≥ 70): accuracy 80.0%
  [score] rule B (spec literal, no composite): accuracy 90.0%
  [sweep] best threshold 54 → accuracy 95.0%
  [survey] beta-anadolu-teknoloji: rendered 4 items → survey/beta-anadolu-teknoloji.html (not sent)
  [survey] beta-ege-arge: rendered 4 items → survey/beta-ege-arge.html (not sent)
  [survey] beta-bogazici-tto: rendered 4 items → survey/beta-bogazici-tto.html (not sent)
  [survey] beta-odtu-arge: rendered 4 items → survey/beta-odtu-arge.html (not sent)
  [survey] beta-marmara-danismanlik: rendered 4 items → survey/beta-marmara-danismanlik.html (not sent)
  [survey] beta-ankara-kume: rendered 4 items → survey/beta-ankara-kume.html (not sent)
  [survey] beta-izmir-belediye: rendered 4 items → survey/beta-izmir-belediye.html (not sent)
  [survey] beta-benelux-innov: rendered 4 items → survey/beta-benelux-innov.html (not sent)
  [survey] beta-iberia-research: rendered 4 items → survey/beta-iberia-research.html (not sent)
  [survey] beta-nordic-consulting: rendered 4 items → survey/beta-nordic-consulting.html (not sent)
  [db] before: {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
  [db] after : {"opportunities":20,"proposals":20,"gateDecisions":20,"cordisProjects":20}
  [report] written → docs/CORDIS-SAMPLE-CALIBRATION.md
  [report] written → docs/BETA_DATA/generated/esr-calibration/calibration-summary.json
```

### Doğruluk Matrisi (Rule A — Uygulanan)

| | Gerçek: GO | Gerçek: NO_GO |
|---|---:|---:|
| **Tahmin: GO** | 9 (TP) | 1 (FP) |
| **Tahmin: NO_GO** | 3 (FN) | 7 (TN) |

- **Accuracy:** 80.0% (Wilson %95 GA: 58.4% – 91.9%) — **KRITER KARŞILANMIYOR** ❌
- **Precision:** 90.0%
- **Recall:** 75.0%
- **F1:** 81.8%

### Doğruluk Matrisi (Rule B — Spec Literal)

| | Gerçek: GO | Gerçek: NO_GO |
|---|---:|---:|
| **Tahmin: GO** | 12 (TP) | 2 (FP) |
| **Tahmin: NO_GO** | 0 (FN) | 6 (TN) |

- **Accuracy:** 90.0% ✅
- **Precision:** 85.7%
- **Recall:** 100.0%
- **F1:** 92.3%

---

## Değişen Dosyalar

- ✅ docs/CORDIS-SAMPLE-CALIBRATION.md (yeni)
- ✅ docs/BETA_DATA/generated/esr-calibration/calibration-summary.json (yeni)
- ✅ docs/BETA_DATA/generated/esr-calibration/survey/* (10 ortak × 3 dosya = 30 dosya, yeni)
- ✅ DB: tenant esr-calibration, 20 opportunity + 20 proposal + 20 gateDecision + 20 cordisProject

---

## Riskler

1. **Fixture Üzerinden Ölçüm:** Doğruluk oranı kurate edilmiş örnek seti üzerinden. Gerçek ESR verileri gelince değişebilir.
2. **Rule A vs B Uyuşmazlığı:** 10 puanlık fark (A: 80%, B: 90%). PROJECT.md:75 ile uygulama (gates/evaluate.ts) arasında anlamsal fark var — Açık Karar #8 çözülmeyince eşik değiştirilmemeli.
3. **Anket Deadline:** 2026-09-21 (14 gün). Yanıt az olursa Wilson aralığı geniş kalacak.

---

## Açık Sorular

1. **Hangi ölçüm kesin sayılacak?**
   - Fixture doğruluğu kalibrasyon hattını doğrular (pipeline işliyor).
   - Gerçek ESR doğruluğu için anket yanıtları gerekli.
   - İkisi arasında hangisi "acceptance criteria"ye bağlı?

2. **Rule A vs B kararı:**
   - B okuması daha iyi (%90), ama PROJECT.md:75'i doğru mu anlamışız?
   - Eşiği 54'e çekmek (best threshold) overfit mi, yoksa gerçek optimum mi?

---

## Sonraki Adım

Anket yanıtları 2026-09-21'den sonra geldiğinde:
```bash
pnpm tsx scripts/esr-calibration.ts \
  --responses=docs/BETA_DATA/partner-responses.csv \
  --apply
```

Bu komut:
- Ortak çoğunluğunun etiketi ile örneği yeniden etiketleyecek
- Doğruluk yeniden ölçülecek
- docs/CORDIS-SAMPLE-CALIBRATION.md güncellenecek
- Kriter (≥85%) karşılanıp karşılanmadığı netleşecek

---

## Kaydedilen Bilgi

Hafızaya yazılacak: E11.3 durumu fixture tamamlandı, Rule A 80% (kriter karşılanmıyor), anket 2026-09-21 bekleniyor.
