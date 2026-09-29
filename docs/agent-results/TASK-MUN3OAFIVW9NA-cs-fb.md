# TASK-MUN3OAFIVW9NA — cs-fb — İNCELEME-39 düzeltmesi (B-1, B-2, B-3)

**Sprint:** FB-KAMU-2 · **Dal:** `dev` · **Commit:** `10173a08` · **Kaynak:** be-fb İNCELEME-39 raporu (TASK-MUN4N6GFR08SX), fe-fb commit'leri `9b63111d` ve `373d4133`. İş fe-fb'nindi. fe-fb meşgul olduğu için bana verildi.

**Platform:** macOS'ta (Darwin 27.0.0) doğrulandı. Ayrıntı §4'te.

## 1. Ne yapıldı

### B-1: üretimde http:// değeri artık davet e-postasını ve takvimi kapatıyor
Belgeler "kapalı kalır" diyordu, kod ise çalışmaya devam ediyordu. Belgeyi değiştirmedim, davranışı belgeye uydurdum.
- `src/lib/app-url.ts` → `appBaseUrl()`, üretimde `appUrlProblem()` bir sorun bildirdiğinde (`unset`, `invalid`, `loopback`, `insecure`) `null` döndürüyor. Böylece iki fonksiyon tek kuralı paylaşıyor. Bir test bu eşitliği kilitliyor: "problem null ⇔ appBaseUrl dolu".
- **Davet e-postası:** `invitationMailBaseUrl()` zaten `appBaseUrl()` çağırıyor. Değer `null` olunca route'taki mevcut `app_url_not_configured` dalına düşüyor: e-posta **gönderilmiyor**, `level: 'error'` SystemAlert yazılıyor (`dedupeKey: invitation-mail-app-url-missing`) ve `emailSent: false` dönüyor. Yeni bir kalıp eklemedim. Yalnız alert ve log metnini "unset or loopback" yerine "not usable (… http:// or more than an origin)" yaptım. Davet edene elle iletmesi için verilen link `appUrl()`'den geliyor, yani üretimde `https://fonbridge.com/...`. Hiçbir zaman `http://` olmuyor.
- **Google Takvim:** `GoogleCalendarProvider.connect()` yetkilendirmeyi **başlatmıyor**. `CalendarActionError('CALENDAR_APP_URL_NOT_CONFIGURED')` fırlatıyor. Kod `errors.ts` içindeki `CODES` listesine eklendi, böylece ayar ekranı `calendarErrorCode()` ile onu tanıyor. `settings.calendar.errors.CALENDAR_APP_URL_NOT_CONFIGURED` için tr ve en metni eklendi.
- `app-url-alert.ts`: `invalid` açıklaması "not a bare origin URL (no path, query or fragment)" oldu. Yorum artık doğru.
- `.env.example`: "yalnız origin ver (path, ?sorgu, #parça yok)" notu ve "diğer linkler https://fonbridge.com'a düşer" eklendi.

### B-3: sorgu ya da # içeren değer artık sorun sayılıyor
- `appUrlProblem()`, üretimde `search`, `hash`, ham değerde `?` ya da `#` varsa `'invalid'` döndürüyor. Ham değer kontrolü gerekli, çünkü `https://fonbridge.com?` ayrıştırılınca boş `search` veriyor.
- **Kapsamı biraz genişlettim:** kök dışı bir path (`/app`) ya da kimlik bilgisi (`user:pass@`) de `invalid` sayılıyor. `appBaseUrl()` artık yalnız `url.origin` döndürdüğü için bu parçalar sessizce düşerdi. O durumda uyarı hiç çıkmaz, link de operatörün yazdığından farklı olurdu.
- `appBaseUrl()` her ortamda yalnız origin döndürüyor. Üretim dışında da `http:`/`https:` dışındaki şemalar için `null` veriyor (`mailto:` → `null`).

### B-2: çağrı yerlerini kilitleyen testler
- **Yeni:** `tests/app-url-self-links.test.ts`
  - Statik tarama, yorumlar ayıklanmış kod üzerinde: `src` içinde test dışı dosyalarda `localhost:3000`, `app.fabrika.io`, `app.fabrika.dev` ve `//fabrika.app` yasak. Tek istisna `app-url.ts`. Tarayıcının korunan dosyaları gerçekten gördüğünü ve yorum ayıklayıcının string içindeki URL'yi koruduğunu ayrı bir test kontrol ediyor.
  - `NEXT_PUBLIC_APP_URL` `.`/`[...]` ile yalnız `app-url.ts` ve `env.ts` içinde okunabiliyor.
  - `instrumentation.register()` gerçekten çağrılıyor ve `reportAppUrlProblem`'in tam 1 kez çağrıldığı kontrol ediliyor. Bu davranış testi, grep değil.
- `provider.test.ts`: `access_type=offline` kontrolü (A6), üretimde `http://`, `?x=1` ve `#x` için `CalendarActionError` + kod kontrolü, redirect_uri'nin yalnız origin'den kurulması, tr/en mesajının var olması.
- `invitation-mail-limit.live.test.ts`: üretimde `http://app.example.invalid` ve `https://app.example.invalid/?x=1` için e-posta gönderilmiyor ve error alert yazılıyor. Ayrıca elle iletilecek link `https://fonbridge.com/tr/accept-invite?token=` ile başlıyor (A4).
- `app-url.test.ts`: B-1 ve B-3 kuralları, `appUrl()` fallback'i ve problem⇔null eşitliği.

## 2. Kanıt

**TDD kırmızısı (kod değişmeden önce, yeni birim testleri):**
```
Test Files  1 failed (1)
     Tests  6 failed | 9 passed (15)
```

**Mutant döngüsü** (6 dosyalık paket: `app-url.test`, `provider.test`, `mailer.test`, `app-url-self-links`, `m9-calendar-connect`, `invitation-mail-limit.live` (izole DB). Her mutant tek eşleşme assert'iyle uygulandı ve yedekten geri yüklendi):
```
A1 RED Tests  1 failed | 88 passed (89)   instrumentation: reportAppUrlProblem() çağrısı kaldırıldı
A2 RED Tests  1 failed | 88 passed (89)   api-keys page apiBaseUrl="https://fabrika.app"
A3 RED Tests  2 failed | 87 passed (89)   alerts-daily process.env.NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io'
A4 RED Tests  2 failed | 87 passed (89)   invitations route mailBaseUrl ?? 'http://localhost:3000'
A5 RED Tests  1 failed | 88 passed (89)   layout metadataBase new URL('http://localhost:3000')
A6 RED Tests  1 failed | 88 passed (89)   google.ts access_type: 'offline' silindi
A7 RED Tests  1 failed | 88 passed (89)   digest-run renderDigestHtml(summary, 'https://app.fabrika.io')
B1 RED Tests  6 failed | 83 passed (89)   appBaseUrl yalnız 'loopback'ta null (düzeltme öncesi davranış)
B3a RED Tests  4 failed | 85 passed (89)  search/hash kontrolü silindi
B3b RED Tests  2 failed | 87 passed (89)  origin yerine ham değer döndürülüyor (eski davranış)
B3c RED Tests  2 failed | 87 passed (89)  path/kimlik bilgisi kontrolü silindi
C1 RED Tests  1 failed | 88 passed (89)   takvim düz Error fırlatıyor (kodsuz, çevrilemez)
BASE after restore 0 Tests  89 passed (89)
```
be-fb'nin §2.2'deki 7 geri dönüşünün 7'si de kırmızı. Önceden 7/7 hayatta kalıyordu. Kendi mutantlarımın 5'i de kırmızı.

**B-1 canlı davet testinde düzeltme öncesi davranış (B1 mutantı yalnız `invitation-mail-limit.live`, izole DB):**
```
× without a usable NEXT_PUBLIC_APP_URL in production nothing is mailed and an error alert is raised
AssertionError: expected { status: 200, body: { …(4) } } to match object { status: 200, body: { …(3) } }
Tests  1 failed | 15 passed (16)
→ geri alındı: Tests  16 passed (16)
```
Yani eski kodla `http://` değeri e-postayı gönderiyordu (`emailSent: true`). Yeni kodla e-posta gitmiyor ve alert yazılıyor.

**Kapılar:**
```
npx tsc --noEmit        → tsc=0
eslint (dokunulan 9 .ts dosyası) → lint=0
pnpm i18n:check         → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
hedefli vitest (calendar + app-url + m9-calendar-connect) → Test Files 7 passed (7), Tests 87 passed (87)
```
**Temiz worktree** (`git worktree add --detach … 10173a08`, `pnpm install --frozen-lockfile`, `prisma generate`):
```
pnpm build → build=0
```
**Tam süit**, aynı temiz worktree'de, izole DB'de. DB, `fabrika-postgres` içinde `csfb_mun3` adıyla `pg_dump` kopyası. Üç `DATABASE_URL*` bu DB'ye yönlendirildi. Paylaşılan `fabrika` DB'sine yazılmadı:
```
Test Files  233 passed | 2 skipped (235)
     Tests  2723 passed | 8 skipped (2731)
exit=0
```
**Temizlik:** kendi worktree'm kaldırıldı (`git worktree remove --force`). `DROP DATABASE csfb_mun3 WITH (FORCE)` → `DROP DATABASE`. Listede kalan iki scratch worktree başka oturumlara ait, onlara dokunmadım.

### 2.1 Yeniden doğrulama (29.09.2026, ikinci oturum, `dev` HEAD `86fc0cc2` üzerinde)
Önceki oturum kodu `10173a08` ile commit'ledi, ama bu rapor commit'lenmemişti. Yukarıdaki iddiaları yeni bir temiz worktree'de (`git worktree add --detach <scratchpad>/wt HEAD`, `pnpm install --frozen-lockfile`, `prisma generate`) kendim yeniden koştum. Paylaşılan ağaca dokunmadım.

**be-fb §2.2 geri dönüşleri (A1–A7).** Her biri tek eşleşme assert'iyle uygulandı ve yedekten geri yüklendi. DB'siz 3 dosyalık paket: `src/lib/app-url.test.ts`, `src/lib/calendar/__tests__/provider.test.ts`, `tests/app-url-self-links.test.ts`:
```
BASE Tests  38 passed (38)
A1 Tests  1 failed | 37 passed (38)   instrumentation reportAppUrlProblem() silindi
A2 Tests  1 failed | 37 passed (38)   api-keys apiBaseUrl="https://fabrika.app"
A3 Tests  2 failed | 36 passed (38)   alerts-daily NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io'
A4 Tests  1 failed | 37 passed (38)   invitations route mailBaseUrl ?? 'http://localhost:3000'
A5 Tests  1 failed | 37 passed (38)   layout metadataBase new URL('http://localhost:3000')
A6 Tests  1 failed | 37 passed (38)   google.ts access_type: 'offline' silindi
A7 Tests  1 failed | 37 passed (38)   digest-run renderDigestHtml(summary, 'https://app.fabrika.io')
RESTORED Tests  38 passed (38)
```
7/7 kırmızı. be-fb'nin 10 dosyalık paketinde bu 7'si hayatta kalıyordu (`115 passed | 17 skipped`). Worktree sonunda `git status` temizdi.

**B-1 / B-3 probe** (`NODE_ENV=production`, her değer ayrı süreç, çünkü env modül yüklenirken okunuyor):
```
"http://fonbridge.com"        problem insecure base null
"https://fonbridge.com/?x=1"  problem invalid  base null
"https://fonbridge.com#a"     problem invalid  base null
"https://fonbridge.com?"      problem invalid  base null
"https://fonbridge.com/app"   problem invalid  base null
"https://u:p@fonbridge.com"   problem invalid  base null
"https://fonbridge.com/"      problem null     base https://fonbridge.com
"https://fonbridge.com"       problem null     base https://fonbridge.com
```
be-fb'nin probe'unda `http://` → `appBaseUrl http://fonbridge.com` ve `?x=1` → `problem null` çıkıyordu. Şimdi ikisi de `null`, yani davet e-postası gitmiyor ve takvim reddediyor. Üretimde geçerli değer (sonda `/` olsa da) hâlâ çalışıyor.

**Kapılar (aynı worktree):**
```
npx tsc --noEmit                                  → tsc=0
eslint (10173a08'in 10 .ts dosyası)               → lint=0
pnpm i18n:check                                   → ✅ i18n check passed: both catalogs agree, … i18n=0
vitest src/lib/calendar + app-url + self-links + mailer → Test Files 7 passed (7) · Tests 77 passed (77)
pnpm build                                        → build=0
```
Tam süiti bu oturumda yeniden koşmadım. §2'deki tam süit sonucu (`2723 passed | 8 skipped`, izole DB) önceki oturumdandır. Bu oturumdaki kod farkı yalnız fe-fb'nin footer commit'leri (`9a683b39`, `2a34cec2`, `86fc0cc2`), app-url koduna dokunmuyorlar.

### 2.2 İNCELEME-39 bulgularının kapanışı
| Bulgu | Durum | Kanıt |
|---|---|---|
| B-1 üretimde `http://` e-posta + takvim açık | **Kapandı** | probe `insecure → base null`; canlı davet testi B1 mutantında kırmızı (§2) |
| B-2 çağrı yeri testleri yok | **Kapandı** | A1–A7 7/7 kırmızı (§2.1) |
| B-3 sorgu/`#` içeren değer | **Kapandı** | probe `?x=1`, `#a`, `?` → `invalid`; B3a–c mutantları kırmızı (§2) |

## 3. Değişen dosyalar (commit `10173a08`)
- `src/lib/app-url.ts`: B-1 ve B-3 kuralı, `parseAppUrl` yardımcısı
- `src/lib/app-url-alert.ts`: `invalid` açıklaması ve yorum
- `src/lib/calendar/google.ts`: `CalendarActionError('CALENDAR_APP_URL_NOT_CONFIGURED')`
- `src/lib/calendar/errors.ts`: yeni kod
- `src/app/api/invitations/route.ts`: alert ve log metni, yorum (davranış kodu değişmedi)
- `messages/tr.json`, `messages/en.json`: yalnız `CALENDAR_APP_URL_NOT_CONFIGURED` satırı. Paylaşılan ağaçta başka ajanların staged hunk'ları vardı. Commit'i geçici bir index ile kurdum (HEAD blob + benim satırım). Ortak index'i "onların staged hali + benim satırım" olarak güncelledim, yani onların işi ne commit'e girdi ne de geri alındı.
- `.env.example`: origin notu
- Testler: `src/lib/app-url.test.ts`, `src/lib/calendar/__tests__/provider.test.ts`, `tests/invitation-mail-limit.live.test.ts`, **yeni** `tests/app-url-self-links.test.ts`
- devop-fb'nin `llm*`/m11 dosyalarına ve diğer commit'lenmemiş işlere dokunmadım. `git show --name-only HEAD` yalnız yukarıdaki 12 dosyayı listeliyor.

## 4. Riskler
- **Davranış değişikliği:** Üretimde `NEXT_PUBLIC_APP_URL` `http://` ya da path/sorgu içeriyorsa davet e-postası artık gitmiyor. Bu kasıtlı ve belgeyle uyumlu. Canlıda değer `https://fonbridge.com` değilse davetler yalnız elle iletilecek link ile çalışır, error SystemAlert de açılır. Deploy'dan önce canlı env kontrol edilmeli.
- **Kapsam genişlemesi (B-3):** Path ve kimlik bilgisi de `invalid` sayılıyor. İleride uygulama bir alt path'te (`basePath`) yayınlanırsa bu kuralın gevşetilmesi gerekir. Bugün `next.config`'te `basePath` yok.
- Statik tarama yalnız bilinen eski origin'leri yakalıyor. Tamamen yeni, sabit yazılmış bir alan adını yakalamaz. `NEXT_PUBLIC_APP_URL` doğrudan okuma yasağı bu boşluğun bir kısmını kapatıyor.
- **Takvim:** `connect()` bugün hiçbir yerden çağrılmıyor (`connectCalendar('google')` önce `CALENDAR_OAUTH_NOT_CONFIGURED` ile reddediliyor). Yeni kod callback kartı açıldığında devreye girecek. `state` doğrulaması ve callback rotası be-fb §6.2'deki ayrı kartın konusu.

**Platform beyanı:** Doğrulama macOS'ta (Darwin 27.0.0) yapıldı: Node + vitest, Docker'da Postgres. Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. Kod platformdan bağımsız: WHATWG `URL`, `URLSearchParams`, string karşılaştırma. Yeni test `node:path` `join`/`resolve`/`relative` kullanıyor ve `RULE_FILES` ile `/` ayırıcılı yolları karşılaştırıyor. Windows'ta `relative()` `\` döndüreceği için bu test Windows'ta yanlış sonuç verebilir. Aynı kalıp mevcut `retired-brand-name.test.ts`'de de var. CI ve üretim Linux, orada davranış macOS ile aynı.

## 5. Açık sorular
- **Ö-1:** Path/kimlik bilgisini `invalid` saymak (B-3'ün biraz ötesi) kabul mü? İnceleyen reddederse tek satırlık bir geri alma yeterli (mutant B3c testleri de birlikte çıkar).
- **Ö-2:** be-fb Ö-2 (`AUTH_URL` ile `NEXT_PUBLIC_APP_URL` aynı origin mi kontrolü) ve Ö-3 (`docs.fabrika.app`) bu kartın kapsamı dışında, açık kalıyor.

## 6. Sonraki adım
0. Bu oturumda ayrıca TASK-MUN2UXWTAX1AQ (fe-fb, altbilgi) incelendi: **ONAY**, bulgular `docs/agent-results/TASK-MUN2UXWTAX1AQ-cs-fb-inceleme.md`.
1. Yeniden inceleme (İNCELEME-39 takibi): §2'deki mutant tablosu ve B-1 canlı kırmızısı.
2. Patron/devop: canlı `NEXT_PUBLIC_APP_URL=https://fonbridge.com` olmalı. Tam olarak bu değer olmalı: sonda `/` olabilir, path ya da sorgu olmamalı.
3. Callback kartı (be-fb §6.2) açıldığında `CALENDAR_APP_URL_NOT_CONFIGURED` ayar ekranında gösterilecek. Çevirisi hazır.
