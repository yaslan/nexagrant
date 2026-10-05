# TASK-MTSI7YQWUZOFH — `prisma-override.d.ts`: tip güvenliği borcu

**Ajan:** ex-en (Araştırmacı / Explorer) · **Tip:** teknik borç / kapı sertleştirme · **Tarih:** 2026-09-08
**Commit:** `3b5fa04` (dev) · **Ölçüm tabanı:** HEAD `a3d87e9`
**Önceki ölçümüm:** TASK-MTRKA25R5M3SY (bu rapor onun iki iddiasını **düzeltiyor** — §5)

---

## 0. Tek cümle

`pnpm typecheck` artık şemada olmayan bir modele yapılan çağrıyı **reddediyor**; kanıt §2'de, ve
kartın "muhtemel gerçek çözüm" dediği `prisma generate` yolunun bu hata sınıfı için **hiçbir şey
yapmadığı** ölçümle gösterildi (§2.3) — ama borcun *öteki* yarısını (`withTenant` → `unknown`)
gerçekten çözdüğü için yine de kapıya alındı (§2.6).

---

## 1. Ne yapıldı

### 1.1 Neden var? (kartın 1. maddesi — gerekçe arkeolojisi)

`git log --follow src/types/prisma-override.d.ts` → dosyayı getiren commit **`9696822`
"refactor: replace the @ts-ignore suppressions with real declarations"**. Yani dosya
`prisma generate` eksikliğini kapatmak için değil, koda serpiştirilmiş `@ts-ignore`'ları
toplamak için yazılmış; `[key: string]: any` o toplamanın en ucuz yoluymuş.

Dosyanın kendi yorumundaki gerekçe **hâlâ geçerli**, ama iddiaları eskimişti:

| Dosyanın yazdığı | Bugün ölçtüğüm |
|---|---|
| "Deleting this override … leaves **158** type errors across **36** files" | **52 hata**, ~20 dosya (§2.5) |
| "mostly the four tables the schema does not define (Organization, Participation, Collab, OrgTopicStat)" | **Sıfır** hayalet-tablo hatası kaldı; o P0'lar kapanmış |
| "`prisma generate` … is the real fix" | Bu hata sınıfı için **yanlış** — §2.3 |

Gerekçenin geçerli kalan çekirdeği: bir klonda `.prisma/client` yoktur (`prisma generate`
yalnız `node_modules`'a yazar), dolayısıyla `@prisma/client` hiçbir şey döndürmez ve
uygulamanın import ettiği `Role`, `Gate`, `Opportunity`, `PrismaClient` bir yerden gelmelidir.
Dosya kalıyor — ama artık `any` bir kapı değil.

### 1.2 Yapılan değişiklik

`[key: string]: any` → şemanın ürettiği **71 delegate adının** birleşimi:

```ts
type ModelName = 'account' | 'addOn' | … | 'workspace';          // 71 ad
type ModelDelegate = { [method: string]: any };                   // metotlar gevşek KALIYOR
export interface PrismaClient extends Record<ModelName, ModelDelegate> { $connect(); … }
export const PrismaClient: new (options?: {…}) => PrismaClient;
```

Ad eşlemesi (`lowerFirst(model)`) tahmin değil: gerçek bir `prisma generate` çıktısındaki
71 delegate getter'ı ile **birebir** karşılaştırıldı (§2.1).

Metotlar neden gevşek bırakıldı: `findMany`'nin argümanını doğru yazmak `Prisma.<Model>WhereInput`
ağacının tamamını elle üretmek demek; elle yazılmış bir arg tipi şemadan saptığı anda **olmayan
hatalar** üretir. Sertleşen şey "hangi delegate var" sorusu — P0'ları üreten tam olarak o.

`$` metotları (`$connect/$disconnect/$transaction/$executeRaw(Unsafe)/$queryRaw(Unsafe)`) index
signature kalkınca açıkça beyan edildi; repodaki 10 raw çağrı sitesi tarandı, hepsi karşılanıyor.

### 1.3 Nöbetçi

`src/types/prisma-override.test.ts` (YENİ, 3 test) `prisma/schema.prisma`'yı okuyup birleşimi
yeniden türetir ve **üç yönde** kırmızıya döner: şemada olup listede olmayan model, listede olup
şemada olmayan model, ve client'a geri konan bir index signature.

---

## 2. Kanıt (gerçek komut çıktısı)

### 2.1 Ad eşlemesi iki bağımsız kaynakla doğrulandı

```
$ pnpm exec prisma generate
✔ Generated Prisma Client (v7.10.0) … in 324ms
$ diff <(lowerFirst of every `model` in prisma/schema.prisma) <(delegate getters in the generated client)
IDENTICAL — lowerFirst rule confirmed against the generated client
```
(71 = 71; veritabanı bağlantısı gerekmedi.)

### 2.2 ZORUNLU MUTASYON — hayalet model → `pnpm typecheck` DÜŞÜYOR

**ÖNCE (HEAD `a3d87e9`, değişiklik yok):** `src/lib/__ghost-probe.ts` içine
`prisma.thisModelDoesNotExist.findMany({ where: { nope: true } })` eklendi.

```
$ pnpm typecheck ; echo "EXIT=$?"
$ tsc --noEmit
EXIT=0          ← kapı KÖR: hayalet model çağrısı temiz geçiyor
```

**SONRA (bu commit):**

```
$ pnpm typecheck
src/lib/__ghost-probe.ts(5,29): error TS2339: Property 'thisModelDoesNotExist' does not exist on type 'PrismaClient'.
[ELIFECYCLE] Command failed with exit code 2.
EXIT=1
```

Gerçek tarihsel P0'ların ikisiyle, üstelik `scripts/` altında (tarayıcının görmediği yer):

```
scripts/__ghost-probe.ts(3,26): error TS2339: Property 'organization' does not exist on type 'PrismaClient'.
scripts/__ghost-probe.ts(4,46): error TS2551: Property 'orgTopicStat' does not exist on type 'TenantTx'. Did you mean 'topicStat'?
```

Her iki probe da ölçümden hemen sonra silindi; `git status` temiz.

### 2.3 `prisma generate` TEK BAŞINA hiçbir şey yakalamıyor (kartın 2. maddesi)

İstemci üretilmiş **ve** ESKİ override yerinde, aynı hayalet model çağrısı:

```
--- OLD override + GENERATED client: ghost model mutation ---
(errors on probe: 0)
```

Sebep: `[key: string]: any` gerçek tiplerle **birleşiyor** ve her adı yutuyor. Yani
"`prisma generate`'i kapıya al, override'ı bırak" yolu bu hata sınıfı için **sıfır fayda**.
Kapıyı kapatan şey delegate adlarının sayılması.

### 2.4 Üretilmiş istemciye BAĞIMLI DEĞİL (CI güvenli)

CI `pnpm typecheck`'i doğrudan koşuyor. Üretilmiş istemci dizini geçici olarak kaldırılıp ölçüldü:

```
--- typecheck WITHOUT generated client ---   0 hata
--- mutation WITHOUT generated client ---
src/lib/__ghost-probe.ts(5,29): error TS2339: Property 'thisModelDoesNotExist' does not exist on type 'PrismaClient'.
```

Koruma her iki dünyada da çalışıyor.

### 2.5 Override'ı TAMAMEN kaldırmayı denedim — 52 hata (kartın 2. maddesi, ikinci yarı)

```
$ mv src/types/prisma-override.d.ts …/override.moved
$ ./node_modules/.bin/tsc --noEmit --pretty false ; echo TSC_EXIT=$?
TSC_EXIT=2
TOTAL_ERRORS=52
$ (dosya bayt-bayt geri kondu; md5 eşleşti)
```

| Küme | Adet | Nerede | Ne demek |
|---|---:|---|---|
| Test mock'u gerçek satır tipini karşılamıyor | 17 | `m2/server/actions.test.ts`, `concept-notes/[id]/export/route.test.ts` | üretimi etkilemez |
| `JsonValue` ↔ somut tip | ~14 | m11, m2, concept-notes | çalışır, tip gürültüsü |
| Elle yazılmış `*Row` ↔ gerçek satır | ~13 | pipeline, evidence, partners, portal | çoğu çalışır |
| `PrismaPromise` ↔ `Promise` | ~4 | m11, marketplace | mekanik |
| **Gerçek hata: hayalet SÜTUN** | **2** | `prisma/seed-m6-evaluations.ts:62,76` — `Opportunity.callId`, `Proposal.status` şemada YOK | **seed çalışma zamanında patlar** |
| Enum uyuşmazlığı | 2 | `src/lib/auth.ts:232` (`string` → `Role`), `pipeline/actions.ts:255` | yanlış literal DB'de reddedilir |

**Kaldırmadım.** Gerekçe tahmin değil ölçüm: 52 hata ~20 dosyaya yayılıyor ve bunların çoğu şu an
beş ajanın aktif olarak yazdığı dosyalar (m2, m11, pipeline, marketplace). Bu kartın kapsamı tek
dosya + kapı; 20 dosyalık bir tip göçünü aynı commit'e sıkıştırmak regresyon riski. **Ayrı kart
hak ediyor** ve §6'da öneri olarak duruyor. Kaldırmanın gerçek getirisi: birleşim yalnız *model*
granülerliğinde; hayalet **sütun/ilişki** ancak override kalkınca derleyiciye görünür — yukarıdaki
2 seed hatası tam olarak o sınıf.

### 2.6 `withTenant` dönüşü (kartın 4. maddesi) — kartın iddiası DOĞRU çıktı

`plan-repository.ts:140`'taki çağrı, elle verilen tip argümanı **çıkarılarak** ölçüldü:

```
WITH generated client (local dev after `prisma generate`):
  inferred => { planId: string; }[]
WITHOUT generated client (what CI and a fresh install see):
  inferred => unknown
```

Yani `withTenant` imzası zaten jenerik ve doğru; sorun delegate'in `any` dönmesi —
TypeScript `any`'yi `Promise<T>` içine ayrıştıramayınca `T` `unknown`'a düşüyor. **Çözüm
`prisma generate`.** Bu yüzden `pnpm db:generate` hem `pnpm gate`'in başına hem `ci.yml`'ye
eklendi (veritabanı ve `DATABASE_URL` gerekmiyor — ikisi de kapalıyken çalıştığı ölçüldü).

Mevcut 3 çağrıdaki elle tip argümanları **KASITLI OLARAK BIRAKILDI**: üretim yapılmamış bir
ağaçta (`pnpm typecheck`'i kapı dışında koşan biri) onları silmek dönüşü `unknown` yapar ve
`.map()` satırını kırar. Yani argümanlar hâlâ yük taşıyor; kaldırılmaları §6'daki tam-kaldırma
kartına ait.

### 2.7 Nöbetçi testi kasten bozdum — üç yönde de kırmızı

```
=== DRIFT A: a model in the schema dropped from the union ===
AssertionError: expected 'prisma/schema.prisma declares models …' to be ''
      Tests  1 failed | 2 passed (3)
  (typecheck side-effect:) 125 hata          ← birleşim gerçekten yük taşıyor
=== DRIFT B: a model left in the union that the schema does not declare ===
AssertionError: expected '`ModelName` in src/types/prisma-overr…' to be ''
      Tests  1 failed | 2 passed (3)
=== DRIFT C: index signature put back on the client ===
AssertionError: expected 'export interface PrismaClient…' not to match /\[\s*[A-Za-z_]+\s*:\s*string\s*\]/
      Tests  1 failed | 2 passed (3)
=== restored, all green ===
0 hata ·  Tests  3 passed (3)
```
Her geri alma bayt yedeğiyle yapıldı (`git checkout` ile değil — paylaşılan worktree'de altı ajan var).

### 2.8 Kapı

```
$ pnpm typecheck   -> EXIT=0
$ pnpm test        -> EXIT=0     Test Files 104 passed | 2 skipped (106) · Tests 1214 passed | 8 skipped (1222)
$ pnpm i18n:check  -> EXIT=0     ✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
$ pnpm rls:check   -> EXIT=0
$ pnpm rls:verify  -> EXIT=0     ✅ Veritabanı 42 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
$ npx eslint  (beş takipsiz scripts/_g0-*.ts hariç)  -> EXIT=0, sıfır çıktı
```

`pnpm gate` bir bütün olarak **exit 1** dönüyor, ama **benim değişikliğim yüzünden değil**: lint'i
kıran tek şey `scripts/_g0-*.ts` altındaki **beş takipsiz** (git'e hiç girmemiş) hata ayıklama
betiği. Ayrıntı §5.1 — dokunmadım.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `src/types/prisma-override.d.ts` | `[key: string]: any` → 71 adlık `ModelName` birleşimi; `class`+`interface` birleşmesi yerine `interface` + construct-signature `const` (eslint `no-unsafe-declaration-merging`); `$` metotları açıkça beyan edildi; eskimiş yorum başlığı gerçeğe göre yeniden yazıldı |
| `src/types/prisma-override.test.ts` | **YENİ** — sapma nöbetçisi (3 test) |
| `src/types/db-rows.ts` | Yalnız yorum: "prisma generate does not run in this repo" artık yanlıştı |
| `src/lib/calendar/__tests__/sync.test.ts` | `Partial<TenantTx>` mock'u (index signature kalkınca kırılan **tek** dosya) kendi şeklini beyan eden `CalendarMockTx` + tek noktada `asTx()` cast'i oldu — 24 hatayı kapatır ve mock'u daha sıkı tipler |
| `package.json` | `db:generate` betiği; `gate` zincirinin başına `pnpm db:generate` (i18n adımı **aynen** korundu) |
| `.github/workflows/ci.yml` | `Generate Prisma client` adımı (lint/typecheck öncesi) |

`src/` uygulama kodu, `prisma/schema.prisma`, `messages/` **DEĞİŞMEDİ**.

---

## 4. Riskler

1. **Şema büyüdükçe birleşim elle güncellenmeli.** Nöbetçi test bunu unutulamaz yapıyor (kırmızıya
   döner ve eksik adı yazar), ama yeni model ekleyen ajan için bir adım daha demek. Bilinçli takas:
   alternatif, kapının kör kalması.
2. **Koruma model granülerliğinde.** Hayalet **sütun/ilişki** typecheck'e görünmüyor; onları hâlâ
   `src/modules/m8/server/schema-contract.test.ts` yakalıyor ve o yalnız `src/` tarıyor. Yani
   `prisma/seed-*.ts` ve `scripts/` içindeki hayalet sütunlar **hâlâ korumasız** (§2.5'te 2 örnek).
3. **`prisma generate` kapıda, eşzamanlı koşuda.** Altı ajan aynı worktree'de `pnpm gate` koşarsa
   iki `prisma generate` aynı `node_modules` çıktısına yazabilir. İşlem idempotent ve ~300ms, ama
   teorik bir yarış var. Gözlemlenmedi.
4. **CI'da davranış değişti.** CI artık istemciyi üretiyor, yani orada delegate metotları gerçek
   tiplere kavuşuyor. Ölçüm anında bu 0 hata veriyor (§2.4 ve §2.8), ama ileride bir şema
   değişikliği CI'yı yerelden önce kırmızıya döndürebilir — bu bir kusur değil, kapının işi.

---

## 5. Açık sorular / ilgisiz kusurlar (BENİM DEĞİL — adıyla bildiriliyor)

### 5.1 `pnpm lint`'i kıran beş takipsiz betik — SAHİBİ ARANIYOR
`scripts/_g0-apply-sql.ts`, `_g0-inspect.ts`, `_g0-k1dup.ts`, `_g0-verify.ts`, `_g0-whoami.ts`.
**Hiçbiri git'te takip edilmiyor** (`git ls-files` boş) — biri hata ayıklarken bırakmış. İkisi
`@typescript-eslint/no-explicit-any` ile 7 lint hatası veriyor ve **`pnpm gate`'i tek başına
exit 1 yapıyor**. Dokunmadım (silmek başkasının çalışmasını yok edebilir). Sahibi ya temizlemeli
ya `.gitignore`'a almalı.

### 5.2 `prisma/seed-m6-evaluations.ts` şemada olmayan sütunlara yazıyor — ÇALIŞMA ZAMANI HATASI
Satır 62 `Opportunity.callId`, satır 76 `Proposal.status` (şemada `Proposal.outcome` var).
`PrismaClientValidationError` ile patlar. Hiçbir kapı görmüyor: schema-contract tarayıcısı yalnız
`src/` tarıyor, typecheck ise override yüzünden sütun görmüyor. Kapsam dışı bıraktım.

### 5.3 `tsconfig.json`'da `noUncheckedIndexedAccess` YOK
`CLAUDE.md` "Kod stili" bölümü "TypeScript strict, `noUncheckedIndexedAccess`" diyor; `tsconfig.json`
`"strict": true` içeriyor ama `noUncheckedIndexedAccess` **hiç yok**. Kural ile gerçek çelişiyor;
açmak muhtemelen yüzlerce hata üretir. `docs/ROADMAP.md` "Açık kararlar"a taşınmalı.

### 5.4 `vitest.config.mts:8` deprecated `__dirname` kullanıyor
Her vitest koşusunda uyarı basıyor ("Use `import.meta.dirname` instead"). Zararsız, gürültülü.

### 5.5 (Önceki karttan devam) `pnpm build` HEAD'de hâlâ kırmızı
`src/lib/k2-cordis/importer.ts` (206/309/524/548) dinamik `fs` yolları turbopack'i kırıyor —
TASK-MTSHU5LT4XAE §3.1. Bu yüzden güvenilir enforcement noktası `pnpm gate`, `build` değil.

---

## 6. Sonraki adım (önerilen kart)

**"Override'ı kaldır — 52 hatayı kapat"**, tek ajan, tek ardışık PR, m2/m11/pipeline'a dokunan
ajanlar boşken. Getirisi ölçülü ve somut:
- hayalet **sütun ve ilişkiler** derleyiciye görünür olur (bugün yalnız `src/` tarayan bir testte),
- `withTenant` her yerde gerçek satır tipi çıkarır, elle tip argümanları silinebilir,
- §5.2'deki iki canlı seed hatası kapanır.
Maliyet: §2.5 tablosundaki 52 hata; %33'ü (17) yalnızca iki test dosyasının mock fixture'ı.

---

## 7. Definition of Done

- [x] Override'ın **neden** var olduğu `git log`/`git show` ile bulundu ve rapor başına yazıldı (§1.1)
- [x] Gerekçenin hâlâ geçerli olup olmadığı ölçüldü; dosyanın eskimiş üç iddiası düzeltildi (§1.1)
- [x] `prisma generate` + override kaldırma **denendi**, kırılan şey **sayıldı ve sınıflandırıldı** (§2.3, §2.5)
- [x] Kaldırılamıyorsa daraltılabilir mi → daraltıldı: `any` yerine 71 adlık delegate birleşimi (§1.2)
- [x] `withTenant` dönüşü ölçüldü; `unknown` sebebi bulundu ve `prisma generate` ile çözüldü (§2.6)
- [x] **ZORUNLU MUTASYON:** hayalet model → `pnpm typecheck` düşüyor; ÖNCE/SONRA kırmızı çıktı raporda (§2.2)
- [x] Mutasyon geri alındı; ağaç temiz
- [x] Nöbetçi test kasten bozuldu, üç yönde kırmızıya döndü, geri alındı (§2.7)
- [x] `pnpm typecheck` / `test` / `i18n:check` / `rls:check` / `rls:verify` → hepsi EXIT=0 (§2.8)
- [x] i18n kapı adımı bozulmadı (`gate` zincirinde aynen duruyor)
- [x] İlgisiz kusurlar düzeltilmedi, adıyla bildirildi (§5)
- [x] Sonuç dosyası + dev commit (`3b5fa04`)
