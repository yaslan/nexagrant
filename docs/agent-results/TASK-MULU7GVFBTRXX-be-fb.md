# TASK-MULU7GVFBTRXX — FB güvenlik düzeltmesi: kanıtların yeniden üretimi (be-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`. Düzeltme kodu `f7a36779` (Ö-1, Ö-2, K-1…K-4) ve `9b373fb4` (K-6) commit'lerinde. Önceki pane rapor yazmadan kapandığı için kanıtları yeniden ürettim. **Kod değiştirilmedi.**

Tüm koşular, HEAD `09cf9bba` üzerinde açılmış ayrık bir worktree'de yapıldı: `git worktree add --detach <scratchpad>/fb`, ardından gerçek `pnpm install` ve `prisma generate`. Symlink'li `node_modules` ile Turbopack derlemeyi reddediyor. Bu yüzden `.next` çıktısı ana ağacın `.next`'ine hiç dokunmadı. Sunucular yalnız :3100'de açıldı ve kapatıldı. :3000'e (leed-fb) dokunulmadı. Raporlama anında HEAD `13998ebf`: aradaki 5 commit, doğrulanan dosyaların hiçbirine dokunmuyor (`git diff --stat 09cf9bba HEAD -- src/lib/auth.ts src/lib/demo-login.ts src/lib/auth-secret.ts src/instrumentation.ts .env.example prisma/migrations/fix-agency-invite-rejection-audit.sql tests/agency-invite.live.test.ts` → boş).

Sır değeri basılmadı. Çerez ve token değerleri yalnız dosyada tutuldu, iş sonunda silindi.

## 1. Ne yapıldı

| Bulgu                                    | Sonuç                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ö-1 derleme zamanı kilidi                | **Kapandı.** `NODE_ENV=test` veya `development` ile başlatılan bir üretim derlemesi, bayrak açıkken **açılmıyor** (exit 1, dinleyici 0). Bu hem `next start` hem de standalone `server.js` için geçerli. Bayrak kapalıyken aynı derleme çalışıyor: e-posta formu yok, `credentials` sağlayıcısı yok, POST oturum açmıyor. `next dev` ile bayrak açıkken demo girişi çalışıyor. |
| Ö-2 admin claim'i DB'den                 | **Kodda kapandı, yerel veride bir kalıntı var.** Bayrak kapalıyken, DB satırı admin olmayan bir kullanıcının demo-admin token'ı `isPlatformAdmin: False` döndü. Gerçek `admin@…` çerezi ise bayrak kapalıyken de `True` döndü. Sebep kod değil: yerel DB'de bu kullanıcının satırında, eski koddan kalma `isPlatformAdmin=t` var. Ayrıntı §2.2 ve §5'te.                       |
| K-1 `.env.example`                       | Kapandı: `DEMO_LOGIN_ENABLED=false`.                                                                                                                                                                                                                                                                                                                                           |
| K-2 DB'ye admin yazılmıyor               | Kapandı. Kodda artık `isPlatformAdmin` yazan bir yol yok, birim testi de var. Eski satır temizlenmedi (§5).                                                                                                                                                                                                                                                                    |
| K-3 kısa AUTH_SECRET                     | Kapandı. Birim testi var. Üretim derlemesi kısa anahtarla açılmıyor (exit 1).                                                                                                                                                                                                                                                                                                  |
| K-4 emekli anahtar testi                 | Kapandı. Parametreli digest kümesi ile birim testi var.                                                                                                                                                                                                                                                                                                                        |
| K-6 NULL-tenant `agency.invite.rejected` | Kapandı. Migration iki kez exit 0 verdi, fonksiyon gövdesinin md5'i değişmedi. Tam test ve ayrıca canlı suite sonrası NULL-tenant sayısı 0.                                                                                                                                                                                                                                    |
| Kapılar                                  | typecheck, lint, test, `rls:check`, `rls:bypass-check`, `rls:verify` → hepsi exit 0.                                                                                                                                                                                                                                                                                           |

## 2. Kanıt

### 2.1 Ö-1: üretim derlemesi, `NODE_ENV=test` ile

```
$ NODE_ENV=test DEMO_LOGIN_ENABLED=true pnpm build          → build exit=0

Derlenmiş çıktı (.next/server/chunks/src_lib_demo-login_ts_*.js), builtForProduction varsayılanı literal true:
  e.s(["assertDemoLoginAllowed",0,function(e=c$,t=!0){if("true"===e.DEMO_LOGIN_ENABLED&&(t||"production"===e.NODE_ENV))throw new ch}]

[1] NODE_ENV=test DEMO_LOGIN_ENABLED=true next start -p 3100
  ✓ Ready in 80ms
  DEMO_LOGIN_ENABLED=true is not allowed in a production build or with NODE_ENV=production: it lets anyone sign in … the server will not start with it.
  exit code=1
  listeners on 3100: 0
  curl /api/auth/providers → http=000 (bağlantı yok)

[2] standalone: cd .next/standalone && NODE_ENV=test DEMO_LOGIN_ENABLED=true PORT=3100 node server.js
  DEMO_LOGIN_ENABLED=true is not allowed in a production build …
  exit code=1 · listeners on 3100: 0

[3] NODE_ENV=development DEMO_LOGIN_ENABLED=true next start -p 3100
  DEMO_LOGIN_ENABLED=true is not allowed in a production build …
  exit code=1 · listeners on 3100: 0

[4] Aynı üretim derlemesi, NODE_ENV=test DEMO_LOGIN_ENABLED=false next start -p 3100   (çalışan tek yapılandırma)
  listeners: 1
  providers: ['google', 'microsoft-entra-id']                      ← credentials yok
  /tr/login http=200  <h1>FonBridge Platformuna Giriş</h1>  email-input=0 name=email:0   (yalnız "Google ile Devam Et")
  csrf len=64
  POST /api/auth/callback/credentials (csrfToken, email=admin@yasinaslan.com.tr, password=x)
    HTTP/1.1 302 Found
    location: http://localhost:3100/api/auth/error?error=Configuration
  session: null
  session-cookie in jar: 0

Karşılaştırma — next dev, DEMO_LOGIN_ENABLED=true, :3100
  providers: ['google', 'microsoft-entra-id', 'credentials']
  /tr/login email-input=1
  POST /api/auth/callback/credentials (admin@…, password=x)
    HTTP/1.1 302 Found
    location: http://localhost:3100/tr
  session: {'email_domain': 'yasinaslan.com.tr', 'isPlatformAdmin': True, 'hasTenant': True}
```

Görevdeki senaryo (`NODE_ENV=test DEMO_LOGIN_ENABLED=true` + `next start`) artık bir sunucu açmıyor. Bu nedenle o yapılandırmada curl'lenecek bir sunucu yok. "E-posta formu yok, `credentials` yok, POST oturum açmıyor" kanıtı, aynı üretim derlemesinin çalışabildiği tek yapılandırmada ([4]) alındı. Kilit iki katmanlı: `assertDemoLoginAllowed` açılışı reddediyor, `isDemoLoginEnabled` ise `builtForProduction` true iken hiçbir durumda true dönmüyor (`src/lib/demo-login.ts:37`, `:48-55`, `:86-96`).

### 2.2 Ö-2: bayrak kapandıktan sonra claim

Sıra: `next dev` bayrak açıkken çalıştı, admin çerezi alındı, sunucu durduruldu, `DEMO_LOGIN_ENABLED=false next dev -p 3100` ile yeniden başlatıldı ve aynı çerezler denendi. Probe token'lar `next-auth/jwt` `encode()` ile üretildi (salt `authjs.session-token`, `.env`'deki AUTH_SECRET). Her ikisi de `isPlatformAdmin:true` ve `demoAdmin:true` claim'i taşıyor.

```
Yerel DB (User):
  demo-user-superadmin              | admin@yasinaslan.com.tr | isPlatformAdmin=t   ← eski koddan kalma (K-2 öncesi yazılmış)
  cmtv6gz2u0000gcxk2wco8rc5          | demo@usfinbridge.com    | isPlatformAdmin=f

                                                                           bayrak AÇIK   bayrak KAPALI
gerçek admin çerezi (demo-user-superadmin)                                 True          True   ← DB satırı t
demo-admin token: id=cmtv6…(DB'de admin değil), email=admin@… (demo koltuğu)  True          False  ← Ö-2 kapandı
T3: id=cmtv6…, email=demo@usfinbridge.com, sahte claim'ler                  False         False  ← claim DB'den yeniden hesaplanıyor
providers (bayrak kapalı): ['google', 'microsoft-entra-id']
```

Yorum:

- Kod doğru çalışıyor. Admin hakkı yalnız demo bayrağından gelen bir oturum, bayrak kapanınca bir sonraki istekte admin'i kaybediyor.
- Admin claim'i ile oluşturulmuş sahte bir token, DB'de admin olmayan kullanıcıda bayrak açıkken bile `False` dönüyor.
- Görevin istediği tam cümle ("aynı çerezle isPlatformAdmin false") yerel DB'de **üretilemedi**. Sebep: `demo-user-superadmin` satırı DB'de gerçekten admin. Artık doğruluk kaynağı DB olduğu için `True` beklenen sonuç.
- Bu satırı paylaşılan DB'de onaysız değiştirmedim (§5, açık soru 1).

### 2.3 K-1…K-4

```
K-1  .env.example:26-29
     # … Off by default. For local development with the demo seats, set it to `true`
     # in your own .env (the e2e run sets it itself, see playwright.config.ts).
     DEMO_LOGIN_ENABLED=false
     (son değiştiren commit: f7a36779)

K-2  src/lib/auth.ts:274-278  create çağrısında isPlatformAdmin yok ("No `isPlatformAdmin` here, ever")
     src/lib/auth.ts:352-355  mevcut kullanıcı dalında yazma yok
     auth.ts'de kalan isPlatformAdmin geçişleri: :50 (DEMO_PROFILES sabiti), :429 (okuma),
     :434/:446/:462 (token'a DB'den atama), :500-501 (session) → User'a yazan satır yok

K-3  src/lib/auth-secret.ts:27 MIN_AUTH_SECRET_LENGTH = 32, :50-54 red
     Çalışma zamanı: AUTH_SECRET=<24 karakterlik yer tutucu> NODE_ENV=production next start -p 3100
       AUTH_SECRET is too short (under 32 characters). … the server will not start with a guessable session-signing key.
       exit code=1 · listeners 3100: 0

K-4  src/lib/auth-secret.ts:40-43 `retired` parametresi, :55-60 red

$ vitest run src/lib/auth-secret.test.ts src/lib/demo-login.test.ts src/lib/auth-callbacks.test.ts --reporter=verbose
 ✓ auth-secret  > refuses a key shorter than 32 characters
 ✓ auth-secret  > refuses a key whose SHA-256 is on the retired list
 ✓ auth-secret  > the built-in retired list holds only SHA-256 digests, never a value
 ✓ demo-login   > stays off in a production build whatever NODE_ENV the process is started with
 ✓ demo-login   > refuses to start a production build with the flag on, whatever NODE_ENV says
 ✓ demo-login   > the build-time lock is a direct process.env.NODE_ENV read, which Next inlines at build
 ✓ auth-callbacks > a token minted while demo sign-in was on loses admin once the flag is off
 ✓ auth-callbacks > a stale demoAdmin claim is ignored by the session callback with the flag off
 ✓ auth-callbacks > a crafted isPlatformAdmin claim on a non-admin user is recomputed to false (crw-fb T3)
 ✓ auth-callbacks > fails closed: no row, or no database, is no admin
 ✓ auth-callbacks > signing in to the demo admin seat does not set User.isPlatformAdmin
 ✓ auth-callbacks > the Credentials provider is not registered with the flag off
 … (24 testin tamamı)
 Test Files  3 passed (3)
      Tests  24 passed (24)
```

### 2.4 K-6

```
Migration, yerel DB'ye (fabrika-postgres, db fabrika) iki kez, ON_ERROR_STOP=1 ile:
  run 1 exit=0
  run 2 exit=0
  md5(prosrc) iki koşudan önce ve sonra: 58071e976f3a124eb0f4b3a76bb05f5c (değişmedi)
  owner=fabrika secdef=t proconfig={"search_path=public, pg_temp",app.system_scope=on}
  acl={fabrika=X/fabrika,fabrika_app=X/fabrika}
  apply-order.txt: fix-agency-invite-rejection-audit.sql listede (drop-marketplace.sql'den sonra)

SELECT count(*) FILTER (WHERE "tenantId" IS NULL), count(*) FROM "AuditEvent" WHERE type='agency.invite.rejected'
  tam testten önce:                    0 | 1
  tam test (pnpm test) sonrası:        0 | 1
  canlı suite tek başına koştuktan sonra: 0 | 1
SystemAlert source='agency.invite' satırı: önce 0, sonra 0 (test paylaşılan sayaç satırını geri alıyor)

Canlı suite (fabrika_app), 16/16 gövde koştu:
 ✓ refused attempts are counted without the code > a spent code is filed under its agency; an unknown one leaves no tenant-readable row
 Tests  16 passed (16)
```

Kalan tek satır `tenantId`'si dolu, yani bir ajansa ait. Bilinen kodun reddi, tasarım gereği ajansın altına yazılıyor.

"27 satır silindi" bilgisi önceki pane'in tek seferlik temizliğine ait. O koşunun çıktısı kayıp ve migration satır silmiyor (`fix-agency-invite-rejection-audit.sql:27-28`). Bu yüzden sayıyı yeniden üretemedim. Doğrulayabildiğim, bugünkü durumun 0 olduğu.

### 2.5 Kapılar (worktree, HEAD `09cf9bba`, `set -a; source .env; set +a`)

```
$ pnpm typecheck        typecheck exit=0
$ pnpm lint             lint exit=0
$ pnpm test             test exit=0
 Test Files  178 passed | 2 skipped (180)
      Tests  2045 passed | 8 skipped (2053)
$ pnpm rls:check        exit=0  ✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
                                ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
$ pnpm rls:bypass-check exit=0  ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 23 on the sanctioned cross-tenant path, 0 still owed.
$ pnpm rls:verify       exit=0  ✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
```

## 3. Değişen dosyalar

- `docs/agent-results/TASK-MULU7GVFBTRXX-be-fb.md` (bu rapor). Kod değişmedi.
- Paylaşılan DB'ye yazılan tek şey K-6 migration'ının iki kez uygulanması oldu. `CREATE OR REPLACE` aynı gövdeyle çalıştı, md5 değişmedi. Test koşularının bıraktığı kalıcı iz yok (sayımlar önce ve sonra aynı).
- Scratchpad'deki worktree (`git worktree remove --force`), token, çerez ve probe betiği silindi. :3100 kapalı, dinleyici 0. :3000 dinleyicisi (leed-fb) yerinde.

## 4. Riskler

- **Eski admin satırı.** Yerel DB'de `admin@yasinaslan.com.tr` satırı `isPlatformAdmin=t`. Bu satır K-2 düzeltmesinden önce demo yolu tarafından yazıldı. Bayrak kapalıyken de bu hesap platform admin. `allowDangerousEmailAccountLinking: true` olduğu için, aynı adrese bağlı bir Google hesabı da admin olur.
  - Yerelde sınırlı bir risk. Ancak aynı demo yolu herhangi bir staging veya demo DB'sinde çalıştıysa orada da aynı satır vardır.
  - Deploy öncesi `SELECT id, email FROM "User" WHERE "isPlatformAdmin"` denetimi şart.
- Ö-2 düzeltmesi her istekte `User` üzerinde bir `select` ekliyor (birincil anahtarla, tek satır). Performans etkisi düşük.

## 5. Açık sorular

1. Yerel DB'deki (ve varsa staging'deki) `demo-user-superadmin` satırı için `isPlatformAdmin=false` yapılsın mı? Bu, paylaşılan DB'de bir veri değişikliği. Onay olmadan uygulamadım.
   - Uygulama: `UPDATE "User" SET "isPlatformAdmin" = false WHERE id = 'demo-user-superadmin';`
   - Geri alma: `UPDATE "User" SET "isPlatformAdmin" = true WHERE id = 'demo-user-superadmin';`
   - Bayrak açıkken leed-fb'nin :3000'deki demo admin oturumu `demoAdmin` claim'iyle admin kalmaya devam eder.
   - Uygulandıktan sonra görevdeki Ö-2 cümlesi gerçek çerezle de birebir üretilebilir.

## 6. Sonraki adım

- Açık soru 1 onaylanırsa satırı güncelle ve Ö-2'yi gerçek çerezle tekrar koş.
- Deploy kontrol listesine `isPlatformAdmin` satır denetimini ekle.

## Platform beyanı

**macOS**'ta doğrulandı: Darwin 27.0.0, Next.js 16.3.4 (Turbopack), pnpm 11.25, Postgres `pgvector/pgvector:pg16` konteyneri (`fabrika-postgres`, :5433).

Windows ve Linux'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan beklenen davranış:

- Dokunulan yollar platformdan bağımsız: `process.env.NODE_ENV`'in derlemede sabitlenmesi, JWT callback'leri, SQL fonksiyonu.
- `instrumentation.ts`'deki `process.exit(1)` üç platformda da aynı çalışır.
- Kanıt komutları (`lsof`, `docker exec`, kabuk betikleri) macOS/Linux'a özgü. Windows'ta eşdeğerleri gerekir, ancak ürün davranışı değişmez.
