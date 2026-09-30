# TASK-MUNWZ3RNUNU2K — FB İNCELEME-75 (se-fb)

**Durum:** TAMAM
**İncelenen:** TASK-MUNVVMJDEO932 (cs-fb): `ea1fa508`, merge `12d9251e`, `cf33bb11`. Bulgu kaynağı: `TASK-MUNUT0ET27K2B-be-fb.md` (İNCELEME-70).
**Ortam:** Ayrı worktree, dev `cb7e0ac8` üzerinde (detached). İzole Postgres benim konteynerimde: `sefb75-pg`, 127.0.0.1:5475. Paylaşılan `fabrika-postgres` (:5433) yalnız bir kez `pg_dump` ile okundu; oraya hiçbir yazma ya da HTTP isteği gitmedi. Worktree `.env`'inde `grep -c 5433` → 0. Kod DEĞİŞTİRİLMEDİ.

## Karar

**cs-fb'nin değişiklikleri: ONAY.** Stripe 500 gövdesi, cordis import `import_failed`, bekçinin genişletilmesi ve cagrilar/önbellek testleri doğru. 7/7 mutantı benim ağacımda da öldürüyor. Tam kapılar yeşil.

**O-2 sınıfı: KAPANMADI.** Raporun §4'ü "bugün ağaçta bu şekilde 5xx sızıntı yok" diyor, bu yanlış. **5 route dosyasında 6 handler**, oturumlu kullanıcıya Prisma'nın ham hata metnini 500 gövdesinde dönüyor. Tablo adları ve sorgu şekli görünüyor. Canlıda kanıtlandı (Y-1). Bekçi, raporun kendi kabul ettiği iki kör noktadan (alan geçişi ve `{ status }` değişkeni) tam burada kaçıyor. Ayrıca bekçiyi kendi 13 kalıbımla zorladım; **13'ü de kaçtı** (D-1). Y-1 için takip kartı **zorunlu**.

| # | Önem | Konu | Durum |
|---|---|---|---|
| Y-1 | ORTA | 6 handler 500 gövdesinde `error.message` dönüyor (GDPR export/silme uçları) | **Yeni, canlı kanıtlı, takip kartı gerekli** |
| D-1 | DÜŞÜK | 5xx bekçisi 13/13 alternatif sızıntı kalıbını kaçırıyor | Sertleştirme önerisi |
| D-2 | DÜŞÜK | Stripe webhook 400 gövdesi yapılandırma durumunu açık ediyor | cs-fb §5 gözlemi, canlıda teyit edildi |
| D-3 | DÜŞÜK→ORTA | `/api/cagrilar` için kullanıcı başı hız sınırı yok | Ayrı kart kararı doğru; ara çözüm önerisi aşağıda |
| Ö-1 | bilgi | `webhooks/stripe:102` `'already processed'` dalı ölü kod | Zararsız |

## 1. Ne yapıldı
1. İnceledim: `ea1fa508` ve `cf33bb11` diff'leri, bekçi (`tests/api/api-error-body-guard.test.ts`), yeni ve değişen testler. Bekçinin taradığı 36 `route.ts` dosyasını kör noktalar için elle ve grep ile taradım: değişken status, alan geçişi, `.stack`, `.cause`, `JSON.stringify`, `${e}`, `{ error }` kısaltması. `src/lib` altındaki yanıt kuran yardımcılar (`api-auth.ts`, `tenant.ts`) sabit metin dönüyor, temiz. `invitations` `reason` alanı yalnız sabit kodlar dönüyor, temiz.
2. **Canlı sızıntı tetikleme (Y-1).** Prod build aldım (`next build`) ve `.next/standalone/server.js` ile 127.0.0.1:47975'te koştum (`DEMO_LOGIN_ENABLED=false`). Oturum çerezini `next-auth/jwt encode` ile `demo-user-alice` için bastım; çerez yalnız scratchpad'de tutuldu, yazdırılmadı. Hataları **yalnız kendi DB'mde** iki yolla enjekte ettim: (a) `Evaluation` tablosunun adını değiştirdim, (b) `User` tablosuna BEFORE UPDATE `RAISE EXCEPTION` tetikleyicisi ekledim. İkisi de sonra geri alındı.
3. **Bekçi zorlama (D-1).** `cordis/projects/route.ts:131`'deki sabit 500 gövdesini 13 alternatif sızıntı kalıbıyla değiştirip bekçiyi koştum. G14 kontrol mutantı (düz `.message`) kırmızı çıktı, yani düzenek çalışıyor.
4. cs-fb'nin `mutants.py` betiğini kendi ağacımda yeniden koştum.
5. **Stripe canlı:** sunucuyu rastgele bir `whsec_` test sırrıyla yeniden başlattım. Denediklerim: bozuk imza, imzalı ama iç hata veren olay, aynı olayın yeniden teslimi, işlenmeyen olay tipi. Ardından `StripeEventLog`'da claim sızıntısı olup olmadığına baktım. Kodda claim'in (`claimStripeEvent`) yazmalarla aynı transaction'da olduğunu doğruladım.
6. D-3'ü kod üzerinden değerlendirdim: istek başına dış çağrı sayısı ve çeviri maliyeti.
7. Kapılar: tsc, eslint, next build ve tam `npx vitest run`.

## 2. Kanıt

### 2.1 Y-1: 500 gövdesinde Prisma metni (`…-ekler/live-5xx-leak.txt`)
```
== fault 1 (only in my DB sefb75-pg :5475): ALTER TABLE "Evaluation" RENAME TO "Evaluation_sefb75"
-- POST /api/user/export (alice):
{"error":"\nInvalid `prisma.evaluation.findMany()` invocation:\n\n\nThe table `public.Evaluation` does not exist in the current database."}  HTTP 500
-- POST /api/user/export-data (alice):   (aynı gövde)  HTTP 500
-- GET /api/gdpr/export (alice):         (aynı gövde)  HTTP 500
== fault 2: BEFORE UPDATE trigger on "User" raises 'sefb75-internal-detail: tablo=User kolon=deletedAt'
-- POST /api/user/request-deletion (alice):
{"error":"\nInvalid `prisma.user.update()` invocation:\n\n\nDatabase error. Code: `P0001`. Message: `sefb75-internal-detail: tablo=User kolon=deletedAt`"}  HTTP 500
-- DELETE /api/gdpr/delete (alice):            (aynı gövde)  HTTP 500
-- DELETE /api/user/request-deletion (alice):  (aynı gövde)  HTTP 500
```
**Konum (kaynak):** `src/actions/user/export-data.ts:193-195`, `src/actions/user/request-deletion.ts:127-130` ve `:166-169`. Üçü de `const message = error instanceof Error ? error.message : …; return { success: false, error: message }` yapıyor. Route'lar bu değeri aynen döndürüyor: `NextResponse.json({ error: result.error ?? '…' }, { status })`, `status` = `'Unauthorized' ? 401 : 500`.
- `src/app/api/user/request-deletion/route.ts:19` (POST) ve `:37` (DELETE)
- `src/app/api/user/export/route.ts:13`, `src/app/api/user/export-data/route.ts:17`
- `src/app/api/gdpr/export/route.ts:14`, `src/app/api/gdpr/delete/route.ts:16`

**Etki:** O-2 ile aynı sınıf. Prisma model/metot adı, tablo adı ve veritabanı hata metni oturumlu kullanıcıya gidiyor; bir kısıt ya da tetikleyici mesajı da olabilir. Oturum gerektiği ve yalnız kullanıcının kendi GDPR isteğinde tetiklendiği için istismar edilebilirlik düşük, bu yüzden önem **ORTA**. İki dosya `'use server'` olduğu için aynı metin UI'daki server-action çağrısıyla da istemciye ulaşıyor. `'use server'` dosyalarında bu kalıbı taşıyan başka dönüş yok (grep: yalnız bu 3 satır).

**Düzeltme:** Kaynakta düzeltilmeli. Üç `catch` bloğu `console.error`/`logger.error` ile ayrıntıyı log'a yazsın ve sabit bir kod dönsün (`error: 'request_failed'` / `'export_failed'`). `'Unauthorized'` ve `'User not found'` sabitleri kalabilir. Bu tek değişiklik 6 handler'ı ve server-action yolunu birlikte kapatır. Route tarafında ayrıca `status === 500` ise gövdeyi sabitlemek de iyi bir derinlemesine savunma olur. Regresyon testi `admin-cordis-import-500.test.ts` desenini izleyebilir: action `{success:false, error:'<iç metin>'}` dönecek şekilde mock'lanır, gövdede iç metin görünmemeli. Canlı yeniden test için §2.1'deki iki enjeksiyon yeterli.

### 2.2 D-1: bekçi zorlama (`…-ekler/guard-mutants.py`, `guard-mutants-out.txt`)
```
G1 `${error}` şablon: YEŞİL (KAÇTI)
G2 JSON.stringify(error): YEŞİL (KAÇTI)
G3 (error as Error).cause: YEŞİL (KAÇTI)
G4 (error as Error).stack: YEŞİL (KAÇTI)
G5 Response.json({error: e}) çıplak: YEŞİL (KAÇTI)
G6 {error: error} açık alan: YEŞİL (KAÇTI)
G7 String(queryErr) listede olmayan ad: YEŞİL (KAÇTI)
G8 error.toString(): YEŞİL (KAÇTI)
G9 error['message'] köşeli: YEŞİL (KAÇTI)
G10 const {message}= destructure: YEŞİL (KAÇTI)
G11 değişken status + .message: YEŞİL (KAÇTI)
G12 gövde önce kurulur: YEŞİL (KAÇTI)
G13 string içinde ')' erken kapanış: YEŞİL (KAÇTI)
G14 kontrol: .message (yakalanmalı): KIRMIZI (yakalandı)
git status: temiz
```
**Etki:** Bekçi bir kara liste. Bugün ağaçta G1–G13 şekillerinin hiçbiri yok (grep: `.stack`, `.cause`, `JSON.stringify(e)`, `${e}`, `{ error: e }` → 0), yani bu bir **regresyon ağı zayıflığı**, canlı açık değil. Ama Y-1 tam olarak G11 (değişken `{ status }`) ile alan geçişinin birleşimi; kör nokta varsayımsal değil, gerçekten yaşandı. En tehlikelisi G4 (`.stack`: dosya yolları ve satırlar). G13'te parantez sayacı string içindeki `)` karakterinde erken kapanıyor.

**Düzeltme (öneri, küçük):**
- (a) Kalıp listesine `\.stack\b`, `\.cause\b`, `JSON\.stringify\(`, `\$\{\s*\w+\s*\}`, `\.toString\(\)`, `\[['"]message['"]\]` eklenmeli; `String(` için ad listesi kaldırılmalı.
- (b) Durum koşulu `status: 5xx` literaline ek olarak `{ status }` kısaltması ve `status: <tanımlayıcı>` biçimini "5xx olabilir" saymalı.
- (c) Daha güçlüsü pozitif kural: 5xx olabilen gövdede yalnız string/sayı literalleri ve `runId`/`requestId` gibi izinli alanlar olabilir.
- (d) Y-1 için ayrı bir kaynak bekçisi: `src/actions/**` altında `catch` içinde `error.message`'ı `return` edilen nesneye koyan kod kırmızı olmalı.

### 2.3 cs-fb mutantları benim ağacımda (`…-ekler/csfb-mutants-rerun.txt`)
```
MB8 cagrilar alt sınır yok: KIRMIZI (öldü)
MB11 önbellek EN YENİyi atıyor: KIRMIZI (öldü)
MB13 billing/quote 500 = (error as Error).message: KIRMIZI (öldü)
MB14 cagrilar 500 = String(error) (yalnız bekçi): KIRMIZI (öldü)
MS1 stripe webhook eski gövde geri: KIRMIZI (öldü)
MS2 cordis import importRes.error geri: KIRMIZI (öldü)
MS3 cordis import 503 + err.message (çok satırlı): KIRMIZI (öldü)
```
MB11 testini okudum: "sondan ikinci kayıt önbellekte" kontrolü doğru ayırt edici, cs-fb'nin gerekçesi yerinde. `admin-cordis-import-500.test.ts`, alan geçişini bekçiden bağımsız olarak davranış testiyle sabitliyor; iyi. Y-1 için de aynı desen önerilir.

### 2.4 Stripe webhook: 400/500 ayrımı ve yeniden deneme (`…-ekler/live-stripe.txt`)
```
-- mevcut sunucu (.env STRIPE_WEBHOOK_SECRET boş), imzasız POST:
Webhook Error: Missing STRIPE_WEBHOOK_SECRET  HTTP 400
-- (rastgele whsec_ test sırrıyla yeniden başlatıldı; sır dosyaya yazılmadı)
-- bozuk imza: HTTP 400 text/plain Webhook Error: No signatures found matching the expected signature for payload. …
-- imzalı, bilinmeyen abonelik (1. teslim): HTTP 500 application/json {"error":"internal_error"}
-- aynı olay yeniden teslim (Stripe retry): HTTP 500 application/json {"error":"internal_error"}
-- imzalı, işlenmeyen tip: HTTP 200 application/json {"received":true}
-- StripeEventLog evt_sefb75_*: 0
```
- **Ayrım doğru:** imza hatası 400, iç hata 500. 500 gövdesi sabit, ayrıntı yalnız sunucu log'unda (`Error processing webhook: Unable to determine tenantId from subscription sub_sefb75_unknown`).
- **Yeniden deneme güvenli:** `claimStripeEvent(tx, …)` (`src/lib/billing/subscription-sync.ts:481`, `:759`) yazmalarla aynı transaction'da. İç hata claim'i geri alıyor (canlıda `StripeEventLog` 0 satır), böylece Stripe'ın yeniden teslimi olayı gerçekten yeniden işliyor; olay kaybolmuyor. İkinci teslim de 500 aldı, yani hata yutulmadı. Stripe 400'ü de yeniden dener; imzası tutmayan bir istek zaten Stripe'tan gelmediği için bu bir sorun değil.
- **D-2 (DÜŞÜK, cs-fb §5 teyit):** 400 gövdesi kimliksiz her çağırana `Missing STRIPE_WEBHOOK_SECRET` diyerek yapılandırma durumunu ve Stripe SDK'nın uzun yardım metnini veriyor. Düzeltme: `new NextResponse('invalid_signature', { status: 400 })`, ayrıntı zaten satır 27'de log'da.
- **Ö-1:** `route.ts:102` `err.message?.includes('already processed')` dalına hiçbir yol ulaşmıyor. `src` içinde bu metni fırlatan kod yok; eşzamanlı claim `StripeEventAlreadyClaimed` → `null` ile içeride yutuluyor. Zararsız ölü kod.

### 2.5 D-3 değerlendirmesi (kararın incelemesi)
`/api/cagrilar` önce `requireTenantApi()` çağırıyor, yani oturum ve kiracı şart. Tek bir istek şunları tetikleyebiliyor: en fazla `MAX_PAGES`=5 SEDIA çağrısı × `pageSize` ≤ 50 (alt sınır artık 1, testli), ayrıca `lang=tr` ise ≤250 başlık ve açıklama için `api.mymemory.translated.net` çağrısı (`src/lib/translation.ts:95`). MyMemory'nin anonim kullanımında IP başına günlük karakter kotası var. 5000 kayıtlık önbellek tekrar eden aramaları karşılıyor, ama farklı anahtar kelimelerle önbellek atlanır. Kötü niyetli ya da hatalı bir oturumlu istemci döngüsü **paylaşılan çıkış IP'sinin çeviri kotasını tüketip tüm kiracılarda Türkçe çeviriyi düşürebilir**. SEDIA tarafında da IP kısıtlaması riski var. Bu bir kullanılabilirlik ve maliyet riski; veri sızıntısı değil.
- **cs-fb'nin kararına katılıyorum:** DB tabanlı kullanıcı-başı sınır migration ister ve bu kartın kapsamını aşar. Ayrı kart doğru.
- **Önem:** DÜŞÜK→ORTA. Saldırgan müşteri olmak zorunda ve istekler oturumla ilişkilendirilebiliyor, ama etki kiracılar arası.
- **Öneri:** Kart açılana kadar süreç-içi `Map<userId, {windowStart,count}>` ile `cagrilar` için örneğin dakikada 20 istek ve 429 `Retry-After` uygulanabilir. Migration gerektirmez. cs-fb'nin "instance sayısıyla çarpılır" itirazı doğru, ama çarpan bilinen ve sınırlı bir sayı; sınırsızdan iyidir. Kalıcı çözüm cs-fb'nin önerdiği `UserRateWindow` + tek `UPDATE … RETURNING`. Karar liderin.

### 2.6 Kapılar (`…-ekler/gates.txt`)
```
tsc --noEmit exit=0
eslint src tests exit=0
next build exit=0 (1:14)
npx vitest run (4. koşu, izole DB hazır) exit=0
 Test Files  267 passed | 6 skipped (273)
      Tests  3205 passed | 73 skipped (3278)
```
Önceki üç koşudaki kırmızılar ortamdan geldi, kod kaynaklı değildi; hepsi `gates.txt`'te kayıtlı:
- (1) Dump roller olmadan geldiği için `fabrika_app` yoktu → repo'nun `scripts/setup-rls-role.ts` + `apply-rls.ts` betiklerini yalnız :5475'e koştum.
- (2) Paylaşılan :5433'ten alınan dump'ta `ApiKey.rateWindowCount/rateWindowStartedAt`, `Membership.staleDigestOn`, `Relationship.staleRemindedContactAt` yoktu. Bunların SQL dosyaları repoda mevcut (`prisma/migrations/add-api-key-rate-window.sql`, `m4-stale-reminder-idempotency.sql`; proje `db push` + `apply-migrations.sh` akışını kullanıyor, bkz. `docs/RELEASE_CHECKLIST.md`). Yani paylaşılan yerel DB'ye bu SQL'ler henüz uygulanmamış; bu bir yerel ortam gecikmesi, migration eksikliği değil. Kendi DB'mi `prisma db push` ile eşitledim.
- (3) 9 kırmızı, §2.1'den kalan kendi `sefb75_boom` tetikleyicimdendi; sildim, `gdpr-data-subject.live` 20/20 geçti.

## 3. Değişen dosyalar
Kod değiştirilmedi. Yalnız:
- `docs/agent-results/TASK-MUNWZ3RNUNU2K-se-fb.md`
- `docs/agent-results/TASK-MUNWZ3RNUNU2K-se-fb-ekler/` (`live-5xx-leak.txt`, `live-stripe.txt`, `guard-mutants.py`, `guard-mutants-out.txt`, `csfb-mutants-rerun.txt`, `gates.txt`)

## 4. Riskler
- Y-1 açık kaldığı sürece GDPR uçlarında DB hatası olursa iç metin istemciye gider. Tetiklemek için kullanıcının kendi oturumu ve bir sunucu hatası gerekiyor, yani saldırganın tetiklemesi zor. Ama bir göç ya da kısıt hatası sırasında gerçek kullanıcıya şema bilgisi gösterilir.
- Paylaşılan :5433 DB'sine `add-api-key-rate-window.sql` ve `m4-stale-reminder-idempotency.sql` uygulanmamış (§2.6). Bu DB'ye karşı koşan diğer ajanların live testleri `ColumnNotFound` ile kırmızı görebilir. Kod riski değil; yalnız yerel ortam. İlk şüphem (migration eksikliği) repo kontrolünde yanlış pozitif çıktı.

## 5. Açık sorular
- D-3 ara çözümü (süreç-içi sayaç) kabul edilir mi, yoksa doğrudan DB tabanlı kart mı açılsın? Karar liderin.

## 6. Sonraki adım
1. **Takip kartı (zorunlu):** Y-1. Üç `catch` bloğu sabit kod dönsün; 6 handler için davranış testi eklensin; §2.1'deki iki enjeksiyonla canlı yeniden test yapılsın.
2. Aynı karta ya da ayrı karta D-1: bekçi sertleştirme (a)–(d); G1–G13 mutantları kırmızı olmalı.
3. D-2: webhook 400 gövdesi sabitlensin (küçük).
4. D-3 için lider kararı. İsteğe bağlı: paylaşılan :5433'e iki eksik SQL'in uygulanması (DevOps, sahibinin onayıyla).

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64). Prod build + standalone sunucu, izole Docker Postgres. Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. İncelenen kod platforma bağlı değil: HTTP gövdeleri, Prisma hata metni ve kaynak metni okuyan bir test (`node:fs` + `path.join/relative`, ayırıcıdan bağımsız). Süreç, kabuk ya da dosya yolu kodu yok. Linux prod imajında aynı davranış beklenir. Y-1'deki sızıntı metni Prisma'dan gelir ve platformdan bağımsızdır.
