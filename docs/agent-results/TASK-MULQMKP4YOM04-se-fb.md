# TASK-MULQMKP4YOM04 — FB gözlemlenebilirlik: PostHog gerçek entegrasyon + Sentry olay kanıtı

**Ajan:** se-fb (Güvenlik Mühendisi) · **Dal:** `dev` (push yok) · **Tarih:** 29.09.2026
**Commit'ler:** `488313b1` (kod + testler), `4630a1a8` (KVKK dokümanları), rapor commit'i bu dosyayla birlikte
**Platform:** macOS (Darwin 27, Apple Silicon) üzerinde doğrulandı. Aşağıdaki "Platform" başlığına bakın.

## Özet (tek paragraf)

PostHog'daki `console.log` stub'ı gerçek bir capture çağrısına dönüştü. Olay yalnız iki koşul birlikte sağlanınca gidiyor: `NEXT_PUBLIC_POSTHOG_KEY` dolu **ve** ziyaretçi çerez bandında "Tümünü Kabul Et" dedi. Aksi halde kod sessizce hiçbir şey yapmıyor. Olaylarda kişisel veri yok: kimlik tarayıcıda rastgele üretilen anonim bir değer, özellikler süzgeçten geçiyor. Sentry iletimi SDK'sız olarak yeniden eklendi. `recordAlert` yalnız **yeni açılan `error`** uyarısını iletiyor ve `SENTRY_DSN` boşken kapalı. İkisi de yerel sahte uca uçtan uca kanıtlandı: PostHog gerçek tarayıcıyla, Sentry gerçek DB yazımıyla. **Gerçek anahtarla doğrulama açık iş olarak kaldı** (patron kartı TASK-MULQM3LFB4KRA). Ayrıca **Sentry için bir karar çelişkisi var**, 1. maddeye bakın.

## 1. Ne yapıldı

### ⚠ Önce: Sentry karar çelişkisi (patrona)
Kart açıklaması şöyle diyor: "Sentry, `src/lib/observability/sentry.ts`'te elle yazılmış bir envelope istemcisi ve SENTRY_DSN boş." **Bu bilgi eski.** O dosya 07.09'da **patron kararıyla silinmişti** (`0d1d6c8`, TASK-MTQUN8VV6DK8C). Gerekçe "hata verisi dışarı çıkmasın" idi ve karar `processing-register.md` §19, DPA §7 ve `VERI-YERLESIMI.md`'de yazılıydı. ROADMAP E0'daki "Sentry gerçekten var" notu da aynı eskimiş bilgiyi taşıyordu (düzeltildi).
Kodu iki tarafı da bozmayacak şekilde yazdım: **DSN boşken 07.09 kararı olduğu gibi geçerli**, hiçbir hata verisi dışarı çıkmıyor. **`SENTRY_DSN`'i doldurmak 07.09 kararını geri almak demek.** Bu adım patron onayı gerektiriyor. Onay verilirse DPA §7 ile `VERI-YERLESIMI.md` de güncellenmeli. `.env.example` ve `processing-register.md` §19a bunu açıkça yazıyor.

### PostHog (`src/lib/analytics.ts`)
- **Üç kapı var:** (1) anahtar dolu olmalı; boşsa sessiz no-op, `console.log` yok. (2) `hasAnalyticsConsent()` yalnız açık "Tümünü Kabul Et" için true döner. Yanıtsız, "Gerekli Çerezler", bozuk JSON ya da engelli storage "hayır" sayılır. (3) Kod tarayıcıda çalışıyor olmalı.
- **SDK kullanılmadı, `fetch` yeterli** (`/i/v0/e/`, `keepalive:true`, `credentials:'omit'`). Kart "posthog-node + gerekirse posthog-js" diyordu. Kararımın gerekçesi şu: bugün tek kullanım istemci tarafında (`fon-hazirlik`), sunucu tarafında izlenecek bir olay yok. posthog-js'in varsayılanları ise (autocapture, `$current_url`, kendi çerezi, oturum kaydı) aşağıdaki KVKK kurallarının tam tersi; her birini kapatıp kapalı tutmak gerekirdi. Bu yolla yeni bağımlılık da gelmedi.
- **KVKK tarafı:** `distinct_id` yalnız onaydan **sonra** üretilen `crypto.randomUUID()` (`fabrika_analytics_anon_id`). Kullanıcı kimliği, e-posta, ad ve kurum adı gönderilmiyor. URL, referrer ve başlık da yok, çünkü hazırlık sonuç linki cevapları query string'de taşıyor. Olay başına `$process_person_profile:false` ve `$geoip_disable:true` gidiyor. `sanitizeProperties` en fazla 20 skaler tutuyor, dizeleri 64 karakterde kesiyor; kimlik biçimli anahtarları (email/mail/name/adi/kurum/user/phone/adres/tckn/vkn/iban/token/ip), `$` ile başlayanları, nesneleri ve e-posta biçimli değerleri düşürüyor.
- Kullanılmayan `identify()` kaldırıldı; kişiyle eşleştirme yapılmıyor.
- Onay anahtarı `src/lib/cookie-consent.ts`'e taşındı, `CookieConsent.tsx` de aynı sabiti kullanıyor.

### Sentry (`src/lib/observability/sentry.ts` + `system-alert.ts`)
- 07.09 öncesindeki envelope istemcisi geçmişten (`8691c35a^`) alınıp sadeleştirildi. `user`, ek dosya ve `request` alanları çıkarıldı. Olay alan alan kuruluyor: level, source, mesaj, `sanitizeMeta`'dan geçmiş meta ve `alert_id` etiketi. E-posta biçimli metin `[email]` olarak maskeleniyor. `server_name` ve IP gönderilmiyor.
- `recordAlert` yalnız **yeni oluşturulan** `error` satırını iletiyor. Tekrar sayacına katlanan tekrar zaten açık bir issue, o yüzden iletilmiyor. `warn`/`info` hiç gitmiyor. Çağrı await ediliyor (serverless ortamda istek düşmesin diye), 2 sn zaman aşımı var ve exception fırlatmıyor.
- `env.ts`'e `SENTRY_DSN` (optionalUrl) ve `SENTRY_ENVIRONMENT` eklendi, `.env.example`'a açıklamalı satırlar girildi.

### Dokümanlar
- `docs/legal/processing-register.md`: yeni **§19a** (PostHog ve Sentry için iki sütunlu tablo: açılma koşulu, gönderilen ve gönderilmeyen veri, hukuki sebep, bölge, tedbir), §19 notu, §21'e iki satır, §22 madde 7 güncellemesi.
- `docs/SECURITY_COMPLIANCE.md`, `docs/kamu/VERI-YERLESIMI.md` ve `docs/ROADMAP.md` E0 güncellendi. ROADMAP'teki eski "Sentry gerçekten var" bilgisi düzeltildi.

## 2. Kanıt

### 2.1 Gerçek tarayıcı, PostHog (Chromium headless, yerel sahte uç `127.0.0.1:47811`)
İzole bir worktree'de (`488313b1`) `next dev -p 3917` şu ayarlarla açıldı: `NEXT_PUBLIC_POSTHOG_KEY=phc_local_fake_key`, `NEXT_PUBLIC_POSTHOG_HOST=http://127.0.0.1:47811`. Senaryo: `/tr/fon-hazirlik` → çerez bandı → kurum türü seçimi → **Teste başla**. Ham çıktı: `TASK-MULQMKP4YOM04-screenshots/posthog-browser-e2e.json`.

| Senaryo | Dış istek | anonId (localStorage) | Kare |
| --- | --- | --- | --- |
| Anahtar var + **Gerekli Çerezler** | **0** | `null` | `01-key-set-essential-only.png` |
| Anahtar var + **Tümünü Kabul Et** | **1 POST** `/i/v0/e/` | `cbaf846b-…` | `02-key-set-accept-all.png` |
| Anahtar **yok** (`:3000`, `.env`'de anahtar yok) + Tümünü Kabul Et | **0** | `null` | `03-no-key-accept-all.png` |

Sahte ucun aldığı gövdenin tamamı aşağıda (`api_key` sahte bir değer). Kişisel veri içermiyor:
```
{"api_key":"phc_local_fake_key","event":"readiness_started","distinct_id":"cbaf846b-9271-4083-ba66-b21da3bf9ff1",
 "timestamp":"2026-09-29T09:56:33.721Z","properties":{"orgType":"municipality","$lib":"fonbridge-web",
 "$process_person_profile":false,"$geoip_disable":true}}
```
Tarayıcı önce CORS preflight (`OPTIONS`) gönderdi, sonra `POST` geldi. Gerçek PostHog bu uçta CORS'u destekliyor; posthog-js de aynı ucu kullanıyor.

### 2.2 Gerçek DB + `recordAlert`, Sentry (sahte ingest `127.0.0.1:47811/42`)
Betik: `sentry-proof.ts.txt`. Yerel Postgres'e (5433) gerçek bir `SystemAlert` yazıldı ve iletildi. Test satırları sonra silindi:
```
recordAlert → {"status":"recorded","id":"cmumi5idi0000zexktav04v68"}
db row → {..."level":"error","source":"se-fb-sentry-proof","message":"… contact test.user@example.org","meta":{"rows":0,"stage":"k2-parse","redactedKeys":["userEmail"]}}
warn recordAlert → {"status":"recorded",...}      ← warn, sahte uca GİTMEDİ (yakalanan istek sayısı 1)
cleanup deleted rows → 2
```
Sahte ucun aldığı zarf (`sentry-capture-server.jsonl`; `sentry_key` maskeli):
```
POST /api/42/envelope/   X-Sentry-Auth: Sentry sentry_version=7, sentry_client=fonbridge-alerts/1.0, sentry_key=<masked>
{"event_id":"1e4c…","platform":"node","level":"error","logger":"se-fb-sentry-proof",
 "message":{"formatted":"TASK-MULQMKP4YOM04 local proof 1790675826125 — contact [email]"},
 "tags":{"source":"se-fb-sentry-proof","alert_id":"cmumi5idi0000zexktav04v68"},
 "extra":{"rows":0,"stage":"k2-parse","redactedKeys":["userEmail"]},"environment":"local-proof"}
```
`grep -c test.user@example.org sentry-capture-server.jsonl` → **0**. E-posta ne mesajda ne de meta'da dışarı çıktı.

### 2.3 Birim testleri ve kapılar
- `tests/observability-sentry.test.ts` (14 test): DSN ayrıştırma, olayın yalnız adı geçen alanları taşıması (user/request/server_name yok), e-posta maskeleme, UTF-8 byte uzunluğu, DSN yokken `fetch` hiç çağrılmıyor, **gerçek yerel HTTP sunucusuna teslim**, uç kapalıyken exception yerine `failed` dönmesi, `recordAlert` → yeni error iletiliyor ve warn/info iletilmiyor.
- `tests/analytics-posthog.test.ts` (7 test, jsdom): onaysız, reddedilmiş ve bozuk kayıtta istek yok ve kimlik yazılmıyor; anahtarsızken no-op ve `console.log` yok; kabulde tek POST ve kalıcı anonim kimlik; süzgeç; gövde alanları.
- **Mutasyonla sağlama:** onay kontrolü kaldırılınca 3 test, `level==='error'` koşulu kaldırılınca 1 test kırmızıya döndü. İkisi de geri alındı.
- `pnpm exec vitest run` (tam paket): **209 dosya geçti, 2 atlandı; 2402 test geçti, 8 atlandı.**
- `pnpm exec tsc --noEmit`: temiz. Dokunulan dosyalarda `eslint`: temiz.

## 3. Değişen dosyalar
- `src/lib/analytics.ts` (yeniden yazıldı), `src/lib/cookie-consent.ts` (yeni), `src/components/CookieConsent.tsx` (sabit import'u)
- `src/lib/observability/sentry.ts` (yeni), `src/lib/observability/system-alert.ts` (iletim çağrısı)
- `src/lib/env.ts`, `.env.example` (yalnız kendi hunk'larım commit'lendi; komşunun INNGEST değişiklikleri o sırada çalışma ağacındaydı ve dokunulmadı)
- `tests/observability-sentry.test.ts`, `tests/analytics-posthog.test.ts` (yeni)
- `docs/legal/processing-register.md`, `docs/SECURITY_COMPLIANCE.md`, `docs/kamu/VERI-YERLESIMI.md`, `docs/ROADMAP.md`
- `docs/agent-results/TASK-MULQMKP4YOM04-screenshots/` (3 kare + ham kanıt dosyaları + kullanılan betikler `.txt` olarak)

## 4. Riskler (önem: etki × istismar)
| # | Önem | Bulgu | Durum |
| --- | --- | --- | --- |
| R-1 | **Orta** (karar) | `SENTRY_DSN`'i doldurmak 07.09 "veri dışarı çıkmasın" kararını geri alır | Kod varsayılan kapalı. Patron onayı gerekiyor (§1) |
| R-2 | Düşük | `SystemAlert.message` DB'de **ham** saklanıyor; kanıtta e-posta mesajda duruyordu. Sentry tarafı maskeliyor ama tablo maskelemiyor (RLS'siz tablo, yalnız platform admini okuyor) | Bu kartın kapsamı dışında, mevcut sorun. Öneri: `buildAlertRow` içinde de `scrubText` uygulanması (küçük bir kart) |
| R-3 | Düşük | Çerez onayını geri alma yolu yok: bant bir kez yanıtlanınca yeniden açılmıyor (KVKK md.7 / GDPR art.7(3)) | Açık. PostHog anahtarı açılmadan önce "çerez tercihleri" bağlantısı eklenmeli |
| R-4 | Düşük | PostHog tarafında IP'nin saklanmaması proje ayarına ("Discard client IP data") bağlı. Olay başına yalnız GeoIP kapatılabiliyor | Anahtar açılırken yapılacaklar listesinde (§19a) |
| R-5 | Bilgi | e2e fixture'ları `{analytics:true}` biçimiyle onay kaydı yazıyor; `hasAnalyticsConsent` bunu da onay sayıyor | Testlerde anahtar olmadığı için bir etkisi yok |

## 5. Açık sorular / açık işler
1. **Gerçek anahtarla doğrulama yapılmadı.** Anahtarlar yok, patron kartı TASK-MULQM3LFB4KRA'da. Anahtar gelince yapılacaklar: PostHog "Live events" ekranında `readiness_started` görülmeli ve kişi profili oluşmadığı kontrol edilmeli. Sentry'de `level:error` issue'su görülmeli ve `alert_id` etiketinin DB satırıyla eşleştiği doğrulanmalı. İki adımın komutları: `screenshots/e2e-posthog.cjs.txt` (host'u gerçek uçla değiştirin) ve `screenshots/sentry-proof.ts.txt` (`SENTRY_DSN`'i gerçek DSN ile değiştirin).
2. **Sentry için patron onayı** (R-1). Onay yoksa DSN boş kalmalı; kod hazır bekler.
3. PostHog DPA'sı ve saklama süresi (§19a).

## 6. Sonraki adım
- Patron: TASK-MULQM3LFB4KRA'ya PostHog anahtarı (EU projesi) eklemeli. Sentry DSN'i yalnız R-1 onayıyla girmeli.
- Küçük takip kartları önerisi: (a) `SystemAlert.message` e-posta maskeleme (R-2), (b) çerez tercihlerini yeniden açma bağlantısı (R-3).

## Platform
- **Doğrulama:** yalnız **macOS** (Darwin 27, arm64, Node 26.5, Chromium headless 1243). Windows ve Linux'ta koşulamadı, çünkü bu makinede yoklar.
- **Koddan değerlendirme:** Dokunulan kod platforma bağlı değil. Kullanılanlar `fetch`, `crypto.randomUUID`, `localStorage` ve Node `crypto.randomUUID`; süreç, dosya yolu ya da kabuk kullanılmıyor. Windows, Linux ve tarayıcıların hepsinde aynı davranması beklenir. Kanıt betiklerindeki `lsof`/`kill` yalnız yerel temizlik içindi, ürün koduna girmedi.

## Not: yerel kanıtın kurulumu (tekrar için)
Aynı dizinde başka bir ajanın `next dev` süreci `:3000`'de çalışıyordu. Bu yüzden `.claude/worktrees/` altında izole bir worktree kuruldu (`node_modules` ve `.env` symlink). Turbopack kök dışına işaret eden symlink'i reddettiği için yalnız o kopyada `turbopack.root` ayarlandı; bu değişiklik commit'lenmedi. İş bitince worktree silindi. Kendi başlattığım 3917 ve 47811 süreçleri kapatıldı.
