# TASK-MTVTPVTEBCF5Z — Kiracı-atlaması Dilim 6: yaptırımlı çapraz-kiracı istemcisi

**Ajan:** de-fb (Data Engineer) · **Tip:** feature (RLS / veri erişim katmanı) ·
**Platform:** darwin 25.6.0 (saf SQL + TypeScript; işletim sistemine bağlı kod yolu yok) ·
**Tarih:** 2026-09-11

---

## 1. Ne yapıldı

Depoda tenant kapsamından çıkan 35 çağrı yeri vardı ve hepsi **doğruydu** — kiracıyı
*bulan* API-key araması, veri sahibini her kiracıda arayan GDPR ihracı, platform-admin
konsolları, kiracı kümesi sorgunun *çıktısı* olan cron fan-out'ları. Sorun bunların
yanlış olması değil, **kapısız** olmasıydı: uygulama yerelde `fabrika` (SUPERUSER,
BYPASSRLS) rolüyle bağlandığı için hepsi **kazara** çalışıyordu.

Ölçüm (bu rapor §2.4): aynı sorgular `fabrika_app` (NOBYPASSRLS) rolünde **sıfır satır**
döndürüyor. Yani uygulama BYPASSRLS olmaktan çıktığı gün API-key kimlik doğrulama,
sihirli-token ortak portalı, GDPR ihracı ve günlük alarm fan-out'u **sessizce** bozulur:
hata yok, boş sonuç, doğru görünen bir ekran.

Dilim 6 bu 35 yere delik yerine **kapı** koydu:

| parça | ne yapar |
|---|---|
| `prisma/rls.sql` → `system_scope` politikası | Ayrı ve **PERMISSIVE** politika. Permissive politikalar OR'lanır: `tenant_isolation` bir harfi bile değişmedi (`scripts/rls-migrations.ts` dokuz migration'daki kopyasını **bayt bayt** karşılaştırıyor; yeniden ifade etmek dokuz migration'ı kırardı). |
| `prisma/rls.sql` → `enter_system_scope(purpose)` | SECURITY DEFINER; purpose'u kapalı listeye karşı **veritabanında** doğrular, `app.system_scope` GUC'unu `is_local => true` ile açar. `exit_system_scope` bilerek **yok**: çıkış COMMIT/ROLLBACK'tir, çağıran unutamaz. EXECUTE yetkisi yalnız `fabrika_app`'e adıyla verilir → `REVOKE EXECUTE` kapıyı deploy'suz kapatır. |
| `src/lib/system-scope.ts` (YENİ, 178 satır) | Tek giriş noktası: `withSystemScope(purpose, context, cb)`. Beş purpose (`tenant-discovery`, `subject-scoped`, `platform-admin`, `platform-aggregate`, `cross-tenant-job`), markalı `SystemTx` tipi (çıplak `prisma` bu tipi karşılamaz), her çağrı `context` ile loglanır → çapraz-kiracı okuma anonim değil, **atfedilebilir**. |
| `scripts/tenant-bypass-scan.ts` → CHECK D | `src/**` içindeki her `withSystemScope(` çağrısını sayar. Yeni bir kaçış, baseline'da gerekçesiyle yazılı değilse **kırmızı**. |
| `scripts/check-tenant-bypass.ts` | Kind ↔ check tutarlılığı: bir CHECK A atlamasını `system-scope` diye etiketleyip susturmak artık kapıyı kırar. Ek olarak "sanctioned escapes" özeti basar. |
| `tests/system-scope.live.test.ts` (YENİ, 6 test) | Davranışı **ölçülebildiği tek yerde** ölçer: `fabrika_app` bağlantısında. |
| 22 çağrı yeri / 16 dosya | `withSystemScope`'a taşındı (dağılım §2.3). |
| `src/app/[locale]/admin/modules/actions.ts` | Bunun tersi: kiracı zaten argümanda olduğu için `withTenant`'a taşındı — çıplak `prisma.$transaction`'ın altında her upsert `fabrika_app`'te WITH CHECK'e takılırdı. |

**Kilit tasarım kararı:** bu bir *unutmaya* karşı korumadır, *ele geçirilmiş sürece* karşı
değil. `fabrika_app` GUC'u kendisi de set edebilir (ölçüldü, §2.5). Sert sınır ikinci bir
rol/bağlantı ister; §6'daki 1-3-1 bunu insana bırakır. `withSystemScope` imzası, o geçiş
yapıldığında **yalnız bu dosyanın** değişeceği şekilde seçildi.

---

## 2. Kanıt

### 2.1 Kapının tamamı yeşil (`pnpm gate`'in her adımı, 2026-09-11)

```
$ pnpm lint                → lint exit=0
$ pnpm typecheck           → typecheck exit=0
$ pnpm test                → Test Files 164 passed | 2 skipped (166)
                             Tests  1926 passed | 8 skipped (1934)      exit=0
$ pnpm i18n:check          → ✅ i18n check passed …                      exit=0
$ pnpm rls:check           → ✅ All 47 tenant-scoped models have RLS policies registered.
                             CHECK 4b — 14 tables … ENABLE + FORCE + tenant_isolation  exit=0
$ pnpm rls:bypass-check    → ✅ SUCCESS: no new tenant bypass.            exit=0
$ pnpm rls:verify          → ✅ 47 tabloda … izolasyon fabrika_app ile GERÇEKTEN ölçüldü  exit=0
$ pnpm test:e2e            → 1 skipped · 180 passed (3.9m)                exit=0
$ pnpm alerts:check        → ✅ Öksüz alarm yok                           exit=0
```

### 2.2 Bu koşuda ortaya çıkan iki tuzak — ikisi de kodla ilgisiz, ikisi de kayda değer

**(a) 40 birim testi kırmızıydı; sebep Postgres'in kapalı olmasıydı.**
İlk `pnpm test` koşusu `6 failed | 147 passed`, `Tests 40 failed` verdi. Vitest'in
bastığı `PrismaClientKnownRequestError` **mesajsızdı**; hatayı adıyla görmek için
çağrıyı repo kökünden tek tek koşturmak gerekti:

```
NAME= PrismaClientKnownRequestError CODE= ECONNREFUSED
  Invalid `prisma.tenant.create()` invocation
```

`docker info` → daemon yok. `open -a Docker` + `docker compose up -d` →
`postgres-vector  Up (healthy)`. Aynı süit, tek değişiklik olarak DB ayakta:
**1926 passed, 0 failed.** Kırmızıların hiçbiri kodla ilgili değildi.

**(b) `E2E_PORT` ile koşulan e2e'de 4 kırmızı; sebep spec'lerin portu sabit yazması.**
Komşu ajan `:3000`'i tuttuğu için gate `E2E_PORT=3117` ile koşuldu:

```
$ E2E_PORT=3117 pnpm test:e2e
  4 failed
    theme-no-script-warning.spec.ts  ×2
    theme-paint-timing.spec.ts       ×2
  1 skipped · 176 passed (3.7m)
```

Dördünün de hatası **aynı** ve teşhis edici:

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/tr
```

Sunucu 3117'deydi. Sebep ürün değil, spec:

```
$ grep -rn "localhost:3000" tests/e2e/*.ts
tests/e2e/identity-honesty.spec.ts:40:    { name: COOKIE_NAME, value, url: 'http://localhost:3000' },
tests/e2e/identity-strings.spec.ts:42:    { name: COOKIE_NAME, value, url: 'http://localhost:3000' },
tests/e2e/theme-paint-timing.spec.ts:17:const BASE_URL = 'http://localhost:3000';
tests/e2e/theme-no-script-warning.spec.ts:22:    await page.goto(`http://localhost:3000/${locale}`, …);
```

Port boşalınca aynı dört test **geçti** (§2.1, 180 passed). Yani bunlar "HEAD'de de
kırmızı, tema/hydration borcu" değil — `E2E_PORT` yolunun **yanlış negatifi**.
Önceki raporlar (`TASK-MTV8W14FY9BKD-geli-tirici.md` §6.3) bu ikisini kalıcı kırmızı
sanmıştı; ölçüm bunu düzeltiyor. Kart açıldı (§6.2).

### 2.3 Yaptırımın kendisi: kapı 22 kaçışı sayıyor

```
$ pnpm rls:bypass-check
Sanctioned cross-tenant escapes: 22 call site(s) via withSystemScope, measured.
  cross-tenant-job     2 call site(s) in 2 file(s)
  platform-admin       3 call site(s) in 3 file(s)
  platform-aggregate   5 call site(s) in 3 file(s)
  subject-scoped       6 call site(s) in 3 file(s)
  tenant-discovery     6 call site(s) in 5 file(s)
  Each one is recorded with a reason, ratcheted like a bypass, and opens the
  `system_scope` RLS policy for one transaction only (prisma/rls.sql).

⚠ Outstanding tenant-bypass debt: 2 call site(s), measured.
  [TASK-MTVTMZXYT84RZ] src/lib/billing/create-portal-session.ts — subscription.findUnique (x1)
  [TASK-MTVTMZXYT84RZ] src/lib/billing/lifetime-licence.ts — lifetimeLicence.create (x1)
  [TASK-MTVSBEO7VX6Y4] src/lib/billing/subscription-sync.ts — tenantId-fallback (fixed — prune me)

✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason,
   22 on the sanctioned cross-tenant path, 2 still owed.
```

Vurgu: `withSystemScope`'a taşımak bir çağrıyı kapıdan **kaybetmiyor**; bir sayılı
listeden diğerine taşıyor. Susturma düğmesi değil.

### 2.4 Davranış, ölçülebildiği tek rolde ölçüldü (`fabrika_app`, NOBYPASSRLS)

```
$ npx vitest run tests/system-scope.live.test.ts --reporter=verbose
 ✓ withSystemScope over a NOBYPASSRLS role > outside the path, a cross-tenant read returns nothing 46ms
 ✓ withSystemScope over a NOBYPASSRLS role > inside the path, the same read spans tenants 26ms
 ✓ withSystemScope over a NOBYPASSRLS role > the scope dies with its transaction 6ms
 ✓ withSystemScope over a NOBYPASSRLS role > the database refuses a purpose that is not on the list 9ms
 ✓ the purpose list > TypeScript and prisma/rls.sql declare the same five purposes 1ms
 ✓ the purpose list > every purpose is accepted by the database 18ms
      Tests  6 passed (6)
```

Testin kendini atlamadığı ayrıca doğrulandı: `beforeAll` atlama durumunda
`system-scope live test skipped: …` uyarısı basıyor, çıktıda **yok**.

Ağırlığı taşıyan arm **negatif** olan: yol dışında aynı okuma **sıfır** satır döndürüyor.
Bu olmadan diğer arm'lar politikası olmayan bir veritabanında da aynı neşeyle geçerdi.
Kalıcı hafıza kaydı `fabrika-a-wrapper-migration-is-red-first-in-the-positive-direction`
bu tuzağın tam olarak bu sınıfını anlatıyor ve test ona göre kuruldu.

Canlı izolasyon ölçümü (`pnpm rls:verify`), aynı rolle:

```
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
```

### 2.5 Ne OLMADIĞI da ölçüldü

`fabrika_app` rolü `set_config('app.system_scope','on',true)` çağrısını **kendi başına
yapabiliyor** — denendi, çalışıyor. Dolayısıyla SECURITY DEFINER sarmalayıcısının satın
aldığı şey: purpose doğrulaması, tek greplenebilir giriş noktası ve deploy'suz
`REVOKE EXECUTE`. Satın **almadığı** şey: zaten bizim kodumuzu koşan bir saldırgana
karşı sınır. Bu, `withTenant`'ın durumuyla aynı (o da `app.tenant_id`'yi istediği
kiracıya set edebilir). §6.1'deki 1-3-1 bu sınırı insana taşıyor.

---

## 3. Değişen dosyalar

**Mekanizma**

| dosya | ne |
|---|---|
| `prisma/rls.sql` | +102 satır: `enter_system_scope(purpose)` SECURITY DEFINER, GRANT/REVOKE, `system_scope` PERMISSIVE politikası (`pg_policies`'ten türetilir — üçüncü bir elle-tutulan tablo listesi yok). `tenant_isolation` **değişmedi**. |
| `src/lib/system-scope.ts` | **YENİ** (178 satır). Tek giriş noktası, beş purpose, markalı `SystemTx`, `withSystemScopeOn` (test için açık istemci). |
| `scripts/tenant-bypass-scan.ts` | +63/-0: CHECK D. |
| `scripts/check-tenant-bypass.ts` | +64/-0: kind↔check doğrulaması + kaçış özeti. |
| `scripts/tenant-bypass-baseline.json` | Yeniden yazıldı: 16 `system-scope` kaydı / 22 çağrı + eski kayıtlar. |
| `tests/system-scope.live.test.ts` | **YENİ** (141 satır, 6 test). |

**Çağrı yerleri (22 çağrı / 16 dosya)**

`src/lib/api-auth.ts` · `src/app/[locale]/portal/partner/[token]/page.tsx` ·
`src/modules/m11/server/actions.ts` · `src/app/api/billing/portal/route.ts` ·
`src/actions/user/export-data.ts` · `src/actions/user/request-deletion.ts` ·
`src/lib/inngest/jobs/users-scheduled-deletion.ts` · `src/lib/inngest/jobs/m4-weekly-summary.ts` ·
`src/lib/inngest/jobs/alerts-daily.ts` · `src/app/[locale]/admin/feedback/{page.tsx,actions.ts}` ·
`src/app/[locale]/admin/modules/page.tsx` · `src/lib/billing/{plan-repository,lifetime-licence}.ts` ·
`src/lib/feedback/digest-run.ts`

**Ters yön (kapsam dışına çıkmayan, çıkıyor sanılan bir yer)**

`src/app/[locale]/admin/modules/actions.ts` — `prisma` → `withTenant`.

**Test mock'ları** (yeni modül mock'lanmadan süitler kırmızıydı)

`src/lib/billing/lifetime-licence.test.ts` · `tests/admin-modules.test.ts` ·
`tests/feedback-digest-run.test.ts` · `tests/users-scheduled-deletion.test.ts` ·
`tests/api/v1-{calls,partners,opportunities}.test.ts`

> **Not (paylaşımlı ağaç):** `prisma/rls.sql`'in çalışma kopyasında komşu bir ajanın
> `MarketplaceOrder` satırı vardı (TASK-MTVUQXSYL0X2H, henüz migration'sız —
> `rls:verify` "Şemada olup veritabanında olmayan tablo" diyor). Commit'e **yalnız kendi
> hunk'ım** alındı (`git apply --cached` ile süzülmüş yama); o satır komşusunun
> commit'ine bırakıldı.

---

## 4. Riskler

1. **Sert sınır değil.** §2.5'te ölçüldü: uygulama rolü GUC'u kendi de set edebilir. Bu
   yol "unutmaya karşı" korur. Sert sınır için §6.1.
2. **Deploy sırası.** `withSystemScope` çağıran kod, `pnpm db:rls` koşmadan **sıfır satır**
   okur. Bu dosyadaki her politika değişikliğiyle aynı sıra kuralı, ama sessiz başarısızlık
   sınıfında olduğu için tekrar yazıyorum: **önce `db:rls`, sonra kod.**
3. **Kapının göremediği iki şekil (ölçüldü — §5).** CHECK A/D erişimciye bakar; bir kiracı
   modeline `tx.` üzerinden dokunan çıplak `prisma.$transaction` ve kiracısız bir modelden
   nested `select/include` ile çekilen kiracı ilişkisi kapının dışında kalıyor. **12 çağrı
   yeri, ölçülmüş.** CHECK E bilerek eklenmedi (aşağıda).
4. **CHECK E bu kartta eklenmedi — bilinçli.** Altı ajanın paylaştığı ağaçta depo-geneli
   yeni bir kapı kuralı, benim dokunmadığım dosyalar yüzünden herkesi kırmızıya çevirir.
   Hafıza kaydı `fabrika-gate-scope-follows-the-git-index` tam bu dersi taşıyor. Kart
   açıldı (§6.2).
5. **Paylaşımlı veritabanı.** `fabrika` ve `fabrika_app` ölçümleri aynı anda alınmalı;
   komşu bir seed/temizlik koşusu satır sayılarını kaydırır.

---

## 5. Kapının göremediği iki şekil — ölçüm

Tahmin değil; iki ölçüm betiği kısa ömürlü olarak koşuldu (biri taramanın kendi
`tenantScopedModels()`/`accessorFor()` yardımcılarını, diğeri **Prisma DMMF**'ini
kullanıyor, yani ilişki adı model adından farklı olsa da yakalıyor).

**Şekil 1 — kiracı modeline dokunan çıplak `prisma.$transaction`: 8 blok**

```
src/lib/auth.ts:246                    -> Membership, Workspace
src/lib/auth.ts:438                    -> Membership, Workspace
src/lib/billing/plan-repository.ts:679 -> PlanAssignment, Subscription
src/lib/billing/plan-repository.ts:779 -> PlanAssignment
src/lib/billing/plan-repository.ts:792 -> PlanAssignment
src/lib/billing/plan-repository.ts:809 -> PlanAssignment
src/lib/billing/plan-repository.ts:829 -> PlanAssignment
src/lib/billing/plan-repository.ts:853 -> PlanAssignment
```

**Şekil 2 — kiracısız modelden nested ilişkiyle çekilen kiracı verisi: 4 okuma**

```
src/app/[locale]/admin/tenants/page.tsx:25  Tenant -> users(Membership), workspaces(Workspace)
src/lib/auth.ts:373                         User   -> memberships(Membership)
src/lib/billing.ts:81                       Tenant -> subscription(Subscription)
src/lib/billing/plan-repository.ts:364      Plan   -> assignments(PlanAssignment)
```

Toplam **12**. Şekil 1'in blok penceresi 120 satırla sınırlı olduğundan bu sayı bir
**alt sınırdır**; Şekil 2 DMMF'ten türediği için tamdır. Bu on ikisinin hepsi bugün
`fabrika` (BYPASSRLS) altında çalışıyor ve `fabrika_app`'e geçiş gününde sessizce
boşalır — dilim 6'nın kapattığı 22 çağrıyla aynı sınıf, farklı sözdizimi.

---

## 6. Açık sorular

### 6.1 Karar gerekiyor (1-3-1): çapraz-kiracı yolu *sert* bir sınır olsun mu?

**Problem.** `withSystemScope` "unutmaya karşı" koruyor, "ele geçirilmiş sürece karşı"
korumuyor (§2.5, ölçülmüş). Uygulama rolü GUC'u kendi set edebildiği sürece, yolun
verdiği şey yaptırım değil **muhasebe**.

| # | seçenek | maliyet | ne satın alır |
|---|---|---|---|
| 1 | **Bugünkü hâlinde bırak** (purpose doğrulaması + tek giriş + log + ratchet) | 0 | Unutmaya karşı tam koruma, denetlenebilirlik, `REVOKE EXECUTE` ile deploy'suz kapatma. Saldırgana karşı hiçbir şey. |
| 2 | **İkinci rol + ikinci havuz**: `fabrika_app` `enter_system_scope`'u *çağıramaz*; çapraz-kiracı iş, yalnız o fonksiyonu çalıştırabilen ayrı bir bağlantıdan gider | Orta: ikinci `DATABASE_URL`, connection-pool sayısı iki katına, deploy/secret işi, `withSystemScope` gövdesi değişir (**çağıranlar değişmez** — imza bunun için böyle seçildi) | Gerçek sınır: tenant yolundaki kod, ele geçirilse bile kapsamdan çıkamaz. |
| 3 | **Uygulamayı BYPASSRLS'ten çıkar + seçenek 2** | Yüksek: `fabrika_app`'e geçişin tamamı, §5'teki 12 kör nokta dahil, tüm süit ve tüm cron'lar yeniden ölçülür | RLS'in bugün beyan ettiği her şeyin gerçekten yaptırıma dönmesi. |

**Öneri: 2 — ama 3'ün ön koşulu olarak, ve önce §5 kapatıldıktan sonra.** 2'yi §5'teki
12 kör nokta açıkken yapmak, sert sınırı sessizce boşalan on iki çağrının üstüne kurmak
olur. Sıra: §5 (kart açıldı) → seçenek 2 → seçenek 3. 1 numaralı seçenek bugünkü
durumdur ve o sıraya kadar **kabul edilebilir** — çünkü bugün RLS zaten yaptırımda değil,
yani 2'yi ertelemek mevcut güvenliği düşürmüyor, yalnız kazancı erteliyor.

### 6.2 Açılan kartlar

- **CHECK E — kapının göremediği iki şekil** (§5'teki 12 çağrı yeri + tarama kuralı).
  Kendi kartı olmalı: depo-geneli bir kapı kuralı, paylaşımlı ağaçta tek kartta kapanmalı.
- **e2e spec'leri `localhost:3000`'i sabit yazıyor** (§2.2b). `E2E_PORT`, komşu ajan
  `:3000`'i tutarken gate koşmanın belgelenmiş yolu; dört spec onu yok sayıyor ve iki
  tanesi bu yüzden **yanlış kırmızı** veriyor.

### 6.3 Yanıt bekleyen

- `subscription-sync.ts` borç kaydı "fixed — prune me" diyor (TASK-MTVSBEO7VX6Y4). Kaydı
  silmek o kartın işi; bu kart baseline'a dokunurken bilerek bırakıldı.

---

## 7. Sonraki adım

1. CHECK E kartı (§6.2) — §5'teki 12 çağrı yerini kapat, sonra tarama kuralını ekle.
2. `E2E_PORT` kartı (§6.2) — dört spec'i `baseURL`'e bağla.
3. 1-3-1 (§6.1) insana gitsin; kabul edilirse ikinci rol/havuz yalnız
   `src/lib/system-scope.ts` gövdesini değiştirir.
4. Deploy notu: `pnpm db:rls` **koddan önce**.

---

**Platform beyanı:** macOS (darwin 25.6.0) üzerinde koşuldu ve doğrulandı. Değişikliğin
tamamı PostgreSQL SQL + TypeScript'tir; işletim sistemine bağlı hiçbir kod yolu, dosya
yolu ayracı ya da kabuk çağrısı içermez — Windows/Linux'ta farklı davranması beklenen bir
parça yok.
