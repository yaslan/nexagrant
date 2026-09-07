# TASK-MTQ63RR8Z0G8E — G0 puanı: bağımsız QA doğrulaması + kalan kusurun kapatılması

**Ajan:** blok-zincir-denet-i (QA / Test Mühendisi)
**Tarih:** 2026-09-07
**Branch:** dev
**Önceki rapor:** `TASK-MTQ63RR8Z0G8E-blok-zincir-denet-i.md` (birim testler), `-blok-zincir-dse.md`, `-blok-zincir-dse-2.md`

---

## 1. Ne yapıldı

### 1.1 Kart bayattı — önce ölçtüm

Kart "`g0Score` seed/mock'tan geliyor, kanonik skorlayıcı hiç çağrılmıyor" diyor. **Bu artık doğru değil.**
`g0Score` okuyan her yüzeyi grep'leyip değerin gerçekte nereden geldiğini satır satır izledim:

| Yüzey | Değer nereden geliyordu (ölçüm) | Durum |
|---|---|---|
| `src/lib/gates/evaluate.ts:114` | `computeG0ForOpportunity()` — kanonik skorlayıcı, kolon değil | ✅ zaten doğru |
| `pipeline/[id]/page.tsx:112` | `computeG0ForOpportunity()`, her render'da canlı | ✅ zaten doğru |
| `pipeline/actions.ts:242` | `rescoreOpportunityG0()` (create yolunda) | ✅ zaten doğru |
| `pipeline/board.tsx:487` | **`Opportunity.g0Score` kolonu — ham** | ❌ **kusur, bu işte kapatıldı** |
| `prisma/seed-opportunities.ts:91` | `g0Score: null` | ✅ literal kalmamış |

Yani kartın P0 iddiasının 4/5'i önceki dalgalarda inmiş; **kalan bir tanesi** board'du.

### 1.2 Bulunan gerçek kusur: board ile detay ekranı aynı fırsat için iki farklı puan gösteriyordu

`pipeline/page.tsx` fırsatları çekip `Opportunity.g0Score` kolonunu board'a olduğu gibi veriyordu.
Bu kolon kanonik skorlayıcının **önbelleği**; içine bir kez bir sayı yazılmışsa (eski seed literali,
eski `Math.random() * 15 + 80`, elle düzenlenmiş satır) board onu triyaj puanı diye çiziyordu.

Kanıtla ölçülen çelişki: kanıtı olmayan bir fırsat board'da yeşil **"⭐ 92"** rozetiyle dururken,
aynı fırsatın kendi detay sayfası **"Hesaplanamadı"** diyordu.

### 1.3 Düzeltme (yalnız kendi kartımın dosyaları)

- `pipeline/page.tsx` — yeni `withEvidenceBackedScores()`: board rozeti artık `Opportunity.g0Score`
  kolonundan değil, `persistG0`'ın kırılımla birlikte yazdığı **`TopicMatch.g0Score` kanıt kaydından**
  okunuyor (CLAUDE.md §7). Kanıt kaydı olmayan kartta rozet **hiç çıkmıyor** — 0 da göstermiyor.
  Tüm board için **2 toplu sorgu**; kart başına yeniden hesaplama yok (o ~8 okuma/fırsat olurdu).
  `Opportunity.topicId` hem `Topic.id` hem portal identifier olabildiği için ikisi de çözülüyor —
  `loadG0Snapshot`'ın izlediği kuralın aynısı.
- `pipeline/board.tsx` — e2e için `data-testid="pipeline-board"`; ayrıca hiçbir yerde render
  edilmeyen ölü `GATES[].title` alanı silindi (1 lint uyarısı da bununla kapandı).

### 1.4 Kartın DoD'undaki eksik: uçtan uca test yoktu

`scripts/seed-gate-e2e.ts` içindeki not aynen şöyle: *"G2 rather than G0: G0 refuses when the tenant
has no scoring evidence on file, and a fixture tenant has none."* — yani **hiçbir e2e G0 puanının
ekrana ulaşışını izlemiyordu**; tüm kanıt mock'lu birim testlerdeydi. Eksik olan kanıt fixture'ını yazdım:

- `scripts/seed-g0-e2e.ts` — iki fırsatlı fixture:
  - `scored`: gerçek kanıt (Topic + K1 `TopicMatch` fitScore 88 + `TopicStat` successRate %18),
    `g0Score` kolonu **null** başlıyor → ekranda görünen sayı o koşuda hesaplandı demektir.
  - `unscored`: kanıt yok, kolonda ürünün eskiden uydurduğu **92** literali duruyor (kontrol grubu).
- `tests/e2e/g0-computed-score.spec.ts` — gerçek tarayıcı, gerçek giriş, gerçek tıklama.

---

## 2. Kanıt

### 2.1 e2e: KIRMIZI → düzeltme → YEŞİL (test gevşetilmedi)

Board iddiasını ekledikten sonra, düzeltmeden **önce** (gerçek render metni):

```
Error: expect(locator).not.toContainText("92") failed
  - locator resolved to <div class="space-y-6" data-testid="pipeline-board">…</div>
  - unexpected value "...G02Stratejik Uygunluk & Filtre+👑Koordinatör👤Atanmadı⭐ 44.9▼G0 E2E —
    opportunity with real evidence🤝Ortak👤Atanmadı⭐ 92▼G0 E2E — opportunity with no evidence..."

  1 failed
    [chromium] › tests/e2e/g0-computed-score.spec.ts:75:7 › G0 score comes from the canonical scorer
```

`pipeline/page.tsx` düzeltmesinden **sonra**, aynı test — assertion gevşetilmedi:

```
Running 1 test using 1 worker
[seed-g0-e2e] ready — tenant=g0-e2e-tenant scored=g0-e2e-opportunity-scored (g0Score=null)
              unscored=g0-e2e-opportunity-unscored (g0Score=92) clearedDecisions=0
[seed-g0-e2e] rolled back
  ✓  1 [chromium] › tests/e2e/g0-computed-score.spec.ts:75:7 › G0 score comes from the canonical
     scorer › the screen shows the computed score, and says so when it cannot be computed (3.2s)
  1 passed (4.0s)
```

Testin doğruladıkları (hepsi tek koşuda):
1. Detay ekranındaki sayı = `computeG0ForOpportunity()`'nin **canlı** döndürdüğü sayı
   (UI'dan kopyalanmış bir literal değil — skorlayıcı değişirse test de değişir).
2. Sayı ekrandayken `Opportunity.g0Score` **hâlâ null** → figür kolondan gelmiyor.
3. Kapı çalıştırıldığında kolon + `TopicMatch.g0Score` + `TopicMatch.breakdown` aynı sayıyla yazılıyor
   ve `GateDecision.inputs.calculatedG0Score` = aynı sayı (CLAUDE.md §7 kanıt zinciri).
4. Board rozeti = hesaplanan sayı; kanıtsız kartta rozet yok (92 hiçbir yerde görünmüyor).
5. Kanıtsız fırsat "Hesaplanamadı" diyor — 92 de değil, `0/100` da değil; kolondaki 92 yerinde duruyor.

### 2.2 Ekran görüntüleri (gerçek tarayıcı, `docs/agent-results/TASK-MTQ63RR8Z0G8E-qa-screenshots/`)

| Dosya | Ne gösteriyor |
|---|---|
| `01-detail-computed-score.png` | **44.9/100** · "Eşik: 70/100 · Kanıt: 6/9 ölçüt ölçüldü" · "İç ön değerlendirme — resmî puan değildir" |
| `02-detail-after-gate-run.png` | Kapı çalıştı: "G0 kapısı geçilmedi" + gerekçeler; puan hâlâ 44.9 |
| `03-board-computed-badge.png` | Board: kanıtlı kartta ⭐ 44.9, kanıtsız kartta **rozet yok** (düzeltme öncesi burada ⭐ 92 vardı) |
| `04-detail-not-computed.png` | Kolonda 92 dururken ekran "Hesaplanamadı" diyor |

### 2.3 Skorlayıcının fixture üzerindeki çıktısı (DB'ye karşı, tarayıcısız)

```
scored  → {"score":44.9,"decision":"NO_GO","coverage":0.63,
           "measured":["alignment","baseRate","baseRatePct","budgetRoleEconomy",
                       "lumpSumTwoStage","countryEligible"],"total":9}
unscored→ {"score":null,"decision":null,"coverage":0,
           "reasons":["no scoring evidence available for this opportunity"]}
```

### 2.4 Canlı DB'de kolonun gerçekten skorlayıcı-yazımı olduğu (kart iddiasının çürütülmesi)

```
== Opportunity rows (ilk 8)
 demo-opp-5 | g0Score=6     | G4 | SME-led R&D innovation — Eurostars
 demo-opp-4 | g0Score=0     | G3 | Citizen engagement for climate-neutral…
 demo-opp-3 | g0Score=6     | G2 | Grid flexibility platform
 demo-opp-1 | g0Score=12    | G0 | District renovation pilot — İzmir
 esr-cal-S20| g0Score=50.01 | G0 | Compostable food packaging…
 esr-cal-S19| g0Score=74.9  | G0 | Coordination and support action…
== TopicMatch (kanıt kaydı, breakdown.scoringVersion)
 topic=cmtrerwvw0013… fit=0 g0=6  ver=2.0
 topic=cmtrerwv1000j… fit=0 g0=12 ver=2.0
```

Hiçbir satırda eski 80–94 aralığındaki uydurma yok; her puanın yanında `scoringVersion 2.0` kırılımı var.

### 2.5 Kapı çıktıları

```
$ pnpm typecheck
$ tsc --noEmit                      → temiz (çıktı yok)

$ npx eslint src/app/[locale]/(app)/[workspace]/pipeline/ scripts/seed-g0-e2e.ts \
             tests/e2e/g0-computed-score.spec.ts next.config.ts
                                    → 0 problem

$ npx vitest run tests/g0-compute.test.ts tests/g0-features.test.ts \
                 tests/g0-scoring.test.ts tests/gates.test.ts
  Test Files  4 passed (4)
      Tests  86 passed (86)
```

### 2.6 Regresyon taraması

- `tests/e2e/opportunity-archive.spec.ts` — board'u okuyan tek diğer e2e. Benim `page.tsx`
  değişikliğimle **geçiyor** (aşağıdaki F-3'teki fixture eksiği giderildiğinde):
  `✓ 1 [chromium] › opportunity-archive.spec.ts:46:7 … (3.1s)  1 passed`
- `pnpm test` — 996 geçti, **4 kırmızı**, hepsi `tests/m11-partb-editor-buffer.test.tsx`;
  benim dosyalarım değil (aşağıda F-2).

---

## 3. Bulgular (tekrar-üretim + önem + etki)

### F-1 · P0 · ✅ BU İŞTE DÜZELTİLDİ — açılış sayfası ve blog 500 veriyordu, e2e kapısı hiç açılmıyordu

- **Tekrar-üretim:** `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/tr`
- **Beklenen:** 200 · **Gözlenen (düzeltme öncesi):**
  ```
  500  /tr
  500  /en
  500  /tr/blog
  200  /tr/fiyatlandirma
  ```
  Dev sunucu logunda: `⨯ Error: Invalid src prop (https://images.unsplash.com/photo-1522071820081-…)
  on 'next/image', hostname "images.unsplash.com" is not configured under images in your next.config.js`
- **Kök neden:** `ca73ced` ("refactor: migrate 16 `<img>` elements to next/image") `no-img-element`
  lint uyarılarını temizlemek için 16 `<img>`'i `next/image`'a taşıdı, ama blog görselleri uzak
  (`src/lib/blog.ts:31`, `src/components/BlogSection.tsx:55`,
  `src/app/[locale]/(marketing)/blog/page.tsx:51`) ve `next/image` listelenmemiş host'ta **hata fırlatıyor**.
  `next.config.ts`'te `images` bloğu hiç yoktu.
- **İkincil etki:** Playwright `webServer.url` probu 400'ün altında bir statü göremediği için
  `pnpm test:e2e` **hiç başlayamıyordu** (`Error: Process from config.webServer was not able to start`).
  Yani depodaki tüm e2e kapısı kapalıydı.
- **Düzeltme:** `next.config.ts` → `images.remotePatterns` = `images.unsplash.com` (joker değil,
  host host: admin blog formuna yapıştırılan herhangi bir URL optimizer'dan geçmesin).
- **Doğrulama (düzeltme sonrası, aynı komut):**
  ```
  307  /
  200  /tr
  200  /en
  200  /tr/blog
  ```
- **Not:** Bu kusur kart 8'in (lint borcu) doğrudan yan etkisi ve hiçbir kartın dosya listesinde
  değil; kendi DoD'umu (gerçek etkileşimli test) bloke ettiği için düzelttim.

### F-2 · P1 · BAŞKASININ DOSYASI — `pnpm test` dev'de kırmızı (4 test)

- **Nerede:** `tests/m11-partb-editor-buffer.test.tsx` (4/4 fail) ·
  `src/modules/m11/ui/PartBCollaborativeEditor.tsx:114`
- **Tekrar-üretim:** `npx vitest run tests/m11-partb-editor-buffer.test.tsx`
- **Gözlenen:** `Error: Failed to call 'useTranslations' because the context from
  'NextIntlClientProvider' was not found.`
- **Tek cümle:** `3b5ad2a` bileşene `useTranslations('UserIdentity')` ekledi ama test bileşeni
  `NextIntlClientProvider` olmadan render ediyor. Benim kartımın dosyası değil, düzeltmedim.

### F-3 · P1 · BAŞKASININ DOSYASI — iki e2e fixture'ı `ModuleState` yazmıyor, specler modül kapısında ölüyor

- **Nerede:** `scripts/seed-archive-e2e.ts`, `scripts/seed-gate-e2e.ts` (ikisinde de `moduleState` yok)
- **Tekrar-üretim:** `npx playwright test tests/e2e/opportunity-archive.spec.ts`
- **Gözlenen:** `getByRole('main').getByText('Archive E2E — opportunity to archive')` bulunamıyor;
  sayfa yerine modül kilidi render ediliyor.
- **Kanıt (kök neden ölçümü):** fixture seed edildikten sonra
  `archive fixture ModuleState rows: []` → `moduleGate('M5')` reddediyor.
  M5'i elle `ON` yapınca **aynı spec değiştirilmeden geçiyor** (`1 passed`), yani kusur fixture'da.
  (Denemeden sonra hem `ModuleState` satırını hem fixture'ı geri aldım; DB'de kalıntı yok.)
- Bugünkü `d8d9dd2` ("fix(m6-e2e): grant the fixture tenant the plan…") aynı sınıf hatayı m6 için
  düzeltmiş; bu iki fixture atlanmış.

### F-4 · P2 · BENİM YÜZEYİM AMA BAŞKA KARTIN DOSYALARI — kapı gerekçeleri Türkçe kullanıcıya İngilizce çıkıyor

- **Nerede:** `pipeline/[id]/client.tsx` `gateResult.reasons` / `g0.reasons` render ediyor; metinler
  `src/lib/gates/evaluate.ts:130` ve `src/lib/scoring/g0-canonical.ts` içinde üretiliyor.
- **Ekran kanıtı:** `02-detail-after-gate-run.png` → "G0 composite score 44.9 is below minimum
  threshold 70"; `04-detail-not-computed.png` → "no scoring evidence available for this opportunity".
- **Etki:** CLAUDE.md §8 ihlali (kullanıcıya görünen sabit metin `t()`'den gelmeli).
- **Neden düzeltmedim:** sunucu tarafı gerekçeleri parametreli i18n anahtarlarına çevirmek
  `g0-canonical.ts` + `messages/tr.json` + `messages/en.json` istiyor; her ikisi de şu an başka
  ajanlar tarafından değiştirilmiş durumda (`git status`: `M messages/en.json`, `M messages/tr.json`).

### F-5 · P2 · BAŞKA KARTIN DOSYASI — dashboard ortalaması "puanlanmadı"yı 0 sayıyor

- **Nerede:** `src/lib/dashboard/fetch-metrics.ts:68` → `sum + (o.g0Score || 0)` / `totalOpps`
- **Etki:** Puanlanmamış (null) fırsatlar ortalamayı aşağı çekiyor; "yokluk sıfır değildir" kuralının
  ihlali ve kullanıcının okuduğu bir oran. Tek cümle bildirim, düzeltmedim.

### F-6 · P3 · BAŞKA KARTIN DOSYASI — konsorsiyum sayfasında uydurma `g0Score` sabiti

- **Nerede:** `pipeline/[id]/consortium/page.tsx:29-64` `DEMO_OPPORTUNITIES` (g0Score 88/92/85/94),
  `:154` fallback. Yalnız `demo-opp-1..4` id'leriyle tetikleniyor ve sayfa `g0Score`'u **render etmiyor**
  — bu yüzden P3. "Uydurma fallback" ailesinin kartına ait.

### F-7 · P3 · BENİM DOSYAM, BİLGİ — board rozetinde sabit Türkçe metin

- `pipeline/board.tsx:490` `title="AI Gate Uyum Skoru"` — `t()`'den gelmiyor (CLAUDE.md §8).
  Anahtar eklemek `messages/*.json`'a dokunmayı gerektirdiği (bkz. F-4 yarış riski) için bu işte
  düzeltmedim; kart 8'in kuyruğuna uygun.

### F-8 · BİLGİ — `scripts/test-partners-api.ts` hâlâ git'e girmemiş (`?? scripts/test-partners-api.ts`)

Kart 8'in dediği gibi sahibi belirsiz; dokunmadım.

---

## 4. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `next.config.ts` | `images.remotePatterns` eklendi (F-1) |
| `src/app/[locale]/(app)/[workspace]/pipeline/page.tsx` | `withEvidenceBackedScores()` — board rozeti kanıt kaydından |
| `src/app/[locale]/(app)/[workspace]/pipeline/board.tsx` | `data-testid="pipeline-board"`; ölü `GATES[].title` silindi |
| `scripts/seed-g0-e2e.ts` | **YENİ** — kanıtlı/kanıtsız iki fırsatlı G0 fixture'ı (+ `--rollback`) |
| `tests/e2e/g0-computed-score.spec.ts` | **YENİ** — G0 puanı uçtan uca spec |
| `docs/agent-results/TASK-MTQ63RR8Z0G8E-qa-screenshots/*.png` | 4 gerçek tarayıcı ekran görüntüsü |

Dokunmadıklarım: başka kartların dosyaları (F-2…F-6), `messages/*.json`, `src/lib/scoring/*`.

---

## 5. Riskler

1. **Board rozeti artık `TopicMatch` kaydına bağlı.** Konusu olmayan (topicId `null`) bir fırsat
   CORDIS kanıtıyla puanlanabilir; `persistG0` bu durumda `TopicMatch` yazmadığı için o kartta board
   rozeti çıkmaz. Bu bilinçli: kırılımı olmayan sayıyı göstermek CLAUDE.md §7'nin yasakladığı şey.
   Detay sayfası bu fırsatlar için puanı yine canlı hesaplayıp gösteriyor.
2. **Board rozeti önbelleğe değil kanıda bağlı ama yine de anlıktır**: `TopicMatch.g0Score` son
   `persistG0` koşusunun sonucudur; kanıt değişip yeniden puanlama yapılmadıysa board ile detay
   sayfası farklı sayı gösterebilir. Ürün kararı: her board render'ında kart başına yeniden
   hesaplama ~8 sorgu/fırsat demek. Fark, tek bir kapı koşusuyla kapanıyor.
3. **F-1'in kapsamı**: yalnız `images.unsplash.com` açıldı. Blog admin formuna başka bir host'tan
   URL girilirse o sayfa yine 500 verir — doğru davranış açık liste, ama ürün tarafında forma
   host doğrulaması eklemek gerekebilir (ayrı iş).

---

## 6. Açık sorular

1. F-4 (kapı gerekçelerinin i18n'i) hangi karta ait? `messages/*.json` serbest kaldığında
   tek seferde yapılabilir; şu an yarış riski var.
2. F-3'teki iki fixture (`seed-archive-e2e`, `seed-gate-e2e`) kimin? İkisi de tek satırlık
   `ModuleState` upsert'iyle düzeliyor, ama benim kartımın dosyaları değil.
3. Konusu olmayan ama CORDIS kanıtıyla puanlanabilen fırsatlar için `persistG0` bir kanıt kaydı
   yazmalı mı (ör. `Evidence`)? Şu an tek iz `Opportunity.g0Score` kolonu — board bilerek göstermiyor.

---

## 7. Sonraki adım

- F-2 ve F-3 sahiplerine düşüyor: `pnpm test` ve `pnpm test:e2e` bunlar kapanmadan tam yeşil olmaz.
- F-4/F-5 için kart açılmalı (kullanıcıya görünen metin + kullanıcıya görünen oran).
- TASK-MTREJ27YUPSY7 (lint borcu) ölçümü ayrı raporda: `TASK-MTREJ27YUPSY7-blok-zincir-denet-i.md`.

## Yayına uygun mu?

**TASK-MTQ63RR8Z0G8E kapsamı: EVET.** G0 puanının kullanıcıya ulaşan her yüzeyi kanonik skorlayıcıya
bağlı, hesaplanamayan puan "hesaplanmadı" olarak gösteriliyor, gösterilen her sayının arkasında
`TopicMatch` kırılımı var ve bunların hepsi gerçek tarayıcıda tıklanarak kanıtlandı.

**Depo geneli: HAYIR** — F-2 (4 kırmızı birim test) ve F-3 (2 e2e spec modül kapısında ölüyor)
kapanana kadar kapı tam yeşil değil. Bunlar benim kartımın dosyaları değil.
