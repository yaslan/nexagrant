# TASK-MULT4H6G6LCQG — FB İNCELEME-2: güvenlik, giriş, B1 ve pazar yeri kaldırma (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`, inceleme anında HEAD `91f4752a`. Kod değiştirilmedi. Kapıları ve çalışma zamanı denemelerini HEAD'in ayrık kopyasında (`git worktree add --detach <scratch>/fb-head HEAD`) kendim koştum. Kendi sunucularımı :3471, :3472 ve :3473'te açıp kapattım; :3000'e (leed-fb) dokunmadım. Sır değeri basılmadı: anahtarlar yalnız uzunluk, md5 veya sha256 öneki ve sayım olarak geçiyor.

## Karar özeti

| Kart                                                    | Karar                                                                                                                        | B   | Ö   | K   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- |
| (1) TASK-MULSCEK4JHK8X — DEMO_LOGIN_ENABLED (be-fb)     | **DÜZELTME GEREKLİ.** Bayrak `NODE_ENV=test` ile üretim derlemesinde atlatılıyor (Ö-1). Admin claim'i token'da kalıcı (Ö-2). | 0   | 2   | 2   |
| (2) TASK-MULRTOTG9IKIM — imza anahtarı (se-fb)          | **ONAY.** Ö-4 ve K-9 kapandı.                                                                                                | 0   | 0   | 3   |
| (3) TASK-MULRQJQYM0NAM — B1 davet kodu (be-fb)          | **ONAY.** Onayın üç koşulu da sağlanmış ve kendi SQL denememle doğrulandı.                                                   | 0   | 0   | 4   |
| (4) TASK-MULSMUB1XU9 — B1 canlı test yardımcısı (fe-fb) | **ONAY.** Ö-3 için takip kartı açılmalı: CI migration'ı uygulamıyor, test orada boş yere yeşil.                              | 0   | 1   | 1   |
| (5) TASK-MULSEGTKZ7O7D — pazar yeri kaldırma (fe-fb)    | **ONAY**                                                                                                                     | 0   | 0   | 2   |

Bloklayan (B) bulgu yok. Ürün düzeyinde bir engel var, kod kusuru değil: bayrak kapalıyken davet koduyla kayıt tamamen kapalı. Yani B1 üretimde çalışmıyor (be-fb raporu §4, patron kararı bekliyor).

## 1. Ne yapıldı

- 15 commit'in diff'ini okudum: `f3cb2536`, `535d2c80`, `bfe33cd7`, `3c5f753a`, `14e5fc50`, `d2994b56`, `7402c2d7`, `a91dd581`, `41ec739c`, `796e6053`, `ae1615eb`, `ec7799b4`, `b685214d`, `aa6a0fef`, `34bc23d4` (ve `9d03df76` raporu). SECURITY DEFINER fonksiyonlarını satır satır okudum. Ardından DB'deki gerçek tanımlarını da sorguladım: sahip, `proconfig`, ACL.
- Kapıları kendim koştum: typecheck, lint, tüm test paketi, `rls:check`, `rls:bypass-check`, `rls:verify` ve `.env`'i `source` ederek canlı testler.
- `DEMO_LOGIN_ENABLED=false pnpm build` ile üretim derlemesi aldım. Bununla `next start` üzerinde curl denemeleri yaptım: credentials POST, emekli anahtarla imzalanmış JWT, eski admin claim'li JWT, `/pazar-yeri` ve `/marketplace` 404, M8 sayfaları. Ayrıca bayrak atlatmayı ve anahtarsız açılışı denedim.
- `fabrika_app` rolüyle SQL denemesi: `redeem_agency_invite` hata verdiğinde `app.system_scope` sızıyor mu?

## 2. Kanıt (kendi koşularım, HEAD `91f4752a` ayrık kopya)

### 2.1 Kapılar

`.env` artık `source` edilebiliyor (K-8 ve `91f4752a` sonrası), bu yüzden bu konuda bulgu yok:

```
bash: set -a; source .env; set +a  → bash-source-ok, DATABASE_URL_RLS_TEST=set
zsh:  set -a; source .env; set +a  → zsh-source-ok

$ tsc --noEmit            typecheck exit=0
$ eslint                  lint exit=0

$ pnpm test   (.env source edilmiş)
 Test Files  175 passed | 2 skipped (177)
      Tests  2014 passed | 8 skipped (2022)
test exit=0

$ pnpm rls:check
CHECK 4b — 15 tenant-scoped tables are created by migrations.
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
rls:check exit=0

$ pnpm rls:bypass-check
✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 23 on the sanctioned cross-tenant path, 0 still owed.
rls:bypass-check exit=0

$ pnpm rls:verify
   ✓ okuma (pozitif): AgencyInviteCode kendi kiracısı bağlamında 1 satır döndü
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
rls:verify exit=0
```

Tablo sayısı tutarlı: önceki incelemede 47 tablo vardı. B1 ile +1 (`AgencyInviteCode`), pazar yeri ile −2 eklenince sonuç 46. Önceki incelemedeki 46 başarısız test (`Authentication failed … 'fabrika'`) bu koşuda yok, tüm paket yeşil.

### 2.2 Kart 1 ve 2: üretim derlemesi ile curl denemeleri

```
$ DEMO_LOGIN_ENABLED=false pnpm build   → build exit=0 (rota listesinde pazar-yeri/marketplace yok)

[A] DEMO_LOGIN_ENABLED=false next start -p 3471
providers: ['google', 'microsoft-entra-id']
POST /api/auth/callback/credentials (admin e-postası, csrf, password=x)
  HTTP/1.1 302 Found → /api/auth/error?error=Configuration
  session: null
POST /api/auth/signin/credentials → aynı, session: null

T1 emekli anahtarla imzalı admin token → session: null
   sunucu log: JWTSessionError … cause: Error: no matching decryption secret
T2 güncel anahtar, demo-user-alice → {'tenantId': 'demo-tenant', 'isPlatformAdmin': False}
T3 güncel anahtar, demo-user-bob (DB'de admin DEĞİL) + token'da isPlatformAdmin:true
   → {'user_id': 'demo-user-bob', 'isPlatformAdmin': True}          ← Ö-2

[C] DEMO_LOGIN_ENABLED=true next start (NODE_ENV=production)
   → exited code=1, "DEMO_LOGIN_ENABLED=true is not allowed when NODE_ENV=production…"

[B] NODE_ENV=test DEMO_LOGIN_ENABLED=true next start -p 3472   (AYNI üretim derlemesi)
   → RUNNING providers=['google', 'microsoft-entra-id', 'credentials']       ← Ö-1
   POST /api/auth/callback/credentials (admin e-postası, password=wrong)
   → HTTP/1.1 302 Found → /tr
   session: {'email_domain': 'yasinaslan.com.tr', 'isPlatformAdmin': True, 'hasTenant': True}

[anahtarsız] .env kenara alındı, env -u AUTH_SECRET -u NEXTAUTH_SECRET next start -p 3473
   → süreç kendiliğinden sonlandı, log: "AUTH_SECRET is not set …", :3473'te dinleyici 0
```

Token'lar `next-auth/jwt` `encode()` ile üretildi (salt `authjs.session-token`). Anahtarlar ortamdan okundu, hiçbiri basılmadı.

### 2.3 Kart 2: eski sabit HEAD'de yok (değer basılmadı)

```
eski sabit: len=51 md5=1af6d60b9230a828ab4fec6941f3ddc8 sha256[0:16]=9804925c2dce837b  (= auth-secret.ts RETIRED_SECRET_SHA256)
git grep -l -F <sabit> HEAD           → 0 dosya
çalışma ağacı (node_modules/.next/.git/.venv hariç) → 0 dosya
tüm geçmişte değen commit (-S, --all) → 16   (geçmiş yeniden yazılmadı, beklenen)
.env AUTH_SECRET            len=44 md5=332e26b9  eski sabitle aynı mı: no · HEAD'de: 0 · geçmişte: 0 commit
.env CALENDAR_ENCRYPTION_KEY len=44 md5=82769607  HEAD'de: 0 · geçmişte: 0 commit   (K-9 kapandı)
.env.example AUTH_SECRET    len=0
git grep demo-google|demo-entra (src, tests) → 0
```

### 2.4 Kart 3 ve 4: B1 SECURITY DEFINER ve canlı testler

DB'deki gerçek tanım:

```
redeem_agency_invite|fabrika|super=t|bypass=t|secdef=t|{"search_path=public, pg_temp",app.system_scope=on}|{fabrika=X/fabrika,fabrika_app=X/fabrika}
note_agency_invite_rejection|fabrika|super=t|bypass=t|secdef=t|{"search_path=public, pg_temp",app.system_scope=on}|{fabrika=X/fabrika,fabrika_app=X/fabrika}
AgencyInviteCode: relrowsecurity=t relforcerowsecurity=t
  policies: tenant_isolation ("tenantId" = app.tenant_id), system_scope (app.system_scope = 'on')
```

Hata yolunda scope sızıyor mu? Denemede başka bir oturum tabloyu `ACCESS EXCLUSIVE` kilitledi, `fabrika_app` ise `lock_timeout=300ms` ile fonksiyonu çağırdı:

```
lock_held=1
ERROR:  canceling statement due to lock timeout
CONTEXT:  PL/pgSQL function redeem_agency_invite(text) line 9 at SQL statement
ROLLBACK TO SAVEPOINT s
after_error=<empty>                          ← system_scope geri döndü
normal çağrı sonrası: after_normal=<empty>
```

Canlı test (`fabrika_app`, verbose):

```
$ vitest run tests/agency-invite.live.test.ts --reporter=verbose
 ✓ … 16 testin 16'sı gövdesini koştu (yarış 419ms, 12'li patlama 40ms, hata-yolunda scope 817ms, ajans org içeriğini göremiyor 38ms …)
 Tests  16 passed (16)

$ vitest run tests/agency-invite.live.test.ts src/lib/agency/invite-code.test.ts
 Test Files  2 passed (2)
      Tests  21 passed (21)

Mutasyon: DATABASE_URL_RLS_TEST=$DATABASE_URL (fabrika, BYPASSRLS)
 FAIL  tests/agency-invite.live.test.ts
Error: agency-invite.live: connected as "fabrika" (rolsuper=true, rolbypassrls=true). RLS does not apply …
 Test Files  1 failed | 1 passed (2)
      Tests  5 passed | 16 skipped (21)
```

Yan etki: `agency.invite.rejected` AuditEvent satır sayısı canlı test koşusundan önce 22'ydi, sonra 23 oldu. Test, `tenantId` NULL satırını paylaşılan DB'de bırakıyor (K-6).

### 2.5 Kart 5: pazar yeri

```
DB: to_regclass('"MarketplaceListing"'), to_regclass('"MarketplaceOrder"') → NULL, NULL
git grep -i "marketplace|pazar ?yeri" HEAD -- src tests scripts messages prisma/schema.prisma prisma/rls.sql next.config.ts playwright.config.ts .github
  → yalnız 3 taşıma yorumu (api-keys/actions.ts:9-10, tests/modules/api-keys.test.ts:25)
.md (agent-results, adr ve .agentspace hariç): PROJECT.md:7,22 · README.md:3 · BILLING.md:313 · BUSINESS_MODEL.md:78,80,122
  · DATA_MODEL.md:203 · RELEASE-NOTES-S12.md:131-134,307-310 · ROADMAP.md:116 → hepsi "kaldırıldı — ADR-0005" notu
m8 i18n anahtarı veya kullanımı: 0 · faturalama/abonelik/plan dosyasına dokunan commit: 0
api-keys/actions.ts gövdesi eski marketplace/actions.ts:77-121 ile aynı (fark yalnız marketplace revalidatePath satırları)
baseline: yalnız orders.ts girdisi silindi, rls:bypass-check "0 still owed"
rls.sql döngüsünden iki tablo çıkarıldı; rls:check ve rls:verify yeşil (46 tablo)

[A] sunucu, T2 (demo-user-alice) oturumu:
/tr/main/pazar-yeri -> 404 · /tr/main/marketplace -> 404 · /en/main/marketplace -> 404 · /en/main/pazar-yeri -> 404
/tr/main/pipeline/demo-opp-1/consortium -> 200, <h1>Consortium Builder, koltuk roleKey research ×4, end_user ×3
/tr/main/opportunities/demo-opp-1/matching -> 200, <h1>Konsorsiyum Rol Matrisi, research ×6, end_user ×3
git diff --stat cc7dc05e HEAD -- src/modules/m8 …/opportunities …/pipeline → 0 satır
vitest run src/modules/m8 → Test Files 2 passed, Tests 30 passed
```

## 3. Bulgular

### (1) TASK-MULSCEK4JHK8X — DEMO_LOGIN_ENABLED → DÜZELTME GEREKLİ

DoD maddeleri tek tek karşılanıyor. Bayrak kapalıyken credentials sağlayıcısı yok, doğrudan POST oturum açmıyor, e-posta→admin kuralı ve DB fallback'i bayrağa bağlı. B1 yan etkisi raporda yazılı. `auth.ts:422-429` ve `:482-484` artık e-postayı yalnız bayrak açıkken sayıyor, `layout.tsx:78` de aynı. Bu doğru. Kalan iki sorun şunlar:

**Ö-1: Üretim kilidi `NODE_ENV` çalışma zamanı değerine bağlı. `NODE_ENV=test` ile başlatılan bir üretim derlemesi şifresiz admin girişi veriyor.** Yer: `src/lib/demo-login.ts:32-34` (`isDemoLoginEnabled`) ve `:63-67` (`assertDemoLoginAllowed`). Her ikisi de `env.NODE_ENV`'i okuyor, bu da `src/lib/env.ts:14`'te `process.env`'in tamamının zod ile ayrıştırılmış hali. `next start`, `NODE_ENV` zaten tanımlıysa ona dokunmuyor, zod da `test` değerini kabul ediyor.

- Senaryo (§2.2 [B], ölçüldü): bir staging veya demo kutusunda `NODE_ENV=test` ve `DEMO_LOGIN_ENABLED=true` ile `next start` çalışıyor. Sunucu hata vermeden açılıyor, `credentials` sağlayıcısı kayıtlı. Yanlış şifreyle `admin@…` POST'u `isPlatformAdmin: True` oturumu açıyor.
- Raporun "a production server with the flag on refuses to start" iddiası yalnız `NODE_ENV=production` iken doğru.
- İki yanlış yapılandırma gerektirdiği ve varsayılan kapalı olduğu için B değil Ö.
- Düzeltme: kilidi derleme türüne bağla. Next derlemede `process.env.NODE_ENV` üye erişimini sabit değere çevirir. `demo-login.ts` içinde `const BUILT_FOR_PRODUCTION = process.env.NODE_ENV === 'production'` (doğrudan erişim, `env` nesnesi üzerinden değil) iki fonksiyonda da kullanılsın. Ya da daha sıkı bir koşul konsun: bayrak yalnız `NODE_ENV === 'development'` iken açılabilsin, vitest ise `source` parametresiyle test edilsin. Bir birim testi ve `NODE_ENV=test next start` için tekrar deneme eklensin.

**Ö-2: `isPlatformAdmin` claim'i token'da kalıcı. Bayrak kapandıktan sonra da ya da DB'de admin olmayan bir kullanıcı için bile oturum admin kalıyor.** Yer: `src/lib/auth.ts:422-440` ve `:482-484`. jwt callback bu değeri yalnız `true` yapıyor, hiçbir yerde `false`'a çekmiyor. DB okuması da yalnız `!token.tenantId || trigger === "signIn"` durumunda çalışıyor. session callback `token.isPlatformAdmin === true`'ya güveniyor.

- Senaryo (§2.2 T3): bayrak açıkken admin koltuğuyla alınmış bir token, bayrak `false` yapıldıktan sonra `exp`'e kadar (Auth.js varsayılanı 30 gün, her istekte yenilenir) platform admin olarak kalıyor. T3'te DB'de admin olmayan `demo-user-bob` için bile `isPlatformAdmin: True` döndü.
- be-fb raporu bunu risk olarak yazmış ve `AUTH_SECRET` rotasyonunu önermiş. Ancak bu operasyonel bir önlem; kod aynı hatayı her bayrak geçişinde tekrarlıyor.
- Düzeltme: bayrak kapalıyken jwt callback her çağrıda `token.isPlatformAdmin = dbUser.isPlatformAdmin === true` diye yeniden hesaplasın. Bu, `User` üzerinde tek bir `select` demek. En azından demo kaynaklı grant ayrı bir claim olarak tutulsun (`token.demoAdmin`) ve session callback onu yalnız `demoLoginEnabled` iken saysın.

**K-1: `.env.example:26` `DEMO_LOGIN_ENABLED=true`.** Şablonun varsayılanı "açık". Şablonu kopyalayıp `next dev` ile açılan her makine şifresiz admin girişi sunuyor. Üretimde Ö-1 düzeltilince zararsız hale gelir, ama güvenli varsayılan boş veya `false` olmalı; yorumda "demo için true yap" yazsın.

**K-2: Demo yolu `User.isPlatformAdmin=true` değerini DB'ye kalıcı yazıyor.** Yer: `auth.ts:351-357` ve `:275`. Bayrak kapandıktan sonra bu satır admin kalıyor. `allowDangerousEmailAccountLinking: true` olduğu için o adresin Google hesabı platform admin oluyor. be-fb raporunda yazılı ve yerel DB'de 1 satır. Deploy öncesi `SELECT email FROM "User" WHERE "isPlatformAdmin"` kontrolü ve demo yolunun `isPlatformAdmin` yazmaması (claim'le yetinmesi) önerilir.

### (2) TASK-MULRTOTG9IKIM — imza anahtarı ve rotasyon → ONAY

Önceki bulgular kapandı:

- **Ö-4:** `auth.ts:182`'de sabit yok. Eski sabit HEAD'de ve çalışma ağacında 0 dosyada geçiyor. Emekli anahtarla imzalı token reddediliyor (§2.2 T1). Anahtar olmadan sunucu sonlanıyor ([anahtarsız] denemesi). Emekli anahtar sha256 ile reddediliyor; digest öneki kodla eşleşiyor. e2e `fixtures/auth-secret.ts` sabitsiz. `docker-compose.yml` `${AUTH_SECRET:?…}` kullanıyor. Google/Entra demo fallback'leri 0.
- **K-9:** yerel `CALENDAR_ENCRYPTION_KEY` döndürülmüş. Yeni değer ne HEAD'de ne geçmişte var.
- Raporda sır yok. Yalnız md5 ve uzunluk var; eski sabitin md5'i zaten geçmişte açık olan bir değerin parmak izi.

**K-3: Anahtar gücü denetlenmiyor.** `src/lib/auth-secret.ts:33-38` yalnız boş olup olmadığına bakıyor. `AUTH_SECRET=x` ile açılış kabul ediliyor (se-fb'nin compose denemesi de `x` kullandı). Düzeltme: en az 32 karakter şartı, hata mesajı aynı kalabilir.

**K-4: Emekli anahtar reddi birim testinde yok.** `auth-secret.test.ts` 4 test içeriyor, `RETIRED_SECRET_SHA256` yolunu hiçbiri kapsamıyor. Bu yol yalnız elle doğrulandı. Düzeltme: digest kümesini parametre olarak alan bir iç fonksiyon ve bir sahte digest ile test.

**K-5 (kayıt için): e2e fallback sabiti `test-e2e-auth-secret-fixture-not-for-any-deployment`** (`playwright.config.ts:28`) commit'li ama emekli listesinde değil. Bir deploy'a yanlışlıkla kopyalanırsa açılış onu kabul eder. Risk düşük; istenirse digest'i `RETIRED_SECRET_SHA256`'ya eklensin.

### (3) TASK-MULRQJQYM0NAM — B1 davet kodu → ONAY

SECURITY DEFINER fonksiyonunu satır satır okudum (`prisma/migrations/add-agency-invite-code.sql`):

- `:119-126`: `SET search_path = public, pg_temp` sabit ve `pg_temp` sonda. Fonksiyon gövdesinde tablo adları tırnaklı, yalnız `public`'ten çözülüyor. `gen_random_uuid` `pg_catalog`'tan geliyor. **Koşul 1 sağlanmış.**
- `:125`: `SET app.system_scope = 'on'` fonksiyon düzeyinde. Normal çıkışta ve hata yolunda geri döndüğünü kilit zaman aşımıyla gerçek bir hata üreterek ölçtüm (§2.4, `after_error=<empty>`). **Koşul 2 sağlanmış.**
- `:130-132`: biçim kontrolü `^[0-9a-f]{64}$`. `:134-144` tek UPDATE; `usedCount < maxUses`, iptal, süre ve ajans aktifliği WHERE içinde. READ COMMITTED altında EvalPlanQual koşulu kilit sonrası yeniden değerlendiriyor. Canlı yarış testi (1 kazanan) ve 12'li patlama (tam 5) bunu ölçüyor. `:76`'daki CHECK ikinci savunma hattı. **Son kullanımda yarış yok.**
- `:176-209` `note_agency_invite_rejection`: yalnız `reason` yazıyor, kod, hash veya kişi yok. `void` dönüyor. Transaction dışında çağrılıyor (`auth.ts:382-390`). **Koşul 3 sağlanmış.**
- `REVOKE ALL … FROM PUBLIC` ve yalnız `fabrika_app`'e EXECUTE (DB ACL'de doğrulandı).
- Migration idempotent (`IF NOT EXISTS`, `OR REPLACE`, guard'lı DO blokları). Down dosyası tam. RLS: ENABLE ve FORCE, `tenant_isolation`, rls.sql döngüsünde. Canlı testte ajans bağlı kurumun içeriğini göremiyor ve yazamıyor.
- Tek tip mesaj: bozuk, bilinmeyen, süresi dolmuş, tükenmiş, iptal edilmiş kodların ve ajansı silinmiş kodların hepsi `InviteCodeRejectedError` → `InvalidInviteCodeSignin` → "Davet kodu geçersiz ya da artık kullanılamıyor." yolundan geçiyor (`actions/auth.ts`).
- Kod 12 karakter, CSPRNG ve `randomInt` ile üretiliyor (yaklaşık 58,9 bit), DB'de sha256 olarak tutuluyor. Listelemede hash dönmüyor (`codes.ts:137-147`).

Not: fonksiyon sahibi `fabrika` SUPERUSER, bu yüzden içeride RLS zaten uygulanmıyor ve `system_scope` ayarı ikinci savunma hattı işlevi görüyor. Bu bir kusur değil; üretimde migration'ı kim uygularsa sahip o olur ve `system_scope` ayarı sahipten bağımsız çalışır.

**K-6: Reddedilen denemelerin NULL-tenant AuditEvent satırlarını her kiracı okuyabiliyor, ve test bu satırları paylaşılan DB'de bırakıyor.** `AuditEvent` politikası `tenant_or_shared` (`"tenantId" IS NULL OR …`), `note_agency_invite_rejection` ise bilinmeyen kodu `tenantId NULL` ile yazıyor (`:207-208`). İçerik yalnız `{reason:'unknown'}` olduğundan etkisi düşük. Tenant arayüzünde AuditEvent listesi yok, yalnız `admin/audit` var. Canlı test her koşuda bir satır bırakıyor (22→23, §2.4). Öneri: testin `afterAll`'u kendi NULL satırlarını silsin (ya da `data.run` etiketi eklensin); ileride bir tenant denetim ekranı yazılırsa `type='agency.invite.rejected' AND tenantId IS NULL` filtrelensin.

**K-7: Hız sınırı olmadığı için AuditEvent sınırsız büyüyebilir.** Her başarısız kayıt denemesi bir satır yazıyor. Raporda risk olarak yazılı. Bayrak kapalıyken yol şu an erişilemez (B1 yan etkisi). Kalıcı giriş tasarımıyla birlikte ele alınmalı.

**K-8: Var olan bir kullanıcı kodla giriş yaparsa kod sessizce yok sayılıyor** (`auth.ts:215-217` yorumu, `:345-358` dalı). Kişi ajansa bağlandığını sanabilir. B1 kapsamında bilinçli bir karar; B2'de "bu hesap zaten var, bağlama yapılmadı" mesajı düşünülmeli.

**K-9 (kapsam dışı gözlem, bilgi):** `fabrika_app` rolü `SET app.system_scope = 'on'` komutunu kendisi çalıştırabiliyor. Denememde `AgencyInviteCode` görünür satır sayısı 0'dan 1'e çıktı. Bu, `system_scope` tasarımının genel bir özelliği ve bu kartta regresyon değil. Ama `SET` çalıştırabilen herhangi bir ham SQL yolu tüm tabloları açıyor. Uzun vadede `system_scope`'un bir GUC yerine ayrı bir rolle (`SET ROLE`) verilmesi değerlendirilmeli.

### (4) TASK-MULSMUB1XU9 — B1 canlı test ve ortak rol yardımcısı → ONAY

DoD sağlanıyor. `fabrika_app` ile 21/21 (16 canlı + 5 birim) sonucunu aldım, verbose koşuda 16 canlı testin hepsi gövdesini koştu. BYPASSRLS rolle dosya kırmızı: `Test Files 1 failed`, 16 test skip ve açık hata mesajı (§2.4).

**Ö-3: CI migration'ı uygulamadığı için bu dosya CI'da "passed" sayılıyor ama hiçbir şey ölçmüyor.** Yer: `tests/agency-invite.live.test.ts:106-112` ve `.github/workflows/ci.yml:80-82`. CI ortamı `db push`, `db:rls-role` ve `db:rls` ile kuruluyor, `add-agency-invite-code.sql` uygulanmıyor. `apply-rls.ts` yalnız `prisma/rls.sql`'i yüklüyor, `redeem_agency_invite` ise rls.sql'de değil. Fonksiyon yoksa dosya `console.warn` basıp `ready=false` dönüyor. Testlerin gövdesi `if (!ready) return expect(skipReason).toBeTruthy()` olduğu için 16 test **skip değil passed** sayılıyor.

- fe-fb bunu raporunda risk olarak açıkça yazmış, ama henüz kart açılmamış.
- Aynı boşluk README kurulumuyla açılan her yeni ortamı da etkiliyor. Orada geçerli bir kod bile reddediliyor. Dev ortamında ise demo fallback'ine düşüp sahte `demo-user-mehmet` oturumu açıyor; be-fb raporu §2'de, satır 122'deki olay bu.
- Düzeltme (devop-fb + be-fb): CI "Prepare database" adımı `add-agency-invite-code.sql`'i uygulasın ya da fonksiyon rls.sql'e taşınsın. Ardından `:109`'daki dal `skipOrFailInCi`'ye çevrilsin.

**K-10: Hazır olmayan suite "skipped" değil "passed" raporluyor.** Kök neden Ö-3'le aynı. `if (!ready) return expect(skipReason).toBeTruthy()` yerine `test.skipIf` veya `ctx.skip()` kullanılırsa yerel koşuda da sonuç dürüst görünür.

### (5) TASK-MULSEGTKZ7O7D — pazar yerinin kaldırılması → ONAY

- Kod, çeviri, test ve betiklerde pazar yeri kalmadı. Kalan 3 eşleşme taşıma yorumu. `.md` dosyalarındaki eşleşmeler "kaldırıldı — ADR-0005" notu (§2.5).
- `/pazar-yeri` ve `/marketplace` TR ve EN'de 404, derleme rota listesinde de yoklar. `next.config.ts` rewrite'ı silinmiş.
- M8 çalışıyor: `consortium` ve `matching` sayfaları 200 dönüyor ve koltuk verisi render ediliyor, m8 testleri 30/30, M8 koduna diff yok. fe-fb "Aday Bul" tıklamasının etkisini kanıtlayamadığını dürüstçe yazmış. Aday hesaplama mantığını `matching.test.ts` kapsıyor.
- Abonelik ve faturalamaya dokunulmamış: 4 kod commit'inde `billing|subscription|stripe|iyzico|plan|invoice|add-on` yolu 0.
- `settings/api-keys/actions.ts` kapsam içinde. API anahtarı aksiyonları eskiden `marketplace/server/actions.ts` içindeydi; modül silinince taşınmaları gerekiyordu. Gövde birebir aynı, fark yalnız marketplace `revalidatePath` satırları. `tests/modules/api-keys.test.ts` korumaları taşıyor.
- `tenant-bypass-baseline.json`'dan yalnız `orders.ts` girdisi silinmiş, `rls:bypass-check` "0 still owed" veriyor. RLS döngüsünden iki tablo çıkmış, `rls:check` ve `rls:verify` yeşil. Yerel DB'de tablolar yok. Down dosyası tabloları, politikaları ve grant'leri özgün şekliyle geri kuruyor (FK dahil).

**K-11: Yıkıcı migration'da veri kontrolü yalnız yorumda.** Yer: `prisma/migrations/drop-marketplace.sql:9-15` ve `:28-29`. Senaryo: paylaşılan ya da üretim DB'sine uygulayan kişi yorumu okumazsa gerçek ilan ve sipariş satırları sessizce silinir. Düzeltme: `DROP`'tan önce bir DO bloğu satır sayar, 0 değilse ve `current_setting('app.allow_marketplace_drop', true) <> 'on'` ise `RAISE EXCEPTION` versin.

**K-12: Yeni `api-keys/actions.ts` rol kontrolü yapmıyor** (`:19-21`, `:46-48`). Her üye canlı API anahtarı üretip silebiliyor, `name` da doğrulanmıyor. Bu davranış taşınan koddan birebir geliyor, yani bu kartta regresyon değil. Ayrı bir kartta `manage_users` veya `manage_api_keys` kontrolü eklenmeli.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MULT4H6G6LCQG-crw-fb.md` (bu rapor). Kod değiştirilmedi.
- Geçici dosyalar yalnız scratchpad'de tutuldu (`fb-head` worktree'si, token dosyası, loglar) ve iş sonunda silindi. Kendi açtığım :3471, :3472 ve :3473 sunucuları kapatıldı (dinleyici 0).
- Paylaşılan DB'ye yalnız okuma ve geri alınan transaction'lar gitti. Tek kalıcı iz, canlı test koşusunun bıraktığı 1 adet `agency.invite.rejected` satırı (K-6).

## 5. Riskler

- Ö-1'i yalnız `NODE_ENV=test` ile ölçtüm. `NODE_ENV=development` ile `next start` de aynı sonucu verir (zod enum kabul ediyor), bunu koşmadım.
- Canlı test sayıları paylaşılan `fabrika-postgres` üzerinde alındı. Başka bir ajanın eşzamanlı yazımı sayımları değiştirebilir, ama izolasyon iddialarını değiştirmez.
- e2e koşulmadı: AgentSpace R8 kill-guard. Giriş akışının çalışma zamanı kanıtı curl ile alındı.

## 6. Açık sorular

- B1 bayrak kapalıyken nasıl çalışacak? Kod OAuth üzerinden taşınabilir (S2-b) ya da kalıcı giriş tasarımı beklenebilir. Bu karar verilmeden B1 üretimde kullanılamaz.
- Demo sitesi üretim derlemesiyle mi açılacak? Ö-1'in düzeltme biçimi bu karara bağlı.

## 7. Sonraki adım (leed-fb için önerilen kartlar)

1. **Ö-1 ve Ö-2 (be-fb):** demo kilidi derleme türüne bağlansın. jwt callback bayrak kapalıyken `isPlatformAdmin`'i her çağrıda DB'den yeniden hesaplasın. `NODE_ENV=test next start` denemesi ve birim testi eklensin. K-1 ve K-2 aynı karta girebilir.
2. **Ö-3 ve K-10 (devop-fb + be-fb):** CI'da `add-agency-invite-code.sql` uygulansın ya da fonksiyon rls.sql'e taşınsın. Migration yok dalı `skipOrFailInCi`'ye çevrilsin.
3. **K-3 ve K-4 (se-fb):** `AUTH_SECRET` için en az 32 karakter şartı ve emekli anahtar testi.
4. **K-11 (fe-fb veya be-fb):** drop migration'a satır sayısı guard'ı.
5. **K-12 (be-fb):** API anahtarı aksiyonlarına rol kontrolü.

## Platform beyanı

Doğrulama **macOS** (Darwin 27.0.0, Node 26.5, Next 16.3.4) üzerinde yapıldı. Postgres Docker'daki `fabrika-postgres` konteynerinde, `fabrika_app` rolüyle koştu. İncelenen kod yolları platformdan bağımsız: `process.env` okuma, `process.exit(1)`, `crypto` (sha256, `randomInt`), Prisma/Postgres SQL ve Next rotaları. Ö-1 her platformda aynı davranır, çünkü `next start` her işletim sisteminde tanımlı bir `NODE_ENV`'e dokunmaz. Linux Docker imajı `NODE_ENV=production` sabitlediği için orada tetiklenmez; tetiklenmesi için ortam değişkeninin elle `test` ya da `development` yapılması gerekir. **Windows ve Linux'ta koşulmadı**, çünkü bu makinede yalnız macOS var.
