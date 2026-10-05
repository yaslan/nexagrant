# TASK-MTV4ZJEECXNDE — SPIKE: `TenantScopedDb` markalı (nominal) tip yapılmalı mı?

**Ajan:** blok-zincir-dse (Tasarımcı / DSE-EN) · **Sprint:** SPRINT-S12 · **Tip:** spike
**Ürün kodu sevk edildi mi:** HAYIR. İki deney + bir sonda uygulandı, üçü de geri alındı; commit edilen tek dosya bu rapordur.
**Platform:** macOS (Darwin 25.6.0, arm64), Node/pnpm yerel. Bkz. "Platform beyanı".

---

## 1. Ne yapıldı

`TenantScopedDb` (`src/modules/m6/server/scoring.ts:21`) bugün **yapısal** (structural) bir tip:

```ts
export type TenantScopedDb = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
```

Kendi doküman yorumu bunu zaten itiraf ediyor (scoring.ts:19): *"a plain `prisma` still satisfies it structurally"*. Yani tip, adının verdiği sözü — "bu istemci kiracı kapsamlı bir işlem içinden geldi" — **tutmuyor**. Soru: markalı (nominal) hale getirmenin çarpma yarıçapı ne?

Yapılanlar: (a) tipi alan fonksiyonlar ve çağıranları sayıldı ve üç kovaya ayrıldı, (b) markalı tip **iki farklı biçimde** geçici uygulanıp `pnpm typecheck` hata sayısı ölçüldü ve geri alındı, (c) iki-argümanlı ölü string formunun çağıranları yeniden ölçüldü ve silinmesinin maliyeti ölçüldü.

> **Not — kart açıklaması okunamadı:** `list_tasks` bu kurulumda yalnız başlık döndürüyor (`assignee`+`status` ile tek satıra indirildiğinde de). Kartın tam şartname gövdesine araçla erişemedim; iş, bana verilen görev metnindeki özet maddelere göre yürütüldü. Şartnamede özette olmayan bir madde varsa karşılanmamış olabilir.

---

## 2. Kanıt

### 2.1 Envanter — tipi alan fonksiyonlar (15 fonksiyon, 19 parametre konumu)

```
$ grep -rn "TenantScopedDb" --include="*.ts" --include="*.tsx" . | grep -v node_modules | wc -l
38   # 27 src + 11 tests  (aşağıda dosya bazında)

$ grep -rn "^  db: TenantScopedDb,\|^  dbOr[A-Za-z]*: TenantScopedDb" \
    src/modules/m6/server/scoring.ts src/modules/m6/server/comparison.ts | wc -l
19   # parametre konumu sayısı (aşırı yüklemeler dahil)
```

Ayrık fonksiyon: **15** — `scoring.ts` 9, `comparison.ts` 6.

| Dosya | Fonksiyon | Çağıran sayısı (üretim / test) |
|---|---|---|
| scoring.ts:294 | `getPanelScoresForProposal` | **1 / 0** |
| scoring.ts:379 | `calculateCriterionAverage` (2 aşırı yükleme) | **0 / 2** (+3 negatif derleme testi) |
| scoring.ts:406 | `calculateCriterionAverageInternal` | 2 / 0 (iç) |
| scoring.ts:433 | `calculateEvaluationScore` (2 aşırı yükleme) | **0 / 2** (+2 negatif) |
| scoring.ts:460 | `calculateEvaluationScoreInternal` | 2 / 0 (iç) |
| scoring.ts:528 | `getScoreDistribution` (2 aşırı yükleme) | **0 / 2** (+2 negatif) |
| scoring.ts:555 | `getScoreDistributionInternal` | 2 / 0 (iç) |
| scoring.ts:583 | `updateEvaluationScore` | **1 / 0** |
| scoring.ts:640 | `getCalibrationMatrix` | **0 / 0 — ÖLÜ** |
| comparison.ts:31 | `compareM6ToESR` (2 aşırı yükleme) | **0 / 3** |
| comparison.ts:68 | `compareM6ToESRInternal` | 3 / 0 (iç) |
| comparison.ts:159 | `checkNoDuplicateScore` | **0 / 1** |
| comparison.ts:173 | `validateReviewerAccess` | **0 / 1** |
| comparison.ts:192 | `validateEvaluationTenant` | **0 / 1** |
| comparison.ts:208 | `validateReviewersTenant` | **0 / 0 — ÖLÜ** |

Ölçülen en çarpıcı sayı: **bu 15 fonksiyonun tamamının üretim kodundan yalnız 2 giriş noktası çağıranı var** (`actions.ts:270`, `actions.ts:315`). Kalan çağrıların hepsi ya dosya-içi `*Internal` ya test. İki fonksiyon (`getCalibrationMatrix`, `validateReviewersTenant`) hiç çağrılmıyor.

### 2.2 Üç kova (19 argüman konumu)

```
$ grep -rnE "(updateEvaluationScore|getPanelScoresForProposal|compareM6ToESRInternal|calculateCriterionAverageInternal|calculateEvaluationScoreInternal|getScoreDistributionInternal)\(tx," --include="*.ts" src/ | wc -l
6
$ grep -rn "as unknown as TenantScopedDb" --include="*.ts" tests/ | wc -l
10
```

**Kova 1 — zaten `withTenant` tx'i geçiriyor (6 yer, DOĞRU):**
```
src/modules/m6/server/actions.ts:270    updateEvaluationScore(tx, evaluation.id, tenantId)
src/modules/m6/server/actions.ts:315    getPanelScoresForProposal(tx, tenantId, propId)
src/modules/m6/server/comparison.ts:52  compareM6ToESRInternal(tx, ...)
src/modules/m6/server/scoring.ts:398    calculateCriterionAverageInternal(tx, ...)
src/modules/m6/server/scoring.ts:452    calculateEvaluationScoreInternal(tx, ...)
src/modules/m6/server/scoring.ts:547    getScoreDistributionInternal(tx, ...)
```

**Kova 2 — çıplak `prisma` geçiriyor (3 yer, RİSK):**
```
src/modules/m6/server/comparison.ts:56  compareM6ToESRInternal(prisma as unknown as TenantScopedDb, evaluationId, undefined, currentUserId)
scripts/rescore-g0.ts:73                computeG0ForOpportunity(prisma, opp.tenantId, opp.id)     // param tipi: Client = TenantTx
scripts/rescore-g0.ts:97                persistG0(prisma, computation)                            // param tipi: Client = TenantTx
```

**Kova 3 — test/sistem yolu (10 yer):**
`tests/modules/m6/scoring.test.ts` (8: satır 26, 66, 81, 99, 120, 142, 158, 172) ve `tests/modules/m6/scoring-tenant-scope.test.ts` (2: satır 37, 167) — hepsi `{...} as unknown as TenantScopedDb` mock.

### 2.3 Deney A — yalnız tipi markala (db.ts'ye dokunma)

Uygulanan geçici yama (`scoring.ts:21`):
```ts
declare const tenantScopeBrand: unique symbol;
export type TenantScopedDb = Omit<PrismaClient, '$connect' | ... > & { readonly [tenantScopeBrand]: true };
```

```
$ pnpm typecheck 2>&1 | grep "error TS"
src/modules/m6/server/actions.ts(270,33): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
src/modules/m6/server/actions.ts(315,38): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
src/modules/m6/server/comparison.ts(52,32): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
src/modules/m6/server/scoring.ts(398,75): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
src/modules/m6/server/scoring.ts(452,74): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
src/modules/m6/server/scoring.ts(547,70): error TS2345: Argument of type 'TransactionClient' is not assignable to parameter of type 'TenantScopedDb'.
--- VARIANT A TOTAL ERRORS: 6 ---
```

**Deney A'nın asıl bulgusu hata sayısı değil, hataların KİMDE olduğu:** 6 hatanın 6'sı da **Kova 1 — yani doğru davranan çağrı yerleri**. Kova 2'nin tehlikeli satırı (`comparison.ts:56`) ve Kova 3'ün 10 mock'u **hiç hata vermiyor**, çünkü hepsi zaten `as unknown as` ile markayı da yapısal denetimi de atlıyor. Naif markalama, işi doğru yapanı kırıp yanlış yapanı serbest bırakıyor.

### 2.4 Deney B — markayı basım noktasına koy (`src/lib/db.ts`)

`TenantTx`'i markalı yap, `TenantScopedDb` o markayı yeniden kullansın:
```ts
// src/lib/db.ts:82
declare const tenantScopeBrand: unique symbol;
export type TenantScopeBrand = { readonly [tenantScopeBrand]: true };
export type TenantTx = Prisma.TransactionClient & TenantScopeBrand;
```

```
$ pnpm typecheck 2>&1 | grep "error TS"
scripts/rescore-g0.ts(73,55): error TS2345: Argument of type 'PrismaClient<...>' is not assignable to parameter of type 'TenantTx'.
scripts/rescore-g0.ts(97,23): error TS2345: Argument of type 'PrismaClient<...>' is not assignable to parameter of type 'TenantTx'.
src/lib/db.ts(152,21): error TS2345: Argument of type 'Omit<PrismaClient<...>, "$extends" | ...>' is not assignable to parameter of type 'TenantTx'.
--- VARIANT B TOTAL ERRORS: 3 ---
```

Üç hatanın anatomisi:
- **1 tanesi kasıtlı maliyet:** `src/lib/db.ts:152` — `withTenantOn` içindeki `callback(tx)` (yamasız ağaçta satır **150**; yama 2 satır eklediği için hata 152'de raporlandı). Markanın basıldığı **tek** yer; bir `as` gerektirir ve o `as` markanın tanımıyla aynı dosyada, `set_config('app.tenant_id', ...)` satırının üç satır altında durur. Yani cast, kanıtın yanında yaşar.
- **2 tanesi gerçek bulgu:** `scripts/rescore-g0.ts:73` ve `:97`, çıplak `prisma` singleton'ını `TenantTx` bekleyen parametreye geçiriyor (`src/lib/scoring/g0-compute.ts:63` → `type Client = TenantTx`). Bugün yapısal tip bunu **sessizce kabul ediyor**. Betik `tenantId`'yi elle her çağrıya taşıdığı için sonuç doğru olabilir; ama `app.tenant_id` hiç ayarlanmadığı ve ana bağlantı `BYPASSRLS` olduğu için **RLS bu yolda devrede değil** — doğruluk tümüyle argümanın elle taşınmasına bağlı. Bu, yönetici/sistem yolu olarak bilinçli olabilir; bilinçliyse **görünür** olması gerekir.

Deney A → 6 hata, hepsi doğru yerlerde. Deney B → 3 hata, biri kasıtlı, ikisi gerçek. Aradaki fark markanın *nereye* konduğu.

### 2.5 Yan bulgu — aynı şeklin üç adı var

```
$ grep -rn "= Prisma.TransactionClient\|= TenantTx;\|^export type TenantScopedDb" --include="*.ts" src/
src/lib/db.ts:82:export type TenantTx = Prisma.TransactionClient;
src/lib/scoring/g0-compute.ts:63:type Client = TenantTx;
src/modules/m6/server/scoring.ts:21:export type TenantScopedDb = Omit<...>
```

`TenantScopedDb`, `Prisma.TransactionClient`'ın (yani `TenantTx`'in) elle yazılmış kopyasıdır — `Omit` listesi Prisma'nın kendi `ITXClientDenyList`'iyle aynı işi yapar. CLAUDE.md "reuse > icat" ve tek-doğruluk-kaynağı disiplini açısından: markalanacaksa **bir** tip markalanmalı, üç değil.

### 2.6 İki-argümanlı ölü string formunun yeniden ölçümü

```
$ grep -rnE "(calculateCriterionAverage|calculateEvaluationScore|getScoreDistribution|compareM6ToESR)\(\s*['\`\"]" --include="*.ts" --include="*.tsx" . | grep -v node_modules
tests/modules/m6/scoring-tenant-scope.test.ts:20: * next person to write `calculateCriterionAverage('crit-1')` would have been   <- yorum
tests/modules/m6/scoring-tenant-scope.test.ts:51:    void calculateCriterionAverage('crit-1');                                    <- @ts-expect-error negatif test
tests/modules/m6/scoring-tenant-scope.test.ts:56:    void calculateEvaluationScore('eval-1');                                    <- @ts-expect-error negatif test
tests/modules/m6/scoring-tenant-scope.test.ts:61:    void getScoreDistribution('crit-1');                                        <- @ts-expect-error negatif test
src/modules/m6/server/scoring.ts:371: * `calculateCriterionAverage('crit-1')` would have been told nothing and would  <- yorum
```

**Dört string-öncelikli aşırı yüklemenin (`calculateCriterionAverage`, `calculateEvaluationScore`, `getScoreDistribution`, `compareM6ToESR`) gerçek çağıranı: 0.** Kalan tüm hitler ya iki doküman yorumu ya derlemenin *başarısız olmasını* bekleyen negatif testler. Yani `TASK-MTUIPYSSNLVWG` string formunu kapatmakla doğru yaptı, ama form **hâlâ orada** ve `typeof dbOr… === 'string'` dallarıyla birlikte ~38 satır taşıyor.

**Sonda C — string aşırı yüklemesini `calculateCriterionAverage`'dan sil:**
```
$ pnpm typecheck 2>&1 | grep -c "error TS"
0
$ npx vitest run tests/modules/m6/scoring-tenant-scope.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```
Silmenin çarpma yarıçapı **sıfır**, ve `@ts-expect-error` negatif muhafızları **hâlâ tatmin oluyor** (tek argümanlı çağrı db-formuna karşı da tip hatası, dolayısıyla `@ts-expect-error` boşa düşmüyor — bu, silmenin muhafızı sessizce çürütmediğinin kanıtı).

### 2.7 Deneylerin geri alındığının kanıtı

```
$ git checkout -- src/modules/m6/server/scoring.ts src/lib/db.ts
$ git diff --stat -- src/modules/m6/server/scoring.ts src/lib/db.ts
(boş)
$ pnpm typecheck 2>&1 | grep -c "error TS"
0
$ git status --porcelain -- src/ scripts/ tests/ prisma/ e2e/
 M src/app/[locale]/(app)/[workspace]/pipeline/board.tsx
 M src/lib/llm.ts
 M tests/e2e/module-gate.spec.ts
```
Kalan üç `M` **bana ait değil**: `src/lib/llm.ts` bu spike başlamadan önce de değişikti (oturum başı git snapshot'ında var), `board.tsx` + `module-gate.spec.ts` ise paylaşılan ağaçta eşzamanlı çalışan blok-zincir-dev'in TASK-MTV4YSO4SEMGG işi. Benim dokunduğum iki dosyanın diffstat'ı boş.

---

## 3. KARAR — 1-3-1

**Problem:** `TenantScopedDb` adı "kiracı kapsamlı bir işlemden geldim" diyor, tipi ise çıplak `prisma`'yı da kabul ediyor; bu boşluğun kapatılıp kapatılmayacağına karar verilmeli.

**Seçenekler:**

- **Seçenek A — Markayı basım noktasına koy (`src/lib/db.ts`), `TenantScopedDb`'yi ona bağla.**
  `TenantTx = Prisma.TransactionClient & TenantScopeBrand`; marka yalnız `withTenantOn` içinde, `set_config` satırının yanında basılır; `TenantScopedDb` bu markayı yeniden kullanır (kendi kopyasını üretmez).
  *Artı:* Ölçülen maliyet **3 typecheck hatası** (§2.4): 1'i `db.ts:152`'de kasıtlı tek `as`, 2'si `scripts/rescore-g0.ts`'de bugün görünmez olan gerçek çıplak-`prisma` geçişi. Kova 1'in 6 doğru çağrı yeri **hiç dokunulmadan** geçer. Yeni bağımlılık yok, ~5 satır tip kodu.
  *Eksi:* Kova 3'ün 10 test mock'unu ve `comparison.ts:56`'yı **yakalamaz** — `as unknown as` markayı da atlar. Yani marka, "kaza"yı engeller, "kararlı kaçış"ı engellemez; ikinci bir kural (lint: `as unknown as Tenant*` yasağı) olmadan kapı yarım kalır.

- **Seçenek B — Marka yok; `TenantScopedDb`'yi sil, doğrudan `TenantTx` kullan (§2.5 tekilleştirmesi) + ölü kodu kaldır.**
  Üç aliası bire indir; 4 ölü string aşırı yüklemesini ve 2 hiç-çağrılmayan fonksiyonu sil (§2.6, §2.1).
  *Artı:* Ölçülen çarpma yarıçapı **0 typecheck hatası** (sonda C, §2.6) ve 15/15 test yeşil. `TenantScopedDb`'nin tamamı `PrismaClient`'ın elle yazılmış kopyası olduğu için tekilleştirme saf kazanç; ~38 satır ölü dal ve 2 ölü fonksiyon gider; "aynı şeklin üç adı" kafa karışıklığı biter. CLAUDE.md "reuse > icat" ile birebir hizalı.
  *Eksi:* Kova 2'nin 3 çıplak-`prisma` yerini **hiç görünür kılmaz** — `rescore-g0.ts` bugün olduğu gibi sessizce yapısal denetimi geçer. Yani asıl soruyu (isim sözünü tutuyor mu) cevaplamaz, sadece soruyu soran yüzeyi küçültür.

- **Seçenek C — Tam nominal kapı: marka + `as unknown as` yasağı + test yardımcısı.**
  A'nın üstüne: `tests/` için markayı basan tek bir `tenantDbMock()` yardımcısı, ve `as unknown as Tenant(ScopedDb|Tx)` kalıbını yasaklayan bir ESLint kuralı (`no-restricted-syntax`), `pnpm gate`'e bağlı.
  *Artı:* Üç kovanın **19'unu da** kapsayan tek kapı; `comparison.ts:56` ve 10 mock derleme zamanında görünür hale gelir. Kaçış yolu tek bir yardımcıda toplanır, kanıtın yanında durur.
  *Eksi:* 19 çağrı yerinin **13'üne** (10 mock + 3 kova-2) dokunmak gerekir; bu, hiçbir üretim davranışını değiştirmeyen ama iki test dosyasını baştan sona elleyen bir PR demektir. Üstelik `comparison.ts:56`'nın çıplak-`prisma` dalı **ayrıca bir hata düzeltmesi** ister (aşağıya bak) — o düzeltme yapılmadan C'nin kapısı yeşile dönmez, yani C iki işi bir karta bağlar.

**ÖNERİ: Seçenek B, ardından ayrı bir kartla Seçenek A.**

Gerekçe sayılara dayanıyor: markanın **bugünkü** getirisi ölçülü olarak **2 gerçek bulgu** (`rescore-g0.ts:73,97`) ve bu ikisini markasız da tek `grep` ile bulduk — yani marka, kendi bulduğu değeri bu turda tekrar üretmiyor. Buna karşılık markanın kaçırdığı yüzey büyük: 19 argüman konumunun **13'ü** (%68) zaten `as unknown as` ile hem yapısal hem nominal denetimin dışında, ve marka bunu değiştirmiyor (§2.3'ün asıl bulgusu). Bir tipi, denetlemesi gereken yerlerin üçte ikisinde etkisiz olacak şekilde markalayıp "kiracı izolasyonu tipte garanti" demek, `pnpm gate`'in BYPASSRLS bağlantı üzerinde yeşil yanmasıyla aynı türden bir yanlış güvence olur.

B ise **0 hata / 15 test yeşil** ölçümüyle bedelsiz ve gerçek bir kazanç: üç ad bire iner, ölü string formu ve iki ölü fonksiyon gider. B'den sonra markalanacak yüzey **tek** bir tip (`TenantTx`) olur ve A'nın maliyeti 3 hatadan muhtemelen 2'ye düşer (`TenantScopedDb` ortadan kalktığı için `comparison.ts` ve `scoring.ts` payı erir). Yani B, A'yı ucuzlatır; ters sıra doğru değil.

C reddedilmiyor, **sıraya alınıyor**: `as unknown as` yasağı doğru kural ama kendi başına bir kart — 10 test mock'unu bir yardımcıya taşımak, tip tartışmasından bağımsız bir test hijyeni işi ve `comparison.ts:56` düzeltilmeden anlamlı değil.

**Definition of Done (Seçenek B için, ayrı kart açılırsa):**
- `TenantScopedDb` silindi; `src/modules/m6/server/{scoring,comparison}.ts` `TenantTx`'i `@/lib/db`'den import ediyor.
- `type Client = TenantTx` (g0-compute.ts:63) ya kaldırıldı ya da yorumla "yerel okunabilirlik aliası" olarak gerekçelendirildi.
- 4 string-öncelikli aşırı yükleme ve `typeof dbOr… === 'string'` dalları silindi; `dbOr*` parametre adları kalmadı.
- `getCalibrationMatrix` ve `validateReviewersTenant`: ya çağıranı var ya silindiler (0-çağıran hali korunmadı).
- `tests/modules/m6/scoring-tenant-scope.test.ts` içindeki `@ts-expect-error` satırlarının **hepsi hâlâ tatmin oluyor** (biri boşa düşerse `tsc` hata verir — kanıt bu).
- `pnpm gate` yeşil; `pnpm typecheck` 0 hata; e2e mutlu yol kırılmadı.

**Uygulama planı (Seçenek B):**
1. `src/lib/db.ts`'de `TenantTx`'in yorumunu güçlendir: "yapısal — çıplak `prisma` bunu karşılar; nominal kapı TASK-… ile ayrı ele alınıyor". Yanlış güvenceyi tipte değil yorumda kapat.
2. `scoring.ts`'de `TenantScopedDb` tanımını sil, `TenantTx` import et, 19 parametre konumunu `TenantTx`'e çevir (mekanik).
3. 4 string aşırı yüklemesini ve dallarını sil (sonda C'nin şablonu: §2.6).
4. İki ölü fonksiyonu (`getCalibrationMatrix`, `validateReviewersTenant`) sil veya çağıranını ekle — kararı kart sahibi verir.
5. `pnpm typecheck && npx vitest run tests/modules/m6 && pnpm gate`.
6. Ardından **ayrı kart**: Seçenek A (marka `db.ts`'de) + `rescore-g0.ts`'nin iki çıplak-`prisma` çağrısının kararı.

---

## 4. Değişen dosyalar

| Dosya | Durum |
|---|---|
| `docs/agent-results/TASK-MTV4ZJEECXNDE-blok-zincir-dse.md` | **YENİ** — commit edilen tek dosya |
| `src/modules/m6/server/scoring.ts` | geçici deney (A, B, sonda C) → **geri alındı**, diffstat boş (§2.7) |
| `src/lib/db.ts` | geçici deney (B) → **geri alındı**, diffstat boş (§2.7) |

Ürün kodu sevk edilmedi.

---

## 5. Riskler

- **Bu spike'ın kendi riski düşük** ama paylaşılan `dev` ağacında iki kez `git checkout -- <dosya>` çalıştırdım. İkisi de yalnız **kendi** dokunduğum iki dosyayı adıyla hedefledi; komşu ajanların `board.tsx` / `module-gate.spec.ts` / `llm.ts` değişiklikleri etkilenmedi (§2.7 çıktısı bunu gösteriyor). Aynı dosyaya eşzamanlı yazan bir ajan olsaydı bu geri alma onun işini düşürebilirdi — `scoring.ts`/`db.ts` bu turda başka karta atanmış değil, ama kural olarak bu tür deney izole worktree'de yapılmalı.
- Seçenek A veya C seçilirse: `unique symbol` markası **derleme zamanı** bir kapıdır, çalışma zamanında hiçbir şey doğrulamaz. Kartın adı "tenant izolasyonu" ise, tipin verdiği güvence ile RLS'in verdiği güvence karıştırılmamalı — `pnpm rls:verify` hâlâ tek canlı ölçüm.

---

## 6. Açık sorular / yolda görülen bitişik hatalar (DÜZELTİLMEDİ, adıyla bildiriliyor)

1. **`compareM6ToESR` — `TASK-MTUIPYSSNLVWG`'nin kapattığı hata sınıfı `comparison.ts`'de HÂLÂ AÇIK.** `src/modules/m6/server/comparison.ts:33-59`: string-öncelikli aşırı yüklemede `tenantId?: string` **isteğe bağlı**, ve `tenantId` yoksa kod `compareM6ToESRInternal(prisma as unknown as TenantScopedDb, evaluationId, **undefined**, …)` çağırıyor. İçeride filtre `if (!evaluation || (tenantId && evaluation.tenantId !== tenantId))` (comparison.ts:89) — yani `tenantId` undefined olduğunda **kiracı kontrolü tümden düşüyor** ve sorgu `findUnique` ile BYPASSRLS bağlantı üzerinden herhangi bir kiracının değerlendirmesini döndürebilir. Bu, `scoring.ts`'de kapatılan "opsiyonel tenantId → kapsamsız çalışma" davranışının birebir ikizi, aynı modülde, komşu dosyada. Bugün gerçek çağıranı yok (§2.6), yani **sömürülebilir değil ama tetiği kurulmuş**: `compareM6ToESR(evalId)` yazan bir sonraki geliştirici hiçbir uyarı almaz. Ayrı bir P1 kartı hak ediyor.
2. **`scripts/rescore-g0.ts:73,97` çıplak `prisma` geçiriyor** (§2.4). `tenantId` elle taşındığı için sonuç bugün doğru görünüyor, ama `app.tenant_id` hiç ayarlanmıyor → RLS bu yolda devrede değil. Bilinçli yönetici yolu mu, gözden kaçan mı? Kararı sahibinin vermesi gerekiyor; her iki durumda da **kodda yazılı** olmalı.
3. **`getCalibrationMatrix` ve `validateReviewersTenant` hiç çağrılmıyor** (§2.1). Yarım kalmış bir özellik mi, artık mı? Artıksa silinmeli — çağrılmayan bir kiracı doğrulayıcısı, yanlışlıkla "bu kontrol var" izlenimi verir.
4. **Kart açıklaması araçla okunamadı** (§1 notu). `list_tasks` yalnız başlık döndürüyor; şartname gövdesini görebilmem için bir `get_task`/`show_task` yolu gerekiyor.

**Sonraki adım:** Karar sahibinin A/B/C seçimi. Seçim gelmeden ürün kodu yazılmayacak (kart "KOD SEVKİYATI YOK" diyor). Bulgu 1 için ayrı kart açılması öneriliyor.

---

## Platform beyanı

- **Doğrulandı:** macOS (Darwin 25.6.0, arm64). `pnpm typecheck` (tsc --noEmit) ve `npx vitest run` yerel olarak koştu; §2'deki tüm çıktılar bu makineden kopyalandı.
- **Windows / Linux: koşulmadı** — bu spike'ta koşacak platforma bağlı kod yok. Dokunulan yüzey (`scoring.ts`, `db.ts`) yalnız TypeScript tip tanımı ve Prisma sorgusudur: süreç öldürme, kabuk/ikili adı, dosya yolu ayracı, ekran/DPI veya cihaz izni içermez. `tsc` ve `vitest` platformdan bağımsız çalışır; `pnpm typecheck` sonucu üç platformda aynıdır (TypeScript tip denetimi işletim sistemine duyarlı değil). Tek platform-bağımlı ayrıntı `pnpm`'in `package.json` uyarısıdır ve ölçüme etki etmez.
- `pnpm gate` **bu spike'ta tam koşulmadı**: ürün kodu değişmedi (diffstat boş) ve kapı canlı bir Postgres + Playwright sunucusu ister; koşulan alt küme `typecheck` (0 hata) + hedefli vitest (15/15) idi. Seçenek B veya A bir karta dönüşürse tam kapı o kartın DoD'sindedir.
