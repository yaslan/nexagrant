# TASK-MUN80XIW5NPV1 — FB GÜVENLİK O-1/O-2/O-4 (cs-fb)

**Durum:** TAMAM · **Dal:** `cs-fb/mun80x-api-hardening` (kod commit `ce35748c`, dev ile birleştirme `6a9804f4`) → dev'e merge edildi, **push yok**.
**Kaynak:** docs/agent-results/TASK-MUN66T2HM4A4E-be-fb.md — O-1, O-2, O-4 ve düzeltme önerileri 5/6/8.
**Platform beyanı:** macOS (Darwin 27, arm64) üzerinde doğrulandı: prod build (`next build`) + `node .next/standalone/server.js` 127.0.0.1:47880, izole Postgres konteyneri `csfb-80x-pg` (pgvector:pg16, 127.0.0.1:55880), gerçek tarayıcı Google Chrome (Playwright `channel: 'chrome'`). Linux/Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Dokunduğum kod platforma bağlı değil: HTTP yanıtları, zod doğrulaması ve Postgres `UPDATE … RETURNING`. Dosya yolu, süreç ya da kabuk kodu yok. Bu yüzden Linux prod imajında da aynı davranış beklenir.

## 1. Ne yapıldı

**O-1 — `/api/cagrilar`** (`src/app/api/cagrilar/route.ts`)
- Oturum zorunlu: `requireTenantApi()` çağrılıyor. Oturumsuz istek 401 alıyor ve SEDIA'ya hiç gidilmiyor. Tek tüketici `(app)/[workspace]/calls/page.tsx` aynı origin'den fetch yapıyor, çerez gidiyor ve sayfa çalışıyor (kanıt §2.4).
- `limit`/`pageSize` en fazla 50'ye kırpılıyor. Sayısal olmayan değer 400 `invalid_limit` döner. Sayfadaki "100" seçeneği kaldırıldı; seçenekler artık 10/20/50. Bu seçenek kalsaydı sunucu 50 döndürürken sayfa 100'e göre sayfa sayısı hesaplardı.
- Her istekte `Topic` tablosuna yazan arka plan upsert'ü **silindi**. Route artık `@/lib/db` import etmiyor. Topic'i gece işi yazıyor: `src/lib/jobs/tasks/k1-daily-calls.ts:254/257` (`topic.update`/`topic.create`), zamanlama `src/lib/jobs/schedule.ts:52` `cron: '0 2 * * *'`.
- Çeviri sınırları (`src/lib/translation.ts`): süreç genelinde en fazla **8** eşzamanlı dış çeviri çağrısı çalışıyor (`withTranslationSlot` semaforu). Önbellek en fazla **5.000** kayıt tutuyor; dolunca en eski kayıt çıkıyor. Eskiden her başlık ve açıklama aynı anda ayrı bir çağrı atıyordu ve önbellek sınırsız büyüyordu.

**O-2 — 500 gövdeleri ve CORDIS doğrulaması**
- Ham `errorMessage(error)` yerine sabit `{ error: 'internal_error' }` dönüyor; ayrıntı yalnız sunucu log'una (`logger.error`) yazılıyor. Kapsanan uçlar: `cagrilar`, `cordis/organizations`, `cordis/organizations/[id]`, `cordis/projects`, `billing/quote`, `billing/checkout`, `admin/cordis/import`. `admin/documents/upload` artık `message` taşımıyor, yalnız `upload_failed` kodu dönüyor.
- `src/lib/k2-cordis/api-query.ts`: CORDIS parametreleri zod ile doğrulanıyor. `page`/`limit`/`min_projects`/`year_from`/`year_to` yalnız rakam olabilir ve yıl 1900–2100 aralığında olmalı; `organisationId` `^\d{1,20}$` desenine uymalı (izole DB'deki 53/53 satır uyuyor). Bozuk girdi sorgudan önce 400 `invalid_query`/`invalid_id` alır. `limit` için eski kırpma (1–100) korundu, böylece mevcut çağıranlar kırılmaz.
- Kaynak bekçisi `tests/api/api-error-body-guard.test.ts`: bir route dosyasında `error:`/`message:` alanına `errorMessage(` yazılırsa test kırmızıya döner.

**O-4 — API anahtarı hız sınırı** (`src/lib/api-auth.ts`)
- `authenticateApiKey` her `/api/v1` isteğini anahtar başına sabit 1 dakikalık pencerede sayıyor. Sayma tek bir `UPDATE "ApiKey" … RETURNING` ile yapılıyor, böylece eşzamanlı istekler satır kilidinde sıraya giriyor. Bu UPDATE `withTenant(keyRecord.tenantId)` altında çalışıyor, yani RLS geçerli. Sınır aşılınca 429 döner; yanıtta `Retry-After`, `X-RateLimit-Limit: 1000` ve `X-RateLimit-Remaining: 0` başlıkları var.
- Sınır tek bir sabitte duruyor: `src/lib/api-rate-limit.ts` `API_KEY_RATE_LIMIT_PER_MINUTE = 1000`. Hem sunucu hem API anahtarları ekranı (`settings/api-keys/client.tsx`) bu sabiti okuyor, böylece ekrandaki vaat ile uygulanan sınır birbirinden ayrılamaz. UI vaadini kaldırmak yerine sınırı uyguladım (kartın tercihi buydu).
- `lastUsedAt` yazımı aynı UPDATE'e alındı. Sayaç yazılamazsa istek **kapalı düşer** (500 `AUTH_INTERNAL_ERROR`). Anahtar arama adımının hata davranışıyla aynı; sayılamayan bir anahtar sınırsız olurdu.
- Şema ve migration: `ApiKey.rateWindowStartedAt DateTime?` ve `rateWindowCount Int @default(0)` eklendi. `prisma/migrations/add-api-key-rate-window.sql` (+ `.down.sql`) idempotent; `apply-order.txt`'e eklendi; `docs/DATA_MODEL.md` güncellendi.

## 2. Kanıt

### 2.1 O-1 canlı (prod build, izole DB, **gerçek SEDIA** — mock yok; `lang=en` ile çeviri servisi atlandı)
```
--- Topic ÖNCE
 upd10 |         maxupd          | total
     0 | 2026-09-29 21:48:01.866 |  1301
--- oturumsuz  GET /api/cagrilar?limit=1000&lang=en
{"error":"Unauthorized","message":"Oturumunuz bir çalışma alanına bağlı değil. Lütfen tekrar giriş yapın.","code":"TENANT_SCOPE_REQUIRED"}
HTTP 401
--- oturumlu limit=1000
HTTP 200
success True pageSize 50 topics 250 totalResults 1020
--- oturumlu limit=zz
{"success":false,"error":"invalid_limit"}
HTTP 400
--- Topic SONRA
 upd10 |         maxupd          | total
     0 | 2026-09-29 21:48:01.866 |  1301
```
Tarayıcı ziyaretinden sonra ek SQL: `upd_1h = 0`, `max(updatedAt) = 2026-09-29 21:48:01.866`, `total = 1301`. Oturumlu istekler ve sayfa ziyareti Topic'e **hiç yazmadı**.
Oturum çerezi `next-auth/jwt encode` ile basıldı (salt `authjs.session-token`, `demo-user-alice` / `demo-tenant`). Anahtar `.env`'den okundu ve hiçbir yere yazdırılmadı.

### 2.2 O-2 canlı (oturumsuz)
```
GET /api/cordis/organizations/%00              → {"success":false,"error":"invalid_id"}    HTTP 400
GET /api/cordis/projects?year_from=abc&limit=zz → {"success":false,"error":"invalid_query"} HTTP 400
GET /api/cordis/organizations?limit=zz          → {"success":false,"error":"invalid_query"} HTTP 400
GET /api/cordis/projects?limit=2                → {"success":true,"meta":{"total":32,...}}  HTTP 200
GET /api/cordis/projects?q=%00      → {"success":false,"error":"internal_error"}  HTTP 500   ← gerçek Postgres hatası
GET /api/cordis/organizations?q=%00 → {"success":false,"error":"internal_error"}  HTTP 500
sunucu log (ayrıntı yalnız burada):
[ERROR] [API /api/cordis/projects] query failed Error [PrismaClientKnownRequestError]:
Invalid `prisma.cordisProject.count()` invocation:
Database error. Code: `22021`. Message: `invalid byte sequence for encoding "UTF8": 0x00`
```
Tarama raporundaki iki sızdıran istek (`%00` id ve `limit=zz`) artık sorgu çalışmadan 400 alıyor. Gerçek bir 500 tetiklendiğinde de gövdede Prisma metni yok.

### 2.3 O-4 canlı (`/api/v1/calls`, gerçek ApiKey satırı)
Sayaç 998'e ayarlanmış anahtar:
```
istek 1 → HTTP 200   (999.)
istek 2 → HTTP 200   (1000.)
istek 3 → HTTP 429   (1001.)
retry-after: 60
x-ratelimit-limit: 1000
x-ratelimit-remaining: 0
{"error":"Too Many Requests","message":"Rate limit of 1000 requests per minute exceeded for this API key.","code":"RATE_LIMITED"}
```
Sayaç ayarı yapılmamış, yeni bir anahtarla 1.005 gerçek istek (16 paralel):
```
1000 200
   5 429
rateWindowCount = 1005
```
RLS kontrolü (`fabrika_app`, psql): anahtarın kendi kiracısıyla UPDATE 1 satır etkiledi, başka bir `app.tenant_id` ile 0 satır.

### 2.4 Gerçek tarayıcı — calls sayfası
Kare: `docs/agent-results/TASK-MUN80XIW5NPV1-cs-fb-ekler/calls-page-signed-in.png`
```
url http://127.0.0.1:47880/tr/main/calls
cagrilar ["200 ?status=OPEN%2CFORTHCOMING&type=1&lang=tr&page=1&limit=20"]
select options ["10","20","50"]
rows 95        (HORIZON- metni geçen satır sayısı; ekranda "Toplam 1020 çağrı bulundu")
```
Not: Karedeki üst çubukta "Giriş / Kayıt Ol" düğmesi görünüyor, ama `/api/cagrilar` oturumla 200 döndü ve liste doldu. Bu başlık bileşeninin davranışı; bu kartın kapsamında değil ve dokunmadım.

### 2.5 Mutant tablosu (her düzeltme tek tek geri alındı → ilgili test kırmızı; geri konunca yeşil)
| Mutant | Geri alınmış hâl | Geri konunca |
|---|---|---|
| M1 cagrilar: oturum kontrolü silindi | KIRMIZI 1 failed / 4 passed | yeşil 5/5 |
| M2 cagrilar: limit kırpma silindi | KIRMIZI 1/4 | yeşil 5/5 |
| M3 cagrilar: Topic upsert geri eklendi | KIRMIZI 1/4 | yeşil 5/5 |
| M4 cagrilar: ham hata gövdesi | KIRMIZI 1/4 | yeşil 5/5 |
| M5 çeviri: eşzamanlılık kilidi yok | KIRMIZI 1/1 | yeşil 2/2 |
| M6 çeviri: önbellek sınırsız | KIRMIZI 1/1 | yeşil 2/2 |
| M7 cordis/projects: zod atlandı | KIRMIZI 4/7 | yeşil 11/11 |
| M8 cordis/[id]: id kontrolü atlandı | KIRMIZI 1/10 | yeşil 11/11 |
| M9 cordis/projects: ham Prisma gövdesi | KIRMIZI 1/10 | yeşil 11/11 |
| M10 billing/quote: errorMessage gövdesi | KIRMIZI 1/1 (kaynak bekçisi) | yeşil 2/2 |
| M11 api-auth: 429 kontrolü silindi | KIRMIZI 3/6 (birim + canlı) | yeşil 9/9 |
| M12 api-auth: pencere hiç sıfırlanmıyor | KIRMIZI 1/3 (canlı) | yeşil 4/4 |

Ham çıktı `…-ekler/mutants-out.txt`, betik `…-ekler/mutants.py`. Betik bitince `git status` temizdi, `.bak` dosyası kalmadı.

### 2.6 Kapılar (dev ile birleştirilmiş dal `6a9804f4` üzerinde)
```
tsc exit=0 · lint exit=0 · i18n ✅ exit=0 · build exit=0
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass (0 owed)
pnpm rls:check        → ✅ SUCCESS (CHECK 4b dahil)
npx vitest run        → Test Files 263 passed | 6 skipped (269) · Tests 3120 passed | 73 skipped (3193) · 0 failed
```
where-guard, teardown-where-guard, server-action-rbac-guard ve secret-model-select-guard bekçileri bu tam koşunun içinde yeşil. Hiçbir bekçiyi gevşetmedim.

Tam koşu ilk denemede yeşil değildi; açıkça yazıyorum. Birleştirmeden önceki koşu 47, birleştirilmiş dalın ilk koşusu 44 hata verdi. Kök neden ortamdı: paylaşılan DB'de `m4-stale-reminder-idempotency.sql` migration'ı hiç uygulanmamış, bu yüzden kopyamda da yoktu (`The column Membership.staleDigestOn` ×51, `Relationship.staleRemindedContactAt` ×3). Bu migration başka bir kartın işi. Aynı dosyalar **değiştirilmemiş dev** (`701706ef`) üzerinde de aynı DB'ye karşı birebir aynı testlerde kırmızıydı (`…-ekler/baseline-dev-failures.txt`, `branch-failures-pre-merge.txt`). Migration'ı **yalnız kendi izole kopyama** uyguladım. Ardından kırmızı 12 dosya 159/159 yeşil oldu, sonra da yukarıdaki tam koşu 0 hatayla geçti. `rag-pdf-real-parse` testindeki "well under a second" hatası yük altında oluşan bir zamanlama kırılganlığı (4.586 ms < 3.000 beklentisi); tek başına iki kez 19/19 geçti.

### 2.7 İzolasyon
Bütün yazmalar kendi konteynerime (`csfb-80x-pg`, :55880) gitti. Kopya `pg_dump` ile paylaşılan `fabrika-postgres` (:5433) üzerinden alındı; orada **salt okuma** yaptım, oraya hiçbir istek ya da yazma yapılmadı. Ana checkout'ta hiçbir dosyayı değiştirmedim.

## 3. Değişen dosyalar
- `src/app/api/cagrilar/route.ts`, `src/lib/translation.ts`, `src/app/[locale]/(app)/[workspace]/calls/page.tsx` (yalnız "100" seçeneği)
- `src/app/api/cordis/organizations/route.ts`, `…/organizations/[id]/route.ts`, `…/projects/route.ts`, yeni `src/lib/k2-cordis/api-query.ts`
- `src/app/api/billing/quote/route.ts`, `src/app/api/billing/checkout/route.ts`, `src/app/api/admin/cordis/import/route.ts`, `src/app/api/admin/documents/upload/route.ts`
- `src/lib/api-auth.ts`, yeni `src/lib/api-rate-limit.ts`, `src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx`
- `prisma/schema.prisma`, yeni `prisma/migrations/add-api-key-rate-window.sql` + `.down.sql`, `prisma/migrations/apply-order.txt`, `docs/DATA_MODEL.md`
- Testler (yeni): `tests/api/cagrilar-hardening.test.ts`, `tests/api/cordis-public-hardening.test.ts`, `tests/api/api-error-body-guard.test.ts`, `tests/api/api-key-rate-limit.test.ts`, `tests/api-key-rate-limit.live.test.ts`, `tests/translation-bounds.test.ts`
- Testler (değişen): `tests/api/v1-{calls,opportunities,partners}.test.ts`. Sahte DB'ye yalnız `$queryRaw` eklendi, çünkü sayaç UPDATE'i artık kimlik doğrulamanın parçası. Hiçbir assertion değişmedi.
- `/[locale]/calls/[region]` sayfasına dokunulmadı (TASK-MUNRB2037NA5V).

## 4. Riskler
- **DEPLOY SIRASI (önemli):** `add-api-key-rate-window.sql` uygulanmadan bu kod bir DB'ye bağlanırsa iki şey olur. Her `/api/v1` isteği kapalı düşer (500 `AUTH_INTERNAL_ERROR`), ve `ApiKey`'i tüm sütunlarıyla okuyan her sorgu `ColumnNotFound` verir (API anahtarları ekranı dahil). Paylaşılan dev DB'sine (:5433) kart kuralı gereği **yazmadım**, yani orada da henüz uygulanmadı. Kod çekilmeden önce: `DATABASE_URL=… scripts/apply-migrations.sh` (ya da yalnız bu dosya; idempotent).
- Sabit pencere, pencere sınırında bir istemcinin en fazla 2×1.000 istek yapmasına izin verir. İki sütunla tutulan bir sayacın bilinen bedeli bu; kodda yorum olarak yazılı.
- Her `/api/v1` isteği artık `ApiKey` satırında senkron bir UPDATE yapıyor; eskiden fire-and-forget idi. Aynı anahtarla yoğun paralel istekler bu satır kilidinde sıraya girer. Ölçüm: 1.005 istek, 16 paralel, toplam 34,5 s (yerel prod build, sunucu tarafı dahil).
- Çeviri kuyruğu: soğuk önbellekte 250 başlığın çevirisi 8'li kuyrukla eskisinden yavaş olabilir. Buna karşılık dış servise giden istek patlaması sınırlandı. Sıcak önbellekte fark yok.
- Canlıda (prod) `authenticateApiKey`'in `withTenant` altında `fabrika_app` rolüyle çalıştığını psql ile doğruladım; uygulama seviyesinde `fabrika_app` URL'siyle uçtan uca koşu yapmadım.

## 5. Açık sorular
- Paylaşılan dev DB'sinde `m4-stale-reminder-idempotency.sql` uygulanmamış (§2.6). O kartın sahibi ya da devop uygulamalı; aksi hâlde paylaşılan DB'ye karşı koşan herkes 44 testi kırmızı görür. Bu karttan bağımsız.
- `/api/cordis/*` hâlâ kimliksiz (tarama raporundaki ürün sorusu: ücretli özellik verisi kimliksiz açık kalsın mı?). Kart yalnız hata sızıntısı ve doğrulama istediği için bu uçlara oturum eklemedim.
- `/api/cagrilar` `?page` parametresini hâlâ uygulamıyor (5 sayfanın tamamı tek yanıtta dönüyor, sayfalama düğmeleri aynı veriyi getiriyor). Bu önceden var olan bir durum ve kapsam dışı; ayrı bir kart önerilir.

## 6. Sonraki adım
1. Kod dev'den çekilmeden **önce** `add-api-key-rate-window.sql`'i paylaşılan dev DB'sine ve staging/prod'a uygulamak (devop / patron onayıyla).
2. Push, ekip pratiğine göre lider tarafından yapılacak; ben push yapmadım.
3. İsteğe bağlı: `m4-stale-reminder-idempotency.sql`'in paylaşılan DB'ye uygulanması için ilgili karta not düşülmesi.
