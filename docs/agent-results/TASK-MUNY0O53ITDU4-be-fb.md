# TASK-MUNY0O53ITDU4 — FB DÜZELTME (İNCELEME-75 Y-1/D-1/D-2/D-3) (be-fb)

**Durum:** TAMAM
**Kaynak:** `TASK-MUNWZ3RNUNU2K-se-fb.md` (§2.1 Y-1, §2.2 D-1, §2.4 D-2, §2.5 D-3).
**Dal:** `be-fb/muny0o-o2-gdpr`, ayrı worktree. Commit'ler: `f0fe85b3` (düzeltme), `5da79937` (dev `90916d9d` dala alındı), `5c6456a5` (dev'den gelen koda göre bekçi ayarı), `25e8ee2b` (bekçide Windows yol ayırıcısı). Dev'e `--no-ff` ile merge edildi. **Push yok.**
**Ortam:** İzole Postgres benim konteynerimde (`befb0o-pg`, 127.0.0.1:5477). Paylaşılan `fabrika-postgres` (:5433) bir kez `pg_dump` ile okundu, başka hiçbir şekilde kullanılmadı. Worktree `.env`'inde `grep -c 5433` → 0.

## Özet

| # | Konu | Sonuç |
|---|---|---|
| Y-1 | GDPR uçlarında 6 handler 500 gövdesinde Prisma metni dönüyordu | **Kapandı.** Canlıda 6/6 uç 500 `{"error":"<sabit kod>"}` dönüyor, gövdede iç metin 0 eşleşme. Ayrıntı yalnız sunucu log'unda. |
| D-1 | 5xx bekçisi 13 kalıbı kaçırıyordu | **Kapandı, kalıp listesi yerine yapısal kural.** G1–G13 13/13 kırmızı, kontrol G14 kırmızı. Ağaçta yanlış pozitif 0. |
| D-2 | Stripe webhook 400 gövdesi yapılandırma durumunu açık ediyordu | **Kapandı.** Sır yok → 503 `service_unavailable`. Bozuk imza → 400 `invalid_signature`. Her hata 2xx dışı kaldığı için Stripe yeniden denemeye devam ediyor. |
| D-3 | `/api/cagrilar` için kullanıcı başı sınır yoktu | **Ara çözüm eklendi.** Kullanıcı başına 30 istek/dk, süreç içinde tutuluyor; aşınca 429 + `Retry-After`. Kalıcı DB tabanlı sınır ayrı kart. |
| Ek | Kartta olmayan 2 sızıntı daha bulundu | `[locale]/dashboard/api/export-csv` (500'de `result.error`) ve admin SMTP testi (`error.message`) düzeltildi. iyzico'nun 503'ü de yapılandırma durumunu söylemiyor artık. |

## 1. Ne yapıldı

### Y-1: kaynakta düzeltme
- `src/actions/user/export-data.ts` ve `request-deletion.ts`: üç `catch` bloğu artık hatayı `console.error` ile log'a yazıyor ve sabit kod dönüyor (`export_failed` / `request_failed` / `cancel_failed`).
- `error` alanının tipi `string` idi; sabit kodlardan oluşan birleşim tipine daraltıldı (`'Unauthorized' | 'export_failed'` vb.). Böylece bir hata metni buraya konmak istenirse derleme başarısız olur.
- 6 handler (`user/export`, `user/export-data`, `gdpr/export`, `gdpr/delete`, `user/request-deletion` POST/DELETE) değişken `{ status }` yerine iki açık dal kullanıyor: `'Unauthorized'` → 401, gerisi → `internalError({ error: '<kod>' })`.
- Aynı action'lar gizlilik sayfasına server action olarak da ulaşıyordu. Bu yol da aynı düzeltmeyle kapandı.

### D-1: yapısal bekçi
1. **`src/lib/api-error.ts` → `internalError(fields?, { status?: 500|502|503|504, headers?, ids? })`.** Gövdedeki her alan *literal tipte* olmak zorunda. `err.message`, `String(err)`, `` `x ${s}` ``, `err.stack`, önceden kurulmuş bir `{ error: s }` ya da çalışma anında hesaplanan sayı/boolean tip denetiminden geçmiyor. Bunu `tests/api/api-error.test.ts` içindeki 10 `@ts-expect-error` satırı sabitliyor; `tsc` testleri de kapsıyor. Çalışma anında gelen tek değerler `ids.runId` ve `ids.requestId` (se-fb §2.2(c)'deki izinli alanlar).
2. **Bekçi pozitif kurala çevrildi** (`tests/api/api-error-body-guard.test.ts` + `tests/api/response-status-scan.ts`). Durum kodu kesin olarak 500'ün altında değilse yanıt yalnız `internalError()` ile kurulabilir. "Kesin olarak 500'ün altında" şu durumlar: `status` yok, sayısal literal, literal ternary, ya da parametre veya `const` olarak `400 | 413` gibi literal birleşimle tiplenmiş tanımlayıcı. Değişken, `...init`, `res.status` gibi okunamayan her durum kodu "5xx olabilir" sayılıyor. Gövdenin içeriğine artık bakılmadığı için kaçacak bir kalıp kalmıyor.
   - String, yorum ve şablon metni taramadan önce maskeleniyor. Bu, G13'teki parantez sayacı hatasını gideriyor.
   - Kapsam `src/app/api` idi; artık `src/app` altındaki **bütün** `route.ts` dosyalarını ve `src/lib` altında yanıt kuran yardımcıları (ör. `api-auth.ts`) da kapsıyor.
3. **41 çağrı yeri `internalError()`'a taşındı.** Gövdelerin şekli ve kodları korundu (`{ success:false, error:'internal_error' }`, v1'in `{error,message,code}` biçimi, `İç Sunucu Hatası` vb.). İstemci sözleşmesi değişmedi. İki istisna:
   - `api/dashboard/export-csv` 500'ü düz metinden JSON `internal_error`'a döndü. İstemcisi indirme bağlantısı, gövdeyi okumuyor.
   - iyzico 503: `'iyzico integration is not configured'` → `'service_unavailable'`. Bu da D-2 ile aynı sınıftan.
4. **Server action bekçisi (se-fb D-1(d)).** `'use server'` dosyalarında `catch` bloğundan dönen değerde yakalanan değer ya da ondan türetilmiş bir ad varsa (`const message = …error.message` → `return { error: message }` zinciri dahil) test kırmızı. `errorCode(e)`, `failureCode(e,…)`, `mailFailureCode(e)`, `e instanceof X` ve `e.code` izinli.
   - Kartın dışında kalan önceden var olan iki yer **yalnız küçülebilen** sayılı bir listeye yazıldı: admin plan eylemleri (11) ve m8 (1). Sayı artarsa test kırmızı olur; bu yerlerden biri düzeltilip sayı azalırsa da kırmızı olur, böylece listeden silinmesi gerekir (§4).
5. Bekçinin kendi öz-testleri: route tarafında 26 sızıntı biçimi ve 8 temiz biçim, action tarafında 13 sızıntı biçimi ve 7 temiz biçim.

### D-2: Stripe webhook
- `STRIPE_WEBHOOK_SECRET` yoksa → `internalError({ error: 'service_unavailable' }, { status: 503 })`. Sır eksikliği gönderenin değil sunucunun hatası; eskiden 400 dönüyordu.
- İmza doğrulaması başarısızsa → `400 'invalid_signature'` (text/plain). SDK'nın hata metni yalnız log'a gidiyor.
- Yeniden deneme davranışı: Stripe 2xx dışı her yanıtı yeniden dener. 503, 400 ve 500'ün üçü de 2xx dışı. İşleme hatasında claim transaction ile geri alınıyor, bu yüzden aynı olay tekrar gönderildiğinde yeniden işleniyor (canlıda `StripeEventLog` 0 satır).

### D-3: `/api/cagrilar`
- `src/lib/user-rate-limit.ts` `UserWindowLimiter`: süreç içinde sabit pencere; pencere dolunca tüm sayaçlar birlikte sıfırlanıyor, bu yüzden Map büyüyüp gitmiyor. Desen `csp-report.ts`'teki `ReportLimiter`'dan alındı.
- Route'ta kiracı kontrolünden sonra ve SEDIA ile çeviriden önce: 30/dk/kullanıcı, aşınca `429 { success:false, error:'rate_limited' }` + `Retry-After`. Çağrılar sayfası filtre her değiştiğinde bir istek atıyor; bir insan 30/dk'ya yaklaşmaz, bir döngü aşar.
- Bilinen sınır: sayaçlar süreç başına tutuluyor, yani N instance varsa sınır N×30 olur. Kalıcı çözüm `ApiKey` pencere deseninde bir DB penceresi; bu migration ister ve ayrı kart gerektirir.
- **Düzeltilen hata:** İlk sürümde `windowStart = 0` idi, yani ilk pencere 1970'e sabitleniyordu. Üretimde `Date.now()` çok büyük olduğu için bu görünmezdi, birim test yakaladı. `-Infinity` yapıldı (mutant D3b).

### Kartta olmayan ek bulgular
- `src/app/[locale]/(app)/[workspace]/dashboard/api/export-csv/route.ts`: aynı `{ status }` + `result.error` kalıbı vardı. Action zaten sabit `'ExportFailed'` döndüğü için canlı sızıntı değildi, ama bekçinin kör noktasındaydı. Düzeltildi.
- `src/app/[locale]/admin/settings/actions.ts`: SMTP testi `error.message` dönüyordu. Artık `mailFailureCode(error)` dönüyor: `MailSendError` ise `smtp:EAUTH:535`, değilse `unknown_error`. `mailer.ts` zaten her gönderim hatasını `MailSendError`'a çeviriyor, bu yüzden SMTP hatalarında gösterilen metin aynı kaldı.

## 2. Kanıt

### 2.1 Y-1: canlı 500 tetikleme (`…-ekler/live-gdpr.txt`, betik `live.sh.txt`)
Prod build (`next build`) alındı ve `.next/standalone/server.js` 127.0.0.1:47977'de `DEMO_LOGIN_ENABLED=false` ile koştu. Oturum çerezi `next-auth/jwt encode` ile `demo-user-alice` için basıldı; çerez yazdırılmadı. İki enjeksiyon se-fb'nin §2.1'dekiyle aynı ve yalnız `befb0o-pg`'de yapıldı:
```
== DB: fabrika @ befb0o-pg
-- GET /api/user/request-deletion (alice): {"pending":false}  HTTP 200
-- POST /api/user/export (alice): HTTP 200 application/json; charset=utf-8
== fault 1: ALTER TABLE "Evaluation" RENAME TO "Evaluation_befb0o"
-- POST /api/user/export (alice): {"error":"export_failed"}  HTTP 500
-- POST /api/user/export-data (alice): {"error":"export_failed"}  HTTP 500
-- GET /api/gdpr/export (alice): {"error":"export_failed"}  HTTP 500
== fault 2: BEFORE UPDATE trigger on "User" raises 'befb0o-internal-detail: tablo=User kolon=deletedAt'
-- POST /api/user/request-deletion (alice): {"error":"request_failed"}  HTTP 500
-- DELETE /api/gdpr/delete (alice): {"error":"request_failed"}  HTTP 500
-- DELETE /api/user/request-deletion (alice): {"error":"cancel_failed"}  HTTP 500
== sızıntı taraması (gövdelerde /prisma|invocation|P0001|Evaluation|befb0o|tablo|Database error/i): 0 eşleşme
== 500 sayısı: 6/6
[export-data] Error [PrismaClientKnownRequestError]: …   (×3; request-deletion ×2, cancel-deletion ×1)
== temizlik: trigger=0 Evaluation=t
```
Log'da ayrıntı duruyor: `does not exist` 3 satır, `befb0o-internal-detail` 6 satır. Alice'in `deletionRequestedAt` alanı test sonrasında da `null`. Eski davranışın kanıtı se-fb'nin `live-5xx-leak.txt` dosyasında: aynı 6 uç Prisma metnini dönüyordu.

### 2.2 D-2 ve iyzico canlı (`…-ekler/live-webhooks.txt`)
```
-- Stripe, sır boş — imzasız POST: {"error":"service_unavailable"}  HTTP 503 application/json
-- POST /api/webhooks/iyzico (anahtarlar boş): {"success":false,"error":"service_unavailable"}  HTTP 503
== rastgele whsec_ test sırrıyla (sır dosyaya yazılmadı):
-- bozuk imza: invalid_signature  HTTP 400 text/plain;charset=UTF-8
-- imzalı, bilinmeyen abonelik (1. teslim): {"error":"internal_error"}  HTTP 500
-- aynı olay yeniden teslim: {"error":"internal_error"}  HTTP 500
-- imzalı, işlenmeyen tip: {"received":true}  HTTP 200
-- StripeEventLog stripeEventId LIKE 'evt_befb0o%': 0  (claim iç hatayla geri alındı → yeniden teslim işlenir)
-- log: 1 doğrulama hatası satırı (SDK metni log'da)
```
Eski davranış (se-fb `live-stripe.txt`): `Webhook Error: Missing STRIPE_WEBHOOK_SECRET  HTTP 400` ve SDK'nın yardım metni.

### 2.3 D-3 canlı (`…-ekler/live-cagrilar.txt`)
Sunucuya bir ön-yükleme eklendi (`--import nosedia.mjs`). Bu, `ec.europa.eu` ve `mymemory` adreslerine giden fetch çağrılarını ağa çıkarmadan reddediyor; böylece 150 gerçek dış çağrı yapılmadı. Ürün koduna dokunmuyor.
```
1:200 2:200 … 30:200 31:429 32:429
HTTP/1.1 429 Too Many Requests
retry-after: 57
{"success":false,"error":"rate_limited"}
-- oturumsuz: {…"code":"TENANT_SCOPE_REQUIRED"}  HTTP 401
```

### 2.4 Mutantlar (`…-ekler/mutants-out.txt`, betik `mutants.py.txt`): **32/32 öldü**, ağaç temiz
Birleşik ağaçta (dev `90916d9d` dahil) ikinci kez koşuldu:
```
G1 `${error}` şablon … G13 string içinde ')' erken kapanış: KIRMIZI (öldü)  ← se-fb'nin 13 kalıbı, 13/13
G14 kontrol: .message: KIRMIZI (öldü)
G15 internalError + err.message (tip kilidi): KIRMIZI (öldü)
G16 internalError + şablon (tip kilidi): KIRMIZI (öldü)
Y1a export-data catch eski hali: KIRMIZI (öldü)
Y1b request-deletion catch eski hali: KIRMIZI (öldü)
Y1c cancel catch eski hali (yalnız bekçi): KIRMIZI (öldü)
Y1d gdpr/export route eski hali: KIRMIZI (öldü)
Y1e user/request-deletion DELETE: 401 dalı silindi: KIRMIZI (öldü)
T1 LiteralFields kimlik tipi: KIRMIZI (öldü)        ← 6× TS2578 (kullanılmayan @ts-expect-error), başka hata 0
T2 ids anahtarları serbest: KIRMIZI (öldü)
D2a stripe 400 eski gövde / D2b stripe sırsız → eski 400 yolu: KIRMIZI (öldü)
D3a cagrilar sınır kontrolü kaldırıldı / D3b limiter ilk pencere 0 / D3c limiter <= yerine <: KIRMIZI (öldü)
A1 SMTP eski dönüş / A2 m8 düzeltilirse temel liste bayat: KIRMIZI (öldü)
S1 tarayıcı: nesne özelliği tip bildirimi sayılır / S2 tarayıcı: string maskesi kapalı: KIRMIZI (öldü)
git diff (izlenen, mutantlardan kalan): 0 dosya değişik
```
G1–G14 mutantları se-fb'nin `guard-mutants.py` metinleriyle birebir aynı. Taban satır yeni koda göre `internalError(...)` olarak uyarlandı.

**FP 0:** Gerçek ağaçta route bekçisi 0 bulgu veriyor. Action bekçisi yalnız sayılı listedeki 12 yeri buluyor. Dev merge'ünden sonra bir yanlış pozitif çıktı: `evidence/actions.ts`'te `UploadRefused` hatasının kendi `error.code`'u. Bu düzeltildi ve öz-teste eklendi (`5c6456a5`). Aynı yerde `error.message` kullanılsaydı hâlâ kırmızı olurdu; bu da öz-testte var.

### 2.5 Kapılar (`…-ekler/gates.txt`, birleşik ağaç `5c6456a5`)
```
tsc --noEmit exit=0
eslint src tests exit=0
✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
i18n:check exit=0
next build exit=0
npx vitest run exit=0
 Test Files  277 passed | 6 skipped (283)
      Tests  3333 passed | 81 skipped (3414)
```
- Merge öncesi koşu: 3298 geçti / 0 kırmızı / 73 atlandı.
- 81 atlanan testin dosya dağılımı JSON raporundan alındı: `evidence-upload-s3.live` 21, `public-lead.live` 16, `stale-relationship-reminder.live` 14, `topic-match-nightly.live` 9, `k1-embeddings.live` 7, `invitation-retention.live` 6, `k1-daily-calls` 4, `adapters` 2, `sedia-adapter` 2. Bunların hiçbiri benim dosyam değil; hepsi dış servis ya da env gerektiren testler. 73'ten 81'e artış dev'den gelen S3 testlerinden.
- Dev'den gelen `evidence-unique-object-key.sql` yalnız kendi DB'me uygulandı; duplikat denetimi geçti, `CREATE INDEX` çalıştı. `prisma db push --accept-data-loss` **kullanılmadı** (Prisma bunu ajan için engelliyor; engel aşılmadı).

## 3. Değişen dosyalar
- **Yeni:** `src/lib/api-error.ts`, `src/lib/user-rate-limit.ts` (+ `.test.ts`), `tests/api/response-status-scan.ts`, `tests/api/api-error.test.ts`, `tests/api/gdpr-500-body.test.ts` (6 uç × 500/401 + action sonucu), `tests/api/stripe-webhook-bodies.test.ts`
- **Bekçi:** `tests/api/api-error-body-guard.test.ts` (yeniden yazıldı), `tests/api/cagrilar-hardening.test.ts` (429 testi; test başına ayrı kullanıcı)
- **Y-1:** `src/actions/user/export-data.ts`, `src/actions/user/request-deletion.ts`, 5 route dosyası (`user/export`, `user/export-data`, `user/request-deletion`, `gdpr/export`, `gdpr/delete`)
- **D-2:** `src/app/api/webhooks/stripe/route.ts`, `src/app/api/webhooks/iyzico/route.ts`
- **D-3:** `src/app/api/cagrilar/route.ts`
- **`internalError()`'a taşınan diğer yerler:** v1 (`calls`, `opportunities`, `partners`, `partners/[pic]`), `admin/*` (cordis import, topic-stats import/rescore, documents upload), `billing/*` (checkout, portal, quote, invoices export), `cordis/*` (organizations, organizations/[id], projects), `saved-searches` ×2, `invitations`, `feedback`, `evidence/mock-upload`, `dashboard/export-csv`, `[locale]/…/dashboard/api/export-csv`, `src/lib/api-auth.ts`
- **SMTP:** `src/lib/email/mailer.ts` (`mailFailureCode`), `src/app/[locale]/admin/settings/actions.ts`
- **Rapor:** `docs/agent-results/TASK-MUNY0O53ITDU4-be-fb.md` + `…-ekler/` (canlı çıktılar, mutant betiği ve çıktısı, kapılar, düzenek betikleri `.txt` olarak)

## 4. Riskler
- **Admin plan eylemleri (11 yer, yalnız platform admin):** `toFailure()` `detail` alanına `errorMessage(e)` koyuyor ve arayüz bunu gösteriyor. Ayrıca `requirePlatformAdmin()` bu `try` bloğunun içinde çağrılıyor. Bir redirect ya da notFound fırlatırsa, bu atış `toFailure` tarafından yakalanıp `{ok:false}`'a çevrilebilir. Doğrulamadım, takip kartında bakılmalı.
- **m8 `findCandidates` (1 yer, kiracı kullanıcısı):** `errorMessage(e)` arayüze bilinçli alan mesajları taşıyor (ör. "Seat not found in this workspace."), ama bir Prisma hatası da aynı yoldan geçer. Aynı sınıftan, ORTA. Düzeltmek için alan hataları için ayrı bir sınıf gerekiyor, bu yüzden bu karta sığmadı. İkisi de bekçide sayılı listede; takip kartı önerisi §6.
- **Gözlem, benim kapsamım dışında:** `evidence/actions.ts` `confirmEvidenceUploadAction` fonksiyonu `UploadRefused` ya da `P2002` dışındaki her DB hatasında `// Mock return if DB offline` diyerek `{ success: true, evidence: { id: 'ev-<ts>' … } }` dönüyor. DB hatası kullanıcıya sahte bir başarı olarak gidiyor. Veri bütünlüğü açısından fe-fb'ye iletilmeli.
- D-3 süreç içinde tutulduğu için sınır instance sayısıyla çarpılır ve yeniden başlatmada sıfırlanır. Bu bilinerek seçilmiş bir ara çözüm.
- `internalError()`'ın tip kilidi `as` ile aşılabilir (`msg as 'x'`). Bekçi bunu yakalamıyor. Lint `any`'yi yasaklıyor ama literal tipe `as` ile daraltmayı yasaklamıyor. İnceleme dikkat etmeli.

## 5. Açık sorular
- Admin plan (11) ve m8 (1) için tek kart mı, iki ayrı kart mı? Önerim: m8 ayrı kart (ORTA, kiracıya dönük), admin plan ise DÜŞÜK ve `requirePlatformAdmin` sorusuyla birlikte ayrı bir kart.
- D-3'ün kalıcı DB penceresi için kart açılsın mı? Karar liderin.

## 6. Sonraki adım
1. Takip kartı: m8 `findCandidates` alan hataları için ayrı sınıf; varsayılan dal sabit kod dönmeli; bekçi listesinden `m8: 1` silinmeli.
2. Takip kartı: admin plan `toFailure().detail` sabitlenmeli ve `requirePlatformAdmin()` `try` bloğunun dışına alınmalı; bekçi listesinden silinmeli.
3. fe-fb'ye bilgi: `confirmEvidenceUploadAction` DB hatasında sahte başarı dönüyor.
4. İsteğe bağlı: D-3 için `UserRateWindow` DB penceresi.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64). Prod build + standalone sunucu, izole Docker Postgres (pgvector/pg16). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Kodda platforma bağlı yol yok:
- HTTP gövdeleri ve durum kodları; süreç içi `Map` sayacı ve `Date.now()`.
- Kaynak tarayıcı `node:fs` + `path.join/relative/resolve` kullanıyor. Bekçinin yol beklentileri `relative()` çıktısını `sep` üzerinden `/`'ye çeviriyor (`rel()`). Bu olmasaydı Windows'ta `\` dönen yollar `arrayContaining` ve sayılı liste anahtarlarıyla eşleşmezdi; rapor yazılırken fark edildi ve düzeltildi (son commit).
- Test düzeneği betikleri (`live.sh`, `serve.sh`) bash + `lsof` + docker kullanıyor, yalnız macOS/Linux içindir. Bunlar ürün kodu değil.
