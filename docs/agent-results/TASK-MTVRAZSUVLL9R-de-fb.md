# TASK-MTVRAZSUVLL9R — Tenant-bypass Dilim 5 (SON): kalıcı statik kapı

**Ajan:** de-fb (Data Engineer) · **Tip:** feature (kapı/tooling) · **Sprint:** SPRINT-S12
**Bağımlılık:** Dilim 1–4 (48 çağrı sarmalandı) — raporları okundu
**Platform:** mac (Darwin 25.6.0, arm64) · **Bkz:** `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm-2.md` §5, §2.3

---

## 1. Ne yapıldı

`pnpm rls:bypass-check` — sarmalayıcısız kiracı erişimini, `tenantId` geri-düşüm desenini ve
`TenantTx` marka sahteciliğini `pnpm gate`'te kıran statik bir kapı. Üç yeni dosya, `package.json`'da
iki satır. `src/**` içinde **hiçbir kaynak dosyaya dokunulmadı** (kartın şartı).

| Dosya | Ne |
|---|---|
| `scripts/tenant-bypass-scan.ts` | Tarayıcı: *gerçek* yarısı. Dört kontrol, yorum/dizge duyarlı. |
| `scripts/check-tenant-bypass.ts` | Kapı: *politika* yarısı. Baseline karşılaştırması, `--prune`, `--json`. |
| `scripts/tenant-bypass-baseline.json` | Gerekçeli mandal. 37 girdi, 41 çağrı yeri. |
| `package.json` | `rls:bypass-check` betiği + `gate` zincirine `rls:check` ile `rls:verify` arasına eklendi. |

### 1.1 Dört kontrol

- **CHECK A** — kiracıya özel bir modelin `prisma` singleton'ı üzerinden okunması/yazılması.
  Kural `tx` yerine `prisma` yazılmış olmasından KARAR VERİLEBİLİR: `withTenant` callback'ine
  `set_config('app.tenant_id', …)` koşulmuş bir *transaction* istemcisi verir; singleton başka bir
  bağlantıdır. Kapsam analizi yok, "belki sarılıdır" yok.
- **CHECK B1** — `tenantId ? { … } : { … }`, yanlış kolda `tenantId` yok. Filtre daralmıyor,
  **yok oluyor**. Bu depoda iki kez düzeltilmiş, sonra üç dosyada daha canlı bulunmuş bir sınıf.
- **CHECK B2** — `tenantId: x ?? 'bir-şey'` / `x || y`. `?? null` / `?? undefined` **kural
  düzeyinde** muaf (nullable sütunda dürüst yokluk), `?? PLATFORM_SCOPE_TENANT_ID` de öyle
  (`src/lib/llm.ts`'in *beyan edilmiş* platform kapsamı). Adı olan belgelenmiş bir sabit beyandır;
  aynı yerdeki çıplak dizge tahmindir.
- **CHECK C** — `as unknown as TenantTx`, `src/lib/db.ts` dışında. `db.ts:95` bu deliği kendi
  docstring'inde adıyla anıyor. Bugün üretim `src/**` içinde **sıfır** ihlal var; kapı bedava.

### 1.2 İki bilinçli sınır (gizlenmiyor, yazılıyor)

1. **Çalışma ağacını değil git İNDEKSİNİ tarar** (`git ls-files`). Bu ağaçta altı ajan çalışıyor;
   komşunun takipsiz sonda betiği kapıyı burada kırmızı, CI'da yeşil yapmamalı. Yeni dosyalar
   `git add` anından itibaren kapsamda — `githooks/pre-commit` de tam orada koşuyor.
   *(Ölçüldü: `git ls-files` 415, `find` 416 dosya döndürüyor; fark `src/proxy.ts`, gitignore'lu.)*
2. **Yalnız `src/**`**, içindeki `*.test.ts` / `*.spec.ts` / `__tests__/` hariç. Fikstürler bilerek
   kiracılar arası satır yaratıp siliyor; `scripts/` bilerek `fabrika` rolünde koşan operatör
   araçları. Bu 28 bulgu **sayılıyor ama yargılanmıyor** ve kapı her koşuda sayıyı yazıyor — dışlama
   sessiz değil, görünür.

---

## 2. Kanıt

### 2.1 Kapının GERÇEKTEN yakaladığı — kasıtlı ihlal, İZOLE worktree'de

Paylaşılan ağaca ihlal satırı enjekte etmedim: dört komşu ajan aynı `dev` üzerinde commit atıyor ve
sonda satırı birinin commit'ine düşebilirdi. Bunun yerine `git worktree add --detach` ile
`c3c8e9c`'nin izole bir kopyası açıldı, ölçüm orada yapıldı, worktree silindi.

**Temel çizgi (izole worktree, HEAD c3c8e9c):**
```
Scanned 416 tracked source files in src/** against 45 tenant-scoped models.
  42 call site(s) outside a tenant scope; baseline records 42.
  28 more are in fixtures (*.test.ts, *.spec.ts, __tests__/): reported, not judged.
exit=0
```

**Dört kontrolü birden ihlal eden bir dosya eklendi** (`src/lib/deliberate-violation.ts`), dosyanın
sonunda ayrıca hatayı **alıntılayan bir docstring** var:
```
❌ 5 tenant bypass(es) this baseline has never seen:

  CHECK A — tenant-scoped model reached through the `prisma` singleton
  src/lib/deliberate-violation.ts:5
      return prisma.opportunity.findMany({ orderBy: { createdAt: 'desc' } });
  src/lib/deliberate-violation.ts:10
      return prisma.conceptNote.findMany({ where: tenantId ? { tenantId } : {} });

  CHECK B1 — `tenantId ? {…} : {…}` — the filter disappears instead of narrowing
  src/lib/deliberate-violation.ts:10

  CHECK B2 — `tenantId: x ?? …` / `x || …` — an invented tenant instead of a refusal
  src/lib/deliberate-violation.ts:15
      return { tenantId: tenantId ?? 'unknown-tenant', module: 'M1' };

  CHECK C — `as unknown as TenantTx` — the brand minted outside withTenantOn
  src/lib/deliberate-violation.ts:20
      return prisma as unknown as TenantTx;

❌ rls:bypass-check FAILED.
EXIT=1
```
Satır 24-27'deki docstring (`prisma.opportunity.findMany({ where: tenantId ? { tenantId } : {} })`)
**hiç bildirilmedi** — yorum duyarlılığı ölçüldü, iddia edilmedi. Bu önemli: bu depoda dört
docstring düzelttiği hatayı çalışan örnek olarak *alıntılıyor*; kendi belgelerine kızan bir kapı
insanlara belgeleri silmeyi öğretir.

Dosya kaldırıldı → kapı tekrar **yeşil**.

### 2.2 Mandalın öbür iki dişi

**(a) Bilinen bir dosya çağrı KAZANIRSA** — `api-auth.ts`'e ikinci bir `apiKey.findUnique` eklendi:
```
❌ 1 known file(s) gained call sites:
  src/lib/api-auth.ts — apiKey.findUnique: baseline 1, found 2
  src/lib/api-auth.ts:41
      await prisma.apiKey.findUnique({ where: { keyHash } });
  src/lib/api-auth.ts:42
      const keyRecord = await prisma.apiKey.findUnique({
  The recorded reason covers 1 of them:
      The SHA-256 key hash IS the credential and this lookup is what DISCOVERS the tenant. …
  A new call site is not covered by an old reason. Wrap it, or record it.
```
Baseline **satır numarasına değil** `(dosya, model.op)` ikilisine bağlanıyor. Satır numaraları
kayıyor — bu kartın kendi metni `export/route.ts:34` diyordu, çağrı bugün `:47`'de.

**(b) Bir borç KAPANIRSA** — `create-portal-session.ts` sarıldı:
```
⚠ 1 baseline entry is ahead of the tree:
  src/lib/billing/create-portal-session.ts — subscription.findUnique: recorded 1, found 0  ✔ fixed
$ pnpm rls:bypass-check --prune
Pruned 1 baseline entry:
  A|src/lib/billing/create-portal-session.ts|subscription.findUnique  1 -> 0
✅ SUCCESS: … 6 still owed.        ← borç 7 → 6
```

### 2.3 Tasarım değişikliği: düşen sayı KIRMIZI değil UYARI

İlk sürümde düşen sayı da kapıyı kırıyordu. Bu kart koşarken **gerçekten oldu**:
TASK-MTVSBEO7VX6Y4 `subscription-sync.ts`'teki iki geri-düşümden birini kaldırdı ve kapı benim
baseline'ımı bayat ilan etti. Düşen sayı **her zaman bir iyileşmedir**; altı ajanın paylaştığı bir
ağaçta bunun bloke ettiği kişi genellikle sebep olan kişi değildir, ve mandal böyle düzeltilmez —
silinir. Bu yüzden asimetrik: **yeni/artan = hata (exit 1), azalan = uyarı (exit 0)**.

Uyarının listeyi çürütmesini engelleyen şey ayrı: borç özeti artık **ölçülen** sayıyı yazıyor,
kayıtlıyı değil, ve sıfıra düşen girdiyi `fixed — prune me` diye işaretliyor. Liste borcu asla
**abartamaz** ve her koşuda — yeşilde de — basılır.

### 2.4 `pnpm gate` içinde, yerinde

```
$ pnpm rls:check && pnpm rls:bypass-check && pnpm rls:verify
CHAIN_EXIT=0

$ tsx scripts/check-rls.ts
✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.

$ tsx scripts/check-tenant-bypass.ts
Scanned 416 tracked source files in src/** against 46 tenant-scoped models.
  41 call site(s) outside a tenant scope; baseline records 41.
  28 more are in fixtures (*.test.ts, *.spec.ts, __tests__/): reported, not judged.
✅ SUCCESS: no new tenant bypass. 35 call site(s) allowed with a recorded reason, 6 still owed.
   (Shape only — `pnpm rls:verify` asks the database whether isolation actually holds.)

$ tsx scripts/check-rls-live.ts
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

`pnpm lint` temiz. `pnpm exec eslint scripts/check-tenant-bypass.ts scripts/tenant-bypass-scan.ts`
→ 0 hata. Kendi dosyalarımda `tsc` hatası **yok** (aşağıda §7).

---

## 3. Baseline: 41 çağrı, 37 girdi, hepsi okunarak yazıldı

Gerekçelerin hiçbiri yoldan çıkarılmadı; her biri işaret ettiği dosya AÇILIP okunarak yazıldı.

| sınıf | çağrı | ne demek |
|---|---:|---|
| `tenant-discovery` | 5 | Satırın kendisi kimlik bilgisi; kiracı bu sorgunun **cevabı**. `api-auth.ts` (API anahtarı hash'i), partner portalı magic-token (×3), `billing/portal` (kullanıcı hangi kiracının sahibi?). Sarılamaz: `withTenant`'ın ihtiyacı olan argüman bu çağrının sonucudur. |
| `subject-scoped` | 16 | KVKK/GDPR. `userId`'ye göre, veri sahibinin üyesi olduğu **her** kiracıya yayılıyor. Tek kapsam taşınabilirlik ihracını sessizce eksik yapardı. |
| `platform-admin` | 6 | `requirePlatformAdmin()` arkası konsollar; dosyalar bunu kendi yorumlarında söylüyor. |
| `platform-aggregate` / `cross-tenant-job` | 8 | "Bu plana kaç kiracı bağlı", beta özeti, cron fan-out. Kiracı kümesi sorgunun **çıktısı**. |
| **`debt`** | **6** | Aşağıda §4. |

### 3.1 Kartın istediği üç madde — ve neden allowlist'e GİRMEDİLER

Kart `conceptTemplate` (export/route) ve `Topic` (pipeline/actions ×2) için ada göre allowlist
istiyordu. **Gerekmedi ve ada göre allowlist yanlış olurdu:** kapı `scripts/rls-models.ts`'in
`tenantScopedModels()` fonksiyonunu yeniden kullanıyor, o da `SYSTEM_WIDE` ve `NULLABLE_TENANT`
kümelerini zaten dışlıyor. `Topic` `SYSTEM_WIDE`'da, `ConceptTemplate` `NULLABLE_TENANT`'ta. İkinci
bir isim listesi açmak, iki kapının "kapsanmış" tanımı üzerinde anlaşmasını sağlayan tek kaynağı
bölerdi.

Yerine kapı bir **katalog notu** basıyor — kartın §5.3 şartı ("`Topic`'in hiçbir kovada olmamasının
nedeni AÇIKÇA belgelenecek, yoksa envanterde eksik satır gibi görünür") tam olarak bu:
```
Shared catalogues this gate does not police (by construction, not by allowlist):
  Topic — 14 call site(s) in src/**
      shared CORDIS catalogue, no tenantId column at all …
  AuditEvent — 11 call site(s) in src/**
  ConceptTemplate — 6 call site(s) in src/**
```

**Kartın bir bilgisi yanlıştı, düzeltiliyor.** Kart "`conceptTemplate` ve `Topic` … `tenantId`
sütunları YOK" diyor. `Topic` için doğru. `ConceptTemplate` için **yanlış**:
`prisma/schema.prisma:994` → `tenantId String? // null = platform`. Bu fark önemsiz değil, §6'nın
tamamı oradan çıkıyor.

---

## 4. Ölçülen borç: 6 çağrı, hepsi panoda bir kartta

Hiçbiri prozada bırakılmadı — "başka kartın kapsamı" satırı bir kusurun düzeldiğinin kanıtı değildir.

| çağrı | neden yanlış | kart |
|---|---|---|
| `create-portal-session.ts:15` | `tenantId` zaten parametre; hiçbir şey keşfetmiyor | **TASK-MTVTMZXYT84RZ** |
| `lifetime-licence.ts:183` | `data: { tenantId }` ile yazıyor; `fabrika_app` altında INSERT **reddedilir** — ödenmiş lisans kayda geçmez | **TASK-MTVTMZXYT84RZ** |
| `marketplace/page.tsx:21` | Kod "paylaşılan katalog" diyor, şema null olmayan `tenantId` + `tenant_isolation` politikası veriyor. Çelişki; muafiyetle kapatılamaz | **TASK-MTVTQTJIQ5SDB** |
| `esr-parser.ts:61` | `tenantId \|\| 'system'` → `generateText` → **`AiUsageLog`** (kiracıya özel tablo) + kredi düşümü. Depoda doğru değer zaten beyan edilmiş: `PLATFORM_SCOPE_TENANT_ID` | **TASK-MTVTRNORO1ES8** |
| `storefront.ts:278` | `?? 'anonymous'` log yükünde; sorgu değil, ama hiçbir `Tenant` satırıyla eşleşmeyen id — hayalet alarm yığınının başladığı yer | **TASK-MTVTRNORO1ES8** |
| `subscription-sync.ts:179` | `?? ''` — `assertTenantScope`'un tam olarak reddettiği değer | **TASK-MTVSBEO7VX6Y4** (dosyanın sahibi o kart) |

---

## 5. Kartın ötesinde: "Dilim 5 son" YANLIŞ

Baseline'daki 35 `allowed` çağrı kiracı kapsamı açısından **doğru**. Ama `fabrika_app`
(NOBYPASSRLS) açısından **hazır değil**. Salt-okunur bir sonda ile ölçtüm — aynı sorgu,
`app.tenant_id` ayarlanmadan, iki rolde (sarmalanmamış bir çağrının yaptığının aynısı):

```
--- DATABASE_URL (today): role=fabrika rolsuper=true rolbypassrls=true
--- DATABASE_URL_RLS_TEST: role=fabrika_app rolsuper=false rolbypassrls=false

 table                 | as fabrika | as fabrika_app | what reads it unscoped
-----------------------+------------+----------------+------------------------
Membership             |         15 |              0 | GDPR export + erasure + billing-portal tenant discovery
Feedback               |          5 |              0 | platform-admin triage console + beta digest
ModuleState            |         17 |              0 | platform-admin module console
Subscription           |          1 |              0 | platform plan console (groupBy/count)
Relationship           |          0 |              0 | m4-weekly-summary cron fan-out
SavedSearch            |          0 |              0 | alerts-daily cron fan-out
ApiKey                 |          2 |              0 | API-key authentication (tenant discovery)
ApplicationPart        |          0 |              0 | magic-token partner portal (tenant discovery)
AiUsageLog             |          9 |              0 | GDPR export
Opportunity            |         28 |              0 | GDPR export + erasure
MarketplaceListing     |          0 |              0 | marketplace page (contradiction)
```

Dolu olan her tablo `fabrika_app` altında **0** dönüyor. Somut karşılığı:

- **Her API anahtarı isteği 401 döner** — `api-auth.ts` 2 anahtarın hiçbirini bulamaz.
- **Veri sahibi dışa aktarımı BOŞ dosya üretir** (15 üyelik, 9 kullanım kaydı, 28 fırsat → 0).
- **Silme talebi hiçbir şey silmeden "başarılı" der.** KVKK/GDPR açısından en ağırı budur:
  hata değil, sessiz yokluk.
- Platform-admin konsolları boş ekran verir (17 modül durumu, 5 geri bildirim → 0).

Bu çağrılar `withTenant`'a **alınamaz** (kiracı sorgunun cevabı ya da sorusu bütün estate'i
kapsıyor); onlara **yaptırımlı bir çapraz-kiracı yolu** gerekiyor. Dilim 6 olarak kart açıldı:
**TASK-MTVTPVTEBCF5Z** — sınıf başına mekanizma, ADR, ve yukarıdaki tablonun yeniden ölçülmesi DoD.

Not: `rls:verify` bunu zaten kısmen söylüyordu ("app.tenant_id yokken 20 dolu tablonun hepsi 0 satır
döndü"), ama hangi ÜRÜN YOLUNUN ona bağlı olduğunu söylemiyordu. Kapının kattığı şey o eşleme.

---

## 6. Kapının kendi kör noktası (ölçüldü, kart açıldı)

`ConceptTemplate` `NULLABLE_TENANT`'ta olduğu için CHECK A onu göremez. Baktım:
`createConceptNote` (server action) ve `generateConceptNoteDraft` **istemciden gelen** `templateId`'yi
`findUnique({ where: { id } })` ile, kiracı kolu olmadan okuyor.

**Ölçüm (dürüstlük payı):** tabloda 7 satır var, **7'si de `tenantId IS NULL`**; kiracıya ait şablon
**0**. Yani bugün canlı sızıntı **yok**. Politika (`tenant_or_shared`,
`tenantId IS NULL OR tenantId = current_setting('app.tenant_id', true)`) doğru yazılmış; hatalı olan
çağrı yeri. İlk kiracı şablonu oluşturulduğu gün iki yönde birden bozulur: bugünün rolünde B, A'nın
şablonunu okur; `fabrika_app`'te A **kendi** şablonunu okuyamaz (kapsamsız çağrı `app.tenant_id`
ayarlamadığı için politika yalnız NULL satırlarla eşleşir).

Kart: **TASK-MTVTU103F11XJ**. Kapıyı bu kartta genişletmedim çünkü bu **farklı bir kural** —
kullanılan istemciyle değil `where` cümlesinin şekliyle ilgili — ve `AuditEvent`'in 11 çağrısını da
kapsayacağı için kendi baseline'ını ister.

---

## 7. Değişen dosyalar

```
scripts/tenant-bypass-scan.ts        (yeni)
scripts/check-tenant-bypass.ts       (yeni)
scripts/tenant-bypass-baseline.json  (yeni)
package.json                         (+2 satır: rls:bypass-check, gate zincirine ekleme)
docs/agent-results/TASK-MTVRAZSUVLL9R-de-fb.md (bu dosya)
```
`src/**`, `tests/**`, `tsconfig.json`: **dokunulmadı**.

### Bilinen kırmızı — bana ait DEĞİL

`pnpm gate` `typecheck` adımında kırmızı. İki hata, ikisi de tek bir dosyada:
```
tests/e2e/document-export-tenant-isolation.spec.ts(70,9): error TS18048: 'body' is possibly 'undefined'.
tests/e2e/document-export-tenant-isolation.spec.ts(71,37): error TS2345: Argument of type 'string | undefined' …
```
Sahiplik `git log` ile: `4bf0154 build(types): TASK-MTVPPDW8NXKLD — turn noUncheckedIndexedAccess on
permanently` bayrağı açtı; o kartın metni bu spec dosyasına dokunmayı **yasaklıyordu** (paralelde
TASK-MTVT0VLF4AP19'un dosyası, son dokunan commit `82037c2`). İki kartın kesişiminde kalmış; benim
kapsamım değil ve düzeltmedim. Hatalar regex destructuring (`[, body]`) üzerinde —
`noUncheckedIndexedAccess`'in beklenen etkisi.

**Benim dosyalarımda 0 typecheck hatası:** `pnpm typecheck 2>&1 | grep "scripts/(check-tenant-bypass|tenant-bypass-scan)"`
→ eşleşme yok.

`gate` zincirinin `typecheck`'ten sonraki adımları bu yüzden koşamadı; `rls:check`,
`rls:bypass-check`, `rls:verify` üçlüsünü elle koştum (§2.4, `CHAIN_EXIT=0`).

---

## 8. Riskler

1. **Model listesi çalışma ağacından, kaynak dosyalar indeksten okunuyor.** `tenantScopedModels()`
   `prisma/schema.prisma`'yı `readFileSync` ile okur (mevcut davranış, `rls:check` de öyle yapıyor).
   Komşu commit'lenmemiş bir model eklerse kapsam yerelde genişler, CI'da genişlemez. Yön güvenli
   (daha çok kapsam), ama tutarsız. Bu koşuda gerçekten oldu: TASK-MTVSBEO7VX6Y4'ün eklediği
   `StripeEventLog` yüzünden model sayısı ölçüm sırasında 45'ten 46'ya çıktı.
2. **Baseline `(dosya, model.op)` ile eşleşir.** Aynı dosyada aynı modele aynı operasyonla yapılan
   ikinci bir çağrı **sayıyla** yakalanır (§2.2a), ama bir dosya yeniden adlandırılırsa girdi
   "yeni ihlal" olarak kızarır. Doğru davranış, ama sürprizdir.
3. **Düşen sayı uyarı olduğu için baseline biraz eskimiş kalabilir.** Karşı tedbir borç özetinin
   ölçülen sayıyı basması (§2.3) — liste abartamaz, ama kayıtlı gerekçe metni bir süre eski
   kalabilir. Bu koşuda `subscription-sync` girdisinin gerekçesi elle tazelendi.
4. **Regex tabanlı, AST değil.** `//` içeren bir düzenli ifade edebiyatı bilinen kör noktadır
   (`\\` öncesi `//` yorum sayılmıyor, `/\\/\\//` şekli bu yüzden kapsanıyor). AST'ye geçmek
   `typescript` API'sini betiğe sokardı; bu kapının maliyet/fayda dengesine göre yapılmadı.
5. **Kapı ŞEKLİ ölçer, davranışı değil.** Her çıktı satırında yazıyor. Sarılmış bir dilim
   `fabrika_app`'e hazır demek değildir (§5) — bunu yalnız `rls:verify` ve `.live` desenli testler
   söyleyebilir.

---

## 9. Açık sorular

1. **`admin/modules/actions.ts:35` `allowed` mi kalmalı?** `where: { tenantId }` taşıyor, yani
   sarılabilir; ama aynı konsoldaki kardeşi (`page.tsx:28`) sarılamaz. Tek bir ekranda iki erişim
   stili istemedim, `allowed` bıraktım ve gerekçeyi baseline'a yazdım. Dilim 6 (TASK-MTVTPVTEBCF5Z)
   `platform-admin` sınıfına bir mekanizma seçtiğinde bu ikisi birlikte taşınmalı.
2. **`scripts/**` ve `tests/**` kapsam dışı kalsın mı?** Bugün kalıyor (operatör araçları ve
   fikstürler bilerek çapraz-kiracı). `scripts/rescore-g0.ts:79` `prisma as unknown as TenantTx`
   yapıyor ve yorumu bunu "admin script, RLS bypassed" diye gerekçelendiriyor — CHECK C `src/**`
   dışına çıkarılırsa ilk konuşulacak satır odur.
3. **CHECK B2 değişken geri-düşümleri de yakalıyor** (`x || y`, kart öyle istedi). Bugün ağaçta
   sıfır örneği var, yani bedava; ama meşru bir "iki kiracı id'sinden hangisi doluysa" deseni
   çıkarsa gürültü yapar. O gün kural daraltılmalı, allowlist şişirilmemeli.

---

## 10. Sonraki adım

1. **TASK-MTVTPVTEBCF5Z (Dilim 6)** — `fabrika_app` geçişinin gerçek son ön koşulu. §5'teki tablo
   DoD'sinde.
2. **TASK-MTVTMZXYT84RZ / TASK-MTVTQTJIQ5SDB / TASK-MTVTRNORO1ES8** — 5 borç çağrısı (altıncısı
   TASK-MTVSBEO7VX6Y4'ün dosyasında).
3. **TASK-MTVTU103F11XJ** — kapının kör noktası; CHECK D kararı orada verilecek.
4. `tests/e2e/document-export-tenant-isolation.spec.ts`'teki iki typecheck hatası
   (TASK-MTVPPDW8NXKLD × TASK-MTVT0VLF4AP19 kesişimi) sahiplenilmeli — `pnpm gate` o dosya
   yüzünden bütünüyle koşamıyor.

---

## 11. Platform beyanı

**Doğrulama platformu: mac (Darwin 25.6.0, arm64)** — Node 26.5, pnpm, Postgres (docker-compose),
`fabrika` + `fabrika_app` rolleri.

Dokunduğum kod yollarının **platforma bağlı tek noktası** `git ls-files -z` çağrısıdır
(`execFileSync`, `node:child_process`). Kabuk kullanılmıyor (`execFile`, `exec` değil), yollar `\0`
ile ayrılıyor, ve `git ls-files` her platformda ileri eğik çizgili (`/`) repo-göreli yol döndürür —
Windows'ta da. Baseline'daki yollar bu yüzden üç platformda birebir aynı eşleşir. Dosya okuma
`node:fs` + `node:path.resolve` ile yapılıyor; satır ayırma `\n` üzerinden ve `\r` bir kod karakteri
olarak taşınıyor, yani CRLF checkout'ta `text` alanının sonunda `\r` görünebilir — **yalnız ekrana
basılan alıntıda**, eşleşme mantığında değil (eşleşme `(check, file, subject)` üzerinden).

Süreç öldürme, ikili adı, kısayol metni, ekran/DPI, mikrofon-kamera izni **yok**.

**Windows / Linux'ta koşulamadı** — bu makinede yalnız mac var. Koddan beklenen: aynı davranış;
tek koşul `git`in PATH'te olması (zaten `githooks/` bunu varsayıyor).
