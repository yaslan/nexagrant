# TASK-MTPZHMSPMDA66 — M6.3 Puanlama Mantığı ve Hesaplama Motoru

**Ajan:** BE-EN (`geli-tirici`) · **Sprint:** S9 · **Commit:** `47d8a5c`

## 0. Kartın ZATEN inmiş olan kısmı (ölçüm, iddia değil)

Karta başlamadan `src/modules/m6` ölçüldü. **Motorun büyük kısmı zaten inmişti** —
sıfırdan yazılmadı. `git log -- src/modules/m6` üç ilgili commit gösteriyor
(`f485bbb` puanlama+consensus, `c8f6f9f` hesaplama motoru, `b6ed409` temizlik).

Ölçüm sonucu, kartın maddeleri karşısında:

| Kart maddesi | Durum | Kanıt |
|---|---|---|
| Ağırlıklı panel ortalaması | **ZATEN VARDI** | `calculatePanelScore()`, scoring.ts |
| Consensus kuralı (≥%70 ikili uyum) | **ZATEN VARDI** | `calculateConsensusOutcome()` |
| ESR karşılaştırma + 0..15 → 1..5 ölçek | **ZATEN VARDI** | `compareWithEsr()`, `esrTotalToPanelScale()` |
| Kalibrasyon matrisi, puan dağılımı | **ZATEN VARDI** | `getCalibrationMatrix()`, `getScoreDistribution()` |
| Puanın DB'ye yazılması | **ZATEN VARDI** | `updateEvaluationScore()` |
| Puanlama fonksiyonu birim testi | **ZATEN VARDI** (30 test yeşil) | `npx vitest run src/modules/m6` → 30 passed |
| "İç ön değerlendirme" etiketi | **ZATEN VARDI** | `m6-internal-badge`, iki dilde e2e ile korunuyor |
| **Puan hesaplanamadığında 0 göstermeme** | **EKSİKTİ — bu görevin işi** | aşağıda |

Yani kartın "hesaplama motoru" kısmı inmişti; **eksik olan, motorun "puan yok" halini
0 uydurmadan taşıyabilmesiydi.** Yapılan iş budur.

## 1. Ne yapıldı

Üç ayrı yerde motor, olmayan bir puanın yerine bir sayı **üretiyordu**:

1. `calculatePanelScore()` içindeki `weightSum > 0 ? weightedSum / weightSum : 0` —
   hakemin puanladığı ölçütlerin hiçbiri ağırlık taşımıyorsa sonuç **0.00** oluyordu.
   Panel 1..5 ölçeğinde puanlanır; 0 düşük puan değil, **ölçek dışıdır**. Bu 0
   `Evaluation.avgScore`'a yazılıp panoda kırmızı bir farkla birlikte görünüyor,
   kimsenin puanlamadığı teklif çalışma alanının en kötü teklifi gibi okunuyordu.
2. `calculateConsensusOutcome()` tek hakemi `solid` / **%100 uyum** diye raporluyordu.
   Uzlaşı, hakemlerin *birbiriyle* anlaşmasıdır; tek hakemde karşılaştırılacak çift
   yoktur — iddia boş bir kümeden üretiliyordu.
3. `updateEvaluationScore()` modüldeki **tek** okuyucuydu ki `submittedAt` filtresi
   uygulamıyordu. Yani manşet `avgScore` taslakları da sayarken, aynı ekrandaki
   ölçüt-bazlı kırılım yalnızca gönderilmiş puanları sayıyordu — iki farklı popülasyon.

Yapılan değişiklik: **yokluk motordan yokluk olarak çıkıyor.**
`panelAverage` ve `agreementPercentage` artık nullable; `unmeasuredReason` hangi
yokluk olduğunu adlandırıyor (`no-submitted-marks` / `no-weighted-criterion`);
`not-measured` consensus sonuçlarına katıldı. `calculatePanelScore()` boş listede
artık **throw etmiyor**, durumu döndürüyor — guard'ı unutan bir çağıran ne sayfayı
düşürebilir ne de sayı uydurabilir.

`storedPanelAverage()` okuma tarafını koruyor: ölçek minimumunun altındaki saklı bir
ortalama kimsenin puanından hesaplanmış olamaz, dolayısıyla eski 0'ı taşıyan satırlar
başarısız not yerine "ölçülmedi" diye okunuyor. **Hiçbir satır yeniden yazılmıyor** —
`Score` satırları tek doğruluk kaynağı olarak kalıyor.

UI artık em-dash yerine **"Hesaplanmadı" / "Not calculated"** yazıyor ve nedeni hücrede
taşıyor (em-dash "boş sütun" gibi okunuyordu).

## 2. Kanıt (kopyalanmış gerçek çıktı)

### Birim testler — 30 → 38
```
$ npx vitest run src/modules/m6
 Test Files  2 passed (2)
      Tests  38 passed (38)
```
Eklenen 8 test `describe('M6 Scoring — the not-measured contract')` altında; ayrıca iki
mevcut test sözleşme değişikliği nedeniyle **sıkılaştırıldı** (gevşetilmedi):
- `should handle single reviewer` → artık `consensusOutcome === 'not-measured'`
  bekliyor (önce `'solid'` bekliyordu — tek kişilik panelde oybirliği iddiası).
- `should throw error on empty reviewer list` → `should report an empty reviewer list
  as unmeasured, not as a score`; `panelAverage` null **ve** `not.toBe(0)`.

### Gerçek tarayıcı + gerçek Postgres e2e
```
$ npx playwright test tests/e2e/m6-evaluator.spec.ts --reporter=line
Running 4 tests using 1 worker
[seed-m6-e2e] ready — tenant=m6-e2e-tenant proposal=m6-e2e-proposal evaluation=m6-e2e-evaluation criteria=4
[seed-m6-e2e] rolled back
  4 passed (6.3s)
```

### Ekran görüntüleri — `docs/agent-results/TASK-MTPZHMSPMDA66-screenshots/`
- **`01b-dashboard-not-measured.png`** — `0/1` hakem · Panel Puanı **"Hesaplanmadı"**
  (italik, 0.00 DEĞİL) · ESR **4.33** · Fark **—** · Uzlaşı **"Ölçülmedi"**.
  Üstünde sarı **"İç ön değerlendirme:"** bandı duruyor.
- **`03b-dashboard-scored.png` / `03-dashboard-after-save.png`** — puanlar girildikten
  sonra Panel Puanı **4.40** (5×.3 + 4×.2 + 5×.3 + 3×.2), ESR **4.33**, Fark **-0.07**,
  Uzlaşı hâlâ **"Ölçülmedi"** (fixture tek hakem oturtuyor — eskiden burada "Güçlü"
  yazıyordu, tek kişilik panelden üretilmiş bir oybirliği iddiası).
- `05-evaluator-lens-disclaimer-tr.png` / `-en.png` — "iç ön değerlendirme" etiketi
  her iki dilde ve **viewport içinde** (`toBeInViewport()` ile korunuyor).

### Kanıt disiplini (CLAUDE.md §7)
Ekrandaki 4.40 `Score` satırlarından, 4.33 `Proposal.esrScores`'tan geliyor; kodda
sabit rakam yok. e2e bunu DB'den doğruluyor:
`expect(evaluation.avgScore).toBeCloseTo(EXPECTED_PANEL_AVERAGE, 5)` ve her `Score`
satırı için `expect(row.tenantId).toBe(M6_E2E.tenantId)`.

### Kapı
```
$ npx eslint src/modules/m6 tests/e2e/m6-evaluator.spec.ts     → temiz (0)
$ npx tsc --noEmit                                             → m6'da 0 hata
```

## 3. Değişen dosyalar
- `src/modules/m6/server/scoring.ts` — not-measured sözleşmesi, `storedPanelAverage()`,
  `submittedAt` filtresi, kalibrasyon matrisi koruması
- `src/modules/m6/server/comparison.ts` — `!panelScore` yerine `storedPanelAverage()`
- `src/modules/m6/server/__tests__/scoring.test.ts` — +8 test, 2 test sıkılaştırıldı
- `src/modules/m6/ui/EvaluationDashboard.tsx` — "Hesaplanmadı" + neden
- `messages/{tr,en}.json` — `m6.dashboard.notMeasured*` (iki dil eşit)
- `tests/e2e/m6-evaluator.spec.ts` — yeni sözleşmeyi doğrulayan assertion'lar + element shot

## 4. Riskler
- `PanelScoreResult.panelAverage` artık `number | null`. Modül dışında çağıran yok
  (repo geneli grep ile doğrulandı), ama m6'yı tüketecek yeni kod bunu bilmeli.
- `updateEvaluationScore` artık hesap null çıktığında `avgScore`'a **null yazıyor**.
  Bu, puanı geri çekilmiş bir değerlendirmede eski sayının asılı kalmasını önler;
  kaynak `Score` satırları silinmez.
- `storedPanelAverage` ölçek altı saklı değerleri gizler. Gerçek düşük puan (1.0)
  korunur — bunun testi var (`keeps a genuinely low stored average`).

## 5. Açık sorular
- Tek hakemli panelde "Ölçülmedi" doğru davranış mı, yoksa ürün "tek hakem = uzlaşı
  yok, ama puan geçerli" ayrımını UI'da daha görünür mü istiyor? Şu an puan gösteriliyor,
  yalnız uzlaşı ölçülmemiş sayılıyor.
- `Evaluation.avgScore` sütununda eski `0` taşıyan canlı satır var mı bilinmiyor
  (yerelde yok). `storedPanelAverage` bunları okumada zararsızlaştırıyor; istenirse
  ayrı bir sayım sorgusu yazılabilir.

## 6. Sonraki adım
- M6.4 varsa: ölçüt ağırlıklarının kiracıya göre düzenlenebilmesi (`Criterion.weight`
  şu an seed'den geliyor).
- Panelde 2+ hakem oturtan bir e2e — `solid`/`divergent` yollarının şu an yalnız birim
  testi var, gerçek tarayıcıda kanıtı yok.
