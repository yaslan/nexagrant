# TASK-MUNVVMJDEO932 — FB DÜZELTME (İNCELEME-70 Y-1/D-1/D-2/D-3) (cs-fb)

**Durum:** TAMAM
**Dal:** `cs-fb/munvvm-o2-leaks` (dev `75f093d5` üstünden). `ea1fa508` → dev merge `12d9251e`, sonra istisna kaldırma commit'i ve dev'e ikinci merge. Push YOK.
**Bulgu kaynağı:** docs/agent-results/TASK-MUNUT0ET27K2B-be-fb.md (Y-1, D-1, D-2, D-3; mutantlar MB8/MB11/MB13)

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64): prod build (`next build`) + `next start` 127.0.0.1:47881, izole Postgres `csfb-80x-pg` (127.0.0.1:55880, kendi konteynerim). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Değişen kod platforma bağlı değil: HTTP yanıt gövdeleri, logger çağrısı ve kaynak metni okuyan bir test (`node:fs` + `path.join/relative`, ayırıcıdan bağımsız). Dosya yolu, süreç ya da kabuk kodu yok. Linux prod imajında aynı davranış beklenir.

## Özet

| Bulgu | Sonuç |
|---|---|
| Y-1 `webhooks/stripe:105` | 500 gövdesi artık `{"error":"internal_error"}`. Ayrıntı zaten satır 100'deki `console.error`'da. Canlıda kanıtlandı. |
| Y-1 `admin/cordis/import:28` | `!importRes.success` dalı artık `{"success":false,"error":"import_failed","runId":…}`. Ham metin `logger.error`'a gidiyor, run satırında ve alarmda da duruyor. Canlıda kanıtlandı. |
| Y-1 bekçi kör noktası | Bekçi artık 5xx durumlu her `NextResponse.json / new NextResponse / Response.json / new Response` çağrısının argümanlarını okuyor. `.message`, `String(e/err/error…)` ve `errorMessage(` görürse kırmızı. MB13 artık **kırmızı**. Dal açıldığında gerçek ağaçta tek eşleşme bilinen `billing/portal:58` idi. se-fb'nin düzeltmesi dev'e girdikten sonra eşleşme **0**, yanlış pozitif **0**. |
| `billing/portal` | **Dokunulmadı.** se-fb TASK-MUNSRKW0HJYBV'de düzeltti; merge `f23d79cc` benim ilk merge'imden önce dev'e girmişti. İlk commit'teki geçici `PENDING_ELSEWHERE` istisnası birleşik ağaçta kaldırıldı (2. commit). Bekçi artık istisnasız ve yeşil. |
| D-1 (MB8) | `/api/cagrilar` için `limit=0 / -1 / -50 → pageSize 1` testi eklendi. MB8 artık **kırmızı** (3 test). |
| D-2 (MB11) | "En eskiyi at" testi eklendi. MB11 artık **kırmızı**. |
| D-3 | **Eklenmedi, öneri olarak kaldı** (§5). Mevcut tek hız sınırı yardımcısı `ApiKey` satırına bağlı. Kullanıcı başına uygulamak yeni tablo/migration ya da süreç-içi sayaç ister. "Mevcut yardımcıyla ucuz" koşulunu sağlamıyor. |

## 1. Ne yapıldı

1. `src/app/api/webhooks/stripe/route.ts`: işleme hatası 500'ünde düz metin `Error processing webhook: ${err.message}` yerine sabit JSON gövde. Stripe yalnız 2xx olmayan kodu görüp yeniden dener, gövdeyi okumaz. İmza hatası dalı (400) bu kartta değişmedi (bkz. §5 Açık sorular).
2. `src/app/api/admin/cordis/import/route.ts`: başarısız koşu dalı sabit `import_failed` kodu ve `runId` dönüyor. Ayrıntı `logger.error(…, importRes.error, { runId })` ile log'a gidiyor. Hangi hata olduğu `runId` ile `CordisImportRun.error` alanından okunabiliyor.
3. `tests/api/api-error-body-guard.test.ts`: iki yeni test.
   - "no 5xx response carries the thrown value": yanıt çağrılarını parantez eşleştirerek çıkarıyor. Çok satırlı çağrılar ve şablon metinler de dahil. `status: 5xx` olan ve sızıntı kalıbı taşıyan çağrıyı `dosya:satır` ile raporluyor. 4xx gövdeleri kapsam dışında: zod `issue.message` ve topic-stats 422/413 gibi istemciye ne yanlış olduğunu söyleyen gövdeler meşru.
   - "the 5xx guard catches the shapes it is meant to catch": bekçinin kendisini sabitliyor. 5 sızıntı şekli yakalanmalı, 3 meşru şekil geçmeli.
4. `tests/api/admin-cordis-import-500.test.ts` (yeni): `importRes.error` alan geçişi `.message` kalıbı olmadığı için bekçi bunu göremez. Bu yüzden davranış testiyle sabitlendi: gövde sabit, ayrıntı log'da, profil işi koşmuyor. Catch dalı da ayrıca test ediliyor.
5. `tests/api/cagrilar-hardening.test.ts`: `test.each(['0','-1','-50'])` ile SEDIA'ya `pageSize: 1` gitmeli.
6. `tests/translation-bounds.test.ts`: cap+1 kayıt yazılıyor. En yeni **iki** kayıt önbellekten gelmeli (fetch yok), en eski kayıt yeniden çekilmeli (1 fetch). Not: yalnız "en yeni kayıt önbellekte" kontrolü MB11'i öldürmüyordu. "En yeniyi at" mutantı yeni kaydı eklemeden önce bir öncekini atıyor, yani en yeni kayıt yine önbellekte kalıyor. İlk sürümüm bu yüzden MB11'i yaşattı; ayırt edici olan sondan ikinci kayıt.

## 2. Kanıt

### 2.1 Canlı: admin/cordis/import (`…-ekler/live-cordis.txt`)
CORDIS indirmesi bir test preload'u ile 503'e çevrildi (`NODE_OPTIONS=--require cordis-503-stub.cjs`, yalnız `cordis.europa.eu/data/` URL'lerine dokunuyor). Böylece gerçek zip indirilmeden importer'ın gerçek başarısız-koşu dalı çalıştı. Oturumlar `next-auth/jwt encode` ile basıldı: platform admin (DB'de `isPlatformAdmin=t`) ve `demo-user-alice`. Anahtar `.env`'den okundu, hiçbir yere yazdırılmadı.
```
-- oturumsuz:        {"error":"Unauthorized",…,"code":"UNAUTHENTICATED"}  HTTP 401
-- demo-user-alice:  {"error":"Forbidden",…,"code":"PLATFORM_ADMIN_REQUIRED"}  HTTP 403
-- platform admin:   {"success":false,"error":"import_failed","runId":"cmunwaz7w0000x4xkntce2yeq"}  HTTP 500
== sunucu log'u (ayrıntı yalnız burada):
[ERROR] [API /api/admin/cordis/import] import run failed Failed to download CORDIS zip from https://cordis.europa.eu/data/cordis-HORIZONprojects-csv.zip: Service Unavailable secret-upstream-detail {"runId":"cmunwaz7w0000…
```

### 2.2 Canlı: webhooks/stripe (`…-ekler/live-stripe.txt`)
Sunucu rastgele bir `whsec_…` test sırrıyla başlatıldı. `.env`'deki değer boş; sır dosyaya yazılmadı. Olay `Stripe.webhooks.generateTestHeaderString` ile imzalandı, yani doğrulanmış bir çağrı.
```
-- imzalı customer.subscription.updated (bilinmeyen abonelik): HTTP 500 content-type=application/json
{"error":"internal_error"}
== sunucu log'u (ayrıntı yalnız burada):
Error processing webhook: Unable to determine tenantId from subscription sub_csfb_secret_4242 Error: …
```

### 2.3 Canlı: /api/cagrilar alt sınır (`…-ekler/live-cagrilar.txt`, alice oturumu, gerçek SEDIA)
```
limit=-5&lang=en -> HTTP 200 success True pageSize 1 topics 5
limit=0&lang=en  -> HTTP 200 success True pageSize 1 topics 5
```
(`topics 5` = 5 sayfa × 1.)

### 2.4 Mutantlar (`…-ekler/mutants.py`, `mutants-out.txt`): 7/7 öldü
```
MB8 cagrilar alt sınır yok: KIRMIZI (3 test)
MB11 önbellek EN YENİyi atıyor: KIRMIZI
MB13 billing/quote 500 = (error as Error).message: KIRMIZI (bekçi)
MB14 cagrilar 500 = String(error) (yalnız bekçi): KIRMIZI (bekçi; İNCELEME-70'te bekçi yeşil kalmıştı)
MS1 stripe webhook eski gövde geri: KIRMIZI (bekçi)
MS2 cordis import importRes.error geri: KIRMIZI (davranış testi)
MS3 cordis import 503 + err.message (çok satırlı): KIRMIZI (bekçi)
git status (mutasyon sonrası, izlenen): yalnız kartın 5 dosyası — betik her mutantı geri aldı
```

### 2.5 Bekçinin gerçek ağaçtaki eşleşmesi (`…-ekler/guard-real-tree.txt`)
Dal açıldığında (se-fb merge'inden önce), `PENDING_ELSEWHERE` geçici olarak boşaltılınca:
```
+ [ "billing/portal/route.ts:58", ]      Tests  1 failed | 3 passed (4)
```
Başka eşleşme yok, yani yanlış pozitif 0. Kalıp `src/app/api` altındaki bütün `route.ts` dosyalarını tarıyor. Webhook'un 400 imza dalı `.message` taşıyor ama 5xx olmadığı için bilerek dışarıda bırakıldı.

### 2.6 Kapılar (izole DB, bu dal)
```
tsc --noEmit exit=0 · eslint src tests exit=0 · i18n:check exit=0 ✅ · next build exit=0
npx vitest run (1. koşu) → Test Files 3 failed | 263 passed | 6 skipped (272) · Tests 3 failed | 3175 passed | 73 skipped (3251)
   3 kırmızı: rag-pdf-worker-isolation (CPU bütçesi, PdfLimitError), withholding-rounding + invoice-writer (Test timed out 5000ms)
   aynı 3 dosya tek başına → Tests 48 passed (48). load average 62.47 (makine doygun). Hiçbiri bu kartın dosyalarına dokunmuyor.
npx vitest run (2. koşu, load 42) → Test Files 266 passed | 6 skipped (272) · Tests 3178 passed | 73 skipped (3251) · exit=0
--- birleşik ağaç (dev 12d9251e + istisna kaldırıldı; se-fb portal düzeltmesi dahil) ---
tsc exit=0 · eslint exit=0 · npx vitest run → Test Files 266 passed | 6 skipped (272) · Tests 3197 passed | 73 skipped (3270) · exit=0
mutants.py birleşik ağaçta: 7/7 KIRMIZI (`…-ekler/vitest-full-3-birlesik-ozet.txt`)
```

## 3. Değişen dosyalar
- `src/app/api/webhooks/stripe/route.ts`
- `src/app/api/admin/cordis/import/route.ts`
- `tests/api/api-error-body-guard.test.ts`
- `tests/api/admin-cordis-import-500.test.ts` (yeni)
- `tests/api/cagrilar-hardening.test.ts`
- `tests/translation-bounds.test.ts`
- `docs/agent-results/TASK-MUNVVMJDEO932-cs-fb.md` + `-ekler/`

## 4. Riskler
- **Bekçinin sınırı:** statüyü değişkenden alan (`{ status }`) ya da gövdeyi önceden bir değişkene kuran 5xx yanıtları görmez. Alan geçişini (`error: result.error`) de görmez; bu yüzden cordis import için ayrı davranış testi var. Bugün ağaçta bu şekilde 5xx sızıntı yok; tarama §2.5.
- **Admin arayüzü:** `import_failed` gövdesini okuyan bir istemci kodu yok (`grep -rn "api/admin/cordis/import" src scripts` → yalnız route'un kendi log satırları). Admin, hata ayrıntısını `runId` ile run satırından okur.

## 5. Açık sorular / öneriler
- **D-3 (öneri, uygulanmadı):** oturumlu `/api/cagrilar` için kullanıcı başına sınır. En ucuz sağlam seçenek: `ApiKey.rateWindow*` desenini (tek `UPDATE … RETURNING` ile pencere+sayaç) `Membership` ya da yeni bir `UserRateWindow(userId, bucket)` satırına taşımak. Örneğin `cagrilar` için dakikada 10 istek + 429 `Retry-After`. Migration gerektirdiği için ayrı kart olmalı (DB + deploy sırası: önce migration). Süreç-içi `Map` sayacı daha ucuz, ama çok instance'lı prod'da sınır instance sayısıyla çarpılır; yalnız ara çözüm olarak düşünülebilir. Karar liderin.
- **Yeni gözlem (bu kartta değiştirilmedi):** `webhooks/stripe` imza dalı (400) kimliksiz her çağırana `Webhook Error: ${error.message}` dönüyor. Canlıda `STRIPE_WEBHOOK_SECRET` boşken gövde `Webhook Error: Missing STRIPE_WEBHOOK_SECRET` oldu, yani yapılandırma durumu dışarıdan okunabiliyor. DÜŞÜK. Önerim: sabit `invalid_signature`, ayrıntı log'da. Kapsam 5xx olduğu için dokunmadım.

## 6. Sonraki adım
- D-3 için karar: DB tabanlı kullanıcı-başı sınır kartı açılsın mı?
- Webhook 400 gövdesi için küçük takip (isteğe bağlı).
