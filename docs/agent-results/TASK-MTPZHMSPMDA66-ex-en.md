# TASK-MTPZHMSPMDA66 — M6.3 Puanlama Mantığı ve Hesaplama Motoru (Bağımsız Doğrulama Raporu)

> **Ajan:** EX-EN (Bağımsız Doğrulama Ajanı)  
> **Sprint:** SPRINT-S12  
> **Tarih:** 8 Eylül 2026  
> **Kart:** `TASK-MTPZHMSPMDA66 — M6.3 Scoring Logic & Calculation Engine`  
> **Hüküm:** 🟢 **GEÇTİ (PASSED)**

---

## 1. Rapor Karşılaştırma & Çelişki Matrisi

Daha önce sunulan iki ayrı ajanın raporları (`-geli-tirici.md` ve `-blok-zincir-dse.md`) incelenmiş, iddialar ve kod tabanındaki gerçek durum karşılaştırılmıştır:

| İddia / Boyut | BE-EN Raporu (`-geli-tirici.md`) | DSE-EN Raporu (`-blok-zincir-dse.md`) | Doğrulanmış Kod Tabanı Gerçeği |
|---|---|---|---|
| **Ana Kapsam & Çözülen Problem** | Puan hesaplanamadığında `0.00` uydurma sorununu çözdü; `panelAverage: null` + `unmeasuredReason` + `'not-measured'` uzlaşı getirdi. | `calculateCriterionAverage`, `getScoreDistribution`, 6 doğrulama fonksiyonu ve 1..5 strict integer aralığı eklediğini belirtti. | Her iki ajan sırayla çalıştı (`c8f6f9f` DSE-EN, ardından `47d8a5c` BE-EN). BE-EN, DSE-EN'in yazdığı motorun `0.00` uydurma hatasını refaktör edip sözleşmeyi sıkılaştırdı. |
| **Tek Hakemli Panel Uzlaşısı** | Tek hakemli panelde oybirliği iddiası üretilemeyeceğini, uzlaşının `consensusOutcome: 'not-measured'` döndürdüğünü vurguladı. | Tek hakemli panel için `%100 uyum` / `solid` uzlaşı döndüğünü iddia etti. | **BE-EN haklı.** `calculateConsensusOutcome()` içinde `reviewerScores.length <= 1` durumu direkt `'not-measured'` döndürmektedir. DSE-EN'in iddiası eskimiş/hatalıdır. |
| **M6 Birim Test Sayısı** | 38 birim testin geçtiğini bildirdi (30 mevcut + 8 yeni). | 30 test geçtiğini bildirdi (24 scoring + 6 comparison). | **BE-EN haklı.** `vitest run src/modules/m6` çalıştırıldığında **38 birim test** %100 yeşil geçmektedir. |
| **UI Entegrasyon Durumu** | `EvaluationDashboard.tsx` bileşeninin güncellendiğini ve "Hesaplanmadı" / "Not calculated" yazdığını gösterdi. | "M6 Panel UI (not yet in sprint): wire up scoring functions to proposal evaluation dashboard (upcoming)" iddiasında bulundu. | **BE-EN haklı.** `src/modules/m6/ui/EvaluationDashboard.tsx` mevcuttur ve `scoring.ts` sonuçlarına bağlıdır. DSE-EN'in "UI yapılmadı" iddiası geçersizdir. |

---

## 2. CLAUDE.md Kural Denetimleri

### Kural #7 — Kanıt Disiplini (Evidence & TopicStat & Sabit Rakam Taraması)
- **Denetim Amacı:** Kullanıcıya gösterilen panel puanı, ESR kıyaslaması ve istatistiklerin kod içinde sabit rakam olarak yazılmadığını doğrulama.
- **Bulgular:**
  - `src/modules/m6/server/scoring.ts` içindeki `4.40` panel ortalaması DB'deki `Score` satırlarının weighted ortalamasından dinamik hesaplanmaktadır.
  - `4.33` ESR puanı `Proposal.esrScores` JSON alanından okunmaktadır.
  - Fark (`-0.07`), `esrScore - panelScore` formülüyle dinamik üretilmektedir.
  - Kodda `ESR_TOTAL_MAX = 15`, `PANEL_SCALE_MIN = 1`, `PANEL_SCALE_MAX = 5` ve uzlaşı eşiği `%70` dışında sabit kullanıcı verisi **yoktur**.
  - Puan bulunmadığında ekrana `0.00` basılması engellenmiş, `panelAverage: null` durumunda iki dilde de **"Hesaplanmadı" / "Not calculated"** etiketleri bağlanmıştır.
  - CLAUDE.md #4 gereği "İç ön değerlendirme" disclaimeri UI bileşeninde yer almaktadır.

### Kural #1 — Çok Kiracılılık & Tenant Isolation (`withTenant` Denetimi)
- **Bulgular:**
  - `src/modules/m6/server/scoring.ts` içindeki veri sorgulayan tüm fonksiyonlar (`getPanelScoresForProposal`, vb.) `TenantScopedDb` tipini zorunlu tutmaktadır.
  - `src/modules/m6/server/comparison.ts` içindeki `compareM6ToESR` fonksiyonu `withTenant(tenantId, tx => ...)` ile sarmalanmıştır.
  - `validateEvaluationTenant` ve `validateReviewersTenant` yardımcı fonksiyonları ile kiracı yalıtımı kontrol edilmektedir.

### Kural #9 — Para (Int Minor Unit) Denetimi
- M6 (Evaluator Lens) teklif değerlendirme ve ESR puan karşılaştırması yaptığı için doğrudan parasal alan içermez; modül lisanslama maliyetleri (Eklenti SKU `addon_m6`: 9900 sent / €99) `PlanEntitlement` katmanında yönetilmektedir.

---

## 3. Puanlama Birim Test Çalıştırma Sonuçları

`pnpm test src/modules/m6` ve `pnpm test tests/modules/m6.test.ts` komutları çalıştırılmış ve çıktılar kaydedilmiştir:

### `src/modules/m6` Birim Test Çıktısı:
```
$ vitest run --passWithNoTests src/modules/m6

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ src/modules/m6/server/__tests__/comparison.test.ts (6 tests) 2ms
 ✓ src/modules/m6/server/__tests__/scoring.test.ts (32 tests) 4ms

 Test Files  2 passed (2)
      Tests  38 passed (38)
   Start at  16:56:57
   Duration  137ms (transform 57ms, setup 0ms, import 135ms, tests 5ms, environment 0ms)
```

### `tests/modules/m6.test.ts` Modül Entegrasyon Test Çıktısı:
```
$ vitest run --passWithNoTests tests/modules/m6.test.ts

 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ tests/modules/m6.test.ts (13 tests) 7ms

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Start at  16:56:59
   Duration  166ms (transform 36ms, setup 0ms, import 94ms, tests 7ms, environment 0ms)
```

### TypeScript Tip Kontrolü (M6 Modülü):
`npx tsc --noEmit` çıktısında `src/modules/m6` altında **0 hata** tespit edilmiştir.

---

## 4. Hüküm ve Gerekçe

### HÜKÜM: 🟢 GEÇTİ (PASSED)

**Gerekçe:**
1. M6.3 Puanlama Mantığı ve Hesaplama Motoru (`calculatePanelScore`, `calculateConsensusOutcome`, `compareWithEsr`, `esrTotalToPanelScale`, `validateScoreRange`) eksiksiz uygulanmıştır.
2. Olmayan/hesaplanamayan puanların yerine `0.00` uydurulması engellenmiş, `panelAverage: null` + `unmeasuredReason` + tek hakemde `'not-measured'` uzlaşı kuralı başarıyla işletilmiştir.
3. 38 birim test + 13 entegrasyon testi %100 yeşil geçmektedir.
4. UI bileşeni (`EvaluationDashboard.tsx`) hesaplanamayan puanlar için "Hesaplanmadı" / "Not calculated" göstermektedir.
5. Kiracı izolasyonu (`TenantScopedDb`, `withTenant`) tamdır.

---

## 5. Gelecek Sprintler İçin Önerilen Yeni Kartlar (Opsiyonel / İyileştirme)

1. **Çoklu Hakemli Panel E2E Tarayıcı Testi:** Tek hakemli panel e2e testi mevcuttur; 2+ hakemli panellerde `solid` / `divergent` durumlarının tarayıcıda görselleştirmesini doğrulayan e2e testi eklenebilir.
2. **Kiracı Bazlı Ölçüt Ağırlık Özelleştirmesi (M6.4):** Şu an varsayılan ağırlıklar kullanılmaktadır; kiracı yöneticisinin ölçüt ağırlıklarını çalışma alanı bazında düzenleyebilmesi özelliğinin eklenmesi.

---
*Rapor EX-EN (Bağımsız Doğrulama Ajanı) tarafından oluşturulmuştur.*
