# TASK-MUNZ6BRKW1UO4 — FB İNCELEME-79 (cs-fb)

**Durum:** TAMAM
**İncelenen:** TASK-MUNY0O53ITDU4 (be-fb), dev merge `e317f285`: `internalError()` + pozitif 5xx bekçisi, 6 GDPR ucunda sabit kod, Stripe 503/400, `/api/cagrilar` için kullanıcı başına 30/dk sınırı.
**Ortam:** Ayrı worktree (detached `e317f285`, kendi `pnpm install`). İzole Postgres `csfb79-pg` (127.0.0.1:5479). Paylaşılan `fabrika-postgres` (:5433) yalnız bir kez `pg_dump` ile okundu. Worktree `.env`'inde `grep -c 5433` → 0. **Kod değiştirilmedi.** Mutantların hepsi geri alındı, `git status src tests` temiz.

## Karar

**ONAY: merge `dev`'de kalabilir.** Kartın vaat ettiği her şey canlıda tuttu:
- GDPR: 6/6 uçta sabit kod döndü, başarılı yollar sağlam.
- Stripe: 503/400 cevaplarında yapılandırma ayrıntısı yok; claim geri alınıyor, bu yüzden yeniden teslim işlenebilir.
- Cagrilar: 40 eşzamanlı istekten tam 30'u 200, 10'u 429 döndü; `Retry-After` var; kullanıcılar birbirinden yalıtılmış.
- Gerçek ağaçta bekçi yanlış pozitif vermiyor, maskelenen/okunamayan çağrı yok, doğrudan kurulan 5xx yok.

Aşağıdaki açıkların **hiçbiri bugün üretim kodunda yok**. Hepsi bekçinin ya da testlerin kör noktası; ileride yazılacak kodun kaçabileceği yolları gösteriyor. Yüksek önemde bulgu yok. Takip kartı önerisi §6'da.

| # | Önem | Bulgu | Kanıt |
|---|---|---|---|
| O-1 | ORTA | Bekçi `status` adını kapsamdan bağımsız çözüyor. Dosyada bir yerde `status: 400` tipli parametre varsa, başka fonksiyondaki `const status = err.status ?? 500` de 4xx sayılıyor. | K1 YAŞADI, R4 KAÇTI |
| O-2 | ORTA | `src/app` altında `route.ts` olmayan dosyalar taranmıyor. Kardeş bir yardımcı (`./respond.ts`) `err.message` ile 500 kurup route'a döndürebiliyor. | K3 YAŞADI |
| O-3 | ORTA | `internalError()`'da `ids.requestId`/`ids.runId` ve `headers` alanları her `string`'i kabul ediyor. `err.message` bu alanlarla 5xx gövdesine ya da başlığına girebiliyor; tsc ve bekçi ses çıkarmıyor. | K5, K6 YAŞADI |
| O-4 | ORTA | Action bekçisi yalnız `catch` bloğu içindeki `return`'e bakıyor. Hata `catch` dışında tanımlı bir değişkene atanıp sonra dönerse, ya da `.catch((e) => ({ error: e.message }))` / `then(ok, onRejected)` kullanılırsa kaçıyor. | K8, K9 YAŞADI, A1–A4 KAÇTI |
| D-1 | DÜŞÜK | GDPR başarılı yollarını hiçbir test sabitlemiyor. Dışa aktarım gövdesi `{}` yapılınca ya da silme isteği cevabından `deletedAt` düşünce tüm `tests/` yeşil kalıyor. Canlıda bugün doğru çalışıyor (§2.1-A). | G2, G3 YAŞADI |
| D-2 | DÜŞÜK | Bilerek yazılması gereken kaçışlar: tırnaklı ya da hesaplanan anahtar (`{'status': 500}`), ters tırnak veya tırnak içeren regex literal (maskeleyici bunu string sanıp dosyanın kalanını gizliyor), `as 'x'` tip kaçışı (be-fb §4'te bildirdi), `const { json } = NextResponse`, `NextResponse['json']`, `new globalThis.Response`, `Reflect.construct`. | K2, K4, K7 YAŞADI; R1–R3, R5–R11, R15 KAÇTI |
| D-3 | DÜŞÜK | `/api/cagrilar` sabit pencere kullanıyor. Pencere sınırında tek kullanıcı **2,7 sn'de 60 istek** geçirebiliyor (canlı). Süreç başına tutulduğu için sınır instance sayısıyla da çarpılıyor. Bu ara çözümün bilinen sınırı. | live-burst.txt |
| D-4 | DÜŞÜK / bilgi | Yapılandırma durumu gövdeden gitti ama **durum kodundan** hâlâ okunuyor. Oturumsuz biri imzasız POST atınca sır yoksa 503, varsa 400 alıyor (iyzico da aynı). Sır olmadan olay zaten işlenmediği için saldırgana bir yetki kazandırmıyor. | live-stripe.txt |
| G-1 | Gözlem | Kartta "400'de retry yok" deniyor; bu doğru değil. Stripe 2xx dışındaki **her** cevabı, 400 dahil, yeniden dener. be-fb'nin raporu bu konuda doğru. Pratikte sonuç: yanlış sırla imzalanan gerçek olaylar sır düzelince teslim edilir, bu da istenen davranış. | — |
| G-2 | Gözlem | Oturumu olan ama `User` satırı silinmiş biri `requestAccountDeletion`'da `'User not found'` alıyor; route bunu 500 `request_failed`'a çeviriyor. Sızıntı yok ama anlam olarak 401/404 olmalıydı. | koddan (`request-deletion.ts:67`) |
| G-3 | Gözlem (ortam) | Paylaşılan :5433 DB'nin şeması dev'in gerisinde: `Membership.staleDigestOn`, `Relationship.staleRemindedContactAt`, `ApiKey.rateWindow*` ve `Evidence(tenantId,r2ObjectKey)` unique indeksi yok. Oradan alınan dump'la canlı testler toplu kırmızı oluyor. | schema-sync.sql.txt, §2.5 |

## 1. Ne yapıldı
1. **Bekçi atlatma denemeleri.** Kartın saydığı biçimleri ve kendi 21 biçimimi `unguardedServerErrors` / `catchReturnLeaks` üzerinde koştum (`scan-probe`).
   - Kartın saydıkları **yakalandı**: değişken status ile `NextResponse.json`, `new Response(body,{status})` ve `5e2` gibi okunamayan status.
   - Yardımcıdan dönen Response: yardımcı `src/lib` altındaysa yakalanıyor; `src/app` altında route olmayan bir dosyadaysa kaçıyor (O-2).
2. **Gerçek ağaçta FP/FN taraması** (`tree-probe`). Taranan 47 dosyada:
   - Ham çağrı sayısı ile maskeleyicinin gördüğü sayı her dosyada eşit; maskeleme hiçbir çağrıyı gizlemiyor.
   - Status'u okunamayan çağrı 0, 5xx doğrudan kurulan çağrı 0.
   - Bir Response kuran ama taranmayan tek dosya helper'ın kendisi (`src/lib/api-error.ts`).
   - Tuhaf biçim (tırnaklı status, destructure, `globalThis.Response`) 0.
   - Route olup tarama dışında kalan 4 dosya yalnız redirect ya da `handleCspReport` döndürüyor. `handleCspReport` `src/lib` altında taranıyor.
3. **Gerçek dosyalarda 23 mutant** (`mutants.py`). Her birinde tek değişiklik yapıldı, ilgili test/tsc/lint koşuldu, sonra `git checkout` ile geri alındı.
4. **Canlı test.** Prod `next build` alındı ve standalone sunucu 127.0.0.1:47979'da `DEMO_LOGIN_ENABLED=false` ile koştu.
   - Oturum çerezleri `next-auth/jwt encode` ile alice, bob ve charlie için basıldı; hiçbiri yazdırılmadı.
   - SEDIA/çeviri çağrıları be-fb'nin ön-yüklemesiyle ağa çıkmadan reddedildi.
   - Enjeksiyonlar yalnız `csfb79-pg`'de yapıldı ve geri alındı.
5. **Kapılar:** tsc, eslint, i18n, build ve tam vitest.

## 2. Kanıt

### 2.1 GDPR canlı (`…-ekler/live-gdpr.txt`)
```
== A) başarılı yollar (enjeksiyon yok)
-- POST /api/user/export: HTTP/1.1 200 OK | content-disposition: attachment; filename=… | gövde 4843 bayt, anahtarlar: timestamp,tenant,notice,tables
-- POST /api/user/export-data: HTTP/1.1 200 OK | … 4843 bayt
-- GET /api/gdpr/export: HTTP/1.1 200 OK | … 4843 bayt
-- POST /api/user/request-deletion: {"status":"pending","deletedAt":"2026-10-30T10:51:14.288Z"}  HTTP 200
-- GET /api/user/request-deletion: {"pending":true,"requestedAt":…,"purgeAt":…}  HTTP 200
-- DELETE /api/user/request-deletion: {"status":"active"}  HTTP 200
-- DELETE /api/gdpr/delete: {"success":true,"status":"pending","deletedAt":…}  HTTP 200
-- oturumsuz: 6/6 uç {"error":"Unauthorized"} HTTP 401
== B) Evaluation tablosu yeniden adlandırıldı
-- POST /api/user/export / export-data / GET /api/gdpr/export: {"error":"export_failed"}  HTTP 500 (×3)
== C) User BEFORE UPDATE trigger 'csfb79-internal-detail: tablo=User kolon=deletedAt'
-- POST /api/user/request-deletion: {"error":"request_failed"}  HTTP 500
-- DELETE /api/gdpr/delete: {"error":"request_failed"}  HTTP 500
-- DELETE /api/user/request-deletion: {"error":"cancel_failed"}  HTTP 500
== D) throw → Next 500: getDeletionStatus try/catch'siz; kolon yeniden adlandırıldı
-- GET /api/user/request-deletion:   HTTP 500 | ctype= | gövde uzunluğu= 0
== sızıntı taraması (B+C+D gövdeleri): 0 eşleşme
== 500 sayısı B+C: 6/6, D: 1/1
== sunucu log'unda ayrıntı: does-not-exist=4 csfb79-internal-detail=6
== temizlik: trigger=0 Evaluation=t kolon=1 alice.dRA=null
```
**Throw → Next 500:** Yakalanmayan bir hata, Next'in prod sunucusunda boş gövdeli ve content-type'sız bir 500 üretiyor. Bekçinin bu yolu kapsamaması doğru.

### 2.2 Stripe / iyzico canlı (`…-ekler/live-stripe.txt`)
```
== STRIPE_WEBHOOK_SECRET boş
-- imzasız POST: {"error":"service_unavailable"}  HTTP 503 application/json
-- sahte imzalı POST: {"error":"service_unavailable"}  HTTP 503
-- iyzico (anahtarlar boş): {"success":false,"error":"service_unavailable"}  HTTP 503
== rastgele whsec_ test sırrıyla yeniden başlatıldı (sır dosyaya yazılmadı, sonra silindi)
-- imza başlığı yok / bozuk imza / başka sırla imzalı: invalid_signature  HTTP 400 text/plain (×3)
-- doğru imza, işlenmeyen tip: {"received":true}  HTTP 200
-- doğru imza, bilinmeyen abonelik (1. teslim): {"error":"internal_error"}  HTTP 500
-- aynı olay yeniden teslim: {"error":"internal_error"}  HTTP 500
== gövdelerde yapılandırma/SDK/iç metin: 0 eşleşme
-- StripeEventLog evt_csfb79%: 0   (claim geri alındı → yeniden teslim işlenebilir)
-- sunucu log: 3 doğrulama hatası satırı, 2 işleme hatası satırı
```
Stripe'ın yeniden deneme davranışı: 503, 400 ve 500 üçü de 2xx dışı olduğu için Stripe hepsini yeniden dener (G-1). İşlenemeyen olay kaybolmuyor. S2 ve S3 mutantları (sırsız 200, işleme hatası 200) testte öldü.

### 2.3 `/api/cagrilar` canlı (`…-ekler/live-cagrilar.txt`, `live-burst.txt`)
```
== 5 oturumsuz istek (sayaca girmemeli): 401 401 401 401 401
== alice: 40 EŞZAMANLI istek (xargs -P 40)
   dağılım:  30 200; 10 429;
== alice 41. istek: HTTP/1.1 429 Too Many Requests / retry-after: 58 / {"success":false,"error":"rate_limited"}
== bob (aynı kiracı, farklı kullanıcı) alice kilitliyken: HTTP 200
== alice ?limit=abc (400 yolu) kilitliyken: {"success":false,"error":"rate_limited"}  HTTP 429
--- pencere sınırı (D-3):
charlie: 60/60 × 200, 2.734s içinde (eski pencerenin son ~0,7 sn'si: 30/30, yeni pencere: 30/30)
```
(Etiketteki "~0,7 sn" betiğin ilk sürümünden kaldı. Son sürüm ilk 30'u pencere başından 58,8 sn sonra, ikinci 30'u 60,4 sn sonra atıyor, yani ilk grup pencere bitmeden yaklaşık 1,2 sn önce gidiyor. Sonuç sayıları etiketten bağımsız.)
- Eşzamanlı yarış yok: `take()` ilk `await`'ten önce ve senkron çalışıyor, bu yüzden 40 paralel istekte tam olarak 30 geçti.
- Oturumsuz istekler sayılmıyor, çünkü sınır `requireTenantApi`'den sonra uygulanıyor.

### 2.4 Mutantlar (`…-ekler/mutants-out.txt`, betik `mutants.py.txt`)
```
K1 bekçi: `status: 400` tipli parametre + başka fonksiyonda değişken status 500 (gölgeleme): YAŞADI
K2 bekçi: tırnaklı anahtar { 'status': 500 }: YAŞADI
K3 bekçi: src/app içinde route.ts olmayan kardeş yardımcı 500 kuruyor: YAŞADI
K4 bekçi: dosyada ters tırnak içeren regex literal, alttaki 500 maskeleniyor: YAŞADI
K5 internalError: ids.requestId içine err.message (tsc+bekçi): YAŞADI  [guard=0, tsc=0]
K6 internalError: headers içine err.message (tsc+bekçi): YAŞADI  [guard=0, tsc=0]
K7 internalError: `as 'internal_error'` tip kaçışı (tsc+lint+bekçi): YAŞADI  [guard=0, tsc=0, eslint=0]
K8 action bekçisi: catch dışına atanıp sonra dönen hata metni: YAŞADI
K9 action bekçisi: Promise .catch((e) => ({ error: e.message })): YAŞADI
D1 cagrilar: sınır userId yerine tenantId: ÖLDÜ      D2 Retry-After yok: ÖLDÜ
D3 429 yerine 403: ÖLDÜ                               D4 sınır 31 (off-by-one): ÖLDÜ
D5 limiter pencere hiç sıfırlanmıyor: ÖLDÜ           D6 Retry-After 0 olabilir: ÖLDÜ
S1 stripe 503 gövdesinde yapılandırma adı: ÖLDÜ      S2 sırsız 200: ÖLDÜ
S3 işleme hatası yutulup 200: ÖLDÜ                   S4 400 gövdesine SDK metni: ÖLDÜ
G1 gdpr 'Unauthorized' dalı 500'e: ÖLDÜ              G4 cancel hatası 200 success: ÖLDÜ
G2 gdpr başarılı dışa aktarım boş gövde: YAŞADI  [gdpr-500-body=0, tüm tests/=0]
G3 request-deletion POST başarıda deletedAt düşüyor: YAŞADI  [gdpr-500-body=0, tüm tests/=0]
git status src/tests (mutant kalıntısı): temiz
```
Sonuç: 23 mutanttan 12'si öldü, 11'i yaşadı. D-3, Stripe ve GDPR hata yolu testleri sağlam. Yaşayanların hepsi bekçi kör noktası (O-1…O-4, D-2) ya da başarılı yol test boşluğu (D-1).

Birim düzeyinde probe (`probe-scan.txt`): route tarafında 16 biçimden 4 kontrol yakalandı, 12 atlatma kaçtı; action tarafında 5 biçimden 1 kontrol yakalandı, 4 atlatma kaçtı. Satır satır liste dosyada.

### 2.5 Kapılar (`…-ekler/gates.txt`, `vitest-summary.txt`; HEAD `e317f285`)
```
tsc exit=0 · eslint src tests exit=0 · i18n:check exit=0 (✅ both catalogs agree …)
next build exit=0
npx vitest run: Test Files 2 failed | 275 passed | 6 skipped (283) · Tests 2 failed | 3331 passed | 81 skipped (3414)
  kırmızı 2 = zaman aşımı: agency/report.test.ts property testi (120 sn), cordis-partner-profile.live (Prisma tx 5000 ms, 5016 ms geçti)
izole tekrar (aynı 2 dosya): Test Files 2 passed · Tests 17 passed
```
- **3331 + 2 yük altında zaman aşımı (izole tekrarda yeşil) = 3333 geçti, 0 gerçek kırmızı, 81 atlandı.** Bu, be-fb'nin sayısıyla aynı. Kırmızı olan iki dosyanın incelenen diff'le ilgisi yok; son değişiklikleri `e46d9798` (TASK-MUMJ7W0GUI6N1).
- `gates.txt`'teki ilk `build exit=1` benim ortam hatam. Symlink'li `node_modules` için Turbopack "points out of the filesystem root" hatası veriyor. Gerçek `pnpm install` sonrası build 0 ile bitti.
- vitest'in ilk iki koşusu (33 ve 52 kırmızı) da ortam kaynaklıydı:
  - `DATABASE_URL_RLS_TEST` süper kullanıcıya bakıyordu (`fabrika_app` rolü `pnpm db:rls-role` ile kuruldu).
  - Dump şeması dev'in gerisindeydi (G-3). `prisma migrate diff --from-config-datasource --to-schema` çıktısı (3 `ADD COLUMN` + 1 unique indeks) **yalnız `csfb79-pg`'ye** uygulandı. Sonrasında diff "empty migration" döndü.

## 3. Değişen dosyalar
- Yalnız rapor: `docs/agent-results/TASK-MUNZ6BRKW1UO4-cs-fb.md` + `…-cs-fb-ekler/` (canlı çıktılar, mutant betiği ve çıktısı, probe testleri, düzenek betikleri `.txt` olarak, `schema-sync.sql.txt`, kapılar).
- **Ürün kodu ve testler değişmedi.**

## 4. Riskler
- O-1…O-4 bugün sömürülebilir değil: gerçek ağaçta ilgili kalıp yok (§1.2). Asıl risk, bekçiye "tamamen kapalı" diye güvenilip gelecekteki kodun bu yollardan birini kullanması. En gerçekçi olanlar üç tane:
  - O-1: `status` çok yaygın bir ad; `refuse(error, status: 400|413)` deseni ağaçta zaten var.
  - O-4: `let error; try {…} catch (e) { error = e.message } return { error }` sık yazılan bir kalıp.
  - O-3: `requestId` alanına yanlışlıkla hata metni koymak.
- D-3: Tek kullanıcının sınırda 2× patlaması SEDIA/MyMemory kotasını dakikada 30 yerine yaklaşık 60 istekle zorlayabilir. Instance sayısıyla çarpılması da cabası. Kalıcı DB penceresi kartına kadar kabul edilebilir.
- D-1: GDPR başarılı yolu bugün doğru ama bir regresyonu hiçbir test yakalamaz. KVKK md.11 / GDPR art.20 çıktısı sessizce boşalabilir.

## 5. Açık sorular
- O-1…O-4 ve D-2 bekçi sertleştirmesi tek kart mı olsun? Önerim tek kart. Liste yaklaşımına geri dönmeden şunlar yapılabilir: tarayıcıyı TypeScript AST'ye (`ts.createSourceFile`) taşımak kapsam/gölgeleme, tırnaklı anahtar ve regex literal sorunlarını birlikte çözer; kapsama `src/app/**/*.ts` yardımcıları eklenir; `ids` alanı `` `${string}-${string}` `` gibi dar bir tipe ya da sunucunun ürettiği markalı (branded) bir tipe bağlanır; `headers` literal değerlere kısıtlanır.
- D-4 için status kodunu da eşitlemek (sır yokken de 400 dönmek) istenir mi? Bu, be-fb'nin "sunucu hatası 5xx olmalı" gerekçesiyle çelişiyor. Önerim olduğu gibi kalması; karar liderin.

## 6. Sonraki adım
1. **Takip kartı (ORTA): bekçi sertleştirme.** Kapsamı O-1…O-4 + D-2. Kabul kriteri: K1–K9 ve probe'daki R1–R11/R15, A1–A4 kırmızı olmalı, gerçek ağaçta FP 0 kalmalı. Mutant metinleri `…-ekler/mutants.py.txt` ve `scan-probe.test.ts.txt`'te hazır.
2. **Takip kartı (DÜŞÜK): GDPR başarılı yol testleri.** Dışa aktarım gövdesinin anahtarları ve `Content-Disposition` sabitlenmeli; request-deletion POST/DELETE ve gdpr/delete cevap şekli sabitlenmeli. Bu testler G2/G3'ü öldürmeli.
3. D-3 kalıcı DB penceresi (be-fb §6.4) için: kayan pencere ya da token bucket seçilirse sınırdaki 2× patlama da kapanır.
4. Ortam (G-3): paylaşılan :5433 DB'ye dev şeması uygulanmalı. Bu, DB sahibinin/devop'un işi; ben :5433'e yazmadım.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64): prod build + standalone Next 16.3.4 sunucusu, izole Docker Postgres (pgvector/pg16), vitest 4.1.11. Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Koddan platform değerlendirmesi:
- İncelenen değişiklikte platforma bağlı yol yok. HTTP gövdeleri ve durum kodları, süreç içi `Map` + `Date.now()` limiter ve saf metin tarayıcı her platformda aynı çalışır.
- Bekçi dosya yollarını `rel()` ile `/`'ye çeviriyor (be-fb `25e8ee2b`), bu yüzden Windows'ta da eşleşir.
- Benim düzenek betiklerim (`live.sh`, `live-cag.sh`, `serve.sh`: bash + curl + docker + xargs) yalnız macOS/Linux içindir; ürün kodu değildir.
