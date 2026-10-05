# TASK-MULQMFVLJYZ5V — FB MVP kabul ölçümü (PROJECT.md §8 madde 1, 3, 6, 7) — se-fb

**Tarih:** 29.09.2026 · **Ortam:** `dev` dalı (`bec7b483`), mevcut `next dev` sunucusu `:3000` (cwd FONBRIDGE), yerel Postgres `fabrika` (:5433), gerçek Google Chrome (Playwright `channel:'chrome'`, headless) · **Kod değişikliği:** yok
**Platform beyanı:** yalnız **macOS** (Darwin 27, arm64) üzerinde ölçüldü. Ölçülen yollar tarayıcı + HTTP + Postgres; platforma bağlı kod yolu yok (süreç öldürme, kabuk, dosya yolu ayrımı kullanılmadı). K2 içe aktarıcısı geçici zip'i `process.cwd()/tmp_cordis` altına `path.join` ile yazıyor, Windows/Linux'ta da aynı davranmalı. Windows/Linux **koşulamadı**: bu makinede yalnız macOS var.

> Not: Kartın board açıklamasını okuyamadım. `list_tasks` yalnız başlığı döndürüyor, açıklamayı döndürmüyor. Kapsam kart başlığından, görev metninden ve PROJECT.md §8'den alındı.

## Özet tablo

| # | Kabul maddesi (§8) | Sonuç | Ölçülen değer | Engel / neden |
|---|---|---|---|---|
| 1a | Yeni kiracı 5 dk'da kaydolur | **GEÇTİ** (demo e-posta yolunda) | Davet linki açıldı → kiracı oluştu: **1,57 sn** (otomatik; insanın form doldurma süresi dahil değil) | Google OAuth yolu ölçülmedi: bir insanın Google test hesabı gerekiyor (pilot kapısı c) |
| 1b | Keşif planında kayıtlı arama oluşturur | **GEÇTİ** | Davet linkinden kayıtlı arama satırına kadar: **2,36 sn**; DB'de `notify=true` | Yok |
| 1c | 24 saat içinde e-posta uyarısı alır | **KALDI, ölçülemedi** | Gönderim yok. İş, gönderim olmadan `emailsSent:1` raporluyor | `RESEND_API_KEY` boş, Inngest dev sunucusu yok. Bir de **sahte başarı hatası** var (B-1) |
| 3a | K2, CORDIS HE dökümünü < 30 dk'da işler | **KALDI** | Gerçek dökümle koşu **535 sn sonra FAILED**. 23.613 projeden yalnız 22'si yazıldı | **İçe aktarıcı hatası** (B-2); dış kaynak da yavaş (~50–150 KB/s) |
| 3b | M1: `HORIZON-CL5-2026-09-D4` öneki için ilk 20 koordinatör < 2 sn | **KALDI (özellik yok)** | Aynı sorgu gerçek hacimde SQL düzeyinde **1,6–7,5 ms** (bilgi amaçlı) | Konu önekine göre koordinatör listesi UI/API'de yok (B-3). Örnek önekle eşleşen **0 proje** var (Ö-2) |
| 6 | Ekip planı M6'yı açmaya çalışınca eklenti satın alma akışı açılır, Stripe test ödemesinden sonra M6 `on` olur | **KALDI, ölçülemedi** | Checkout **200 / 57 ms**, "Stripe ödeme simülasyonu"na düşüyor. Sonrasında abonelik/modül/kredi = 0/0/0 (doğru) | Stripe anahtarları boş (patron TASK-MULQM3LFB4KRA). **M6 eklentisi katalogda yok**, bilerek satın alınamaz (`UNPRICED_ADDONS`) |
| 7 | Concept note < 90 sn, kredi düşer, YZ günlüğü yazılır, "YZ kullanım beyanı" tek tıkla dışa aktarılır | **KALDI, ölçülemedi** | Üretim denenemedi | `ANTHROPIC_API_KEY` boş. Yeni kiracıda M2 plan dışı ve kredi 0. **YZ beyanı için UI yok** (B-4) |

**Pilot kapsamı (davet kodu, karne, radar):** uçtan uca çalışıyor. Ajans panelinde kod üretildi, davet bandı göründü, kayıt sonrası kod kullanıldı (`usedCount` 0→1), il (`Samsun`) kiracıya yazıldı. Karne 5 adımda tamamlandı (otomatik **2,97 sn**), radar (`/tr/belediye-cagrilari`) **200 / 0,74 sn**.

## 1) Ne yapıldı

1. **Madde 1, gerçek tarayıcı:** Betik tek geçişte şu akışı sürdü:
   1. Ajans (`b2v0219-ajans@example.org`) `/tr/ajans` sayfasında davet kodu üretti.
   2. Yeni üretici `/tr/kayit?kod=…` adresini açtı. Davet bandı göründü. E-posta ve il girildi, onay kutusu işaretlendi, gönderildi.
   3. `/tr/default/calls` sayfasında "hydrogen" arandı ve **Aramayı Kaydet**'e tıklandı.
   4. `/tr/fon-hazirlik` karnesi baştan sona dolduruldu.
   5. `/tr/belediye-cagrilari` açıldı.

   Süreler `performance.now()` ile ölçüldü. Sonuç DB'den ayrıca doğrulandı.
2. **Madde 1c:** Uygulamanın kendi `sendSavedSearchAlerts()` fonksiyonu yalnız benim test satırım için çağrıldı. `since` = 30 gün önce, bellekte verildi.
3. **Madde 3:** Paylaşımlı DB kirlenmesin diye **izole** `fabrika_sefb_k2` veritabanı açıldı. Şema `prisma db push` ile kuruldu, çünkü migration zinciri sıfırdan oynatılamıyor (Ö-4). `runCordisImport({dataset:'HORIZON'})` gerçek URL'e karşı koşuldu. Hata kök nedeni csv-parse'ın aynı ayarlarıyla tekrar üretildi. Gerçek hacim (145.909 katılım, 23.613 konu) izole DB'ye yüklenip koordinatör sorgusu ölçüldü. İş bitince izole DB **silindi**.
4. **Madde 6:** Yeni kiracıyla `/tr/default/settings/billing` sayfasında "Sepete ekle" → "Stripe ile ödemeye geç" tıklandı. Ardından DB'de hak (abonelik/modül/kredi) verilip verilmediğine bakıldı.
5. **Madde 7:** Yeni kiracıyla `/tr/default/concept-notes` ve `/tr/default/settings/modules` açıldı. Kodda `generateCompletion` sırası ve `generateAiUsageDeclaration` çağıranları incelendi.

## 2) Kanıt

Kareler: `docs/agent-results/TASK-MULQMFVLJYZ5V-screenshots/` (01–12). Davet kodu karelerde maskelendi, yalnız son 4 hanesi (`ATHB`) görünüyor. Ham süreler: `olcum-madde1.json`.

**Madde 1, betik çıktısı (`olcum-madde1.json`):**
```
"inviteHint": "ATHB", "msRegisterPageVisible": 416, "msAccountCreated": 1572,
"landedOn": "/tr/default/dashboard", "saveError": 0, "msSavedSearchCreated": 2363,
"msKarneCompleted": 2972, "radarStatus": 200, "msRadarLoaded": 738
```
**DB doğrulaması:**
```
User sefb-kabul-1790663367246@example.org → TENANT_OWNER, tenant org-mssulp, kind ORGANIZATION, province "Samsun"
SavedSearch cmumaqln2002bndxk7eginpmm name "hydrogen" notify=true filters {"q":"hydrogen","status":["OPEN","FORTHCOMING"]}
AgencyInviteCode codeHint ATHB usedCount 1 label "se-fb kabul ölçümü 1790663367246"
```
Kareler 02–05: davet bandı, dolu form, kayıt sonrası ilk ekran, "Arama kaydedildi (hydrogen). Yeni çağrılar için e-posta bildirimi alacaksınız."

**Madde 1c:**
```
RESEND_API_KEY set: false
result {"emailsSent":1,"emailsFailed":0,"emailsSkipped":0,"errors":[]}
lastRunAt after 2026-09-29T06:30:23.834Z
```
Hiçbir e-posta gitmedi, ama iş bunu "gönderildi" diye sayıyor ve `lastRunAt`'ı ilerletiyor. Anahtar sonradan eklense bile bu aralıktaki eşleşmeler bir daha gönderilmez. `:8288` dinlenmiyor, yani Inngest cron (`0 8 * * *`) bu ortamda hiç tetiklenmez.

**Madde 3, gerçek içe aktarım (`/usr/bin/time -l`):**
```
{"success":false,"rowCounts":{"projects":0,...},"durationMs":534964,
 "error":"Invalid `prisma.cordisParticipation.upsert()` ... Foreign key constraint violated on the constraint: `CordisParticipation_projectId_fkey`"}
535.77 real
izole DB sonrası: CordisProject 22 · CordisOrganization 709 · CordisParticipation 0 · CordisImportRun FAILED
```
Dökümün gerçek boyu (Python `csv`, `;` ayraç):
```
project.csv rows 23613 · organization.csv rows 145909 · topics.csv rows 23613
```
İçe aktarıcının csv-parse ayarlarıyla tekrar üretim:
```
project.csv      importer records 63   skipped 831 Invalid Closing Quote: found non trimable byte after quote at line 24
project.csv      noSkip   ERROR after 22
organization.csv importer records 1248 skipped 909 Invalid Closing Quote ... at line 1250
```
24. satırdaki bayt dizisi: `…"HORIZON-RIA";"";""Non-CO2 greenhouse gases are …`. `objective` alanı kaçışlı tırnakla (`""`) başlıyor. `escape:'"'` + `trim:true` + `relax_quotes` birlikte bunu kapanış tırnağı sanıyor, `skip_records_with_error:true` da hatayı sessizce yutuyor.

İndirme: CORDIS sunucusu ilk denemede 135 sn'de 6,6 MB'ta bağlantıyı kesti. `curl -C -` ile 209 sn'de tamamlandı (36.908.998 B). `importer.ts:113`'teki `fetch(url)` çağrısının zaman aşımı yok, yeniden denemesi de yok.

**Madde 3b, gerçek hacimde SQL (şemadaki indeks şekli; 5 koşunun medyan/max değeri):**
```
HORIZON-CL5-2026-09-D4%  rows 0  median_ms 1.6 max_ms 3.2
HORIZON-CL5-2026%        rows 9  median_ms 1.6 max_ms 1.8
HORIZON-CL5-2024-D4%     rows 17 median_ms 2.1 max_ms 2.4
HORIZON-CL5%             rows 20 median_ms 6.8 max_ms 7.5   (EXPLAIN ANALYZE Execution Time: 6.271 ms)
```
Dökümdeki CL5 konuları: 2024 → 189, 2025 → 82, 2026 → 9, `2026-09-D4` → 0. `leaders/page.tsx` konu filtresi olmadan `cordisPartnerProfile.findMany({take:20, orderBy: totalProjects})` çağırıyor. `api/v1/partners` ve `api/cordis/organizations` uçlarında konu parametresi yok.

**Madde 6:** Kare 11 (faturalama sayfası) ve kare 12 ("Stripe ödeme simülasyonu").
```
checkout 200 57ms {"demoMode":true,"message":"Stripe credentials not configured. ..."}
Subscription 0 · ModuleState 0 · CreditLedger 0   (simülasyondan sonra hak verilmedi — atlatma yok)
```
`BillingClient.tsx:95` → `UNPRICED_ADDONS = ['credits500','credits1500','addonM6']`. M6 yalnız Pro/Ultra planlarıyla geliyor, ayrı eklenti olarak satılmıyor.

**Madde 7:** Kare 09: "Concept Note Architectures modülü aboneliğinizin kapsamı dışında. Şu planlarda yer alıyor: Basic, Pro, Ultra."
- `grep generateAiUsageDeclaration src` yalnız tanımı buluyor (`src/modules/m2/server/actions.ts:228`), çağıran yok. `ConceptNoteEditor.tsx` yalnız "AI Generate Draft / Save Draft / Export DOCX" butonlarını gösteriyor.
- `llm.ts:365–422` önce bakiyeyi kontrol ediyor, sonra sağlayıcıyı çağırıyor, en son günlüğe ve kredi defterine yazıyor. Yani anahtar yokken kredi düşmez. Bu davranış doğru.

## 3) Değişen dosyalar

- `docs/agent-results/TASK-MULQMFVLJYZ5V-se-fb.md` (bu rapor)
- `docs/agent-results/TASK-MULQMFVLJYZ5V-screenshots/` (12 kare + `olcum-madde1.json`)
- Kaynak kodda değişiklik yok. Geçici ölçüm betikleri repodan çıkarıldı (scratchpad'de duruyor).
- Paylaşımlı dev DB'de kalan test verisi: kullanıcı `sefb-kabul-1790663367246@example.org`, kiracı `org-mssulp` (`cmumaqkt00024ndxkgoftbnh1`), `SavedSearch cmumaqln2002bndxk7eginpmm`, `Consent` satırları ve ajans `B2v0219` altında `ATHB` ipuçlu davet kodu (etiketi "se-fb kabul ölçümü …"). Bu kayıt ajans hunisinde +1 kayıt olarak görünür. Kanıt olsun diye silinmedi; istenirse temizlerim ya da kodu iptal ederim.
- İzole `fabrika_sefb_k2` veritabanı silindi.

## 4) Riskler ve bulgular

| Kod | Önem | Konum | Bulgu | Önerilen düzeltme |
|---|---|---|---|---|
| **B-1** | **Yüksek** (pilot söz veriyor, iş sessizce yalan söylüyor) | `src/lib/inngest/jobs/alerts-daily.ts:195–206` | Resend istemcisi yoksa gönderim atlanıyor, ama `touchLastRun` ve `emailsSent++` yine çalışıyor. Sahte başarı (CLAUDE.md kural 6). O aralıktaki eşleşmeler bir daha asla gönderilmez. UI kullanıcıya "e-posta bildirimi alacaksınız" diyor | Anahtar yoksa `emailsFailed` + `no_mail_provider` yazılsın, `lastRunAt` ilerletilmesin, `SystemAlert` açılsın. Regresyon testi eklensin |
| **B-2** | **Yüksek** (K2/M1 verisi üretimde hiç dolmaz) | `src/lib/k2-cordis/importer.ts:153–163` | Gerçek HE dökümünde csv-parse satır 24'te kırılıyor. `skip_records_with_error` 831 proje kaydını sessizce atlıyor. 23.613 projeden 22'si yazılıyor, sonra katılımlar FK ihlaliyle bütün koşuyu düşürüyor | Ayrıştırıcıyı gerçek dökümle düzelt (`escape`/`relax_quotes` ayarı, gerekirse ön işleme). Atlanan kayıt 0 değilse koşu FAILED + alarm olsun. Proje kümesinde olmayan katılımlar filtrelensin. Gerçek zip'ten alınmış bir satır örneği fikstür olsun. `fetch` için zaman aşımı ve yeniden deneme eklensin |
| **B-3** | Orta (kabul maddesi karşılanamıyor) | `partners/leaders/page.tsx`, `api/v1/partners`, `api/cordis/organizations` | Konu önekine göre koordinatör listesi yok. Gerçek hacimde SQL ≤ 7,5 ms, yani performans sorun değil; eksik olan filtrenin kendisi | `CordisProjectTopic.topicCode LIKE prefix%` + `role='coordinator'` filtresi, UI'da önek alanı, e2e testte süre ölçümü |
| **B-4** | Orta | `src/modules/m2/server/actions.ts:228` | `generateAiUsageDeclaration` hiçbir UI'dan çağrılmıyor, "tek tıkla dışa aktarım" yok. Editör butonları İngilizce sabit metin (i18n, madde 9) | Editöre "YZ Kullanım Beyanı" butonu (i18n anahtarı `ConceptNote.aiUsage` zaten var) + indirme + e2e |
| B-5 | Düşük–Orta (yanıltıcı UI, atlatma yok) | `settings/modules/page.tsx:32–36`, `actions.ts:54` | Aboneliği olmayan **her yeni kiracı** Modüller sayfasında sabit "PRO" planı ve M1–M5, M8 "AKTİF" görüyor (kare 10). Aynı anda M2 sayfası "plan dışı" diyor (kare 09). Eylem de `'pro'` fallback'iyle `ModuleState ON` yazabiliyor. Gerçek erişim `checkModuleAccess` → `getEntitlements` ile ayrıca engellendiği için **yetki atlatması yok**, ama DB'ye kirli durum yazılıyor ve kullanıcı yanıltılıyor. BILLING.md §9'da açık kart olarak geçiyor | Fallback `FALLBACK_PLAN_ID` (`free`) olsun, aktif modüller `getEntitlements`'tan okunsun |
| Ö-1 | Düşük | `.env` | `WORKER_URL=http://localhost:8000` bu makinede başka bir projenin PHP sunucusunu gösteriyor (`/health` → 404 HTML). `DATABASE_URL_MIGRATE` kimlik bilgisi reddediliyor (`28P01`) | Yerel `.env` düzeltmesi (patron veya ortam kartı) |

## 5) Açık sorular

- **Ö-2:** Kabul örneği `HORIZON-CL5-2026-09-D4` gerçek dökümde 0 projeyle eşleşiyor, çünkü 2026 çağrıları henüz fonlanmadı. Madde "önekle eşleşen geçmiş benzer konular" diye mi yeniden yazılsın, yoksa ölçüm örneği `HORIZON-CL5-2024-D4` mü olsun? (Ürün/patron kararı.)
- **Ö-3:** Madde 6 "Ekip planı + M6 eklentisi" diyor. Bugünkü katalogda M6 eklenti olarak satılmıyor, Pro/Ultra ile geliyor. Kamu tarafındaki "Ekip" adı TL paketi. Kabul maddesi yeni katalog modeline göre güncellensin mi?
- **Ö-4:** `prisma migrate deploy` boş bir DB'de `relation "FollowupDoc" does not exist` hatasıyla duruyor, yani migration zinciri sıfırdan kurulamıyor. CI ve yeni ortam kurulumu için ayrı kart gerekli mi? Bunu yalnız izole DB kurarken gördüm, derinlemesine incelemedim.
- Madde 1a'nın kalıcı giriş yolu Google OAuth (ADR-0006). Bu yolda "5 dk" ölçümünü bir insanın test hesabıyla yapması gerekiyor. Yukarıdaki süreler demo e-posta yolunun sistem gecikmesi; insan süresi dahil değil.

## 6) Sonraki adım: önerilen kartlar (bu kartta kod değiştirilmedi)

1. **K2 gerçek döküm ayrıştırma + atlanan kayıtta FAILED** (B-2): be-fb, yüksek öncelik. Kabul: gerçek HE zip'iyle 23.613 proje yazılır, koşu SUCCESS olur, süre < 30 dk.
2. **Uyarı işi sahte başarı** (B-1): be-fb, yüksek öncelik, pilot öncesi. Kabul: anahtar yokken `emailsFailed`, alarm açılır, `lastRunAt` sabit kalır. Birim testi.
3. **M1 konu önekine göre koordinatör listesi** (B-3): fe-fb + be-fb. B-2'ye bağımlı.
4. **M2 "YZ kullanım beyanı" tek tık + editör i18n** (B-4).
5. **Modüller sayfası `pro` fallback'i → gerçek yetki** (B-5); BILLING.md §9'daki açık kartla birleştirilebilir.
6. Patron: `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, Stripe test anahtarları (TASK-MULQM3LFB4KRA). Anahtarlar gelince 1c, 6 ve 7 yeniden ölçülmeli.
