# TASK-MTU26XBVZ6H1O — 3. tur: fatura e2e ailesi YEŞİL (17/17)

**Ajan:** blok-zincir-dev · **Tarih:** 2026-09-09 · **Sprint:** SPRINT-S12
**Önceki turlar:** `-blok-zincir-dev.md`, `-blok-zincir-dev-2.md` · **Liderin koşusu:** `TASK-MTU26XBVZ6H1O-evidence/lead-round2-verification.txt`

## 1. Ne yapıldı

Liderin ölçtüğü kırmızıyı kendi makinemde tekrarladım (aynı 2 test, aynı satır, aynı kök),
kaynağı okuyup **hangi tarafın yanlış olduğunu kanıtladım**, sonra iki testi de gerçeğe göre
hizaladım. Uygulama koduna dokunmadım.

### Karar (tek cümle)

> **Uygulama doğru, assertion eski:** VUK 215 / 385 Sıra No.lu Genel Tebliğ yabancı para
> faturasında TL karşılığının belge üzerinde **gösterilmesini zorunlu kılıyor**; bu depo
> kuralı iki yönde de uyguluyor (`foreignCurrencyFilingBlock` TL rakamı olmayan USD
> belgesini GİB'e göndermeyi **reddediyor**, `8118b54` de rakamı basılı sayfaya koyuyor) —
> dolayısıyla `expect(usd).not.toContain('₺')` iddiası TL-karşılığı özelliğinden **eski**,
> `test.skip()` altında olduğu için bugüne kadar görünmemişti.

Kanıt zinciri (okunan kaynak):
- `src/lib/efatura.ts:153-164` — `foreignCurrencyFilingBlock()`: `exchangeRate` yoksa
  "USD faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez" döndürüyor.
  Yani TL rakamı bu depoda **zorunlu**, yasak değil.
- `src/lib/efatura.ts:334-361` — `exchangeRateStatement()`: kuru ve tarihi tek yerde
  cümleleştiriyor, TL toplamı **satırdan okunuyor**, export'ta yeniden hesaplanmıyor.
- `src/lib/efatura.ts:706-730` — "TL karşılığı" satırı; kodun kendi yorumu:
  *"The row below is the only place a ₺ may appear on a document whose sale is in another
  currency — the amounts above stay in the currency the header declares (F-1)."*
- `8118b54` commit mesajı: *"that row is the only place a lira sign may appear on a sale
  denominated in another currency, so F-1's rule still holds for every amount of the sale
  itself."*

### Assertion nasıl değişti (GEVŞEMEDİ, KESKİNLEŞTİ)

Eski iddia tek satırdı ve **yanlıştı**: "belgede hiç ₺ geçmesin".
Yeni iddia aynı regresyonu yakalıyor ama doğru kuralı ifade ediyor: **para birimleri
karışmasın**.

| | eski | yeni |
|---|---|---|
| ₺ sayısı | `not.toContain('₺')` (0 olmalı — mevzuata aykırı) | `occurrences(usd,'₺') === 1` |
| ₺ nerede | ölçülmüyordu | `rowsMentioning(usd,'₺')` tek satır, o satır `TL karşılığı` içeriyor |
| ₺ değeri | ölçülmüyordu | `₺4.082,22` (satırdaki `grandTotalTryMinor: 408222`) |
| satış tutarları | `$99,00`, `$118,80` | + `$19,80`, ayrıca `₺99,00`/`₺19,80`/`₺118,80` **yasak** |
| kur satırı | ölçülmüyordu | `1 USD = 41,2345 TRY` (TRY kelime olarak, ikinci sembol yok) |
| TRY belgesi | `$` yok | + `TL karşılığı` satırı **büyümemiş olmalı** |

Orijinal kusur — "Para Birimi: USD" başlığı altında her para hücresinin sabit ₺ ile
basılması — yeni iddiayı da düşürür: o durumda ₺ sayısı 1 olmaz ve `₺99,00` bulunur.

Aynı gerçek **her iki teste** de uygulandı:
- `:166` (HTTP gövdesi, string düzeyinde) — `<tr>` bloğu bazında.
- `:259` (tarayıcıda basılan sayfa, `innerText`) — satır bazında; birini düzeltip
  diğerini unutmadım.

Ayrıca `invoice-write-path.spec.ts:158-163` yorumu düzeltildi: "503 de 200 de pass" diyordu,
oysa 2. turda kod 200'e zorlandı. Yorum artık kodu doğru anlatıyor (bu tek istisna,
başka kapsam açılmadı).

## 2. Kanıt (kopyalanmış çıktı)

### 2.1 Önce: kırmızı tekrarlandı (değişiklikten ÖNCE)

```
$ lsof -nP -iTCP:3000 | grep LISTEN
no listener on :3000 (clean)

$ pnpm test:e2e --grep "invoice"
    Para Birimi: USD
    1	Fabrika Pro (1 ay)	1 Adet	$99,00	%20	$99,00
    Ara Toplam (Matrah):	$99,00
    Hesaplanan KDV (%20):	$19,80
    ÖDENECEK GENEL TOPLAM:	$118,80
    TL karşılığı:	₺4.082,22
    TCMB döviz alış kuru (2026-09-08): 1 USD = 41,2345 TRY
    ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur."

      219 |     const rendered = await page.locator('body').innerText();
      220 |     expect(rendered).toContain('USD');
    > 221 |     expect(rendered).not.toContain('₺');
          |                          ^

  2 failed
    [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:138:7 › a foreign-currency invoice export › the USD document never prints a lira sign, and the TRY one still does
    [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:210:7 › a foreign-currency invoice export › the printable page a customer sees agrees with itself
  15 passed (10.2s)
[ELIFECYCLE] Command failed with exit code 1.
```

Liderin ölçümüyle **birebir aynı** — kör kabul değil, tekrar üretildi.

### 2.2 Sonra: yeşil (tam çıktının son 15 satırı)

Tam log: `docs/agent-results/TASK-MTU26XBVZ6H1O-evidence/round3-invoice-e2e-green.txt`

```
$ lsof -nP -iTCP:3000 | grep LISTEN
no listener on :3000

$ pnpm test:e2e --grep "invoice"
  ✓   4 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:117:7 › invoice export reads a real record › an anonymous caller gets no document at all (569ms)
  ✓   5 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:129:7 › invoice export reads a real record › an id that exists nowhere is 404, not an invented invoice (21ms)
  ✓   6 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:135:7 › invoice export reads a real record › another tenant invoice is 404, the same answer as one that does not exist (16ms)
  ✓   7 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:145:7 › invoice export reads a real record › an unsupported format is refused before anything is read (7ms)
  ✓   8 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:150:7 › invoice export reads a real record › the tenant own invoice renders that row, and nothing invented (186ms)
  ✓   9 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:166:7 › a foreign-currency invoice export › the USD document prices the sale in dollars and shows lira only as the stated equivalent (34ms)
  ✓  10 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:203:7 › a foreign-currency invoice export › the XML declares one currency and uses it on every amount (18ms)
  ✓  11 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:213:7 › a foreign-currency invoice export › the XML carries the TCMB rate the row was issued at (26ms)
  ✓  12 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:230:7 › a foreign-currency invoice export › the database itself refuses a foreign-currency invoice with no rate (40ms)
  ✓  13 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:259:7 › a foreign-currency invoice export › the printable page a customer sees agrees with itself (217ms)
  ✓  14 [chromium] › tests/e2e/invoice-write-path.spec.ts:107:5 › a tenant with no billing identity is paid-up but not invoiced (50ms)
  ✓  15 [chromium] › tests/e2e/invoice-write-path.spec.ts:131:5 › a payment issues one invoice, and the export route serves it (34ms)
  ✓  16 [chromium] › tests/e2e/invoice-write-path.spec.ts:180:5 › a redelivered webhook does not issue a second invoice (7ms)
  ✓  17 [chromium] › tests/e2e/invoice-write-path.spec.ts:192:5 › two concurrent payments get two distinct numbers (35ms)

  17 passed (9.2s)
```

**17 passed, 0 failed.**

### 2.3 Kapı hâlâ kapı: `INVOICE_SUPPLIER_*` boşken süit KIRMIZI

`playwright.config.ts` içindeki `testEnv` **geçici olarak** boşaltıldı, koşuldu, sonra
`git checkout -- playwright.config.ts` ile geri alındı (ağaçta iz yok — 2.5'e bakın).
Tam log: `TASK-MTU26XBVZ6H1O-evidence/round3-invoice-e2e-RED-without-supplier-env.txt`

```
  ✘   8 [chromium] › tests/e2e/invoice-export-real-record.spec.ts:150:7 › the tenant own invoice renders that row, and nothing invented (88ms)
  ✘   9 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:166:7 › the USD document prices the sale in dollars and shows lira only as the stated equivalent (33ms)
  ✘  10 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:203:7 › the XML declares one currency and uses it on every amount (35ms)
  ✘  11 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:213:7 › the XML carries the TCMB rate the row was issued at (33ms)
  ✘  13 [chromium] › tests/e2e/invoice-foreign-currency-export.spec.ts:259:7 › the printable page a customer sees agrees with itself (142ms)
  ✘  15 [chromium] › tests/e2e/invoice-write-path.spec.ts:131:5 › a payment issues one invoice, and the export route serves it (53ms)
  ✘  17 [chromium] › tests/e2e/invoice-write-path.spec.ts:192:5 › two concurrent payments get two distinct numbers (39ms)

  7 failed
  10 passed (11.5s)
[ELIFECYCLE] Command failed with exit code 1.
```

Not: `:131` (write-path) artık kırmızı — 2. turdan önce bu test 503'ü de pass sayıyordu,
yani bu satır kapının gerçekten kapandığının **doğrudan** kanıtı.

### 2.4 Belgenin gerçeği (kaynak sayım, iddia değil)

Yeni assertion'ların dayandığı sayılar `8118b54`'ün kendi kanıt dosyalarından ölçüldü:

```
$ grep -o '₺' docs/agent-results/TASK-MTSWLWDONWA3W-evidence/08-after-fx-note-USD.html | wc -l
1
$ grep -n '₺' .../08-after-fx-note-USD.html
121:      <td style="text-align: right; font-family: monospace;">₺4.788,90</td>
$ sed -n '118,121p' .../08-after-fx-note-USD.html
    <tr>
      <td class="label">TL karşılığı:</td>
      <td style="text-align: right; font-family: monospace;">₺4.788,90</td>
    </tr>
$ grep -o 'TL karşılığı' .../08-after-fx-note-TRY.html | wc -l
0
```

Etiket ve rakam **aynı `<tr>` içinde** → satır bazlı iddia geçerli; TRY belgesinde
"TL karşılığı" satırı yok → `lira` için eklediğim negatif iddia doğru.

### 2.5 `pnpm gate` — gerçek çıktı

Tam log: `TASK-MTU26XBVZ6H1O-evidence/round3-gate.txt`

```
$ pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify

$ eslint
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (0 errors, 2 warnings)

$ tsc --noEmit
$ vitest run --passWithNoTests
 Test Files  133 passed | 2 skipped (135)
      Tests  1582 passed | 8 skipped (1590)

✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
  Keys in messages/tr.json: 1363
  Keys in messages/en.json: 1363

✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.

Kiracıya özel model: 43 · RLS açık tablo: 49 · tenant_isolation politikası: 43
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 19 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

`tsc --noEmit` çıktısız döndü (temiz); 2 eslint uyarısı bu kartın dokunduğu dosyalarda
**değil**, önceden var.

Geçici `playwright.config.ts` değişikliği geri alındı:

```
$ git checkout -- playwright.config.ts && git status --porcelain playwright.config.ts
  (çıktı yok — dosya temiz)
```

## 3. Değişen dosyalar

| dosya | değişiklik |
|---|---|
| `tests/e2e/invoice-foreign-currency-export.spec.ts` | `rowsMentioning()` + `occurrences()` yardımcıları; `:166` testi mevzuata göre yeniden yazıldı (başlık dahil); `:259` testi aynı gerçeğe hizalandı |
| `tests/e2e/invoice-write-path.spec.ts` | yalnız yorum (`:158-163`): "503 de pass" yalanı düzeltildi |
| `docs/agent-results/TASK-MTU26XBVZ6H1O-evidence/round3-*.txt` | üç koşum logu (yeşil, kırmızı, gate) |
| `docs/agent-results/TASK-MTU26XBVZ6H1O-blok-zincir-dev-3.md` | bu rapor |

DOKUNULMADI: `src/lib/efatura.ts`, `src/lib/money.ts`, `src/lib/billing/**`, `playwright.config.ts`
(geçici probe geri alındı). Ortak ağaç kuralı: `git add -A` kullanılmadı, dosyalar tek tek eklendi.

## 4. Riskler

- **`rowsMentioning()` HTML'i `<tr>` ile bölüyor**, DOM parse etmiyor. Totals tablosu düz
  (iç içe tablo yok) olduğu sürece doğru; biri iç içe tablo eklerse iddia yanıltıcı
  olabilir — ama `occurrences(...) === 1` toplam sayımı bu durumda da koruyor.
- **`₺4.082,22` literal**: fixture (`grandTotalTryMinor: 408222`) değişirse test gürültüsüz
  değil, **gürültülü** düşer — istenen davranış bu (sessiz kayma yok).
- **`reuseExistingServer: true`** hâlâ açık; her koşumdan önce `lsof -nP -iTCP:3000` ile
  bayat sunucu olmadığını doğruladım. Başka bir pane 3000'de sunucu tutuyorsa ölçüm
  kirlenir — bu bir süit riski, bu kartın kusuru değil.
- **E2E CI'da koşmuyor**; bu yeşil yerel bir ölçüm. 2. tur raporundaki `INVOICE_SUPPLIER_*`
  CI notu hâlâ açık (aşağıya bakınız).

## 5. Açık sorular

1. `expect(lira).not.toContain('$')` iddiası HTML'in **tamamına** bakıyor; ileride
   şablona `$` içeren bir CSS/JS gelirse yanlış-kırmızı verir. Şimdilik geçiyor,
   daraltılsın mı (yalnız totals tablosu)?
2. E2E'yi CI'ya alma kararı: alınırsa `INVOICE_SUPPLIER_*` test değerleri workflow'a
   eklenmeli (2. tur raporu §"CI", satır 102-110). Bu kartın kapsamı dışında, **lider kararı**.

## 6. Sonraki adım

- Kart kapatılabilir: fatura e2e ailesi 17/17 yeşil, kapı boş env'de hâlâ kırmızı,
  `pnpm gate` temiz.
- Açık soru (2) ayrı bir karta düşsün — devredilen bulgu sahipsiz kalmasın.

## Definition of Done

- [x] `pnpm test:e2e --grep "invoice"` **0 failed** (17 passed — tam çıktı §2.2)
- [x] Hangi tarafın yanlış olduğu kaynak okunarak kanıtlandı, tek cümleyle yazıldı (§1)
- [x] Her iki düşen test de aynı gerçeğe göre hizalandı (`:166` ve `:259`)
- [x] Env boşken süit hâlâ kırmızı — 7 failed (§2.3)
- [x] `invoice-write-path.spec.ts:158-163` yorumu koda uyacak şekilde düzeltildi
- [x] `pnpm gate` gerçek çıktısı raporda (§2.5)
- [x] Rapor yazıldı, `dev`'e commit edildi
