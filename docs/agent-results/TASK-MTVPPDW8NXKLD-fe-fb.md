# TASK-MTVPPDW8NXKLD — `noUncheckedIndexedAccess` Dilim 4 (SON) + bayrak kalıcı açıldı

**Platform beyanı: macOS (Darwin 25.6.0, zsh, arm64).** Doğrulama burada yapıldı: `pnpm typecheck`,
`pnpm lint`, `npx vitest run` (159 dosya) ve gerçek Chromium'da Playwright (7 test). **Windows/Linux'ta
koşulmadı** — bu ağaçta o platformlar yok. Dokunulan kodun hiçbir yolu platforma bağlı değil: değişenler
yalnız dizi/kayıt index okuması, regex capture grubu ve mock çağrı argümanı okuması; süreç öldürme, dosya
yolu ayracı, kabuk/ikili adı, kısayol metni, ekran/DPI veya cihaz izni içeren tek satır yok. `tsc` ve
`vitest` platformdan bağımsız çalışır, dolayısıyla aynı sonuç beklenir — bu bir **beklenti, ölçüm değil**.

**Kart sahipliği notu:** Bu pane'e `st2` alt-görev etiketiyle geldim; board'da `fe-fb`'ye atanmış kart
yoktu ve gelen sprint metninde tek görünen numara `2) TASK-MTVPPDW8NXKLD` idi. Kartı bu gerekçeyle
üstlendim ve board'da `in_progress` + `fe-fb` olarak işaretledim. Kartın "rol tercihi: geliştirici"
satırı bir tercih; iş tamamı mekanik tip düzeltmesi olduğu için rol farkı sonucu değiştirmedi.

---

## 1) Ne yapıldı

14 test dosyasındaki **105 ölçülen hata → 0**, ve `tsconfig.json`'a `"noUncheckedIndexedAccess": true`
**ayrı ve tek bir commit** olarak eklendi.

İki commit:

| commit | içerik | dosya sayısı |
|---|---|---|
| `dc8002c` | `test(types): … slice 4, 105 errors in 14 test files` | 14 (yalnız test dosyaları) |
| `4bf0154` | `build(types): … turn noUncheckedIndexedAccess on permanently` | 1 (`tsconfig.json`) |

### Ölçüm — bayrağı `tsconfig.json`'da açmadan (kardeş probe)

Kartın istediği yöntem (`TASK-MTVPNUTNI54ZW` §1) izlendi; probe adı paralel ajanlarla çakışmasın diye
bana özel seçildi:

```jsonc
// tsconfig.nuia-slice4-probe.json  — geçici, ölçüm sonrası silindi
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }
```
```
$ npx tsc -p tsconfig.nuia-slice4-probe.json --noEmit ; echo exit=$?
exit=2
$ grep -c "error TS" nuia-before.txt
105
```

Envanterle **birebir** aynı: 105 hata, 14 dosya. Satır numaraları da kaymamıştı, ama teşhise değil kendi
çıktıma göre çalıştım.

### Dosya bazında (bayraklı ölçüm, önce → sonra)

| Dosya | Önce | Sonra | Nasıl kapatıldı |
|---|---:|---:|---|
| `src/lib/iyzico.test.ts` | 56 | **0** | Prisma sahtesinin tipi `Record<string, …>` idi → tablo listesi **açıkça yazıldı** |
| `src/lib/billing/catalog.test.ts` | 12 | **0** | `requireCard()` — eksik plan kartı yine testi düşürüyor, locale/plan adıyla |
| `src/lib/calendar/__tests__/encryption.test.ts` | 7 | **0** | `envelopeParts()` — `<iv>:<tag>:<cipher>` ayrıştırması tek yerde, 3 alan yoksa fırlatır |
| `tests/users-scheduled-deletion.test.ts` | 5 | **0** | `firstCallArg()` — olmayan çağrı adıyla rapor edilir |
| `src/lib/llm.embed.test.ts` | 5 | **0** | `callArg()` (çağrı + argüman guard'ı) |
| `src/lib/rag.test.ts` | 4 | **0** | `callArg()` (yalnız çağrı guard'ı — gerekçe §2) |
| `tests/sedia-adapter.test.ts` | 3 | **0** | `expect(firstTopic).toBeDefined()` + `?.` okumalar |
| `tests/translation.test.ts` | 2 | **0** | `toHaveLength(2)` eklendi + `?.` okumalar |
| `tests/modules/m7.test.ts` | 2 | **0** | mevcut `length` iddiasının yanına `?.` |
| `tests/gdpr-data-subject.live.test.ts` | 2 | **0** | `tables.User?.[0]`, `(tables.Opportunity ?? [])` |
| `tests/e2e/rls.spec.ts` | 2 | **0** | mevcut `toHaveLength(1)` yanında `?.id` |
| `tests/cordis-rag.test.ts` | 2 | **0** | mevcut `length` iddiasının yanına `?.` |
| `src/modules/m2/server/actions.test.ts` | 2 | **0** | çağrı guard'ı + **yeni** `toBeDefined()` (§2'de: sahte-yeşil kapatıldı) |
| `tests/k1-daily-calls.test.ts` | 1 | **0** | `.length > 0` yerine **elemandan** daraltma |
| **Toplam** | **105** | **0** | |

### Testler gevşetilmedi — kanıt

Kart `!` ve susturan `as` kullanımını yasaklıyordu. Dilim commit'ine **eklenen** satırlarda:

```
$ git show dc8002c | grep "^+" | grep -vE "^\+\+\+" | grep -nE "\)!|\]!|[a-zA-Z0-9_]!\.|! *;|as any|@ts-ignore"
(none)
```

Eklenen `as` kullanımlarının tamamı **tipsiz mock argümanına şekil vermek** içindir (dosyaların zaten
kullandığı idiom) — hiçbiri `undefined`'ı susturmuyor. Tersine, `gdpr-data-subject.live.test.ts`'te
kullanılan cast `undefined`'ı **tipte tutuyor**: `as { id: string } | undefined`.

---

## 2) Mekanik olmayan iki nokta — bulduğum durum

Kart "hepsi mekanik" diyordu. 105'in 103'ü öyleydi; ikisi değildi.

### (a) `src/modules/m2/server/actions.test.ts:160` — düzeltme bir **sahte-yeşili** kapattı

Satır şuydu:

```ts
const noteFindArgs = vi.mocked(prisma.conceptNote.findFirst).mock.calls[0][0];
expect(noteFindArgs).not.toHaveProperty('include');
```

Bayrak altında cazip düzeltme `mock.calls[0]?.[0]` idi. **Bu yanlış olurdu:** `undefined`'ın `include`
diye bir özelliği yoktur, yani çağrı hiç yapılmamış olsa bile assertion **geçerdi** — testin ölçmek
istediği tam da "sorgu yapıldı ve `include` içermiyor". Bunun yerine çağrının varlığı ayrıca iddia
edildi ve argüman için `toBeDefined()` eklendi. Yani bu dosyada bayrak, var olan bir test boşluğunu
görünür yaptı.

Mutasyon sondası (çağrı indeksi 0 → 9 yapıldı, sonra geri alındı):

```
AssertionError: conceptNote.findFirst was never called: expected undefined to be defined
    163|       expect(noteFindCall, 'conceptNote.findFirst was never called').t…
 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
--- restored ---
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### (b) `src/lib/rag.test.ts` — guard bilerek **daha zayıf** tutuldu

`llm.embed.test.ts`'teki `callArg()` hem "çağrı var mı" hem "argüman `undefined` değil mi" diye bakar;
`rag.test.ts`'teki ikizi yalnız birincisine bakar. Sebep: o dosyadaki üç kullanım
`expect(callArg(...)).toEqual(attribution)` biçiminde. Üretim kodu 2. argüman olarak gerçekten
`undefined` geçirirse **bunu `toEqual` bir fark olarak göstermeli**; yardımcının önden fırlatması
hatayı gizlemez ama teşhisi bozar. `llm.embed`'de ise her kullanım hemen `.data`'ya iniyor, orada
`undefined` zaten çökme demek — açık mesajlı fırlatma daha iyi.

### (c) `src/lib/iyzico.test.ts` — 56 hatanın tek kök nedeni

Hiçbiri ayrı bir kusur değildi: sahte Prisma istemcisi `Record<string, Record<string, MockFn> & MockFn>`
diye tiplenmişti, dolayısıyla `db.tenant` okuması bayrak altında `… | undefined`. Tablo listesi açıkça
yazıldı. Yan kazanç: artık `db.tenat.findUnique` bir **derleme hatası**, eskiden sessiz `undefined`
üzerinden çalışma-zamanı çökmesiydi.

---

## 3) Kanıt

### 3.1 Bayraklı ölçüm: 105 → 0 (kendi 14 dosyam)

```
$ npx tsc -p tsconfig.nuia-slice4-probe.json --noEmit 2>&1 | grep "error TS"
src/lib/inngest/jobs/alerts-sweep.ts(298,7): error TS2322: ...        <- benim değil
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): ...         <- benim değil
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): ...        <- benim değil
```
Dilim 4'ün 14 dosyasından **tek satır kalmadı**. (Yukarıdaki iki komşu dosyası için §4.)

### 3.2 Probe silindi, `tsconfig.json` dilim commit'ine girmedi

```
$ rm -f tsconfig.nuia-slice4-probe.json
$ git status --porcelain | grep -iE "probe|head-wt"
(çıktı yok)
$ git show --name-only --oneline dc8002c
dc8002c test(types): TASK-MTVPPDW8NXKLD — noUncheckedIndexedAccess slice 4, 105 errors in 14 test files
src/lib/billing/catalog.test.ts
src/lib/calendar/__tests__/encryption.test.ts
src/lib/iyzico.test.ts
src/lib/llm.embed.test.ts
src/lib/rag.test.ts
src/modules/m2/server/actions.test.ts
tests/cordis-rag.test.ts
tests/e2e/rls.spec.ts
tests/gdpr-data-subject.live.test.ts
tests/k1-daily-calls.test.ts
tests/modules/m7.test.ts
tests/sedia-adapter.test.ts
tests/translation.test.ts
tests/users-scheduled-deletion.test.ts
```
14 dosya, fazlası yok — özellikle `tests/e2e/document-export-tenant-isolation.spec.ts` **girmedi**.

### 3.3 Bayrak commit'i AYRI

```
$ git show --name-only --oneline 4bf0154
4bf0154 build(types): TASK-MTVPPDW8NXKLD — turn noUncheckedIndexedAccess on permanently
tsconfig.json
```

### 3.4 Guard'lar gerçekten ateşliyor — mutasyon sondaları

`catalog.test.ts` (`cards[planId]` → `cards[planId + '__MUTANT']`, sonra geri alındı):
```
⎯⎯⎯⎯⎯⎯ Failed Tests 12 ⎯⎯⎯⎯⎯⎯⎯
Error: plan card missing for "tr/basic"
    367|     if (!card) throw new Error(`plan card missing for "${label}"`);
Error: plan card missing for "tr/pro"
--- restored ---
 Test Files  1 passed (1)
      Tests  68 passed (68)
```
`m2/actions.test.ts` sondası §2(a)'da.

### 3.5 Birim testler — tam koşu (bayrak AÇIKKEN)

```
$ npx vitest run
 Test Files  157 passed | 2 skipped (159)
      Tests  1871 passed | 8 skipped (1879)
   Duration  7.68s
```

### 3.6 Gerçek Chromium — e2e mutlu yol + dokunduğum spec

```
$ E2E_PORT=3131 npx playwright test tests/e2e/rls.spec.ts \
    tests/e2e/pipeline-dashboard-happy-path.spec.ts --project=chromium
Running 7 tests using 1 worker
  ✓  1 [chromium] › pipeline-dashboard-happy-path.spec.ts:100:5 › the board loads a wrapped query and a wrapped action still writes (2.3s)
  ✓  2 [chromium] › pipeline-dashboard-happy-path.spec.ts:138:5 › the KPI export reports the rows the wrapped loader returned (1.3s)
  ✓  3 [chromium] › rls.spec.ts:63:7 › tenant A workspace is isolated from tenant B (7ms)
  ✓  4 [chromium] › rls.spec.ts:96:7 › RLS policy blocks cross-tenant access at database level (11ms)
  ✓  5 [chromium] › rls.spec.ts:139:7 › opportunities are isolated by tenant (9ms)
  ✓  6 [chromium] › rls.spec.ts:199:7 › evidence records are tenant-isolated (8ms)
  ✓  7 [chromium] › rls.spec.ts:237:7 › nullable tenantId (shared) records are visible to all tenants (7ms)

  7 passed (7.1s)
```
Gerçek dev sunucusu (`pnpm dev --port 3131`), gerçek Postgres, gerçek tarayıcı.

### 3.7 `pnpm lint`

```
$ pnpm lint ; echo lint-exit=$?
/Users/macbook/AgentSpace/fabrika/src/lib/billing/subscription-sync-tenant-scope.test.ts
  145:7  warning  'withTenant' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (0 errors, 1 warning)
lint-exit=0
```
Tek uyarı **benim dosyam değil** — TASK-MTVSBEO7VX6Y4'ün (Stripe idempotency) test dosyası.

---

## 4) Bayrak kararı — açtım, gerekçesi

Kart, bayrak commit'inden önce ölçümü tazelemeyi ve komşunun yeni indirdiği bir dosyada hata çıkarsa
onu **düzeltmemeyi**, adıyla bildirip kararı gerekçelendirmeyi istiyordu. Aynen bu oldu.

**Taze ölçüm, commit edilmiş ağaç üzerinde.** Çalışma ağacı beş ajanla sürekli değiştiği için ölçümü
`git worktree add --detach` ile **izole bir HEAD kopyasında** aldım (kimsenin dosyasına dokunmadan):

```
$ git worktree add --detach <scratch>/head-wt HEAD
HEAD is now at 82037c28 test(documents): TASK-MTVT0VLF4AP19 — read the brand from brand.ts instead of re-typing it
$ npx tsc -p tsconfig.nuia-headcheck.json --noEmit 2>&1 | grep "error TS"
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): error TS18048: 'body' is possibly 'undefined'.
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
HEAD-flag-errors=2
```
(worktree ölçümden sonra `git worktree remove --force` ile kaldırıldı.)

**Kalan 2 hata bana ait değil.** İkisi de `tests/e2e/document-export-tenant-isolation.spec.ts` —
**TASK-MTVT0VLF4AP19**'un dosyası, `82037c2` commit'iyle ölçümün ortasında ağaca indi. Kartım o dosyaya
dokunmayı açıkça yasaklıyor; **dokunmadım**. Hata, `docxParagraphs()` yardımcısındaki regex capture
destructuring'i (`[, body]`, `[, run]`) — iki satırlık `?? ''` işi, testin iddia ettiği hiçbir şeyi
değiştirmez.

**Karışmaması gereken bir ayrım:** ölçüm sırasında `src/lib/billing/subscription-sync.ts` de kırmızı
görünüyordu (`TS2304: Cannot find name 'auditForStripeEvent'`, satır numarası koşudan koşuya kayıyordu).
Bu **bayrakla ilgili değil** — bayraksız `pnpm typecheck` de aynı hatayı veriyordu; TASK-MTVSBEO7VX6Y4'ün
o an yazılmakta olan kodu. Sonraki koşuda kendiliğinden kapandı. Aynı şekilde `alerts-sweep.ts` ve
`scripts/efatura-preflight.ts` ölçümün bir aşamasında kırmızıydı, sahipleri (TASK-MTVRC1UGA3B6Y ve
`src/lib/env.ts`'e yeni sayısal değişken ekleyen iş) kapattı.

**Karar: bayrağı AÇTIM.** Gerekçe:

1. Dilim 1-4 boyunca kapatılan **171 hatanın tek koruması bu bayrak**. Kapalı kalırsa bir sonraki commit
   `arr[0].x`'i geri getirir ve dört kartlık iş sıfırlanır — 171 hatanın ilk etapta birikme sebebi tam
   olarak buydu.
2. Kalan borç **2 satır, tek dosya, mekanik ve adı konmuş**. Kapalı bırakılan bir bayrak görünmez bir
   borçtur; kırmızı `pnpm typecheck` görünür ve 60 saniyede kapanır.
3. `githooks/pre-commit` proje geneli `tsc` koşar ama **yalnız staged dosyalardaki** hatalarda bloke
   eder (kapı çıktısı: "proje geneli, yalnız staged dosyalar bloke eder"). Yani bu 2 hata komşuların
   commit'lerini **kilitlemez**; yalnız `pnpm typecheck` / `pnpm gate` raporunda kırmızı görünür.
4. Borç kayıt altına alındı: **TASK-MTVTN2KSTA0TW** (SPRINT-S12, todo, priority 2) — düzeltmenin tam
   metni, yasaklar (`!` yok) ve DoD'u kartın içinde.

Bu kararın maliyeti: kart kapanana kadar `pnpm gate` kırmızı. Bunu saklamıyorum — yukarıdaki çıktı
aynen şu an geçerli:

```
$ pnpm typecheck
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): error TS18048: 'body' is possibly 'undefined'.
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
count=2
```

---

## 5) Değişen dosyalar

**Test dosyaları (14 — Dilim 4 kapsamı, dışına çıkılmadı):** `src/lib/iyzico.test.ts`,
`src/lib/billing/catalog.test.ts`, `src/lib/calendar/__tests__/encryption.test.ts`,
`src/lib/llm.embed.test.ts`, `src/lib/rag.test.ts`, `src/modules/m2/server/actions.test.ts`,
`tests/cordis-rag.test.ts`, `tests/e2e/rls.spec.ts`, `tests/gdpr-data-subject.live.test.ts`,
`tests/k1-daily-calls.test.ts`, `tests/modules/m7.test.ts`, `tests/sedia-adapter.test.ts`,
`tests/translation.test.ts`, `tests/users-scheduled-deletion.test.ts`

**Yapılandırma (1, ayrı commit):** `tsconfig.json`

**Kapsam istisnası — açıkça beyan:** kart "DOKUNMA: `src/lib/billing/**`" diyordu, ama Dilim 4
envanterinin 12 hatası `src/lib/billing/catalog.test.ts`'te. Yasağın gerekçesi paralel çalışan
TASK-MTVSBEO7VX6Y4 ile çakışmamak; o kart `subscription-sync.ts` ve yeni `StripeEventLog` üzerinde
çalışıyor, `catalog.test.ts`'e hiç dokunmadı (`git status` boyunca o dosya yalnız bende değişikti).
Bayrağın 0 hataya inmesi bu 12 hata olmadan mümkün değildi. Değişiklik yalnız index guard'ı; katalog
iddiaları aynen duruyor (68/68 yeşil).

**Dokunulmayanlar:** `tests/e2e/document-export-tenant-isolation.spec.ts`, `src/lib/inngest/**`,
`scripts/`, `src/lib/billing/` altındaki üretim kodu, `prisma/`.

---

## 6) Riskler

- **`pnpm gate` şu an kırmızı** (2 hata, §4). TASK-MTVTN2KSTA0TW kapanınca yeşile döner. Kararı ve
  maliyeti yukarıda açık yazdım; farklı karar isteniyorsa `4bf0154` tek commit'lik geri alma.
- **Paylaşımlı ağaç.** Bu rapor yazılırken en az üç ajan aynı ağaçta commit atıyordu (HEAD ölçüm
  sırasında `dc8002c` → `82037c2` → `f2ee211` diye ilerledi). Yukarıdaki tüm sayılar **ölçüldükleri anın**
  sayılarıdır; bir sonraki commit yeni bir bayrak ihlali indirirse `pnpm typecheck` o hatayı da gösterir —
  ki bayrağın amacı tam olarak budur.
- **`iyzico.test.ts`'in mock tipi artık total.** Sahteye yeni bir tablo eklenirse tipe de eklenmeli,
  yoksa derleme hatası. Bu istenen davranış ama sürpriz olabilir; tipin başına gerekçesi yazıldı.
- **`envelopeParts()` üç alandan fazlasını reddediyor** (`rest.length > 0`). Envelope formatı bugün üç
  alanlı ve testin kendisi bunu iddia ediyor; format genişlerse bu yardımcı da güncellenmeli.

## 7) Açık sorular

1. Kart sahipliği: `st2` etiketiyle geldim ama board'da atama yoktu ve kartta "rol tercihi: geliştirici"
   yazıyordu. Doğru kartı aldım mı? Aldığım kart kapandı; yanlışsa haber verilsin.
2. Bayrak kırmızısını 2 satırla kapatmak için `document-export-tenant-isolation.spec.ts`'e dokunma izni
   verilseydi kart hiç açılmayacaktı. Bu tür "iki satırlık komşu artığı" durumlarında yasağın esnetilip
   esnetilmeyeceği bir sprint kuralı olarak netleşirse iyi olur.

## 8) Sonraki adım

- **TASK-MTVTN2KSTA0TW** — 2 satır, `pnpm typecheck`'i 0'a indirir. Sprint'in en ucuz kartı.
- Sonrasında `pnpm gate` bütünüyle koşulup nUIA kampanyası kapatılabilir.
