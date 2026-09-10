# TASK-MTV8VEB2D63J2 — retired brand: outward-facing beta survey copy + four orphaned files

**Agent:** blok-zincir-dev · **Sprint:** S12 (yedinci dalga) · **Platform:** macOS (darwin 25.6.0)
**Commits:** `3167d27` (orphan adoption) · `7b7e960` (beta survey brand binding)

## 1. Ne yapıldı

### (a) Dört sahipsiz dosya sahiplenildi — `3167d27`
Önceki tur pane'i öldüğünde commit'lenmemiş kalan dört doğru düzeltme. Diff okundu, doğruluğu
teyit edildi, ilgili testler koşuldu, sonra adlarıyla commit edildi:

| Dosya | Değişiklik | Neden önemli |
|---|---|---|
| `src/lib/adapters/eurostars.ts` | `User-Agent: 'Fabrika/1.0'` → `'FonBridge/1.0'` | Eurostars portalının **gerçekten gördüğü ve logladığı** alan |
| `src/lib/adapters/tubitak.ts` | aynı | TÜBİTAK portalının gördüğü alan |
| `src/lib/billing/invoice-writer.test.ts` | fatura satırı beklentileri (3 yer) | — |
| `src/lib/billing/subscription-sync.test.ts` | Stripe satır metni beklentileri (2 yer) | mevcut diff aynen alındı, yeni değişiklik yapılmadı (kart kuralı) |

### (b) İki beta dosyası `PRODUCT_NAME`'e bağlandı — `7b7e960`
`src/lib/beta/pricing-survey-email.ts` (6 yer) ve `src/lib/beta/pricing-survey.ts` (7 yer).
Literal yazılmadı; hepsi tek kaynaktan okunuyor.

**Desen seçimi — yeni desen icat edilmedi.** `withBrand()` DEĞİL, doğrudan `PRODUCT_NAME`
interpolasyonu kullanıldı. Gerekçe: `withBrand()` katalog JSON'undaki `{brand}` yer tutucusunu
dolduran yardımcıdır; bu iki dosyanın metni katalogda değil, kod içi `COPY`/soru tablosunda
yaşıyor. Aynı dizindeki **`src/lib/beta/invite-email.ts` tam olarak aynı kısıtta** (React dışı,
senkron, iki dil tek tabloda) ve bu sorunu zaten `import { PRODUCT_NAME } from '../brand'` +
template literal ile çözmüş (`invite-email.ts:16,40,43,66`). Komşu dosyanın deseni tekrarlandı.

**Türkçe ekler:** deponun yerleşik biçimi izlendi — `messages/tr.json` markayı `{brand}'da`
(satır 1117) ve `{brand}'nın` (satır 605) olarak çekimliyor, yani ünlüyle biten + kalın ünlü
uyumu. Buna göre `Fabrika’da` → `${PRODUCT_NAME}'da`, `Fabrika’yı` → `${PRODUCT_NAME}'yı`.
Tipografik `’` yerine deponun kullandığı düz `'` alındı.

### (c) Muhafız 5/5 yeşil — `HISTORICAL_RECORD`'a DOKUNULMADI
`tests/retired-brand-name.test.ts` değiştirilmedi; iki dosya listeye eklenmedi. Bunlar canlı
giden metin, tarihsel kayıt değil.

## 2. Kanıt

### Muhafız — 5/5 geçiyor (`HISTORICAL_RECORD` değişmeden)
```
$ npx vitest run tests/retired-brand-name.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
   Duration  188ms
```

### Muhafız gerçekten kırmızıya dönebiliyor (negatif kontrol)
Canlı dosyaya bilerek `Fabrika` yazıldı (`pricing-survey-email.ts:32`):
```
$ grep -n "Beta — fiyat doğrulama" src/lib/beta/pricing-survey-email.ts
32:    subject: `Fabrika Beta — fiyat doğrulama anketi (8 dakika)`,

$ npx vitest run tests/retired-brand-name.test.ts
 FAIL  tests/retired-brand-name.test.ts > retired product name > no live source file outside the documented record names the retired brand
AssertionError: expected [ Array(1) ] to deeply equal []
- []
+ [
+   "src/lib/beta/pricing-survey-email.ts",
+ ]
 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```
Geri alındı:
```
$ grep -n "Beta — fiyat doğrulama" src/lib/beta/pricing-survey-email.ts
32:    subject: `${PRODUCT_NAME} Beta — fiyat doğrulama anketi (8 dakika)`,

$ npx vitest run tests/retired-brand-name.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### Anket e-postası GERÇEKTEN üretildi — üretim yolu, elde yazılmış harness değil
`pnpm beta:pricing` (script'in kendi güvenlik modeli: `--send` olmadan hiçbir şey gönderilmez):
```
$ pnpm beta:pricing
[beta-pricing] roster       10 partners from docs/BETA_DATA/beta-partners.csv
[beta-pricing] survey       questionnaire + Google Apps Script written for tr, en (25 questions)
[beta-pricing] mail         beta-anadolu-teknoloji: rendered-only (tr)
... (10 partner)
[beta-pricing] done         rendered — pass --send with real addresses and form URLs to deliver
```

**TR e-posta** (`docs/BETA_DATA/generated/pricing-survey/mail/beta-anadolu-teknoloji.txt`):
```
Subject: FonBridge Beta — fiyat doğrulama anketi (8 dakika)
To: partner01@example.invalid

Merhaba Design Partner 01,

Beta’nın 7. haftasındayız ve sıra en açık sorumuzda: FonBridge Anadolu Teknoloji A.Ş. için ne
kadar eder? Fiyatı sizinle birlikte belirlemek istiyoruz, size sunmadan önce.
...
Teşekkürler,
FonBridge ekibi

Soru ya da itirazınız olursa feedback@fabrika.dev adresine yazın; anket dışı da konuşuruz.
```

**EN e-posta** (`.../mail/beta-benelux-innov.txt`):
```
Subject: FonBridge Beta — pricing validation survey (8 minutes)
To: partner08@example.invalid

Hello Design Partner 08,

We are in week 7 of the beta, and it is time for our most direct question: what is FonBridge
worth to Benelux Innovation BV? We would rather set the price with you than present it to you.
...
Thank you,
The FonBridge team

Write to feedback@fabrika.dev with any question or objection — we are happy to talk outside the form.
```
(Son satırdaki `feedback@fabrika.dev` benim değişikliğim değil — bkz. §4 Riskler/bitişik bulgu.)

### Apps Script üreticisinin çıktısı — form başlığı
```
$ sed -n '1,9p' docs/BETA_DATA/generated/pricing-survey/google-form-tr.gs
/**
 * Generated by scripts/beta-pricing-survey.ts — do not edit by hand.
 * FonBridge E11.4 pricing survey (tr). Paste into script.google.com and Run createForm().
 ...
function createForm() {
  var form = FormApp.create('FonBridge Beta — Fiyat Doğrulama Anketi');

$ sed -n '8p' docs/BETA_DATA/generated/pricing-survey/google-form-en.gs
  var form = FormApp.create('FonBridge Beta — Pricing Validation Survey');
```
Soru içindeki marka geçişleri (üretilmiş .gs'ten):
```
tr:17 .setHelpText('FonBridge\'da koltuk açacağınız kişi sayısı. — tam sayı')
tr:26 .setTitle('[vwTooCheap] Hangi aylık fiyatta FonBridge\'yı o kadar ucuz bulursunuz ki ...')
en:17 .setHelpText('The number of people you would give a seat in FonBridge. — a whole number')
en:26 .setTitle('[vwTooCheap] At what monthly price would FonBridge be so cheap that ...')
```
Eklediğim kesme işareti tek tırnaklı Apps Script literalinin içine düştüğü için üretilen betiğin
hâlâ ayrıştığı doğrulandı (`gsString` kaçışı doğru çalışıyor):
```
$ node --check google-form-tr.gs.js && node --check google-form-en.gs.js
PARSE OK: docs/BETA_DATA/generated/pricing-survey/google-form-tr.gs
PARSE OK: docs/BETA_DATA/generated/pricing-survey/google-form-en.gs
```

**Markdown atölye kitapçığı başlıkları:**
```
# FonBridge Beta — Fiyat Doğrulama Anketi
# FonBridge Beta — Pricing Validation Survey
```

### Değişikliği fiilen koşturan testler
```
$ npx vitest run tests/beta/
 Test Files  7 passed (7)
      Tests  96 passed (96)

$ npx vitest run src/lib/billing/invoice-writer.test.ts src/lib/billing/subscription-sync.test.ts
 Test Files  2 passed (2)
      Tests  30 passed (30)
```

### `pnpm gate` — HANGİ COMMIT: `7b7e960` (beta dosyaları), lint aşaması ÖNCEDEN KIRMIZI
`pnpm gate` = `db:generate && lint && typecheck && test && i18n:check && rls:check && rls:verify && test:e2e`.
**Kapı `lint` aşamasında düşüyor ve bu benim değişikliğim değil.** Ölçüm:
```
$ pnpm lint
✖ 23684 problems (1960 errors, 21724 warnings)

# hatalı dosyalar hangi ağaçta?
465  .claude/worktrees/zztest-validation/…   (başka bir ajanın iç içe worktree'si)
  2  docs/agent-results/…-evidence/*.mts     (yalnız warning)
  0  src/

$ pnpm lint 2>&1 | grep "beta/pricing-survey"
(boş — benim iki dosyam sıfır lint çıktısı üretiyor)
```
Kırmızının kaynağı: eslint, depo içine açılmış `.claude/worktrees/zztest-validation/` worktree'sini
(deponun ikinci bir tam kopyası) taranıyor. 1960 hatanın tamamı oradan geliyor; `src/` altında sıfır.

Kapının geri kalan aşamaları tek tek koşuldu:
```
$ pnpm typecheck        → tsc --noEmit, çıktı yok (temiz)
$ pnpm i18n:check       → ✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
$ pnpm rls:check        → ✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.
$ pnpm test             → Test Files 2 failed | 141 passed | 2 skipped (145)
                          Tests 3 failed | 1700 passed | 8 skipped (1711)
```
`pnpm test`'teki 3 kırmızı da benim değil (bkz. §4). `rls:verify` ve `test:e2e`, kapı zaten lint'te
durduğu için ayrıca koşulmadı — **koşulmadı, atlanmadı**; not olarak yazıyorum.

### Kalıntı sayacı
```
$ grep -rl "Fabrika" src/ next.config.ts | wc -l
1
$ grep -rl "Fabrika" src/ next.config.ts
src/lib/brand.ts
```
13 → **1**, ve kalan tek dosya `brand.ts`'in kendisi: yeniden adlandırma tarihini anlatan ve
`HISTORICAL_RECORD`'da meşru olarak listelenen doküman bloğu.

## 3. Değişen dosyalar
`3167d27` — `src/lib/adapters/eurostars.ts`, `src/lib/adapters/tubitak.ts`,
`src/lib/billing/invoice-writer.test.ts`, `src/lib/billing/subscription-sync.test.ts`
`7b7e960` — `src/lib/beta/pricing-survey.ts`, `src/lib/beta/pricing-survey-email.ts`

Dokunulmayanlar (kart gereği): `src/lib/billing/subscription-sync.ts`, `smtp-form.tsx`,
`src/lib/env.ts`, `tests/retired-brand-name.test.ts`.

## 4. Riskler ve BİTİŞİK BULGULAR (düzeltilmedi — adıyla bildiriliyor)

**B1 — Muhafız markanın ALAN ADI biçimini göremiyor. Dışarı giden e-postada emekli marka var.**
Muhafız `RETIRED = 'Fabrika'` (büyük F) arıyor; küçük harfli alan adları bu taramaya görünmez.
Az önce ürettiğim gerçek anket e-postasının footer'ı hâlâ emekli markayı taşıyor:
`Soru ya da itirazınız olursa feedback@fabrika.dev adresine yazın`.
Kaynak `src/lib/beta/constants.ts:50`. Ölçüm:
```
$ grep -rn "fabrika\.\(dev\|app\|eu\|io\)" src/ --include="*.ts" --include="*.tsx" | wc -l
23        (14 dosya)
  16  fabrika.app      4  fabrika.dev      2  fabrika.io      1  fabrika.eu
```
Dört farklı alan adı varyantı; bazıları **giden postanın zarf başlığında**
(`alerts-daily.ts:164` ve `digest-run.ts:95`: `from: env.EMAIL_FROM || 'FonBridge <no-reply@fabrika.app>'`
— marka yeni, alan adı emekli, aynı satırda). Düzeltmedim: (1) kartımın kapsamı dışında,
(2) hangi alan adının gerçekten kayıtlı olduğu bir iş kararı, kodda ölçülemiyor. **Karar sizde.**

**B2 — `pnpm test`'te 3 kırmızı, benim değişikliğimden bağımsız ve önceden var.**
```
FAIL tests/brand-surfaces-render.test.tsx > public footer renders the product name (tr)
FAIL tests/brand-surfaces-render.test.tsx > public footer renders the product name (en)
FAIL tests/document-exporter.test.ts > document provenance > states that no funding body issued …
     expect: "Bu belge Küçük Danışmanlık Ltd. tarafından Fabrika'da hazırlanmıştır"
```
Bunlar EMEKLİ markayı bekleyen bayat iddialar. Benim değişikliğimle ilişkisiz olduğu ölçüldü:
her iki dosya da `src/lib/beta`'dan hiçbir şey import etmiyor ve `git status` ile
**commit'li HEAD içeriğinde**, yani çalışma ağacında değiştirilmemiş durumdalar. Düzeltmedim.

**B3 — eslint iç içe worktree'yi tarıyor.** `.claude/worktrees/zztest-validation/` deponun ikinci
bir kopyası ve eslint ignore listesinde değil; kapının lint aşamasını tek başına kırmızıya
çeviren şey bu (1960 hatanın 1960'ı). Düzeltmesi `eslint.config`/ignore dosyasına dokunmayı
gerektirir — her ajanı etkiler, kapsamım dışında.

**B4 (düşük)** — Türkçe ekler (`'da`, `'yı`) marka adına göre elle yazılmış durumda; ad yeniden
değişirse ünlü uyumu elle gözden geçirilmeli. Bu, deponun mevcut kabul edilmiş deseni
(`invite-email.ts`, `messages/tr.json` aynısını yapıyor) — yeni bir borç eklemiyorum, mevcut
olanı not ediyorum.

## 5. Açık sorular
1. **B1:** Emekli alan adı 4 varyantta 14 dosyada; hangisi canlı? (`usfinbridge.com` SMTP kartında
   geçiyor.) Tek bir alan adına süpürme ayrı bir kart mı olsun?
2. Muhafız `RETIRED` taramasını alan adı biçimini de yakalayacak şekilde genişletsin mi
   (`/fabrika/i`)? Bugünkü haliyle B1 sınıfını hiçbir zaman göremez.

## 6. Sonraki adım
- B1 için karar → alan adı süpürme kartı.
- B2'deki 3 bayat testin sahibi belirlenip düzeltilmeli (marka geçişinin son artığı).
- B3 için `.claude/worktrees` eslint ignore'a alınmalı; aksi halde `pnpm gate` hiçbir ajan için
  yeşile dönemez.

## Platform beyanı
**macOS (darwin 25.6.0, zsh) üzerinde doğrulandı.** Windows/Linux koşulmadı — **gerek yok:**
dokunduğum kod yolunda platforma bağlı hiçbir şey yok. Değişiklik tamamen saf string
interpolasyonu (`${PRODUCT_NAME}`); süreç öldürme, dosya yolu, kabuk/ikili adı, ekran/DPI ya da
cihaz izni içermiyor. `pnpm beta:pricing` yalnız dosya okuyup yazıyor ve yolları `path.resolve`
ile kuruyor. Üretilen e-posta/Apps Script metni platformdan bağımsızdır; TR karakterler
(`ş, ğ, İ, ’`) UTF-8 kaynak dosyada yaşıyor ve Node'un varsayılan UTF-8 okumasıyla geliyor,
kod sayfası bağımlılığı yok.
