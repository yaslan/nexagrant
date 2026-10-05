# TASK-MUNUT0ET27K2B — FB İNCELEME-70 (be-fb): API sertleştirme O-1/O-2/O-4

**Durum:** TAMAM
**İncelenen:** TASK-MUN80XIW5NPV1 (cs-fb). Kod `ce35748c`, dev ile birleştirme `6a9804f4`, incelenen dev HEAD `cdb85b2c`.
**Bulgu kaynağı:** docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md (O-1, O-2, O-4)

## Karar: ONAY (koşullu)

O-1 ve O-4 kapandı. İkisini de canlıda saldırgan gözüyle zorladım ve kıramadım. O-2'nin kartta sayılan uçları temiz. Ancak aynı sınıftan **3 kaçak daha** buldum. Bunlar kartın listesinde yoktu, ve yeni kaynak bekçisi bu kalıbı göremiyor (**Y-1**). Hepsi kimlikli ya da ayrıcalıklı çağıranlara açık; kimliksiz bir sızıntı kalmadı. Bu yüzden dev'de kalmasına engel görmüyorum. Y-1 için ayrı bir takip kartı öneriyorum.

**Koşul (operasyonel):** `add-api-key-rate-window.sql` paylaşılan dev DB'sinde (:5433) **hâlâ uygulanmamış** (salt okuma sorgusu: 0/2 sütun). Bu migration uygulanmadan dev koduyla çalışan herkeste `/api/v1` 500 veriyor; kanıt §2.6'da. Migration uygulanmadan bu kod başka bir ortama çıkmamalı.

| # | Önem | Bulgu |
|---|---|---|
| Y-1 | DÜŞÜK | O-2 eksik kaldı: `billing/portal` 500 gövdesi ham hata metni dönüyor (canlıda kanıtlandı). `webhooks/stripe:105` ve `admin/cordis/import:28` da aynı durumda. Bekçi `err.message` kalıbını görmüyor (mutant MB13 yaşadı). |
| D-1 | DÜŞÜK | Testte açık: `/api/cagrilar` alt sınırı (`Math.max(1, …)`) hiçbir testle korunmuyor (MB8 yaşadı). Canlı davranış doğru. |
| D-2 | DÜŞÜK | Testte açık: çeviri önbelleğinin "önce en eskiyi at" sırası test edilmiyor (MB11 yaşadı). Boyut sınırı korunuyor. |
| D-3 | DÜŞÜK (kalan risk) | Oturumlu `/api/cagrilar` için kullanıcı başına hız sınırı yok. Tek bir `limit=50&lang=tr` isteği 5 SEDIA çağrısı ve 500'e kadar çeviri çağrısı yapıyor; ölçülen süre 13,7 sn. Bu kartın kapsamı dışında. |

## 1. Ne yapıldı

- Ayrı bir worktree açtım (`cdb85b2c`, detached). İzole Postgres'i kendi konteynerimde kurdum (`befb70-pg`, 127.0.0.1:55970). Paylaşılan `fabrika-postgres`'ten (:5433) **yalnız** `pg_dump` ve iki `information_schema` okuması yaptım. Oraya hiçbir HTTP isteği ya da yazma gitmedi; oturumsuz `/api/cagrilar` denemesi de dahil. Worktree'nin `.env` dosyasında :5433 geçen satır kalmadı (`grep -c 5433` → 0).
- 39 migration'ın hepsini `apply-order.txt` sırasıyla kendi DB'me uyguladım (ok=39, bad=0). Yeni migration'ı ayrıca iki kez koştum ve geri alma dosyasını denedim (§2.1).
- Prod build aldım (`next build` exit 0). `node .next/standalone/server.js` ile 127.0.0.1:47970'te koştum; `DEMO_LOGIN_ENABLED=false` (prod koruması başka türlü sunucuyu açtırmıyor). Oturum çerezlerini `next-auth/jwt encode` ile ürettim: `demo-user-alice` (PIPELINE_MANAGER) ve `demo-user-superadmin` (TENANT_OWNER). Sır hiçbir yere yazdırılmadı.
- Canlı denemeler: O-1 (§2.2), O-2 (§2.3), O-4 (§2.4). Gerçek Chrome ile iki ekran gezdim: calls sayfası ve API anahtarları ekranı (§2.5). Kendi 14 mutantımı koştum (§2.7). Tam kapıları geçirdim (§2.8).
- Kod DEĞİŞTİRMEDİM. Commit'lediğim tek şey bu rapor ve ekleri.

## 2. Kanıt

### 2.1 Migration: idempotent ve geri alınabilir
```
== run 1  → BEGIN / ALTER TABLE / ALTER TABLE / COMMIT                 exit=0
== run 2  → NOTICE: column "rateWindowStartedAt" … already exists, skipping
            NOTICE: column "rateWindowCount" … already exists, skipping   exit=0
rateWindowCount integer 0 · rateWindowStartedAt timestamp without time zone
down ×2 → exit=0 (ikincisinde "does not exist, skipping") · up → exit=0
```

### 2.2 O-1 `/api/cagrilar` (prod build, gerçek SEDIA, `lang=en`)
```
--- Topic ÖNCE   upd_1h|max(updatedAt)|count|md5(id||updatedAt)
0|2026-09-29 21:48:01.866|1301|d9f57d6acae7b71915cc030631453271
--- oturumsuz
GET ?limit=1000&lang=en -> 401     GET ?limit=NaN -> 401     GET ? -> 401
sahte çerez -> 401                 Bearer çöp -> 401         POST -> 405
--- oturumlu
limit=1000     -> 200 pageSize 50 topics 250     pageSize=1000 -> 200 pageSize 50
limit=-5       -> 200 pageSize 1                 limit=0       -> 200 pageSize 1
limit=NaN/abc/Infinity/%20 -> 400 invalid_limit
limit=1e3      -> 200 pageSize 1   (parseInt "1" okur; zararsız)
limit=20abc    -> 200 pageSize 20  (parseInt esnekliği; zararsız)
limit=99999999999999999999999 -> 200 pageSize 50
--- Topic SONRA
0|2026-09-29 21:48:01.866|1301|d9f57d6acae7b71915cc030631453271   ← parmak izi aynı
```
Tarayıcı oturumundan sonra ölçtüm. `updatedAt` değeri 2026-09-29 22:00 ile vitest'in başladığı 09:04:06 UTC arasında olan satır sayısı **0**. Vitest kendi test satırını açıp teardown'da sildi; sayı yine 1301.

Gözlem (önceden var, bu değişiklikten değil): İlk `limit=1000` çağrısında SEDIA sayfa 1'de `TypeError: terminated` verdi. Route buna rağmen `200 success:true totalResults:0` döndü. Yani dış servis arızası kullanıcıya "0 sonuç" olarak görünüyor. İki tekrarda sonuç normaldi (1021 kayıt, 250 başlık).

### 2.3 O-2: CORDIS zod ve 500 gövdeleri (oturumsuz)
```
400 organizations/%00 | /abc | /-1 | /1.5 | /123456789012345678901  → invalid_id
404 organizations/999999999
400 projects?year_from=abc | year_from=1899 | year_to=2101 | limit=zz | limit=-1 | limit=1e3
400 projects?page=%EF%BC%91 (tam genişlik "1") | limit=%D9%A1 (Arapça rakam)  → invalid_query
200 projects?limit=100000 → limit 100 · page=0 → page 1 · page=999999999&limit=100 → 200 (boş sayfa, taşma yok)
400 organizations?limit=zz | min_projects=-1 · 200 organizations?page=999999999&limit=100
500 projects?q|country|topic|framework|role=%00  → {"success":false,"error":"internal_error"}
500 organizations?q|country=%00                   → {"success":false,"error":"internal_error"}
/api/v1/partners/%00 → 500 {"code":"PARTNER_QUERY_FAILED"} · /api/v1/partners?q=%00 → 500 {"code":"PARTNERS_QUERY_FAILED"}
```
Serbest metin alanındaki NUL karakteri hâlâ 500 üretiyor, ama gövde sabit. Kimliksiz bir çağıran bununla yalnız hata log'u üretebilir (DÜŞÜK).

**Y-1 — kaçak kalan 500 gövdeleri.** Kaynak taraması: `grep -rn 'err\.message|String(err' src/app/api`.

| Yer | Kim ulaşır | Gövde |
|---|---|---|
| `src/app/api/billing/portal/route.ts:59` | TENANT_OWNER (`manage_billing`) | `{ error: err.message }` |
| `src/app/api/webhooks/stripe/route.ts:105` | yalnız imzası doğrulanmış Stripe çağrısı | `` `Error processing webhook: ${err.message}` `` (500, düz metin) |
| `src/app/api/admin/cordis/import/route.ts:28` | platform admin | `importRes.error` = importer'ın `errorMessage(error)` değeri (`importer.ts:669/701`) |

Canlı kanıt (TENANT_OWNER oturumu):
```
POST /api/billing/portal
{"error":"No Stripe customer found for tenant demo-tenant. Please complete subscription setup first."}
HTTP 500
```
cs-fb raporu `admin/cordis/import`'u "kapsandı" diye sayıyor. Oysa yalnız `catch` dalı düzeltilmiş; `!importRes.success` dalı ham metni hâlâ dönüyor. Bekçi (`tests/api/api-error-body-guard.test.ts`) yalnız `error:/message: errorMessage(` kalıbını arıyor. MB13 bunu gösteriyor: `billing/quote` gövdesine `(error as Error).message` yazdım ve ilgili testlerin hepsi yeşil kaldı.
Öneri: Bekçiye `\.message\b` ve `String\((e|err|error)\)` kalıplarını da ekleyin; 500 bağlamıyla sınırlayın. Üç yeri sabit koda çevirin. Stripe webhook için gövdede sabit metin yeterli, çünkü ayrıntı zaten log'a yazılıyor.

### 2.4 O-4: `/api/v1` hız sınırı (izole DB'de 4 test anahtarı: A, B, D `demo-tenant`; C başka kiracı)
```
== T1 sınır (A sayacı 998)
HTTP 200 · HTTP 200 · HTTP 429 retry-after: 60 x-ratelimit-limit: 1000 x-ratelimit-remaining: 0
{"error":"Too Many Requests","message":"Rate limit of 1000 requests per minute exceeded for this API key.","code":"RATE_LIMITED"}
== T2 izolasyon: A tükenmişken   B (aynı kiracı) -> 200 · C (başka kiracı) -> 200 · A -> 429
== T3 pencere sıfırlanması (A=5000, pencere 61 sn önce) → A -> 200, sayaç 1
== T3b pencere sonu (59,5 sn önce, sayaç 1000) → 429 retry-after: 1
bilinmeyen anahtar -> 401 (sayılmıyor)
== Yarış 1: sayaç 900, 300 istek, 100 paralel → 100×200, 200×429 (6 sn), sayaç 1200
== Yarış 2: sayaç NULL, 1100 istek, 128 paralel → 1000×200, 100×429 (18 sn), sayaç 1100
```
Her iki yarışta da bütçe **tam** kullanıldı: fazla ya da eksik tek istek bile geçmedi. Satır kilidi serileştirmesi çalışıyor.

**Saat dilimi saldırısı (sonuç negatif, yani iyi):** Ham SQL'e verilen `Date` parametresi, DB oturumu UTC değilken kayabilir mi diye denedim. `ALTER DATABASE … SET timezone='Europe/Istanbul'` yaptım, sunucuyu yeniden başlattım ve oturumun `Europe/Istanbul` olduğunu `pg_settings` ile doğruladım. Sonuç:
```
rateWindowStartedAt 2026-09-30 08:59:51.228 · lastUsedAt 08:59:51.406 · UTC now 08:59:51.568  (kayma yok)
sayaç 1000 → 429 retry-after: 59
```
Prisma 7 `adapter-pg`, tarihi saat dilimi olmayan UTC olarak bağlıyor. Retry-After ve pencere doğru kaldı. Test bitince DB saat dilimini sıfırladım.

**RLS (`fabrika_app`, psql):** `app.tenant_id=demo-tenant` iken başka kiracının anahtarında UPDATE **0** satır etkiledi, kendi kiracısındakinde 1 satır. Politikalar: `tenant_isolation` ve `system_scope`.

### 2.5 Gerçek tarayıcı (Google Chrome, Playwright `channel: 'chrome'`)
```
oturumlu  url /tr/main/calls · options ["10","20","50"]
          <select> 50 seçildi → /api/cagrilar …limit=50 yanıtı 200, 13661 ms, pageSize 50
          cagrilar ["200 20","200 50"] · HORIZON- satırı 231
oturumsuz url → /tr/giris (yönlendirme), /api/cagrilar isteği yok
api-keys  /tr/main/settings/api-keys HTTP 200 · "1,000 istek / dk" · C anahtarı (başka kiracı) listede YOK
```
Kareler: `docs/agent-results/TASK-MUNUT0ET27K2B-be-fb-ekler/calls-oturumlu-20.png`, `calls-oturumlu.png`, `calls-oturumsuz.png`, `api-keys-screen.png`

### 2.6 Deploy sırası: migration yokken ne oluyor (kendi DB'mde canlı)
```
paylaşılan :5433 (salt okuma) → ApiKey.rateWindow* sütunu: 0/2 · Membership.staleDigestOn: 0/1
kendi DB'mde .down.sql → /api/v1/calls → 500 {"code":"AUTH_INTERNAL_ERROR"}
   server log: The column `ApiKey.rateWindowStartedAt` does not exist in the current database.
   api-keys ekranı → HTTP 200 (sayfa içeriğini ayrıca incelemedim)
migration geri uygulandı → /api/v1/calls 200
```
Kapalı düşme (fail-closed) doğru çalışıyor. Ama migration uygulanmadıkça tüm API anahtarı müşterileri kesiliyor.

### 2.7 Kendi mutantlarım (14 mutant; 11 öldü, 3 yaşadı)
| Mutant | Sonuç |
|---|---|
| MB1 `>` → `>=` (1000. istek reddediliyor) | KIRMIZI 3 test |
| MB2 `IS NULL` dalı silindi (ilk pencere hiç başlamıyor) | KIRMIZI 1 |
| MB3 Retry-After hep 60 | KIRMIZI 2 |
| MB4 `lastUsedAt` yazılmıyor | KIRMIZI 1 |
| MB5 pencere 10 dk | KIRMIZI 3 |
| MB6 sayaç UPDATE'i `withSystemScope` altında (RLS atlanıyor) | KIRMIZI 3 |
| MB7 cagrilar üst sınırı 50 → 100 | KIRMIZI 1 |
| **MB8** cagrilar alt sınırı yok (negatif pageSize SEDIA'ya gidiyor) | **YEŞİL, yaşadı → D-1** |
| MB9 cordis limit ≤100 kırpması yok | KIRMIZI 1 |
| MB10 cordis yıl aralığı kontrolü yok | KIRMIZI 1 |
| **MB11** önbellek en yeni kaydı atıyor | **YEŞİL, yaşadı → D-2** |
| MB12 semafor: slot devredilse de sayaç düşüyor | KIRMIZI 1 |
| **MB13** billing/quote 500 = `(error as Error).message` | **YEŞİL, yaşadı → Y-1 (bekçi kör)** |
| MB14 cagrilar 500 = `String(error)` | KIRMIZI 1. Bunu davranış testi yakaladı; bekçi yeşil kaldı |

Ham çıktı: `…-ekler/mutants-out.txt`, betik: `…-ekler/mutants.py`. Betik her mutantı geri aldı; bitişte `git status` (izlenmeyenler hariç) boş: `[]`.

### 2.8 Kapılar (`cdb85b2c`, izole DB)
```
tsc exit=0 · eslint exit=0 · i18n:check exit=0 ✅ · next build exit=0
rls:bypass-check → ✅ SUCCESS: no new tenant bypass … 37 on the sanctioned cross-tenant path, 0 still owed
npx vitest run → Test Files 263 passed | 6 skipped (269) · Tests 3120 passed | 73 skipped (3193) · exit=0
```
(`…-ekler/vitest-full-ozet.txt`) Sayılar cs-fb'nin raporuyla birebir aynı. Tam koşu ilk denemede yeşil geçti. Bunun sebebi `m4-stale-reminder-idempotency.sql`'i de kendi DB'me uygulamış olmamdı (39/39).

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUNUT0ET27K2B-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNUT0ET27K2B-be-fb-ekler/` (4 kare, mutants.py, mutants-out.txt, vitest-full-ozet.txt)
- Kaynak kodda değişiklik yok.

## 4. Riskler
- **Deploy sırası (§2.6):** Paylaşılan dev DB'sinde `add-api-key-rate-window.sql` ve `m4-stale-reminder-idempotency.sql` yok. Dev'i :5433'e karşı çalıştıran herkes `/api/v1`'de 500 alır ve 44 civarı test kırmızıya döner. Staging ve prod için aynı sıra geçerli: önce migration, sonra kod.
- Y-1 kaçakları kimlikli ya da ayrıcalıklı çağıranlara açık. Stripe hata metinleri müşteri kimliği gibi ayrıntılar taşıyabilir.
- Sabit pencere, pencere sınırında 2×1000 isteğe izin veriyor. Bu bilinen bir tasarım bedeli ve kodda yorum olarak yazılı.
- D-3: `/api/cagrilar` oturumlu kullanıcı için hâlâ pahalı ve sınırsız sayıda paralel çağrılabilir. Çeviri kuyruğu süreç genelinde 8 ile sınırlı, bu yüzden bir kullanıcının yükü diğerlerini yavaşlatır.

## 5. Açık sorular
- Y-1 için ayrı kart açılsın mı? Önerim evet: cs-fb'ye verilsin, kapsamı 3 yer ve bekçi kalıbının genişletilmesi olsun.
- `/api/cagrilar` SEDIA arızasında 200 ve "0 sonuç" dönüyor (§2.2 gözlem). 502 ya da `degraded` bayrağı istenir mi? Bu bir ürün kararı.
- Paylaşılan DB'ye iki migration'ı kim uygulayacak (devop ya da patron onayı)?

## 6. Sonraki adım
1. Migration'ları paylaşılan DB'ye uygulamak (onayla; ben :5433'e yazmadım).
2. Y-1 takip kartı; D-1 ve D-2 için iki küçük test eklemesi (aynı karta eklenebilir).
3. Push yok; lider karar verir.

**Platform beyanı:** Doğrulamayı macOS'ta yaptım (Darwin 27, arm64): prod standalone build, izole `pgvector/pgvector:pg16` konteyneri, Google Chrome. Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. İncelenen kod platforma bağlı değil: HTTP yanıtları, zod, Postgres `UPDATE … RETURNING`, bellek içi semafor ve önbellek. Kodda dosya yolu, süreç ya da kabuk çağrısı yok, bu yüzden Linux prod imajında da aynı davranış beklenir. Saat dilimine bağımlılığı ayrıca denedim (§2.4) ve bağımlılık yok.
