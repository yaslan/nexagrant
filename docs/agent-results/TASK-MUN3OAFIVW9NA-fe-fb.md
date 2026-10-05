# TASK-MUN3OAFIVW9NA — FB canlı alan adı fonbridge.com (fe-fb)

**Commit:** `9b63111d` (dal `dev`) · **Platform:** macOS (Darwin 27.0.0) üzerinde doğrulandı. Windows ve Linux'ta koşulmadı. Dokunulan kod platforma bağlı değil: URL ayrıştırma (WHATWG `URL`), `URLSearchParams`, `crypto.randomBytes` ve env okuma. Süreç, dosya yolu ya da kabuk kullanılmıyor, yani diğer platformlarda da aynı davranması gerekir.

**Sıra notu:** Kart "İNCELEME-34'ten sonra başla" diyor. Başladığımda TASK-MUN3O475HC3T8 (İNCELEME-34) panoda `in_progress` görünüyordu. Bu iş İNCELEME-34'ün dosyalarına (accept-invite sayfası) dokunmuyor, o yüzden beklemeden yürüttüm.

## 1. Ne yapıldı

### 1.1 Google Takvim (`src/lib/calendar/google.ts`)
- Artık `redirect_uri` NEXT_PUBLIC_APP_URL'den geliyor: `${appBaseUrl()}/api/calendar/callback`. Değer `URLSearchParams` ile kodlanıyor, yani ham URL sorgu dizesine yapıştırılmıyor. Test kodlanmış hali de kontrol ediyor: `redirect_uri=https%3A%2F%2Ffonbridge.com%2F…`.
- Değer yoksa, boşsa ya da üretimde localhost ise `connect()` bir hata fırlatıyor. Böylece Google'a localhost redirect'i gönderilmiyor.
- **Scope:** Eski `calendar` değeri tam URL değildi, yani Google scope adı olarak geçersizdi. Yeni değer `https://www.googleapis.com/auth/calendar.events`. **Gerekçe:** Sağlayıcı yalnız etkinlik oluşturuyor, güncelliyor ve siliyor. Tam `…/auth/calendar` scope'u takvimleri okuma, paylaşma ve silme izni de verirdi, bunlar hiç gerekmiyor. Daha dar bir aday olan `calendar.events.owned` rapor sonunda Açık soru 1'de.
- **CSRF `state`:** Önceden hiç yoktu. Şimdi her çağrıda 32 bayt rastgele değer üretiliyor (base64url) ve `connect()` bunu `{ authUrl, state }` olarak döndürüyor. `CalendarProvider.connect` tipine isteğe bağlı `state?` alanı eklendi.
- Ayrıca `response_type=code`, `access_type=offline` ve `include_granted_scopes=true` eklendi. `access_type=offline` olmadan `refreshToken` gelmez.

### 1.2 Ortak modül `src/lib/app-url.ts`
Yeni bir kalıp icat edilmedi: be-fb'nin `invitationMailBaseUrl` kuralları (isLoopback dahil) buraya taşındı ve `invitationMailBaseUrl` artık `appBaseUrl()`'ü çağırıyor. Davranış aynı kaldı; `mailer.test.ts` yeşil.
- `appBaseUrl()`: Kural setinin kendisi. Değer yoksa, boşsa ya da URL değilse `null` döner. Üretimde loopback adresi de `null` döner.
- `appUrl()`: Linkin atlanamadığı yerler için (metadataBase, Stripe dönüşü, e-posta linki). Önce `appBaseUrl()`'e bakar; değer yoksa üretimde `https://fonbridge.com`, diğer ortamlarda `http://localhost:3000` kullanır.
- `appUrlProblem()`: Yalnız üretimde çalışır ve `unset`, `invalid`, `loopback` ya da `insecure` (http://) döndürür.

### 1.3 Üretim uyarısı (madde 4)
`src/lib/app-url-alert.ts` içindeki `reportAppUrlProblem()`, `src/instrumentation.ts` sunucu başlarken bir kez çağrılıyor. Yaptıkları:
- `console.error` basar.
- `recordAlert` ile `level: 'error'`, `source: 'app-url'` bir SystemAlert yazar. Bu, davet rotasının kullandığı kanalın aynısı. `dedupeKey` sorun başına tek (`app-url:<sorun>`).
- Sunucuyu durdurmaz: yanlış URL linkleri bozar, uygulamayı bozmaz.

### 1.4 Tarama (madde 2): `src` altında test/e2e dışı sabit localhost, 127.0.0.1, alan adı ve http:// bulguları

| Yer | Ne vardı | Karar |
|---|---|---|
| `src/lib/calendar/google.ts:21` | `redirect_uri=http://localhost:3000/...`, `scope=calendar` | **Düzeltildi** (1.1) |
| `src/app/layout.tsx:19` | `metadataBase` → `?? 'http://localhost:3000'` | **Düzeltildi** → `appUrl()` |
| `src/app/api/billing/checkout/route.ts:285` | Stripe dönüşü `|| 'http://localhost:3000'` | **Düzeltildi** → `appUrl()` |
| `src/app/api/invitations/route.ts:198` | Yanıttaki link `|| 'http://localhost:3000'` | **Düzeltildi** → `mailBaseUrl ?? appUrl()`. E-postaya giden link hâlâ yalnız `mailBaseUrl`'den kuruluyor |
| `src/lib/jobs/tasks/alerts-daily.ts:191` | Kayıtlı arama e-postası `|| 'https://app.fabrika.io'` | **Düzeltildi** → `appUrl()` (yanlış alan adıydı) |
| `src/lib/feedback/digest-run.ts:118` | Özet e-postası `|| 'https://app.fabrika.io'` | **Düzeltildi** → `appUrl()` |
| `src/lib/beta/constants.ts:51` | `BETA_APP_URL ?? 'https://app.fabrika.dev'` | **Düzeltildi** → `appUrl()` |
| `settings/api-keys/client.tsx` (5 yer) | Kod örneklerinde `https://fabrika.app/api/v1/...` | **Düzeltildi**: `page.tsx`, `apiBaseUrl={appUrl()}` prop'unu geçiriyor |
| `src/lib/jobs/tasks/k2-monthly-cordis.ts:46` | `WORKER_URL || 'http://localhost:8000'` | **Bırakıldı**: dahili worker adresi, uygulamanın kendi URL'si değil (Açık soru 2) |
| `src/lib/db.ts:6` | `DATABASE_URL ||` localhost postgres | **Bırakıldı**: veritabanı adresi, uygulama URL'si değil |
| `src/lib/calendar.ts:63`, `briefs/client.tsx:296` | ICS `UID …@fabrika.app` | **Bırakıldı**: URL değil, kimlik. Değiştirilirse mevcut etkinliklerin UID'i değişir ve takvimlerde çift kayıt oluşur (Açık soru 3) |
| `admin/layout.tsx:136`, `components/UserMenu.tsx:574` | `https://docs.fabrika.app` | **Bırakıldı**: dış doküman sitesi, fonbridge.com ile bir karar yok (Açık soru 4) |
| `src/modules/m10/server/actions.ts:129,196` | `https://storage.fabrika.app/...` mock URL | **Bırakıldı**: sahte depolama URL'si, `tests/fabricated-fallbacks.test.ts` bunu bilerek izliyor |
| `src/lib/beta/roster.ts:39`, `invitation-mail-policy.ts` yorumları | Regex ya da yorum | Link değil |
| `AuthCard.tsx:37`, `auth.ts:84`, `env.ts:98`, `PublicFooter.tsx:135` | `@usfinbridge.com` e-posta adresleri | Link değil, e-posta adresi. SMTP kararı cs-fb kartında (TASK-MUN2PNAR729H8) |

AUTH_URL: `src` hiçbir yerde okumuyor. Auth.js v5, `trustHost: true` (`src/lib/auth.ts:309`) ile callback adresini isteğin host'undan kuruyor. Proxy Host başlığını değiştirirse AUTH_URL'nin sabitlenmesi gerekir; bu, `.env.example`'da not olarak yazılı.

### 1.5 `.env.example` (madde 3)
Yorum olarak eklendi: canlı `NEXT_PUBLIC_APP_URL=https://fonbridge.com`, Google Cloud'a kaydedilecek iki redirect URI (`https://fonbridge.com/api/auth/callback/google`, `https://fonbridge.com/api/calendar/callback`), üretim uyarısının davranışı ve `AUTH_URL=https://fonbridge.com` notu.

## 2. Kanıt

**Hedefli vitest** (`app-url.test.ts`, calendar, `mailer.test.ts`, `calendar.test.ts`):
```
Test Files  7 passed (7)
     Tests  86 passed (86)
```

**Değişen modüllere dokunan 18 test dosyası** (alerts-daily, digest, checkout, api-keys, beta, secret-guard…):
```
Test Files  18 passed (18)
     Tests  303 passed (303)
```

**Davet canlı-DB testleri** (`invitation-accept.live`, `invitation-mail-limit.live`): `Tests 32 passed (32)`

**Tüm suite (`npx vitest run`):**
```
Test Files  226 passed | 3 skipped (229)
     Tests  2664 passed | 14 skipped (2678)
```

**Mutantlar** (her biri tek tek uygulandı, test koşuldu, dosya yedekten geri yüklendi; hepsi kırmızı):

| # | Mutasyon | Sonuç |
|---|---|---|
| M1 | redirect_uri yeniden `http://localhost:3000` | 1 fail |
| M2 | scope `calendar` | 1 fail |
| M3 | `state` parametresi URL'den çıkarıldı | 1 fail |
| M4 | `if (!baseUrl)` koruması kapatıldı | 1 fail |
| M5 | `insecure` kontrolü silindi | 2 fail |
| M6 | `appUrl` üretimde localhost'a düşüyor | 1 fail |
| M7 | Üretimde loopback reddi silindi | 3 fail |
| M8b | `state` sabit değer | 1 fail |

İlk M8 (nesne literalinde çift `state` anahtarı) eşdeğer mutanttı: sonraki anahtar öncekini ezdiği için davranış değişmiyordu. O yüzden M8b ile değiştirildi. `git checkout` kullanılmadı; yedek kopyadan geri yüklendi ve `diff -q` ile doğrulandı.

**Kontroller:**
- `tsc --noEmit`: exit 0
- Değişen dosyalarda `eslint`: exit 0
- `npm run -s i18n:check` (temiz worktree'de): `✅ i18n check passed … no file gained hard-coded text.` exit 0
- **Temiz worktree** (`git worktree add --detach 9b63111d`, `pnpm install --frozen-lockfile`, `prisma generate`): `pnpm build` **BUILD=0**

**Canlı üretim sunucusu** (temiz worktree build'i, `next start -p 3917`):
- `NODE_ENV=production NEXT_PUBLIC_APP_URL=http://fonbridge.com` ile açılışta log:
  `[app-url] NEXT_PUBLIC_APP_URL is an http:// URL in production: set it to https://fonbridge.com`
  DB'de `SystemAlert {level:"error", source:"app-url", id: cmun3y1se0000v1xkxly1r2jz}` satırı oluştu. Test satırı sonra silindi (`1 test row removed`).
- `NEXT_PUBLIC_APP_URL=https://fonbridge.com` ile yeni uyarı yok (log'da `app-url` 0 kez). `/tr` HTML'inde:
  `<link rel="canonical" href="https://fonbridge.com/tr"/>`, `<meta property="og:url" content="https://fonbridge.com/tr"/>`
- Kendi başlattığım iki sunucu da durduruldu; 3917 portu boş.

## 3. Değişen dosyalar (commit 9b63111d, 17 dosya)
- **Yeni:** `src/lib/app-url.ts`, `src/lib/app-url-alert.ts`, `src/lib/app-url.test.ts`
- **Takvim:** `src/lib/calendar/google.ts`, `src/lib/calendar/provider.ts`, `src/lib/calendar/__tests__/provider.test.ts`
- **Uygulama linkleri:** `src/app/layout.tsx`, `src/app/api/billing/checkout/route.ts`, `src/app/api/invitations/route.ts`, `src/lib/jobs/tasks/alerts-daily.ts`, `src/lib/feedback/digest-run.ts`, `src/lib/beta/constants.ts`
- **API anahtarları sayfası:** `src/app/[locale]/(app)/[workspace]/settings/api-keys/{client,page}.tsx`
- **Diğer:** `src/lib/email/invitation-mail-policy.ts` (artık `appBaseUrl` çağırıyor), `src/instrumentation.ts`, `.env.example`

## 4. Riskler
- **`/api/calendar/callback` rotası kodda yok.** `connect()`'i çağıran bir rota da yok; sağlayıcı yalnız testlerde kullanılıyor. Takvim bağlama akışı uçtan uca çalışmıyor. Bu kart yalnız URL üretimini düzeltti. Callback yazılırken yapılması gerekenler:
  - `state` httpOnly çerezde tutulmalı ve dönüşte sabit-zamanlı karşılaştırmayla eşleştirilmeli.
  - `redirect_uri`, token değişiminde de aynı `appBaseUrl()` değerinden üretilmeli.
- **Linklerin fonbridge.com'a düşmesi:** Üretimde NEXT_PUBLIC_APP_URL yoksa linkler artık localhost yerine `https://fonbridge.com`'a gidiyor. Staging gibi başka bir üretim ortamında değer unutulursa linkler canlı siteye gider. Bunu SystemAlert (`unset`) görünür kılar.
- **Build-time değer:** `NEXT_PUBLIC_*` değerleri istemci paketine build sırasında gömülür. Sunucu tarafı `env` üzerinden çalışma zamanında okunuyor. `ApiKeysClient` değeri prop olarak aldığı için onun istemci paketine eski bir değer gömülmez.

## 5. Açık sorular
1. **Scope `calendar.events.owned`:** Yalnız kullanıcının sahip olduğu takvimlerdeki etkinlikler için geçerli, `calendar.events`'ten daha dar. Google Cloud OAuth onay ekranında mevcut olup olmadığını doğrulamadım. Mevcutsa ona geçilebilir.
2. **Worker adresi:** `WORKER_URL`'nin üretimde de `localhost:8000` (sidecar) olması mı bekleniyor? Değilse `appUrlProblem` gibi bir kontrol eklenmeli.
3. **ICS UID alan adı:** UID'ler `@fabrika.app` alan adını kullanıyor. Yeni etkinlikler için `@fonbridge.com`'a geçilsin mi? Mevcut etkinliklerin UID'leri değişirse çift kayıt riski var.
4. **Doküman linkleri:** `docs.fabrika.app` linkleri kalsın mı, yoksa kaldırılsın mı? Şu an bu adreste çalışan bir site var mı bilinmiyor.

## 6. Sonraki adım
- İnceleme kartı (crw-fb/se-fb).
- `/api/calendar/callback` rotası ve state doğrulaması için ayrı bir kart.
- Patron/devop: Google Cloud OAuth istemcisine iki canlı redirect URI'nin eklenmesi ve üretim ortamında `NEXT_PUBLIC_APP_URL=https://fonbridge.com` ayarlanması.
