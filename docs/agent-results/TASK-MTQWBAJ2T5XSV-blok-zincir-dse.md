# TASK-MTQWBAJ2T5XSV — F10+F16 "Yokluk ≠ Sıfır"

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** bug/UX · **Branch:** `dev`

## 1. Ne yapıldı

Ürün üç ayrı durumu tek bir "0" olarak gösteriyordu. Ayrım **veri katmanına** taşındı,
UI bunu `|| 0` ile geri ezemiyor, ve **gerçekten ölçülmüş 0 hâlâ 0 olarak görünüyor**.

### A. Panel (M5) — ölçülmemiş KPI artık sayı taşımıyor

- Yeni saf modül `src/modules/m5/server/metrics.ts`: `MetricValue =
  { measured: true; value } | { measured: false }`. `hitRate`, `averageLensScore`,
  `personDaysPerProposal`, `averageG0ToG2Days` — hepsi DB'siz test edilebilir.
- `queries.ts` bu fonksiyonları çağırıyor; `KpiMetrics` artık dört alanı `MetricValue`
  olarak veriyor. Ek olarak **aralıktan bağımsız** `hasAnyOpportunity` alanı var:
  "çalışma alanı yepyeni" ile "bu tarih aralığı boş" farklı cümleler gerektiriyor.
- Ortalama puan sorgusu artık yalnız `status: 'completed'` ve `readerType != 'PANEL'`
  satırlarını okuyor. `Evaluation.excellence/impact/implementation` şemada
  `Float @default(0)`; doldurulmamış satır ortalamaya 0 olarak giriyordu.
- `Dashboard.tsx`: hiç fırsatı olmayan kiracıya KPI kartı **hiç basılmıyor** — açıklama
  + fırsatlara giden tek CTA. Fırsat var ama aralıkta yoksa ayrı bir cümle.
  Ölçülmemiş tek kart "Henüz veri yok" + *neden* boş olduğunu söyleyen açıklama
  gösteriyor, birimi (`%`, `gün`) düşürüyor ve `success` yeşilinden `default`a iniyor —
  eksik bir isabet oranının yeşil çerçevede durması "iyi sonuç" gibi okunuyordu.
- `KpiCard.tsx`: yeni `unmeasured` prop'u. Değer yuvası `text-3xl font-bold` yerine
  `text-base font-medium text-gray-500` oluyor, yani **eksik bir sayı gerçek bir sayıdan
  yüksek sesle konuşmuyor** ve kart ızgarası bozulmuyor. Karar bileşende, çağıran
  tarafta değil — sıradaki KPI kartı da doğru davranacak.

### B. Evaluator Lens (M6) — doldurulmamış değerlendirmeye hüküm verilmiyor

- Yeni saf modül `src/modules/m6/lens-scores.ts`. Kural: üç puan sütunu **yalnız**
  `status === 'completed'` **ve** `readerType !== 'PANEL'` iken anlamlı. Gerekçe:
  puanları yazan iki fonksiyon (`generateAiEvaluation`, `saveHumanEvaluation`) aynı
  ifadede `status: 'completed'` yazıyor; PANEL satırının puanları `Reviewer`/`Score`
  içinde ağırlıklı 1–5 ölçekte duruyor ve bu üç sütun ömür boyu 0 kalıyor.
  (`prisma/seed-m6-evaluations.ts` tam olarak böyle 10 satır üretiyor.)
- `evaluations/page.tsx` artık `status`'ü de okuyup istemciye `scores: LensMarks | null`
  veriyor. `readerType` da artık ezilmiyor: PANEL, HUMAN'a katlanıyordu.
- `evaluations/client.tsx`:
  - Puansız satır: nötr slate rozet **"Henüz değerlendirilmedi"** + nedeni söyleyen
    cümle. Üç boş `0.0/5` kutusu yerine o cümle geçiyor. Gül rengi "Eşik Altı" YOK —
    değerlendirilmemiş bir kayıt hiçbir şeyde başarısız olmadı.
  - Başlık ortalaması `null` olabiliyor → "Değerlendirilmedi" + alt satırda nedeni.
  - G3 kapısı yalnız **puanlamış** okuyucuları sayıyor; `meetsScoreThreshold`
    ölçülmemişken açıkça `false` (eşiği geçemez ama "kaldı" da demez → "Eksik").
  - ESR kalibrasyon listesi yalnız puanlanmış satırları gösteriyor (olmayan bir tahminle
    sapma hesaplanamaz); liste boşsa select **ve submit** devre dışı + neden yazılı.
    Varsayılan seçim de artık ilk *puanlanmış* satır — aksi hâlde kontrol bir satırı
    gösterirken state başka (puansız) satırı işaret ediyordu.

### C. Yan bulgu — düzeltildi

`Dashboard.unitScore` iki dilde de `"/100"` idi; kart üç kriterin (her biri 0–5)
ortalamasını basıyor, yani ölçek 0–5. `"/5"` yapıldı. Hesap değişmedi, yalanlı etiket
değişti (CLAUDE.md §7).

## 2. Kanıt

### 2.1 Aynı fixture, eski ifadeler vs. yeni (hesaplanmış çıktı)

```
--- EMPTY workspace (no opportunities at all) ---
  OLD hit rate      : 0.0 %   <- invented
  OLD avg score     : 0.0      <- invented
  OLD person-days   : 0.0      <- invented
  NEW               : no KPI cards at all; "Bu çalışma alanında henüz fırsat yok"
--- POPULATED workspace (2 G0-scored, 0 submitted, 1 scored reader + 2 unscored) ---
  OLD hit rate      : 0.0 %   <- correct, but indistinguishable from the line above
  OLD avg score     : 1.2      <- two unscored rows averaged in as 0
  NEW avg score     : 3.7      <- the reader who actually scored
--- Evaluator Lens header (avg lens total out of 15) ---
  OLD               : 3.7 / 15.0
  NEW               : 11.0 / 15.0
  OLD per unscored row: "Toplam: 0.0 / 15.0 (Eşik Altı)"
  NEW per unscored row: "Henüz değerlendirilmedi" + reason
```

### 2.2 Gerçek tarayıcı, gerçek tıklama (Playwright, 5/5)

`F10_E2E_KEEP=1 pnpm playwright test tests/e2e/f10-absence-not-zero.spec.ts`

```
Running 5 tests using 1 worker
[seed-f10-e2e] ready — empty=f10-empty-ws full=f10-full-ws opportunity=f10-full-opp-a
  ✓  1 … an empty workspace explains itself instead of reporting a 0 % hit rate (1.2s)
  ✓  2 … the same empty state reads in English (1.1s)
  ✓  3 … a populated workspace shows its real figures — including a hit rate that is really 0 (1.1s)
  ✓  4 … a date range with no opportunities says that, not that the workspace is empty (1.7s)
  ✓  5 … an unfilled evaluation reads "not evaluated", never "0.0 / 15.0 below threshold" (1.2s)

  5 passed (7.1s)
```

Her test gerçek e-posta ile giriş yapıyor, sayfayı geziyor ve ekran görüntüsü alıyor:

| Dosya | Ne gösteriyor |
|---|---|
| `TASK-MTQWBAJ2T5XSV-screenshots/01-empty-tenant-dashboard-tr.png` | Boş kiracı: tek KPI kartı yok, "Bu çalışma alanında henüz fırsat yok" + "Fırsatlara git" |
| `…/02-empty-tenant-dashboard-en.png` | Aynı durum İngilizce |
| `…/03-populated-tenant-real-numbers-tr.png` | Dolu kiracı: **İsabet Oranı 0,0 %** (2 G0'lı fırsat, 0 gönderim → gerçek ölçüm), Kişi-Gün 5,0 · G2 10,0 · Ortalama Puan 3,7 |
| `…/04-empty-date-range-tr.png` | 2020 aralığı: "Seçili tarih aralığında fırsat yok" — boş kiracıdan FARKLI cümle |
| `…/05-unscored-evaluation-not-evaluated-tr.png` | Lens başlığı 11.0 / 15.0 (yalnız puanlayan okuyucu), Değerlendirici 1 |
| `…/06-evaluation-feed-scored-vs-unscored-tr.png` | Kontrast tek karede: 2 puansız kayıt nötr "Henüz değerlendirilmedi" + neden, 1 puanlı kayıt 11.0 / 15.0 (Eşik Üstü) + kırılım |

### 2.3 Birim testler — 23/23 (`tests/absence-not-zero.test.ts`)

Her metrik için **iki** test var; tek taraf sabitlemek hatayı geri getiriyor:

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

- `hitRate(0, 0)` → ölçülmemiş · `hitRate(0, 5)` → **ölçülmüş 0**
- `personDaysPerProposal(40, 0)` → ölçülmemiş · `personDaysPerProposal(0, 2)` → ölçülmüş 0
- `averageG0ToG2Days` tek G0 → ölçülmemiş · aynı gün G0+G2 → **ölçülmüş 0**
- `lensMarks` draft/in-progress/PANEL → `null` · completed 0/0/0 → **ölçülmüş 0/0/0**
- `averageLensTotal` iki puansız + bir 12.0 → **12.0** (4.0 değil)

### 2.4 `pnpm gate` — temiz

```
✖ 194 problems (0 errors, 194 warnings)      # lint: 0 hata (uyarılar önceden vardı)
$ tsc --noEmit                                # typecheck: çıktı yok = temiz
 Test Files  57 passed | 2 skipped (59)
      Tests  560 passed | 8 skipped (568)
$ tsx scripts/check-rls.ts
✅ SUCCESS: All 38 tenant-scoped models have RLS policies registered.
$ tsx scripts/check-rls-live.ts
Kiracıya özel model: 38 · RLS açık tablo: 41 · tenant_isolation politikası: 38
✅ Veritabanı 38 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

Şema sıfırlayan/migrate eden bir komut **çalıştırmadım** (yalnız upsert'lü fixture);
yine de kapı hem `rls:check` hem `rls:verify` ile 38/38 doğruladı.

### 2.5 i18n paritesi

`pnpm i18n:check` → `totalKeysInTurkish: 611`, `totalKeysInEnglish: 611`. Sadece kendi
ad alanlarıma ekledim (`Dashboard`, `m6.metrics`, `m6.feed`, `m6.calibration`); dosyayı
yeniden biçimlendirmedim (diff yalnız eklenen satırlar).

## 3. Değişen dosyalar

**Yeni**
- `src/modules/m5/server/metrics.ts` — saf KPI türetimleri + `MetricValue`
- `src/modules/m6/lens-scores.ts` — `lensMarks` / `lensTotal` / `averageLensTotal` / `readerTypeOf`
- `tests/absence-not-zero.test.ts` — 23 birim testi
- `tests/e2e/f10-absence-not-zero.spec.ts` — 5 e2e
- `scripts/seed-f10-e2e.ts` — idempotent fixture (`--rollback` ile temizlenir)
- `docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/0{1..6}-*.png`

**Değişen**
- `src/modules/m5/server/queries.ts` — `MetricValue` + `hasAnyOpportunity`, puanlanmamış değerlendirme filtresi
- `src/modules/m5/ui/Dashboard.tsx` — iki boş durum + ölçülmemiş kart
- `src/modules/m5/ui/KpiCard.tsx` — `unmeasured` sunumu
- `src/app/.../evaluations/page.tsx` — `status` okunuyor, `scores: LensMarks | null` veriliyor
- `src/app/.../evaluations/client.tsx` — puansız satır/ortalama/G3/kalibrasyon
- `messages/tr.json`, `messages/en.json` — +17 anahtar (her dil), `unitScore` `/100` → `/5`

**Silinen:** `scratch/dse-probe.mjs` (görevde istenen) ve kendi geçici probe/script dosyalarım.

## 4. Riskler

1. **`messages/*.json` ortak dosya.** Commit'im, aynı ağaçta çalışan diğer ajanların
   henüz commit'lenmemiş `Briefs`/`Consortium` anahtarlarını da taşıyor — dosya bölünemez.
   Kapı bu hâliyle yeşil ve parite 611/611.
2. **`unitScore` `/100` → `/5`.** Görünen sayı değişmedi, etiket değişti. Ürün tarafı
   kartın gerçekten 0–100 olmasını istiyorsa düzeltilecek yer *hesap*, etiket değil.
3. **PANEL satırları lens akışında hâlâ listeleniyor**, artık "puanı yok" diyerek.
   Bunları lens akışından tamamen çıkarmak ürün kararı; yapmadım.
4. `readerType`/`status` serbest metin sütunları (enum değil). Kural
   `lens-scores.ts`'te tek yerde; yeni bir `readerType` eklenirse orası güncellenmeli.

## 5. Açık sorular

1. **Ortalama Puan kartının ölçeği ne olmalı?** Şu an üç kriterin ortalaması (0–5) ve
   etiketi `/5` yaptım. Lens'in kendi başlığı 0–15 toplam gösteriyor. İki ekranın aynı
   ölçeği konuşması gerekiyorsa panel de 0–15'e çekilmeli — bu bir ürün kararı, hesabı
   kendiliğimden değiştirmedim.
2. **`prisma/seed.ts` kırık:** `seedG0DemoEvidence()` `demo-topic-1..6` bekliyor ama
   `seedOpportunities()` cuid'li topic üretiyor → `P2003 ForeignKeyConstraintViolation`,
   ve zincir orada durduğu için `ModuleState` hiç yazılmıyor (demo kiracıda M5/M6 yok).
   Benim dosyalarımın dışında; kendi fixture'ımla çalıştım. Sahibi kim olacak?

## 6. Sonraki adım

- Yukarıdaki iki açık sorunun sahiplenilmesi (özellikle 5.2 — seed kırıkken demo kiracıda
  modül sayfaları kapalı görünüyor).
- Aynı "yokluk ≠ sıfır" taraması diğer sayısal yüzeylerde: `dashboard/client.tsx`
  (customer-support'ta, `personDaysPerOpp === '0' ? '14.2'` gibi bir yedek var),
  `evaluations/panel/**` (geli-tirici'de) ve K5 pipeline kartları.

---

## Commit notu (yarış durumu)

Kodum `dev`'de **`de62d22`** içinde. Commit mesajı bana ait değil: `git commit` çağrımla
aynı anda başka bir ajan commit aldı ve stage'lediğim 17 dosya onun commit'ine dahil
oldu; benim çağrım "no changes added to commit" ile döndü. Paylaşılan branch'te geçmişi
yeniden yazmadım. İçerik eksiksiz — `git show --stat de62d22` hepsini listeliyor.
`messages/tr.json` + `messages/en.json` ise (aynı sebeple) **`4be94d5`** içinde; 17+17
anahtarımın ve `unitScore: "/5"` düzeltmesinin HEAD'de durduğunu doğruladım.
