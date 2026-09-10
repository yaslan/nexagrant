# TASK-MTVBL9HBML1ZH — the module gate in front of every LLM call

**Platform beyanı:** doğrulama macOS (darwin 25.6.0, Node/vitest + Playwright chromium) üzerinde yapıldı.
Dokunulan kod yolu platforma bağlı değil (süreç öldürme, dosya yolu, kabuk adı, ekran/DPI, cihaz izni yok —
yalnız TypeScript sunucu eylemleri ve testler). Windows/Linux'ta davranış aynıdır; koşulmadı, çünkü ayırt
edici bir platform kodu yok.

## 1. Ne yapıldı

`M2`, `M7` ve `M10` AI sunucu eylemleri hiçbir `assertModuleAccess` kapısı olmadan `@/lib/llm`'i çağırıyordu.
`M6` ve `M9` her çağrıyı kapılıyor ve gerekçesini yanına yazıyor: *"refuse before any side effect — an LLM
call writes AiUsageLog and debits CreditLedger"*. Kapısız üç modülde bugün `off` olan ya da kiracının planının
hiç satmadığı bir modül, sunucu eylemi doğrudan POST edilerek çalıştırılabiliyor, sağlayıcıya gidiyor,
`AiUsageLog` satırı yazıyor ve `CreditLedger`'ı eksiye düşürüyordu (CLAUDE.md §4).

### 1.1 Devralınan satır numaraları — kendi ölçümüm

Devralınan kök neden bir hipotezdir; üçünü de kendim ölçtüm. Denetimin verdiği üç satır **doğrulandı**:

| Denetimin iddiası | Kendi ölçümüm (düzeltme öncesi) | Durum |
|---|---|---|
| `m2:124` | `src/modules/m2/server/actions.ts:124` — `generateText({` | ✅ doğru |
| `m7:123` | `src/modules/m7/server/actions.ts:123` — `generateText({` | ✅ doğru |
| `m10:88` | `src/modules/m10/server/actions.ts:88` — `generateText({` | ✅ doğru |

### 1.2 Envanteri genişlettim — denetimin görmediği DÖRDÜNCÜ çağrı

Denetim tam envanter iddia etmemişti, bu yüzden tüm ağacı taradım:

```
$ grep -rn "generateText\|generateCompletion\|generateObject\|streamText" src/ | grep -v "^src/lib/llm"
src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts:124:  const result = await generateCompletion({   ← KAPISIZ, denetimde YOK
src/modules/m10/server/actions.ts:88:    contentText = await generateText({                                  ← kapısız
src/modules/m2/server/actions.ts:124:    const generatedText = await generateText({                          ← kapısız
src/modules/m6/server/actions.ts:85:  const resultStr = await generateText({                                 ← M6, zaten kapılı
src/modules/m6/server/esr-parser.ts:60:  const resultStr = await generateText({                              ← üretimde çağrılmıyor, aşağıya bak
src/modules/m7/server/actions.ts:123:    content = await generateText({                                      ← kapısız
src/modules/m9/server/actions.ts:66:    briefContent = await generateText({                                 ← M9, zaten kapılı
```

Kapsama eklenen dördüncü çağrı: **`concept-notes` ekranının `generateSectionDraft` eylemi**. Bu, tek
`generateText` yerine doğrudan `generateCompletion` çağıran tek üretim çağrısı — denetim `generateText`
aradığı için gözden kaçmış olabilir. Aynı modülü (`M2`) faturalıyor ve o da kapısızdı.

`src/modules/m6/server/esr-parser.ts:60` kapsam dışı bırakıldı, tahminle değil kanıtla: dosyada `'use server'`
yok (sunucu eylemi uç noktası değil), `grep -rn "parseEsrDocumentText\|extractAndSaveEsrScores" src/` üretimde
hiçbir çağıran döndürmüyor ve `src/lib/billing/catalog.ts:566`'daki fiyat notu aynısını söylüyor:
*"it has no production caller today (only tests/modules/esr-parser.test.ts reaches it)"*. Oturumu olmayan bir
kütüphane fonksiyonuna oturum kapısı takılamaz; bağlandığı gün kapıyı çağıranın açması gerekir.

### 1.3 Uygulanan düzeltme

Kapı deseni `m6`/`m9`'dan **aynen** kopyalandı — yeni desen icat edilmedi, yorum satırı dahil birebir aynı —
ve eylemin **ilk** ifadesi olarak, `requireTenantAction()`'ın ve her yan etkinin önüne konuldu:

```ts
  // Module gate: refuse before any side effect — an LLM call writes AiUsageLog
  // and debits CreditLedger, so a closed module checked later still costs credits.
  await assertModuleAccess('M7');
```

Reddediş sessiz `return` değil: `assertModuleAccess` `ModuleAccessError` fırlatır (`MODULE_OFF` ya da
`PLAN_UPGRADE_REQUIRED`). M7'de bu özellikle önemli — `generateIpChecklist`'teki `generateText` çağrısı bir
`try/catch` içinde ve hata durumunda gömülü bir metne düşüyor; kapı `try`'ın **önünde** olduğu için reddediş
yutulmuyor.

| Dosya | Kapı satırı | Kapıladığı çağrı |
|---|---|---|
| `src/modules/m2/server/actions.ts` | 72 | 128 |
| `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` | 98 | 128 |
| `src/modules/m7/server/actions.ts` | 111 | 127 |
| `src/modules/m10/server/actions.ts` | 47 | 92 |

`creditsForUsage`'a dokunulmadı, ikinci bir LLM adaptör dosyası açılmadı, `state-machine.ts` kopyalanmadı —
kapı onu `checkModuleAccess` üzerinden çağırıyor.

## 2. Kanıt

### 2.1 KIRMIZI — düzeltmeden önce (`tests/modules/ai-module-gate.test.ts`)

Test dosyası `@/lib/llm`'i **mock'lamıyor**. `generateText`'in çağrılmadığını iddia etmek düzeltmeyi
tekrarlamaktan ibaret olurdu; ispatlanması gereken iddia para hakkında, bu yüzden gerçek adaptör koşuyor ve
yazdığı iki satır — `AiUsageLog` ve `CreditLedger` — reddediş vakalarının ölçtüğü şey. Yalnız oturum,
veritabanı ve `fetch` yerine konuyor.

```
$ npx vitest run tests/modules/ai-module-gate.test.ts     # DÜZELTMEDEN ÖNCE
AssertionError: promise resolved "'note-1'" instead of rejecting                            ← M2 generateConceptNoteDraft, modül OFF
AssertionError: expected 'note-1' to be an instance of ModuleAccessError                    ← M2, plan kapsamıyor
AssertionError: promise resolved "{ text: 'generated body', …(3) }" instead of rejecting    ← M2 generateSectionDraft, modül OFF
AssertionError: expected { text: 'generated body', …(3) } to be an instance of ModuleAccessError
AssertionError: promise resolved "{ success: true, …(1) }" instead of rejecting             ← M7 generateIpChecklist, modül OFF
AssertionError: expected { success: true, …(1) } to be an instance of ModuleAccessError
AssertionError: promise resolved "{ id: 'doc-1', …(6) }" instead of rejecting               ← M10 generateStandardDoc, modül OFF
AssertionError: expected { id: 'doc-1', …(6) } to be an instance of ModuleAccessError

 Test Files  1 failed (1)
      Tests  8 failed | 4 passed (12)
```

8 reddediş testinin tamamı kırmızı; 4 mutlu yol testi zaten yeşil (regresyon tabanı).

### 2.2 YEŞİL — düzeltmeden sonra

```
$ npx vitest run tests/modules/ai-module-gate.test.ts     # DÜZELTMEDEN SONRA
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

Dört çağrı yerinin her biri için üç vaka:

- **(a) modül `off`** → `ModuleAccessError`, `fetch` çağrılmadı, `aiUsageLog.create` çağrılmadı,
  `creditLedger.create` çağrılmadı. Kiracının bakiyesi testte 500 kredi — yani "kredi yoktu zaten" mazereti
  kapalı.
- **(b) modül `on`, plan kapsamıyor** → `ModuleAccessError`, `reason === 'PLAN_UPGRADE_REQUIRED'`, yine üç
  yan etkinin hiçbiri yok (CLAUDE.md §4).
- **(c) mutlu yol** (`on` + plan kapsıyor) → geçiyor, `fetch` çağrılıyor, `AiUsageLog` satırı doğru
  `tenantId`+`module` ile, `CreditLedger` satırı `reason: usage:<Mx>` ile yazılıyor.

### 2.3 Kapı yüzünden düşen mevcut testler — gevşetilmedi, öğretildi

Kapı eklenince 5 dosyada 11 test düştü: bu dosyalar `@/lib/modules/access`'i mock'lamadığı için gerçek kapı
koşuyor, `@/lib/auth` stub'sız olduğundan oturum yok ve sonuç `NO_TENANT` reddi oluyordu (üç dosya ise
`next-auth` → `next/server` çözülemediği için hiç yüklenemiyordu). Hiçbir iddia gevşetilmedi; `m9.test.ts`'in
zaten kullandığı desen `tests/helpers/tenant-scope-mock.ts`'e ortak `moduleAccessStub()` olarak eklendi
(`tenantModuleStub` / `dbModuleStub` ile aynı sözleşme) ve beş dosyaya bağlandı:
`tests/modules/m2.test.ts`, `tests/modules/m7.test.ts`, `tests/modules/m10.test.ts`,
`tests/fabricated-fallbacks.test.ts`, `src/modules/m2/server/actions.test.ts`.

```
$ npx vitest run tests/modules/m2.test.ts tests/modules/m7.test.ts tests/modules/m10.test.ts \
    tests/fabricated-fallbacks.test.ts src/modules/m2/server/actions.test.ts \
    tests/modules/ai-module-gate.test.ts tests/modules/m9.test.ts tests/modules/m6.test.ts
 Test Files  8 passed (8)
      Tests  77 passed (77)
```

### 2.4 typecheck

```
$ pnpm typecheck
$ tsc --noEmit
                       ← çıktı yok, 0 hata
```

### 2.5 pnpm test

```
$ pnpm test
 Test Files  2 failed | 142 passed | 2 skipped (146)
      Tests  3 failed | 1718 passed | 8 skipped (1729)
```

Kalan 3 kırmızı **bu kartın değil** ve bu değişikliğin import grafiğinde değil:

- `tests/brand-surfaces-render.test.tsx` (2) — `public footer renders the product name (tr/en)`
- `tests/document-exporter.test.ts` (1) — `states that no funding body issued the document`

Nedeni: `src/lib/brand.ts:18` `PRODUCT_NAME = 'FonBridge'` (commit `9af3f63` *"feat(brand): restore FonBridge
product name"*), testler ise hâlâ `Fabrika` bekliyor. Üç testin import ettiği dosyalar (`PublicFooter`,
`@/lib/brand`, `src/lib/document-exporter`) benim dokunduğum dört dosyanın hiçbirini içermiyor ve o dosyalar
çalışma ağacında değişmemiş — yani düzeltmemden önce de kırmızıydılar. **Marka kartına ait, devrediyorum
(aşağıda §5).**

### 2.6 pnpm gate

`gate = db:generate && lint && typecheck && test && i18n:check && rls:check && rls:verify && test:e2e`.
Zincir **`test` aşamasında** kırmızı — §2.5'teki üç marka testi yüzünden — ve orada duruyor. Kartın uyardığı
`lint` aşaması (TASK-MTVBI1DP4DQGQ) bu koşuda **yeşil geçti**; duran aşama lint değil, `test`.

Zincir durduğu için kalan aşamaları tek tek koştum, hiçbirini gizlemeden:

```
$ pnpm lint
$ eslint
                       ← çıktı yok, temiz

$ pnpm i18n:check
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.

$ pnpm rls:check
✅ SUCCESS: All 44 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 19 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif/pozitif/çapraz): sınırda reddedildi
✅ 44 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.

$ pnpm test:e2e
  4 failed
    [chromium] › tests/e2e/document-export-tenant-isolation.spec.ts:97:7 › … gets its OWN organisation, not FonBridge
    [chromium] › tests/e2e/price-lock.spec.ts:71:7  › the public pricing page quotes a stranger the list price
    [chromium] › tests/e2e/price-lock.spec.ts:97:7  › the locked tenant's own billing panel still quotes the rate it joined at
    [chromium] › tests/e2e/price-lock.spec.ts:118:7 › checkout charges the locked rate, not the campaign of the day
  1 skipped
  3 did not run
  147 passed (4.9m)
```

Dört e2e kırmızısı da bu kartın dışında: biri marka (§2.5 ile aynı `FonBridge`/`Fabrika` çelişkisi), üçü
fiyat kilidi/faturalama. Bu kartın alanını doğrudan ölçen e2e'ler — `module-gate.spec.ts`,
`module-plan-gate.spec.ts`, `m10-audit-identity.spec.ts`, `m10-dual-approval-persistence.spec.ts`,
`m9-brief-*.spec.ts`, `m6-evaluator.spec.ts` — **147 geçen** arasında.

## 3. Değişen dosyalar

Üretim kodu (dördü de aynı üç satır: import + iki satır yorum + kapı çağrısı):
- `src/modules/m2/server/actions.ts`
- `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts`
- `src/modules/m7/server/actions.ts`
- `src/modules/m10/server/actions.ts`

Test:
- `tests/modules/ai-module-gate.test.ts` **(yeni)** — dört çağrı yeri × üç vaka
- `tests/helpers/tenant-scope-mock.ts` — ortak `moduleAccessStub()` eklendi
- `tests/modules/m2.test.ts`, `tests/modules/m7.test.ts`, `tests/modules/m10.test.ts`,
  `tests/fabricated-fallbacks.test.ts`, `src/modules/m2/server/actions.test.ts` — stub bağlandı

## 4. Riskler

1. **Görünür davranış değişikliği (kasıtlı).** `PLAN_GRANTS`'e göre `pro` planı M1–M6 ve M8 veriyor; **M7 ve
   M10 yalnız Ultra'da** (ya da add-on ile). Bu düzeltmeden sonra `pro` bir kiracının M7 IP kontrol listesi ve
   M10 belge üretimi eylemleri `PLAN_UPGRADE_REQUIRED` ile reddediliyor — daha önce üretip krediyi düşüyordu.
   CLAUDE.md §4'ün istediği tam olarak bu ve M9'un kapısı zaten aynı şeyi yapıyor. Kullanıcı için yeni bir
   çıkmaz sokak açmıyor: bu eylemleri barındıran dört sayfanın dördü de (`/tto`, `/concept-notes`,
   `/opportunities/[id]/documents`, `/opportunities/[id]/m2`) zaten `moduleGate()` arkasında; kapatılan delik,
   sayfa hiç render edilmeden sunucu eyleminin doğrudan POST edilmesiydi.
2. **Ortak ağaçta eşzamanlı yazım.** Bu iş sırasında `src/lib/llm.ts` başka bir kart tarafından
   (TASK-MTVBM0C2QWPCL, `AiUsageLogWriteError`) değiştirildi. Yeni testler gerçek `llm.ts`'i koştuğu için
   onların sürümüne karşı yeşil; ama iki değişiklik ayrı commit'lerde ve sıralamaya bağlı olarak birinin
   testleri diğerinden önce/sonra koşabilir.
3. Kapı `auth()` + `getEntitlements()` + bir `ModuleState` okuması ekliyor (ikisi `Promise.all` ile paralel).
   Saniyeler süren bir LLM çağrısının önünde ölçülebilir bir maliyet değil.

## 5. Açık sorular / devredilenler

- **Marka testleri kırmızı ve gate'i durduruyor** — `tests/brand-surfaces-render.test.tsx` ve
  `tests/document-exporter.test.ts` hâlâ `Fabrika` bekliyor, kod `PRODUCT_NAME = 'FonBridge'` diyor
  (`9af3f63`). Düzeltmesi beklentileri `PRODUCT_NAME`'e bağlamak; **kasten dokunmadım**, çünkü marka kartı şu
  anda aktif (ağaçta o karta ait yeni notlar var) ve aynı dosyalara girmek çakışma riski. Ama bu satır o
  kusurun düzeldiği anlamına **gelmez**: `pnpm gate` bu üç test yeşile dönene kadar kırmızı kalır ve `test`
  aşamasından ileri geçemez. Sahibi belirlenip kart açılmalı.
- Aynı şey 4 e2e kırmızısı için de geçerli (1 marka + 3 fiyat kilidi).
- `src/modules/m6/server/esr-parser.ts` üretimde çağrılmadığı için kapısız kaldı. Bir sunucu eylemine
  bağlandığı gün çağıranın `assertModuleAccess('M6')` ile açması gerekir; `catalog.ts`'deki 0-kredi notu da o
  gün yeniden ele alınmalı.
- M7 ve M10'un fiyatlandırması hâlâ `pending-owner-approval` (`AI_ACTION_CREDITS`) — bu kartın konusu değil,
  ama artık bu iki modülü yalnız Ultra kiracıları çalıştırabildiği için sahibin kararı daha az kiracıyı
  etkiliyor.

## 6. Sonraki adım

1. Marka testlerinin sahibi belirlenip kart açılsın; `pnpm gate` ancak ondan sonra uçtan uca yeşil olabilir.
2. `tests/modules/ai-module-gate.test.ts` yeni bir AI çağrı yeri eklendiğinde genişletilmeli. Bugün bunu
   zorlayan otomatik bir kural yok — "her `generateText`/`generateCompletion` çağrısının önünde
   `assertModuleAccess` olmalı" kuralını bir lint kuralına ya da `check-rls.ts` tarzı bir tarayıcı script'e
   dönüştürmek, aynı boşluğun beşinci kez açılmasını engeller.
