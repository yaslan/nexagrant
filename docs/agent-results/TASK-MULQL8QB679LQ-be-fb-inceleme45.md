# İNCELEME-45 (Sprint FB-KAMU-2) — be-fb

Kod değiştirilmedi. İnceleme temiz bir worktree'de yapıldı (`git worktree add --detach … dev`, HEAD `b17d2ed2`, `pnpm install --frozen-lockfile`, `prisma generate`). DB olarak `fabrika` DB'sinin izole kopyası `befb_i45` kullanıldı (`pg_dump | psql`, fabrika-postgres içinde). Paylaşılan `fabrika` DB'sine yazılmadı.

| Kart | Karar |
|---|---|
| **TASK-MULQL8QB679LQ** (fe-fb), `935ef391` + `b17d2ed2`: K6 admin PDF yükleme | **DÜZELTME GEREKLİ**: B-1, B-2 |
| **TASK-MUN3OAFIVW9NA** (cs-fb), `10173a08`: İNCELEME-39 B-1..B-3 düzeltmesi | **ONAY** (Ö-1 küçük, ayrı iş) |

---

## 1) Kart 1 — TASK-MULQL8QB679LQ: K6 yönetici PDF yükleme

### Bulgular
**B-1 (DÜZELTME): Sayfa ya da parça sayısına sınır yok. Küçük bir PDF yüz binlerce gömme çağrısı açıyor ve ayrıştırma süresince web süreci hiçbir isteğe yanıt vermiyor.**
20 MB sınırı yalnız sıkıştırılmış dosya boyutunu tutuyor. Aynı içerik akışını (`/Contents 3 0 R`) paylaşan N sayfalı bir PDF ürettim. Sayfa başına maliyet 156 bayt. Gömme yapmadan `processPdfAndStore`'un yolunu ölçtüm (`PDFParse.getText` + `chunkText(…,1000,200)`):
```
pages-1.pdf        718 B        6 411 karakter        9 parça   569 ms
pages-1000.pdf     156 388 B    6 415 893 karakter    8 020 parça   1,7 s
pages-5000.pdf     788 388 B    32 083 893 karakter   40 105 parça  9,8 s   maxRSS 730 MB
pages-30000.pdf    4 778 402 B  192 558 894 karakter  240 699 parça 265,6 s maxRSS 1,03 GB
```
Olay döngüsü ölçümü: aynı süreçte bir HTTP sunucusuna 50 ms arayla ping atıldı.
```
pages-5000  {"parseMs":9698,"pingsAnsweredDuringParse":0,"expectedIfFree":186}
pages-1000  {"parseMs":1564,"pingsAnsweredDuringParse":0,"expectedIfFree":30}
```
Sonuçlar:
- pdf.js metni ana thread'de çıkarıyor. 4,8 MB'lık bir dosya Next sürecini yaklaşık **4,5 dakika** boyunca tüm kiracılara yanıtsız bırakır. Doğrusal olarak 20 MB'a yakın bir dosya ~18 dakika eder ve bellek sınırına takılabilir.
- Ayrıştırma bitince parçalar sırayla gömülüyor, parça başına bir çağrı. fe-fb'nin ölçtüğü 192 token/parça ile hesap: 240 699 parça ≈ 46 M token ≈ **~6 USD** (text-embedding-3-large, 0,13 USD/M). Bu çağrılar saatler sürer. İstek zaman aşımına uğrasa da sunucuda devam eder ve iptal edilemez. Bu bir tahmindir, gerçekten harcanmadı.
- Yalnız platform yöneticisi yükleyebildiği için saldırı yüzeyi dar. Ama bu kart "zip bomb benzeri çok sayfalı PDF"i ve embedding maliyetini açıkça soruyordu, ve koruma yok.

Önerilen düzeltme (küçük, `processPdfAndStore` ya da rota içinde, `Document` yaratılmadan önce):
- `getText({ first: MAX_PAGES })` kullanılmalı ve `total > MAX_PAGES` ise ret verilmeli (`too_many_pages`, 413). Örneğin 1500 sayfa; bir HE çalışma programı birkaç yüz sayfadır.
- `chunks.length > MAX_CHUNKS` ise (örn. 5000) gömme başlamadan ret verilmeli (`too_many_chunks`).
- Her ikisi için birim testi ve mutant kanıtı eklenmeli.

**B-2 (DÜZELTME): `no_text` (422) gerçek girdide hiç tetiklenmiyor. Taranmış PDF, sayfa ayırıcı metinle ödenerek gömülüyor.**
pdf-parse 2.4.5 `getText()` varsayılan olarak her sayfanın sonuna `\n-- N of M --` ekliyor (`ParseParameters.pageJoiner`). Bu yüzden metin katmanı hiç olmayan bir PDF bile boş değil:
```
blank.pdf       "\n\n-- 1 of 1 --\n\n" chunks 1
notext-15mb.pdf "\n\n-- 1 of 1 --\n\n" chunks 1
```
Canlı HTTP'de (dev :3945, izole DB, bilerek geçersiz OpenAI anahtarı): 15 MB'lık metinsiz PDF `422 no_text` yerine gömmeye gitti ve `500 upload_failed … OpenAI embeddings error 401` döndü. Geçerli bir anahtarla bu dosya "başarılı" sayılır ve korpusa `-- 1 of 1 --` parçası yazılır. 300 sayfalık taranmış bir belge 300 çöp parça demek; bu parçalar her kiracının top-K'sına karışır. fe-fb raporu (§1.2) ve UI metni ("Taranmış (yalnız görüntü) PDF kabul edilmez") bu davranışı vaat ediyor. Birim testi `getText`'i mock'ladığı için boşluğu görmüyor (`tests/rag-pdf-ingest-partial.test.ts:21`).
Düzeltme: `getText({ pageJoiner: '' })` kullanılmalı (ya da `-- \d+ of \d+ --` satırları atılmalı). Gerçek pdf-parse ile boş sayfalı PDF için 422 veren bir test eklenmeli. Fixture olarak repo'daki `syntheticPdf([])` deseni kullanılabilir.

**Ö-1 (öneri): üç mutant hayatta kaldı.** Aşağıdaki §1.2'de. En önemlisi M9: imza kontrolü `%PDF` (tire olmadan) olarak gevşetilirse hiçbir test kırmızı olmuyor. M7 (`allowDuplicate` herhangi bir değerle açılıyor) ve M10 (beyan edilen `content-length` ön kontrolü silindi) de yeşil kalıyor. M10'un davranış etkisi yok, çünkü gerçek boyut kontrolü yakalıyor. Yalnız erken reddetme kaybolur. Birer test satırı yeterli.

**Ö-2 (gözlem, kart dışı):** Paylaşılan `fabrika` DB'sinde 46 adet `tenantId NULL`, `title='Shared Work Programme'`, 0 parçalı `Document` satırı var (07–11.09.2026). Kaynak `tests/e2e/rls.spec.ts` kalıntısı. Yeni sayfa bunları listeliyor (bkz. kareler) ve aynı başlıkla yapılan yükleme 409 alır. Temizlik ve spec'in kendi satırını silmesi için ayrı kart açılmalı. Dokunulmadı.

**Ö-3 (küçük):** `upload_failed` yanıtı sağlayıcının ham hata metnini yöneticiye döndürüyor (`OpenAI embeddings error 401: {… "Incorrect API key provided: sk-befb-*…`). Anahtarın kendisi maskeli, alıcı yalnız platform yöneticisi. Yine de gövde yerine kısa bir kod daha temiz olur.

### Doğru çalışanlar (kanıtlı)
Canlı HTTP. Kendi `next dev -p 3945` sunucum, izole DB, `OPENAI_API_KEY` geçersiz (harcama 0), oturum çerezleri repo e2e deseniyle imzalandı:
```
BEFORE 46 docs / 0 chunks                     (tenantId NULL)
page /tr/admin/documents admin                200
page /en/admin/documents admin                200
page /tr/admin/documents member               404
page /tr/admin/documents anon                 404
member real-looking pdf                       403 PLATFORM_ADMIN_REQUIRED
anon                                          401 UNAUTHENTICATED
admin html spoofed as application/pdf         415 {"error":"not_pdf"}
admin " %PDF-" after BOM/space                415 {"error":"not_pdf"}
admin %PDF- + garbage (parser fails)          500 {"error":"upload_failed","message":"Invalid PDF structure."}
admin kind=tenant_upload                      400 {"error":"bad_kind"}
admin title 201 chars                         400 {"error":"bad_title","maxLength":200}
admin title whitespace                        400 {"error":"bad_title","maxLength":200}
admin 15MB valid no-text PDF                  500 upload_failed (OpenAI 401)   ← B-2: 422 bekleniyordu
admin 21MB (declared length)                  413 {"error":"too_large"} 21ms
admin text PDF, embedding key invalid         500 upload_failed
admin 60MB chunked, no content-length         413 {"error":"too_large"} 90ms
AFTER  46 docs / 0 chunks
```
- **Content-Type sahteleme:** karar baytlarda veriliyor. HTML, `application/pdf` olarak gönderildiğinde 415 aldı.
- **Büyük gövde:** `content-length` yokken (chunked) 60 MB gövde 90 ms'de 413 ile reddedildi. 15 MB'lık geçerli gövde bozulmadan geldi. `src/proxy.ts` matcher'ı `/api`'yi dışarıda bırakıyor, bu yüzden Next'in 10 MB `proxyClientMaxBodySize` kırpması bu rotayı etkilemiyor.
- **Yarım Chunk:** gömme hatası sonrası `Document`/`Chunk` sayısı değişmedi (46/0 → 46/0). Yarıda kalan hata için `discardPartialDocument` birim testle kilitli (M8 kırmızı). Artık risk: süreç ingest ortasında ölürse (deploy/OOM, bkz. B-1) yarım belge kalır ve alarm yazılmaz. B-1'in sınırı bu pencereyi de daraltır.
- **Yarış:** `findSharedDocumentByTitle` ile yazma arasında kilit ya da unique yok. Aynı başlıkla eşzamanlı iki yükleme ikisi de geçer. Tek admin ve UI kilidi var, bu yüzden düşük risk. Kesin çözüm fe-fb'nin önerdiği `contentSha256` + unique.

### 1.1 tr / en / 390px — gerçek tarayıcı
Sistem Chrome'u (headless, Playwright kütüphanesi `channel:'chrome'`), admin çerezi. Dosya seçildi, "Yükle" butonuna tıklandı:
```
{"loc":"tr","w":390,"h1":"Belgeler (K6 RAG)","hScrollPx":0,"autofilledTitle":"notes"}
{"loc":"en","w":390,"h1":"Documents (K6 RAG)","hScrollPx":0,"autofilledTitle":"notes"}
{"loc":"tr","w":1280,"h1":"Belgeler (K6 RAG)","hScrollPx":0,"autofilledTitle":"notes"}
```
Karelerde hata kartı görünüyor: "Bu dosya PDF değil." / "This file is not a PDF." 390px'te yatay kaydırma 0. Kareler: `docs/agent-results/TASK-MULQL8QB679LQ-be-fb-inceleme45-shots/{tr-390,en-390,tr-1280}.png`. en karesindeki "Dosya Seç" yazısı Chrome'un yerel dosya düğmesi (tarayıcı dili tr), uygulama metni değil.

### 1.2 Mutantlar (`admin-upload-authz` + `rag-pdf-ingest-partial` + `rag.test`, taban 37/37)
```
BASE Tests  37 passed (37)
RED M1 %PDF- imza kontrolu silindi -> Tests  1 failed | 36 passed (37)
RED M2 kind allowlist silindi -> Tests  1 failed | 36 passed (37)
RED M3 gate.ok donusu silindi -> Tests  2 failed | 35 passed (37)
RED M4 duplicate kontrolu silindi -> Tests  1 failed | 36 passed (37)
RED M5 gercek boyut kontrolu 2x gevsetildi -> Tests  1 failed | 36 passed (37)
RED M6 baslik ust siniri >= yerine > ... +1 -> Tests  1 failed | 36 passed (37)
ALIVE M7 allowDuplicate herhangi deger kabul -> Tests  37 passed (37)
RED M8 hata yolunda discardPartialDocument silindi -> Tests  2 failed | 35 passed (37)
ALIVE M9 imza 4 bayt (%PDF, tire yok) -> Tests  37 passed (37)
ALIVE M10 declared content-length kontrolu silindi -> Tests  37 passed (37)
RESTORED Tests  37 passed (37)
git clean
```
7/10 kırmızı. Her mutant tek eşleşme assert'iyle uygulandı ve yedekten geri yüklendi.

---

## 2) Kart 2 — TASK-MUN3OAFIVW9NA: İNCELEME-39 B-1..B-3 düzeltmesi → **ONAY**

### 2.1 Kendi geri dönüşlerim (A1–A7) + ek mutantlar
Paket: `app-url.test`, `calendar provider.test`, `app-url-self-links`, `mailer.test`, `m9-calendar-connect`, `invitation-mail-limit.live` (izole DB). Taban 89/89. `invitation-mail-limit.live` atlanmadan koştu.
```
BASE Tests  89 passed (89)
RED   A1 instrumentation reportAppUrlProblem() silindi -> Tests  1 failed | 88 passed (89)
RED   A2 api-keys apiBaseUrl="https://fabrika.app" -> Tests  1 failed | 88 passed (89)
RED   A3 alerts-daily NEXT_PUBLIC_APP_URL || app.fabrika.io -> Tests  2 failed | 87 passed (89)
RED   A4 invitations mailBaseUrl ?? localhost -> Tests  2 failed | 87 passed (89)
RED   A5 layout metadataBase localhost -> Tests  1 failed | 88 passed (89)
RED   A6 google access_type offline silindi -> Tests  1 failed | 88 passed (89)
RED   A7 digest-run app.fabrika.io -> Tests  1 failed | 88 passed (89)
RED   K1 appBaseUrl prod problem kapisi silindi -> Tests  8 failed | 81 passed (89)
RED   K2 insecure kontrolu silindi -> Tests  6 failed | 83 passed (89)
RED   K3 ham ?/# kontrolu silindi (yalniz search/hash) -> Tests  1 failed | 88 passed (89)
RED   K4 google appBaseUrl yerine appUrl (fallback'li) -> Tests  1 failed | 88 passed (89)
RED   K5 invitation mail policy appUrl fallback -> Tests  4 failed | 85 passed (89)
RED   K6 origin yerine href -> Tests  2 failed | 87 passed (89)
RESTORED Tests  89 passed (89)
git clean
```
cs-fb'nin 7/7 iddiası doğrulandı. İNCELEME-39'da bu 7 geri dönüşün 7'si de hayatta kalıyordu. K1–K6 benim ek mutantlarım, 6/6 kırmızı.

### 2.2 Üretim davranışı (her değer ayrı süreç, `NODE_ENV=production`, gerçek `invitationMailBaseUrl()` + `GoogleCalendarProvider.connect()`)
```
"http://fonbridge.com"         problem insecure mail null  cal REFUSED CALENDAR_APP_URL_NOT_CONFIGURED
"https://fonbridge.com/?x=1"   problem invalid  mail null  cal REFUSED CALENDAR_APP_URL_NOT_CONFIGURED
"https://fonbridge.com#a"      problem invalid  mail null  cal REFUSED …
"https://fonbridge.com?"       problem invalid  mail null  cal REFUSED …
"https://fonbridge.com/app"    problem invalid  mail null  cal REFUSED …
"https://u:p@fonbridge.com"    problem invalid  mail null  cal REFUSED …
"http://localhost:3000"        problem loopback mail null  cal REFUSED …
"https://localhost" / "https://127.1" / "https://2130706433" / "https://[::1]" / "https://0"   loopback, mail null, cal REFUSED
"https://fonbridge.com/%3Fx"   problem invalid  mail null  cal REFUSED …
"https://[::]"                 problem null     mail https://[::]  cal START https://[::]/api/calendar/callback   ← Ö-1
"HTTPS://FONBRIDGE.COM" / ":443/" / "/." / "https:fonbridge.com" / "  https://fonbridge.com  " / "https://fonbridge.com/"
                               problem null     mail https://fonbridge.com  cal START https://fonbridge.com/api/calendar/callback
```
Canlı rota testi (izole DB, verbose):
```
✓ … without a usable NEXT_PUBLIC_APP_URL in production nothing is mailed and an error alert is raised
✓ … the mailed link is built from NEXT_PUBLIC_APP_URL and the subject carries a cut tenant name
✓ … refuses to build a redirect_uri without a usable NEXT_PUBLIC_APP_URL
✓ … builds the redirect_uri from the origin only
Tests  35 passed (35)
```
Sonuç: üretimde http, localhost, sorgu ya da `#` içeren her değerde davet e-postası gitmiyor (`mail null` → mevcut `app_url_not_configured` dalı) ve takvim yetkilendirmesi başlamıyor. Geçerli değer (büyük harf, `:443`, sonda `/`, boşluk) origin'e normalize ediliyor ve çalışıyor.

**Ö-1 (küçük, ayrı iş, ONAY'ı engellemez):** `https://[::]` (IPv6 belirtilmemiş adres) loopback sayılmıyor. `0.0.0.0` ise sayılıyor. `isLoopback`'e `h === '[::]'` eklenmesi yeterli. Pratikte bir operatörün bu değeri yazması çok düşük olasılık, sonuç da http değil https.

cs-fb Ö-1 (path ve kimlik bilgisini `invalid` saymak): **kabul**. `appBaseUrl` yalnız origin döndürdüğü için sessiz kaybı önlüyor. `basePath` bugün yok.

---

## 3) Kapılar (temiz worktree, HEAD `b17d2ed2`)
```
npx tsc --noEmit → tsc=0
Tam süit, izole DB befb_i45:
 1. koşu: Test Files 1 failed | 234 passed | 2 skipped (237) · Tests 1 failed | 2744 passed | 8 skipped
    tek kırmızı: tests/agency-invite.live.test.ts "scope is not left open" — 55P03 lock timeout (paralel yük)
    tek başına: Tests 18 passed (18)
 2. koşu: Test Files 235 passed | 2 skipped (237) · Tests 2745 passed | 8 skipped (2753) · exit=0
```
Kırmızı, incelenen kartlarla ilgisiz bir yük kaynaklı flake (kilit zaman aşımı). İkinci tam koşu temiz.

## 4) Değişen dosyalar
Kod değişmedi. Yalnız bu rapor ve `docs/agent-results/TASK-MULQL8QB679LQ-be-fb-inceleme45-shots/` (3 PNG) eklendi.

## 5) Temizlik
- Kendi `next dev -p 3945` sürecim kapatıldı.
- Worktree'deki geçici `zz-befb-*.mts` dosyaları silindi. Mutantların hepsi geri yüklendi, `git status` temiz.
- Worktree kaldırıldı ve `DROP DATABASE befb_i45` yapıldı (bkz. §7).
- Test verisi: izole DB dışında hiçbir satır yazılmadı. İzole DB'de de canlı yüklemeler satır bırakmadı (46/0 → 46/0).
- Listede görülen `befb_b4` DB'sine dokunulmadı; bu oturumda yaratılmadı.

## 6) Sonraki adım
1. **fe-fb (TASK-MULQL8QB679LQ düzeltme):** B-1 (sayfa/parça sınırı, `Document` yaratılmadan önce, test + mutant), B-2 (`pageJoiner: ''`, gerçek pdf-parse ile 422 testi), Ö-1 (M7/M9/M10 test satırları).
2. Ayrı kart: `rls.spec.ts` kalıntısı 46 satırlık "Shared Work Programme" temizliği (Ö-2).
3. Ayrı küçük kart: `isLoopback` → `[::]` (kart 2 Ö-1).
4. Kart 2 **ONAY**. Deploy öncesi canlı `NEXT_PUBLIC_APP_URL=https://fonbridge.com` kontrolü patron/devop'ta (cs-fb §6.2).

## 7) Platform beyanı
- Doğrulama **macOS**'ta (Darwin 27.0.0, Node 26.5, zsh) yapıldı: Postgres Docker'da, tarayıcı sistem Chrome'u (headless).
- İncelenen kod yolları platformdan bağımsız: WHATWG `URL`, `FormData`, bellek içi PDF baytları, pdf.js. B-1'deki olay döngüsü tıkanması pdf.js'in Node'da ana thread'de çalışmasından geliyor. Bu davranış Linux'ta (CI ve üretim) da aynı olmalı. Üretim konteynerinin bellek sınırına göre OOM daha erken gelebilir.
- Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var.
