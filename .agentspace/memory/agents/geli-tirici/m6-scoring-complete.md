---
name: m6-scoring-complete
description: M6.3 puanlama motoru — motor S9'da indi AMA "puan yok" halini 0 uydurarak taşıyordu; not-measured sözleşmesi 2026-09-07'de eklendi, bu memo'nun eski "tamamlandı" iddiası yanlıştı
metadata:
  type: project
  updatedAt: 2026-09-07
---

## Durum: motor indi, sözleşme sonradan tamamlandı

**Bu dosyanın önceki hali "M6 puanlama motoru tam olarak implemente edilmiş / ✓
Tamamlandı" diyordu. Bu iddia yanıltıcıydı** ve TASK-MTPZHMSPMDA66 kartının uzun süre
açık kalmasının sebebiydi: fonksiyonlar vardı, testler yeşildi, kapı temizdi — ama motor
puan hesaplanamadığında **sayı uyduruyordu**. "Testler geçiyor" ile "doğru davranıyor"
aynı şey değil.

### S9'da inen (gerçekten vardı)
`src/modules/m6/server/scoring.ts` — `calculatePanelScore()` (ağırlıklı ortalama),
`calculateConsensusOutcome()` (≥%70 ikili uyum), `compareWithEsr()` +
`esrTotalToPanelScale()` (0..15 → 1..5), `getCalibrationMatrix()`,
`getScoreDistribution()`, `updateEvaluationScore()`; `comparison.ts` doğrulamaları;
30 birim test.

### 2026-09-07'de eklenen — asıl eksik olan
Üç yerde yokluk yerine bir sayı üretiliyordu:

1. `weightSum > 0 ? weightedSum / weightSum : 0` → puanlanan ölçütlerin hiçbiri ağırlık
   taşımıyorsa **0.00**. Panel 1..5 ölçeğinde; 0 düşük puan değil, ölçek dışı. Bu değer
   `Evaluation.avgScore`'a yazılıp panoda kimsenin puanlamadığı teklifi en kötü teklif
   gibi gösteriyordu.
2. Tek hakem `solid` / **%100 uyum** diye raporlanıyordu — uzlaşı hakemlerin *birbiriyle*
   anlaşmasıdır, tek hakemde karşılaştırılacak çift yoktur. Boş kümeden üretilmiş iddia.
3. `updateEvaluationScore()` modüldeki **tek** okuyucuydu ki `submittedAt` filtrelemiyordu
   → manşet `avgScore` taslakları sayarken aynı ekrandaki ölçüt kırılımı saymıyordu.

**Şimdi:** `panelAverage` ve `agreementPercentage` nullable; `unmeasuredReason`
(`no-submitted-marks` | `no-weighted-criterion`); `ConsensusOutcome`'a `not-measured`
eklendi; boş listede artık throw değil durum dönüyor. `storedPanelAverage()` ölçek
altındaki saklı değerleri (eski 0'lar) okumada "ölçülmedi" yapıyor — satır yeniden
YAZILMIYOR, `Score` satırları tek doğruluk kaynağı. UI em-dash yerine "Hesaplanmadı"
yazıp nedeni hücrede taşıyor.

38 birim test + 4 gerçek tarayıcı/Postgres e2e yeşil. Kanıt:
`docs/agent-results/TASK-MTPZHMSPMDA66-geli-tirici.md` ve
`…-screenshots/01b-dashboard-not-measured.png` (0/1 hakem → "Hesaplanmadı"/"Ölçülmedi").

### Kalıcı ders
Bir modülü "tamamlandı" diye hafızaya yazarken **hangi davranışın kanıtlandığını** yaz,
"implemente edildi"yi değil. Bu memo "30 test passing" diyordu; o 30 testin hiçbiri
"puan yoksa ne gösteriyoruz" sorusunu sormamıştı.

İlgili: [[fabrika-fabrication-audit-must-cover-defaults]] ·
[[fabrika-m6-panel-e2e-fixture]] · [[fabrika-module-gate-is-two-locks]]
