# TASK-MTVR8KK92G0GA — Tenant-bypass Dilim 4: cron alt-işlemlerindeki sarmalayıcısız prisma çağrıları

**Ajan:** blok-zincir-dev (DEV-EN) · **Tip:** bug/hardening · **Platform:** macOS (darwin 25.6.0) — aşağıda "Platform beyanı"
**Bağlam:** `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md` §5 Dilim 4
**Kapsam:** yalnız `src/lib/inngest/jobs/alerts-daily.ts`, `src/lib/inngest/jobs/credits-monthly-grant.ts` ve testleri

---

## 1. Ne yapıldı

### 1.1 Satır numaraları — envanter değil, kendi ölçümüm

Envanter `alerts-daily.ts` için 125/143/171 diyordu. Ağaç o zamandan beri değişti (kendi
`resolvedAt`/`alertsSweep` commit'lerim dahil), bu yüzden önce yeniden ölçtüm. Değişiklik
**öncesi** gerçek durum:

| Dosya | Satır | Çağrı | Tablo | Karar |
|---|---|---|---|---|
| alerts-daily.ts | 104 | `prisma.savedSearch.findMany` | SavedSearch | **kasıtlı fan-out — dokunulmadı** (§4'e bak, sınıfı sanıldığı gibi değil) |
| alerts-daily.ts | 125 | `prisma.membership.findMany` | Membership | → `withTenant` |
| alerts-daily.ts | 137 | `prisma.topic.count` | Topic | **kasıtlı istisna — dokunulmadı** (envanterde yoktu, doğru) |
| alerts-daily.ts | 143 | `prisma.savedSearch.update` | SavedSearch | → `withTenant` |
| alerts-daily.ts | 171 | `prisma.savedSearch.update` | SavedSearch | → `withTenant` |
| credits-monthly-grant.ts | 14 | `prisma.tenant.findMany` | Tenant | **kasıtlı fan-out — dokunulmadı** |
| credits-monthly-grant.ts | 31 | `prisma.creditLedger.create` | CreditLedger | → `withTenant` |

Envanterdeki 3+1 = **4 çağrı sarmalandı**. Envanterin saymadığı 137 numaralı çağrıyı da
inceledim: `Topic` şemada `tenantId` taşımıyor ve veritabanında row security kapalı
(0 politika, ölçüldü) — yani gerçekten global CORDIS kataloğu, sarmalanacak bir şey yok.
Envanter onu haklı olarak listelememiş.

### 1.2 Değişikliğin şekli

`alerts-sweep.ts`'in bu dizinde zaten kurduğu dikişi tekrar kullandım: döngü gövdesi
inngest handler'ından saf bir fonksiyona çıkarıldı (`sendSavedSearchAlerts`,
`grantCreditsToTenants`), handler ince kaldı. Sarmalayıcı imzası **yeni bir stil değil** —
depoda zaten 22 çağrı yeri olan `withTenant(tenantId, cb)`; testin RLS'e tabi bir bağlantı
üzerinden aynı döngüyü koşabilmesi için `src/lib/db.ts`'in kendi docstring'inde bu amaçla
tarif ettiği `withTenantOn(client, tenantId, cb)` enjekte ediliyor (`TenantRunner` tipi).
Kardeş dilim TASK-MTVR7W9ZXO7M'in raporu bu iş bitene dek yazılmamıştı, o yüzden hizalanacak
bir imza yoktu; mevcut `withTenant`/`withTenantOn` çiftini kullandım, ikinci bir stil çıkarmadım.

Bir tasarım kararı: **e-posta gönderimi transaction'ın DIŞINDA.** `runTenant` gerçek bir
Postgres transaction'ı açıyor; Resend'e giden ağ turunu bir açık transaction içinde tutmak
bağlantıyı gönderim süresi boyunca kilitlerdi.

---

## 2. Kanıt

Bu kartın asıl riski kapanış hatasıydı: her yinelemenin `tenantId`'si gerçekten o yinelemeye
ait olmalı. Bunu **iddia etmedim, ölçtüm** — ve yeşilin kendi başına hiçbir şey
kanıtlamadığını varsayarak her yeşili kırmızıya çevirebilen bir sonda ile eşledim.

### 2.1 Ölçüm hangi rol üzerinden yapıldı (yoksa hiçbir şey kanıtlanmaz)

Yereldeki `prisma` singleton'ı `fabrika` rolüne bağlanıyor: **SUPERUSER + BYPASSRLS**.
Bu bağlantı üzerinden izolasyon iddia etmek anlamsız — zaten her satırı görür. Bu yüzden
tüm iddialar `DATABASE_URL_RLS_TEST` (rol `fabrika_app`, NOBYPASSRLS) üzerinden koşuyor;
`tests/rls.spec.ts` ve `pnpm rls:verify` ile aynı rol.

```
superuser {"current_user":"fabrika","su":true,"brls":true}
app-role  {"current_user":"fabrika_app","su":false,"brls":false}
```

Dokunulan tabloların canlı şemadaki RLS durumu:

```
┌─────────┬────────────────┬───────┬──────────┐
│ (index) │ table          │ rls   │ policies │
├─────────┼────────────────┼───────┼──────────┤
│ 0       │ 'CreditLedger' │ true  │ 1        │
│ 1       │ 'Membership'   │ true  │ 1        │
│ 2       │ 'SavedSearch'  │ true  │ 1        │
│ 3       │ 'Tenant'       │ false │ 0        │
│ 4       │ 'Topic'        │ false │ 0        │
└─────────┴────────────────┴───────┴──────────┘
```

Üç politikanın da hem `USING` hem `WITH CHECK` yüklemi
`"tenantId" = current_setting('app.tenant_id', true)` — yani yanlış kapsamdaki bir yazma
yanlış kiracıya *düşmez*, Postgres tarafından **reddedilir** (SQLSTATE 42501).

### 2.2 İki kiracılı fixture ile gerçek koşum — yeşil

`src/lib/inngest/jobs/__tests__/cron-tenant-scope.test.ts`: iki kiracı, iki sahip
(TENANT_OWNER membership), iki saved search yaratılıyor; job'ın çıkarılmış döngüleri
`fabrika_app` bağlantısı üzerinden gerçekten koşuyor; sonuç RLS üzerinden geri okunuyor.

```
 ✓ cron-tenant-scope.test.ts > is measuring through a role the policies actually apply to 10ms
 ✓ cron-tenant-scope.test.ts > credits-monthly-grant: each ledger row lands in the tenant of its own iteration 45ms
 ✓ cron-tenant-scope.test.ts > credits-monthly-grant: a stale tenant id is refused by the database, not misfiled 29ms
 ✓ cron-tenant-scope.test.ts > alerts-daily: every search advances lastRunAt under its own tenant 25ms
 ✓ cron-tenant-scope.test.ts > alerts-daily: a stale tenant id fails the search rather than touching the other tenant 9ms
 ✓ cron-tenant-scope.test.ts > alerts-daily: the lastRunAt write itself is refused under a foreign scope 3ms
```

"Her kiracının kaydı KENDİ kiracısına yazıldı" iddiası RLS üzerinden geri okumayla
doğrulanıyor: A'nın kapsamında tam olarak `[{tenantId: A, delta: 10}]` görünüyor,
B'nin kapsamında tam olarak `[{tenantId: B, delta: 10}]`, ve hiçbiri diğerini göremiyor.

### 2.3 Çürütme sondaları — üretim kodu üzerinde 4 mutant, hepsi KIRMIZI

Test-içi sahte sarmalayıcı yetmez; **üretim dosyalarını gerçekten bozup** süitin
kırmızıya döndüğünü gösterdim, sonra geri aldım.

```
################ MUTANT A — credits: revert to bare prisma (pre-fix state)
     × credits-monthly-grant: each ledger row lands in the tenant of its own iteration 42ms
     × credits-monthly-grant: a stale tenant id is refused by the database, not misfiled 18ms
      Tests  2 failed | 4 passed (6)
################ MUTANT B — credits: closure capture, scope hoisted out of the loop
     × credits-monthly-grant: each ledger row lands in the tenant of its own iteration 44ms
      Tests  1 failed | 5 passed (6)
################ MUTANT C — alerts-daily: revert all 3 calls to bare prisma (pre-fix state)
runTenant call sites remaining in mutant: 0
     × alerts-daily: every search advances lastRunAt under its own tenant 17ms
     × alerts-daily: a stale tenant id fails the search rather than touching the other tenant 8ms
      Tests  2 failed | 4 passed (6)
################ MUTANT D — alerts-daily: closure capture on the lastRunAt write
     × alerts-daily: every search advances lastRunAt under its own tenant 21ms
      Tests  1 failed | 5 passed (6)
```

Mutant B ve D tam olarak kartın uyardığı hatayı kodluyor: `tenantId`'yi döngüden dışarı
kaldırıp dış kapsamdaki değerle sarmak. İkisi de yakalanıyor.

**Ara bulgu — testi bir kez sıkılaştırmam gerekti.** İlk halinde "her satır kendi
kiracısına yazıldı" testi Mutant A altında **yeşil kalıyordu**: sarmalayıcı hiç
çağrılmasa bile yereldeki singleton SUPERUSER olduğu için satır doğru `tenantId` ile
yazılıyor ve RLS okumasında doğru görünüyordu. Yani sonuç iddiası tek başına
sarmalayıcının varlığını kanıtlamıyordu — kartın "uygulama `fabrika_app` rolüne geçtiği
gün" dediği tuzağın ta kendisi. Bunun üzerine teste yapısal iddia ekledim: sarmalayıcı
açılan her kapsamın `tenantId`'sini kaydediyor ve test sırayı da doğruluyor
(`[A, B]`, ve alerts için arama başına iki kapsam: `[A, A, B, B]`). Sarmalayıcısız kod
hiç kapsam açamayacağı için artık kaçamıyor — Mutant A'nın iki testi birden düşürmesinin
sebebi bu.

Postgres'in reddi gerçek, uydurma değil — mutant koşumunda job'ın kendi `console.error`'ı:

```
code: 'P2039',
meta: { modelName: 'CreditLedger',
        driverAdapterError: new row violates row-level security policy for table "CreditLedger" }
  at grantCreditsToTenants (src/lib/inngest/jobs/credits-monthly-grant.ts:41:9)
```

### 2.4 Veritabanı yokken ne oluyor — konvansiyona hizalandı

İlk yazdığım halde test, Postgres bulunamazsa **sert düşüyordu**. Bu yanlıştı: depoda
yerleşik konvansiyon (`tests/rls.spec.ts`, kardeş dilimin
`tests/m9-calendar-tenant-scope.live.test.ts`, ve `check-rls-live.ts`'in kendi docstring'i —
"skipped loudly — a missing database is an absent measurement, not a passing one") veritabanı
yoksa **atlamak**. Benim halim, docker-compose ayakta olmayan her makinede `pnpm gate`'i
kırardı — ağacı paylaştığım 5 ajanın hepsinde. `describe.skipIf(!dbReachable)` ile hizaladım.

Atlamanın sahte-yeşile dönüşmediğini koruyan şey: veritabanı **erişilebilirse** ilk test
rolün gerçekten NOBYPASSRLS olduğunu doğruluyor ve değilse sert düşüyor. Yani "ölçüm yok"
ile "ölçüm yapıldı ve geçti" birbirine karışmıyor. Üç davranış da ölçüldü:

```
=== green with DB ===
 Test Files  1 passed (1)
      Tests  6 passed (6)
=== skips without DB ===
 Test Files  1 skipped (1)
      Tests  6 skipped (6)
=== mutant still caught after the skip refactor? (credits -> bare prisma) ===
     × credits-monthly-grant: each ledger row lands in the tenant of its own iteration 36ms
     × credits-monthly-grant: a stale tenant id is refused by the database, not misfiled 16ms
      Tests  2 failed | 4 passed (6)
restored: IDENTICAL
```

### 2.5 Kapı çıktıları (sayıyla)

```
$ pnpm typecheck
$ tsc --noEmit
(0 hata)

$ npx vitest run src/lib/inngest/
 Test Files  3 passed (3)
      Tests  20 passed (20)

$ npx eslint <üç dosya>
eslint: CLEAN   (0 error, 0 warning)

$ pnpm alerts:check
açık SystemAlert satırı            : 34
  tenant'ı SİLİNMİŞ (öksüz)         : 0
✅ Öksüz alarm yok
```

`pnpm typecheck` ilk koşumda `src/modules/m6/server/scoring.ts(135,43): Cannot find name
'hasSubmittedMarks'` veriyordu. Bu benim değil: dosya çalışma ağacında başka bir ajanın
(denet-i, `src/modules/m6/**`) commit edilmemiş düzenlemesiydi, HEAD sürümünde o isim hiç
geçmiyor. Dokunmadım; yukarıdaki temiz çıktı o ajan kendi düzeltmesini yaptıktan sonra alındı.

### 2.6 Ürettiğim doğrulama satırlarının temizliği — ayrı sayımla

Fixture'lar `afterAll`'da siliniyor. Tüm koşumlardan (fixture + 4 mutant koşumu + elle
sondalar) sonra kalıntı sayımı:

```
leftover tenants: 0 | users: 0 | savedSearches: 0 | creditLedger: 0 | grant-probe tenants: 0
```

Mutant koşumları sırasında bozulan iki üretim dosyasının geri yüklendiği de ayrıca doğrulandı:

```
alerts-daily.ts: IDENTICAL
credits-monthly-grant.ts: IDENTICAL
```

---

## 3. Değişen dosyalar

| Dosya | Ne oldu |
|---|---|
| `src/lib/inngest/jobs/alerts-daily.ts` | döngü `sendSavedSearchAlerts`'e çıkarıldı; 3 kiracı-kapsamlı çağrı `withTenant`'a alındı; iki kasıtlı istisna yorumla adlandırıldı |
| `src/lib/inngest/jobs/credits-monthly-grant.ts` | döngü `grantCreditsToTenants`'e çıkarıldı; `creditLedger.create` `withTenant`'a alındı; fan-out yorumla adlandırıldı |
| `src/lib/inngest/jobs/__tests__/cron-tenant-scope.test.ts` | **yeni** — iki kiracılı, RLS rolü üzerinden gerçek koşum + yapısal kapsam iddiaları |

Kapsam dışı hiçbir dosyaya dokunulmadı: `src/modules/m9/**`, `src/app/[locale]/**`,
`src/components/**`, `scripts/`, `prisma/seed*`, `src/modules/m6/**` — hepsi elimden çıkmadı.

---

## 4. Riskler — Dilim 5'in allowlist'i için ÖNEMLİ

**Üç "kasıtlı istisna"nın hepsi aynı sınıftan DEĞİL.** Ölçtüm:

| Konum | Tablo | RLS | `fabrika_app` altında ne olur |
|---|---|---|---|
| `credits-monthly-grant.ts:88` fan-out | Tenant | kapalı | **güvenli** — 21 satır döndü |
| `alerts-daily.ts:179` match count | Topic | kapalı | **güvenli** — 1298 satır sayıldı |
| `alerts-daily.ts:243` fan-out | **SavedSearch** | **AÇIK** | **SESSİZ ARIZA — 0 satır** |

Son satırın ölçümü (veritabanında `notify:true` tek bir gerçek satır varken):

```
SavedSearch rows now in DB (notify:true), counted as SUPERUSER: 1
same fan-out query as fabrika_app, NO app.tenant_id set     : 0
```

Yani `fetch-saved-searches` RLS'li bir tabloda, hiç `app.tenant_id` set edilmemiş bir
bağlantıda fan-out yapıyor. Uygulama `fabrika_app` rolüne geçtiği gün bu sorgu boş döner ve
`alerts-daily` her sabah `success: true, totalSearches: 0` raporlayıp kimseye posta
göndermez — hata da vermez. Kart bu satıra dokunmamamı söyledi ve dokunmadım (zaten
sarmalanarak da düzelmez: o noktada tenant henüz bilinmiyor). Ama **Dilim 5 bunu diğer
ikisiyle aynı kutuya koymamalı**: Tenant/Topic fan-out'ları politikasız tablolarda güvenli,
bu değil. Çözümü ayrı bir karar gerektiriyor (kiracı listesi üzerinden fan-out + kiracı
başına kapsamlı sorgu, ya da bu tabloya `BYPASSRLS` yerine açık bir "global okuma" rolü).

**İkinci, kapsam dışı bulgu:** `src/lib/billing.ts:80` `getEntitlements`, `prisma.tenant.findUnique`
içinde `subscription`'ı `include` ediyor. `Tenant` RLS'siz ama **`Subscription` RLS'li**
(ölçüldü). `fabrika_app` altında bu include sessizce `null` döner, `live=false` olur ve her
kiracı `FALLBACK_PLAN_ID = 'free'` (aylık 10 kredi) plana düşer — ödeyen kiracılar dahil.
`credits-monthly-grant` bunu her ayın 1'inde çağırıyor. Dosya benim dilimimde değil,
dokunmadım; Dilim 5 için not.

**Üçüncü:** `withTenant` yineleme başına bir transaction açıyor. `alerts-daily` için arama
başına 2, `credits` için kiracı başına 1. Bugünkü hacimde (21 kiracı) önemsiz; on binlerce
kiracıda bu bir yeniden değerlendirme konusu olur.

---

## 5. Açık sorular

1. `alerts-daily.ts:243` fan-out'u (§4) kimin dilimi? Sarmalayarak çözülmüyor, ayrı bir
   karar gerekiyor. Dilim 5'e mi, yoksa yeni bir karta mı?
2. `getEntitlements`'ın `Subscription` include'u (§4) — `src/lib/billing.ts` sahibine mi
   devredilsin?
3. ~~Kardeş dilimin imzası~~ — **çözüldü.** TASK-MTVR7W9ZXO7M bu iş biterken commit edildi
   (135f028); okudum. Aynı imzayı kullanmışız: `withTenant(tenantId, async (tx) => …)`,
   `prisma.` → `tx.`. Tek bilinçli fark: dse "okuma+yazmayı tek `withTenant`'ta tut"
   diyor (atomiklik); `alerts-daily`'de sahip okuması ile `lastRunAt` yazması arasında
   **Resend'e giden ağ turu** var, o yüzden orada iki ayrı kapsam kullandım ve gerekçesini
   koda yazdım. İkinci bir stil çıkarılmadı.

---

## Platform beyanı

**Doğrulandı: macOS (darwin 25.6.0, Node 26.5.0, Postgres 5432'de `postgres-vector` konteyneri.)**

Dokunulan kod yolu **platforma bağlı değil**: süreç öldürme, dosya yolu kurgusu, kabuk/ikili
adı, ekran/DPI ya da cihaz izni içermiyor. Değişen şey yalnızca Prisma çağrılarının bir
transaction sarmalayıcısından geçmesi ve `SELECT set_config('app.tenant_id', $1, true)`
çalıştırılması — bunlar Postgres protokolü üzerinde, işletim sisteminden bağımsız.
**Windows ve Linux'ta koşulamadı** (bu oturumda o platformlar mevcut değil); koddan beklenen
davranış aynıdır, çünkü platform-özel tek bağımlılık `DATABASE_URL_RLS_TEST` ile erişilebilir
bir Postgres örneğidir — testin kendisi o değişken yoksa sessizce geçmez, `expect(ready)`
ile yüksek sesle **düşer**.

---

## 6. Sonraki adım

- Dilim 5 allowlist'i yazılırken §4'teki tablo kullanılsın: `alerts-daily.ts:243`
  "kasıtlı istisna" olarak **güvenli** işaretlenmemeli.
- `getEntitlements` bulgusu (§4) bir karta bağlansın.
- `pnpm gate` tam koşumu bu dilimin dışında; ben `typecheck` + `vitest src/lib/inngest/**`
  + `eslint` + `alerts:check` koştum, hepsi yeşil.
