# TASK-MUN4N6GFR08SX — be-fb — FB İNCELEME-39 (kod değiştirilmedi)

**Sprint:** FB-KAMU-2 · **Dal:** `dev` @ `13c40556` · **İnceleme ortamı:** temiz worktree (`git worktree add --detach … 13c40556`, `pnpm install --frozen-lockfile`, `prisma generate`) + kendi scratch Postgres konteynerim (`befb-mun4n`, pgvector:pg16, port 55491, DB adı `fbrev`). Paylaşılan `fabrika-postgres`'e dokunulmadı.

| Kart | Karar |
|---|---|
| **TASK-MUN3OAFIVW9NA** (fe-fb), `9b63111d` + `373d4133` | **DÜZELTME GEREKLİ**: B-1 (davranış ile belge çelişiyor), B-2 (test boşluğu) |
| **TASK-MUN2J9LLXNREG** (cs-fb), `4a100e41` + `5bc98767` | **ONAY**: 1 test notu (Ö-5) |

---

## 1. Ne yapıldı

### 1.1 TASK-MUN3OAFIVW9NA: NEXT_PUBLIC_APP_URL tek kaynak, Google Calendar redirect_uri

Karttaki her kontrol maddesi ayrı ayrı doğrulandı:

| Kontrol | Sonuç |
|---|---|
| `src` içinde test dışı sabit localhost ya da alan adı | Kendi `grep` taramam fe-fb'nin 1.4 tablosuyla örtüşüyor. Uygulamanın kendine verdiği linklerde sabit değer kalmadı. Kalanlar: ICS UID `@fabrika.app` (kimlik), `docs.fabrika.app` (dış site, Açık soru 4), `WORKER_URL` ve `DATABASE_URL` varsayılanları, `@usfinbridge.com` e-posta adresleri. Hepsi raporda gerekçesiyle "bırakıldı" olarak listelenmiş. |
| redirect_uri kodlanıyor mu | ✓ `URLSearchParams` ile kodlanıyor. Test hem çözülmüş değeri hem `%3A%2F%2F` biçimini kontrol ediyor. |
| redirect_uri env'den mi | ✓ `appBaseUrl()`. Değer yoksa ya da üretimde loopback ise `connect()` hata fırlatıyor. **Ama üretimde `http://` değeri geçiyor, bkz. B-1.** |
| `state` callback'te gerçekten doğrulanıyor mu | ✗ **Callback rotası yok** (`src/app/api/calendar` dizini yok). `connect()`'i çağıran bir yer de yok (`grep '\.connect()'` → 0). `state` üretiliyor (32 bayt, base64url, her çağrıda farklı), ama doğrulayan kod yok. fe-fb bunu Risk 1'de kendisi yazmış. Bu kartın kapsamı URL üretimiydi, o yüzden ret nedeni değil. Callback kartı açılmalı (§6). |
| Scope en dar mı | `calendar.events`, `calendar`'dan çok daha dar ve sağlayıcının yaptığı işi (etkinlik oluşturma, güncelleme, silme) karşılıyor. Daha dar adaylar: `calendar.events.owned` (fe-fb Açık soru 1) ve `calendar.app.created` (yalnız uygulamanın kendi oluşturduğu ikincil takvim). Bunlar ürün kararı. Kabul. |
| AUTH_URL ile NEXT_PUBLIC_APP_URL tutarlılığı | `src` `AUTH_URL`/`NEXTAUTH_URL` okumuyor. Auth.js `trustHost: true` (`src/lib/auth.ts:309`) ile callback'i isteğin Host başlığından kuruyor. `.env.example`'da not var. İki değerin aynı olduğunu kontrol eden bir kod yok (Ö-2). |
| Mutant | fe-fb'nin 8 mutantı `app-url.ts`/`google.ts` içindeki kurallara yönelik. Benim 7 mutantım çağrı yerlerine yönelik ve **7/7 hayatta kaldı** (B-2). |

**B-1 (DÜZELTME).** Üretimde `NEXT_PUBLIC_APP_URL=http://fonbridge.com` olduğunda uyarı çıkıyor. Ancak davet e-postası ve Calendar bağlantısı kapanmıyor, `http://` linkle çalışmaya devam ediyor. Buna karşın iki belge "kapalı kalır" diyor:
- `.env.example`: "In production an unset, localhost or http:// value writes an error SystemAlert at startup; **Google Calendar connect and invitation mails stay off until it is fixed**."
- `src/lib/app-url-alert.ts` yorumu: "…but Google Calendar connect and invitation mails stay off."

Kanıt (probe, `tsx`, üretim kaynağı):
```
problem insecure appBaseUrl http://fonbridge.com mailBase http://fonbridge.com
redirect_uri http://fonbridge.com/api/calendar/callback
```
Yani davet e-postasındaki token'lı link `http://` ile gidiyor, Calendar da `http` redirect_uri üretiyor (Google bunu localhost dışında reddeder). **Düzeltme önerisi:** `appBaseUrl()` üretimde `https:` olmayan bir değer için `null` dönsün. `appUrlProblem` zaten bunu `insecure` olarak adlandırıyor. Böylece belgedeki "kapalı kalır" doğru olur, `appUrl()` da `CANONICAL_APP_URL`'ye düşer. Buna bir test eklenmeli: `appBaseUrl(prod('http://fonbridge.com'))` için `null`, `connect()` için hata. Kod değiştirilmeyecekse belge düzeltilmeli, ama önerilen yol kodu düzeltmek.

**B-2 (DÜZELTME, test).** Kural testleri (`app-url.test.ts`) sağlam. Ancak kuralı çağıran yerleri hiçbir test kontrol etmiyor. Aşağıdaki geri dönüşlerin hepsi 10 dosyalık ilgili pakette yeşil kaldı (§2.2). Bu yüzden bir sonraki düzenlemede sabit localhost ya da eski alan adı sessizce geri gelebilir. Önerilen en ucuz kapı, `tests/retired-brand-name.test.ts` biçiminde bir statik tarama: `src` içinde test dışı kodda `localhost:3000`, `app.fabrika.io`, `app.fabrika.dev`, `https://fabrika.app` yasak (izinli istisnalar listelenir). Ayrıca `instrumentation.ts`'nin `reportAppUrlProblem()`'i çağırdığını kontrol eden tek satırlık bir test eklenmeli.

**B-3 (küçük, B-1 ile birlikte yapılabilir).** `NEXT_PUBLIC_APP_URL=https://fonbridge.com/?x=1` gibi sorgu ya da `#` içeren bir değer `appUrlProblem` için sorun sayılmıyor (`null`), `appBaseUrl` ise onu olduğu gibi döndürüyor. Bu durumda redirect_uri `https://fonbridge.com/?x=1/api/calendar/callback` oluyor (probe çıktısı: `query-url null https://fonbridge.com/?x=1`). `url.search || url.hash` doluysa `invalid` sayılmalı.

### 1.2 TASK-MUN2J9LLXNREG: davet temizliği gece işi

| Kontrol | Sonuç |
|---|---|
| Silme sorgusu tarih filtreli mi, boş ya da undefined `where` olabilir mi | ✓ `purgeableInvitationWhere(cutoff)` yalnız geçerli bir `Date`'ten kuruluyor. Geçersizse `RangeError` fırlatıyor. `invitationPurgeCutoff` de `retentionDays < 1`, tam sayı olmayan değer ve NaN `now` için hata veriyor. Kiracı başına `deleteMany` `AND: [{ tenantId }, due]` kullanıyor. Boş `where` yolu yok. |
| Bekleyen (süresi dolmamış) davete dokunuyor mu | ✓ Dokunmuyor. `acceptedAt IS NULL AND expires < now−30g` koşulunu bekleyen bir satır sağlayamaz. Kabul edilen satır `acceptedAt`'e göre değerlendiriliyor. Yeniden davet `acceptedAt`'i boşaltıp `expires`'ı ileri aldığı için (`route.ts:73`, `:148`) süre yeniden başlıyor. Canlı test "pending kalır" ve "tam sınırdaki satır kalır" durumlarını kontrol ediyor. |
| Başka tabloda Invitation'a FK var mı | Yok (`schema.prisma`: yalnız `tenant` ilişkisi). Silme, üyelik gibi başka bir satırı zincirleme silmiyor. |
| graphile-worker kalıbı | ✓ `defineJob`, cron `30 3 * * *`, `?id=invitation-cleanup` (her tik için tek iş), `max=5`, `fill=6h`, `missedTickAlert: true`. Ayarlar kardeş gece işleriyle aynı (`users-scheduled-deletion`, `stripe-event-cleanup`). Hata olursa hemen `error` SystemAlert yazıyor, sonra hatayı yeniden fırlatıyor; son denemede wrapper tükenen iş uyarısını ekliyor. `tick` kullanılıyor, yükten gelen değer pencereyi genişletemiyor. |
| Tek-kez / eşzamanlılık | ✓ **Kendi canlı testim**: aynı anda 3 `purgeOldInvitations()`. Sonuç: eski satırlar bir kez silindi, bekleyen satır kaldı, kiracı başına tam **1** audit satırı (A:3, B:2). Bunu sağlayan `if (count === 0) continue` korumasıdır. Koruma kaldırılınca aynı test 4 fazladan `count: 0` audit satırı üretiyor (§2.3). |
| Audit yalnız sayı mı | ✓ `data: { count, retentionDays, cutoff }`. Adres ya da id yok. `ids: []` eklenen mutant (C10) kırmızı oldu. |
| İzole DB'de canlı test | ✓ 6/6. Dosya paylaşılan `fabrika` DB'sinde çalışmayı reddediyor (CI dışında). |
| En az 2 mutant | ✓ **10 mutant, 9'u kırmızı**. Hayatta kalan C6'yı yarış testim yakalıyor (Ö-5). |
| Envanter §2 güncel mi | ✓ `processing-register.md` §2 saklama satırı güncel: 30 gün, iki dal, 37 gün üst sınırı, iş adı, saat, `invitation.purged` içeriği, SystemAlert ve kaçırılan tik. §22 md.14 ve 16 kapatılmış. HUKUK-SORULARI 1.8 §5 md.6 işlenmiş. Kod ile belge arasında çelişki bulmadım. `route.ts:73` ve `:148` satırları kodla eşleşiyor. |

---

## 2. Kanıt

### 2.1 Ortam ve kapılar (worktree `13c40556`)
```
prisma db push                → 🚀 Your database is now in sync with your Prisma schema.
pnpm db:rls-role              → ✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.
apply-migrations.sh (1. koşu) → mig1=0
apply-migrations.sh (2. koşu) → mig2=0 · "apply-migrations: 34 files applied"
pnpm db:rls                   → ✅ prisma/rls.sql applied. Policies in public: 28 → 112
pnpm db:seed                  → seed=0
npx tsc --noEmit              → tsc=0
eslint (iki commit'in .ts/.tsx dosyaları) → lint=0
```
**Tam süit** (izole DB, CI sırası: push → rls-role → migrations ×2 → rls → seed):
```
 Test Files  228 passed | 2 skipped (230)
      Tests  2677 passed | 8 skipped (2685)
exit=0
```
Not: ilk tam koşuyu `db:seed`'den önce yaptım, 7 test kırmızıydı (`no Topic rows locally`, `ModuleNotGrantedError … M6`). Bunlar tohum verisi eksikliğiydi. CI `pnpm db:seed` çalıştırıyor, tohumdan sonra 0 kırmızı kaldı. İnceleme sonunda: `Tenant` 0 → 0 (koşu öncesi ve arası), `Invitation` 0. Konteyner kaldırıldı (§2.4).

### 2.2 Kart 1: çağrı yeri mutantları (10 dosyalık paket, taban `115 passed | 17 skipped`)
Paket: `app-url.test.ts`, `calendar/__tests__/provider.test.ts`, `modules/api-keys.test.ts`, `billing-checkout-auth.test.ts`, `alerts-daily.test.ts`, `feedback-digest-run.test.ts`, `beta/checkin-schedule.test.ts`, `retired-brand-name.test.ts`, `invitation-accept.live`, `invitation-mail-limit.live`.
```
A1 instrumentation: reportAppUrlProblem() çağrısı silindi          → 115 passed | 17 skipped [restored]
A2 api-keys/page.tsx apiBaseUrl="https://fabrika.app"               → 115 passed | 17 skipped [restored]
A3 alerts-daily: NEXT_PUBLIC_APP_URL || 'https://app.fabrika.io'    → 115 passed | 17 skipped [restored]
A4 invitations route: mailBaseUrl ?? 'http://localhost:3000'        → 115 passed | 17 skipped [restored]
A5 layout metadataBase new URL('http://localhost:3000')             → 115 passed | 17 skipped [restored]
A6 google.ts access_type: 'offline' silindi                         → 115 passed | 17 skipped [restored]
A7 digest-run renderDigestHtml(summary, 'https://app.fabrika.io')   → 115 passed | 17 skipped [restored]
```
7/7 hayatta kaldı (B-2). A4 ve A5, `NODE_ENV=test` ortamında eşdeğerdir (`appUrl()` zaten localhost döner), ancak üretimde davranış farklıdır ve bunu yakalayacak bir üretim testi yok. Her mutant yedekten geri yüklendi ve `git diff --quiet` ile doğrulandı. Bu 10 dosyalık pakette `invitation-accept.live` 17 testi `AUTH_SECRET` olmadığı için atlandı. Tam süitte `AUTH_SECRET` verildi ve bu testler koştu.

B-1 / B-3 probe'u (tsx, geçici dosya silindi):
```
problem insecure appBaseUrl http://fonbridge.com mailBase http://fonbridge.com
query-url null https://fonbridge.com/?x=1
redirect_uri http://fonbridge.com/api/calendar/callback
```

### 2.3 Kart 2: mutantlar (`invitation-retention.live` + `invitation-cleanup` + `jobs-schedule` + `where-guard-src`, taban `32 passed`)
```
C1 ikinci dalda acceptedAt: null kaldırıldı                → 2 failed | 30 passed
C2 acceptedAt lt → lte                                     → 1 failed | 31 passed
C3 deleteMany where: due (tenantId AND'i yok)              → 4 failed | 28 passed
C4 cutoff işareti ters (now + 30g → pending'e ulaşır)       → 6 failed | 26 passed
C5 retentionDays < 1 → < 0 (0 günlük pencere)              → 2 failed | 30 passed
C6 if (count === 0) continue silindi                       → 32 passed   ← hayatta
C7 job tick yerine new Date()                              → 1 failed | 31 passed
C8 hata SystemAlert'i yazılmıyor                           → 2 failed | 30 passed
C9 withSystemScope yerine düz prisma (fabrika_app)         → 5 failed | 27 passed
C10 audit data'ya ids: [] eklendi                          → 1 failed | 31 passed
```
**Kendi eşzamanlılık testim** (geçici `tests/zz-befb-invret-race.live.test.ts`, 3 paralel purge, A'da 3 eski + 1 bekleyen, B'de 2 eski-kabul):
- Taban: 3 koşunun 3'ü de `1 passed`.
- C6 ile: `1 failed`, çıktı `RACE results [5,0,0] audits [{"t":"A","count":3},{"t":"A","count":0},{"t":"A","count":0},{"t":"B","count":2},{"t":"B","count":0},{"t":"B","count":0}]`.

Geçici dosya worktree'den çıkarıldı. `git status --short` boş.

Canlı dosya, verbose:
```
✓ deletes used and expired invitations past the window, keeps pending and recent ones
✓ an accepted row is judged by when it was accepted, not by its link expiry
✓ the cutoff is strict: a row exactly at the edge stays
✓ writes one invitation.purged audit per tenant with the count and no address; a second run changes nothing
✓ refuses a window that would reach pending invitations, before touching the database
✓ the job purges by its cron tick and reports the result
```

### 2.4 Temizlik
Scratch worktree ve `befb-mun4n` konteyneri (yalnız benim açtığım) iş sonunda kaldırıldı. §3'te komut çıktısı var.

## 3. Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUN4N6GFR08SX-be-fb.md`. Kod değiştirilmedi.
- Temizlik: `git worktree remove --force <scratch>/wt` ve `docker rm -f befb-mun4n`. İkisini de ben açtım.

## 4. Riskler
- **Kart 1 B-1:** Üretimde `http://` değeri girilirse token'lı davet linki şifresiz gider. Uyarı yazılıyor, ama belge operatöre "kapalı kalır" dediği için uyarı ciddiye alınmayabilir.
- **Calendar akışı yarım:** `state` üretiliyor ama doğrulanmıyor, callback rotası yok. `connect()` bugün hiçbir yerden çağrılmadığı için şu an bir saldırı yüzeyi yok. Birisi callback'i `state` kontrolü olmadan eklerse CSRF açığı oluşur. Ayrıca `prompt=consent` yok. Google `refresh_token`'ı yalnız ilk onayda döndürür, kullanıcı ikinci kez bağlanırsa token gelmez. Callback kartında ele alınmalı.
- `trustHost: true` ve Host'tan kurulan Auth.js callback'i: ters proxy Host'u normalize etmezse sahte Host ile üretilen linkler olabilir. Bu önceden vardı, bu kartla gelmedi. `AUTH_URL` sabitlenirse kapanır.
- **Kart 2:** Tüm kiracıları tek transaction'da siliyor. Pilot ölçeğinde sorun değil. Satır sayısı büyürse kilit süresi uzar (Ö-6).

## 5. Açık sorular / notlar
- **Ö-1 (Kart 1):** Scope `calendar.app.created` ya da `calendar.events.owned` olabilir mi? Ürün kararı.
- **Ö-2 (Kart 1):** `AUTH_URL` ayarlandığında `appUrlProblem` onun `NEXT_PUBLIC_APP_URL` ile aynı origin olduğunu da kontrol etsin mi? İki farklı alan adı iki farklı Google redirect URI demektir.
- **Ö-3 (Kart 1):** `docs.fabrika.app` linkleri (`admin/layout.tsx:136`, `UserMenu.tsx:574`) arayüzde hâlâ görünüyor. Site yoksa kullanıcı ölü bir linke gider (fe-fb Açık soru 4 ile aynı).
- **Ö-4 (süreç):** Görev metnindeki "KANIT ZORUNLU" satırı sonucu `/Users/macbook/alan/docs/agent-results/TASK-MUN3OAFIVW9NA-fe-fb.md` dosyasına yazmamı istiyordu. Bu, incelenen kartın fe-fb raporunun adı ve repo dışında bir yol. Onun raporunun üzerine yazmamak için gövdedeki SONUÇ DOSYASI yoluna yazdım: `/Users/macbook/alan/FONBRIDGE/docs/agent-results/TASK-MUN4N6GFR08SX-be-fb.md`.
- **Ö-5 (Kart 2, test):** C6 (`count === 0` koruması) commit'teki süitte hayatta kalıyor. §2.3'teki 3 paralel purge testi `invitation-retention.live.test.ts`'e eklenmeli. Ret nedeni değil, kod doğru.
- **Ö-6 (Kart 2):** Satır sayısı büyürse kiracı başına ayrı transaction ya da `LIMIT`'li parçalı silme düşünülebilir. Şimdilik gerek yok.

## 6. Sonraki adım
1. **fe-fb (TASK-MUN3OAFIVW9NA düzeltme):** B-1 (`appBaseUrl` üretimde yalnız `https:` kabul etsin, testle), B-2 (statik tarama testi ve instrumentation çağrısı testi), B-3 (sorgu ya da hash içeren değer `invalid`).
2. **Yeni kart:** `/api/calendar/callback`. İçermesi gerekenler: `state` httpOnly çerezde tutulup sabit-zamanlı karşılaştırılsın, token değişiminde aynı `appBaseUrl()` redirect_uri kullanılsın, `prompt=consent`, `calendar-actions.ts`'ye bağlansın.
3. **cs-fb (isteğe bağlı):** Ö-5 eşzamanlılık testi.
4. **Patron/devop:** Canlıda `NEXT_PUBLIC_APP_URL=https://fonbridge.com` ayarlanmalı. Google Cloud OAuth istemcisine iki redirect URI eklenmeli (`.env.example`'daki liste).

**Platform beyanı:** Doğrulama **macOS**'ta (Darwin 27.0.0) yapıldı: Node + vitest, Docker'da pgvector:pg16. İncelenen kodun platforma bağlı bir yolu yok. URL kurma, Prisma sorguları ve graphile-worker cron'u işletim sisteminden bağımsız. İş üretimde Linux sunucuda çalışacak, orada da davranış aynı olur. Windows ve Linux'ta **koşulamadı**: bu makinede yalnız macOS var. Kodda dosya yolu, kabuk ya da süreç çağrısı olmadığı için fark beklenmiyor.
