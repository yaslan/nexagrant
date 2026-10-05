# TASK-MULWCLZHRTRK5 — FB İNCELEME-5 (crw-fb)

Repo `/Users/macbook/alan/FONBRIDGE`, dal `dev`, HEAD `03b50954`. Kod değiştirilmedi. Kapıları, build'i ve üretim sunucusu denemelerini kendim koştum. Diğer ajanların rakamlarını kanıt diye kullanmadım.

Bulgu sınıfları: **B** = bloke eder · **Ö** = önemli, kapanmalı (bu kartın merge'ünü durdurmaz) · **K** = küçük / öneri.

## 1. Kararlar

| #   | Kart                                           | Ajan     | Karar    | Bulgular                              |
| --- | ---------------------------------------------- | -------- | -------- | ------------------------------------- |
| 1   | TASK-MULRRU63LWC6E (B7 başvuru/sonuç beyanı)   | be-fb    | **ONAY** | K-1, K-2, K-3                         |
| 2   | TASK-MULRQSJFB8RWJ (B2 ajans panosu)           | fe-fb    | **ONAY** | **Ö-1** (yayın kapısı), K-4, K-5, K-6 |
| 3   | TASK-MULU7GVFBTRXX (giriş güvenliği düzeltme)  | be-fb    | **ONAY** | K-7, K-8, K-9                         |
| 4   | TASK-MULU7SAA4EPP8 (CI migration)              | devop-fb | **ONAY** | K-10                                  |
| 5   | TASK-MULV9NYQ1M2R0 (radar a11y)                | fe-fb    | **ONAY** | yok                                   |
| 6   | TASK-MULVJV5TCHICH ('use server' sınıf export) | be-fb    | **ONAY** | K-11                                  |

Altı kartta da bloke eden (B) bulgu yok. Her kartın DoD maddesini aşağıda kendi ölçümümle karşıladım.

**Ö-1** kartın DoD'unu bozmuyor. Ama ajans hesabı gerçek bir ajansa açılmadan önce kapanmalı. Bu, aydınlatma ekindeki "anonim" iddiasının şartı. fe-fb raporu riski §Riskler'de zaten yazmış (`TASK-MULRQSJFB8RWJ-fe-fb.md:128`). Ben somut bir sızıntı örneği ürettim.

Ön kontrol: 14 commit'in hepsi HEAD'in atası (`git merge-base --is-ancestor` → boş çıktı). origin'deki cherry-pick'ler patch-id ile birebir aynı:

```
9b373fb4 / c91e253d  patch-id e0cd2ebc5060eaff8c5b8d31e95db450517ca58d (ikisi aynı)
50d8140b / b7c25a8f  patch-id f650e63c02f081e17d32440729530aa0ba2fee6a (ikisi aynı)
```

## 2. Kapılar (kendi koşum)

Ayrık worktree `git worktree add --detach <scratchpad>/wt HEAD` (03b50954) üzerinde koştum. Gerçek `pnpm install --offline --frozen-lockfile` ve `prisma generate` yapıldı. Komut `set -a; source .env; set +a` ile koşuldu.

```
typecheck exit=0
lint exit=0
test exit=0          Test Files  181 passed | 2 skipped (183)
                          Tests  2067 passed | 8 skipped (2075)
rls:check exit=0     ✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
                     ✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
rls:verify exit=0    ✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.
rls:bypass-check exit=0  ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded reason, 23 on the sanctioned cross-tenant path, 0 still owed.
i18n:check exit=0    ✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.
```

Atlanan 2 dosya `tests/k1-daily-calls.test.ts` (4) ve `tests/sedia-adapter.test.ts` (2). CI'da da aynı ikisi atlanıyor. Bu kartlarla ilgisi yok.

Kartlara ait suite'ler, ayrıntılı çıktıyla:

```
$ pnpm exec vitest run tests/agency-invite.live.test.ts tests/agency-funnel.live.test.ts \
    tests/application-outcome.live.test.ts tests/application-outcome.test.ts src/lib/agency/funnel.test.ts \
    tests/use-server-exports.test.ts src/lib/auth-callbacks.test.ts src/lib/demo-login.test.ts \
    src/lib/auth-secret.test.ts --reporter=verbose
 Test Files  9 passed (9)
      Tests  78 passed (78)          (↓ / skip satırı: 0)
 ✓ tests/agency-funnel.live.test.ts > agency_funnel_counts (fabrika_app) > the agency is the caller: B sees only its own organisation, never A’s 4ms
 ✓ tests/agency-funnel.live.test.ts > agency_funnel_counts (fabrika_app) > an organisation, or no tenant at all, gets no rows 7ms
 ✓ tests/agency-funnel.live.test.ts > getAgencyFunnel (fabrika_app, with B7 outcomes) > the B7 list is derived from the agency link: A never receives B’s organisation 3ms
 ✓ tests/application-outcome.live.test.ts > … > counts declarations summed across the given tenants only 56ms
 ✓ tests/application-outcome.live.test.ts > … > a GUEST_PARTNER who does not own the card cannot declare 2ms
```

`agency-funnel.live` `@/lib/db`'yi `DATABASE_URL_RLS_TEST` (fabrika_app) istemcisiyle değiştiriyor (`tests/agency-funnel.live.test.ts:28-40`). Böylece `countApplicationOutcomes` da NOBYPASSRLS rolle ölçülüyor.

`application-outcome.live` ise app-owner rolüyle koşuyor (`assertAppOwnerRole`). Bu suite `declareApplication` yazma yolunu ölçüyor, RLS'i değil. RLS ölçümünü funnel suite'i taşıyor.

`pnpm build` (worktree, `env -u NODE_ENV`): **exit 0**, `ƒ /[locale]/ajans` ve `ƒ /[locale]/agency` rotaları derlendi. İlk denemede build düştü, sebebi kodda değil; bkz. K-11.

## 3. Kart bazında inceleme

### 3.1 TASK-MULRRU63LWC6E — B7 başvuru/sonuç beyanı · **ONAY**

DoD kontrolü:

- **Keşif raporu:** var (`TASK-MULRRU63LWC6E-be-fb.md` §1 "Keşif: mevcut alanlar"). Şema değişikliği gerekmedi. `Proposal.submittedAt` + `OppStatus` kullanılıyor, `Proposal.outcome`'a (ESR bandı) bilerek dokunulmuyor.
- **Uçtan uca:** `declareApplication` önce oturumdan kiracıyı alıyor, sonra `withTenant` içinde okuyor, kuralı uyguluyor, yazıyor ve aynı işlemde audit satırı ekliyor (`pipeline/actions.ts:650-736`). Canlı suite, iki kez "gönderildi" beyanında ilk tarihin korunduğunu gösteriyor. Başka kiracı ve GUEST_PARTNER reddediliyor, arşivlenen fırsat sayımdan düşüyor.
- **`countApplicationOutcomes(tenantIds, since?)`:** `src/lib/k5-pipeline/applicationOutcome.ts:106-122`'de. Tek toplam döndürüyor, satır içeriği döndürmüyor. Her kiracı kendi `withTenant`'ında sırayla okunuyor, system scope yok. Yinelenen id tek sayılıyor.
- **JSDoc güven uyarısı: VAR.** `applicationOutcome.ts:92-94`: "SECURITY: `tenantIds` MUST be derived server-side … never pass client input. This function trusts the list it is given". Tek çağıran `src/lib/agency/funnel.ts:206-216` ve listeyi sunucuda `Tenant.agencyId`'den türetiyor.

Bulgular:

- **K-1 — WITHDRAWN fırsatta hep hata veren buton.** `pipeline/[id]/client.tsx:381`'de "gönderildi" butonu `!isDecided` ile gösteriliyor. `isDecided` yalnız FUNDED/REJECTED için doğru. Senaryo: fırsat `WITHDRAWN` → buton görünür → tıklanınca `nextApplicationStatus` `{refused:'WITHDRAWN'}` döner (`applicationOutcome.ts:49`) → kullanıcı her seferinde hata metni görür. Öneri: WITHDRAWN'da paneli salt-okunur göster.
- **K-2 — `ABOVE_THRESHOLD` durumu "gönderildi" ile SUBMITTED'a düşer.** `applicationOutcome.ts:51-53` yalnız FUNDED/REJECTED'i "karar verilmiş" sayıyor. Bugün `Opportunity.status`'a `ABOVE_THRESHOLD` yazan bir kod yolu yok (grep: yalnız enum ve `proposal-outcome.ts` yorumu), bu yüzden şu an teorik. Enum değeri kullanılmaya başlarsa `DECIDED` kümesine eklenmeli.
- **K-3 — ilk "gönderildi" beyanında yarış.** Fırsatın `Proposal`'ı yoksa `tx.proposal.create` çalışır (`pipeline/actions.ts:693`), `Proposal.opportunityId` ise `@unique` (`schema.prisma:886`). Senaryo: iki sekmede aynı anda "gönderildi" → ikinci işlem P2002 → `DECLARE_FAILED`. Veri bozulmaz (ilk yazım kalır). Yalnız kullanıcı gereksiz bir hata görür. Öneri: `upsert` ya da P2002'de yeniden okuma.

### 3.2 TASK-MULRQSJFB8RWJ — B2 ajans panosu · **ONAY** (Ö-1 yayın kapısı)

DoD kontrolü (canlı, kendi worktree'mde `next dev -p 3117`, HEAD kodu, demo girişi):

```
oturum b2v0219-ajans@… (AGENCY kiracısı, TENANT_OWNER)   /tr/ajans → 200   /en/agency → 200   /tr/ajans?gun=90 → 200
oturum demo@usfinbridge.com (ORGANIZATION kiracısı)      /tr/ajans → 403   /en/agency → 403   /tr/ajans?gun=90 → 403
anonim                                                    /tr/ajans → 307 → /tr/giris
```

- **:3000'de tarayıcı** (leed-fb'nin sunucusu, dahili tarayıcı, ajans olmayan oturum): gövde "403 · Bu sayfaya erişiminiz yok · Bu sayfa yalnız kalkınma ajansı hesaplarının üyelerine açıktır…". `/tr/belediye-cagrilari` koyu temada açıldı. Seçili "Belediye" çipi `bg-accent-strong`.
- **Ajans panosu metni** (200 yanıtı): "Adım 1 Davet koduyla kayıt 6 … Adım 3 … <5 5'ten az; sayı gizlendi … İl Tüm iller **İl bilgisi henüz toplanmıyor.**". İl filtresi devre dışı, uydurma sayı yok. Adım 2 "Henüz ölçülmüyor". Sayfada kurum adı ya da id yok. Live test `JSON.stringify(f)` içinde hiçbir kurum id'sinin olmadığını da ölçüyor.
- **Migration** `prisma/migrations/add-agency-funnel.sql`:
  - `SECURITY DEFINER`, `SET search_path = public, pg_temp` sabit, `SET app.system_scope='on'` fonksiyon düzeyinde.
  - Ajans `current_setting('app.tenant_id')`'den alınıyor, parametre yok. Kiracı AGENCY değilse satır dönmüyor.
  - Dönen sütunlar: `org_type` + 4 `integer`.
  - `REVOKE … FROM PUBLIC`, `GRANT` yalnız fabrika_app.
  - `apply-order.txt`'nin son satırında.
  - Geçici DB'de iki geçişte exit 0 (§3.4). `pg_proc`: `agency_funnel_counts|t|{"search_path=public, pg_temp",app.system_scope=on}|{fabrika=X/fabrika,fabrika_app=X/fabrika}`.
- **Kohort sunucuda türetiliyor:** `funnel.ts:206-209` `Tenant.agencyId = session tenant`. Sayfa `getAgencyFunnel(scope.tenantId, …)` çağırıyor (`ajans/page.tsx:40`), tarayıcıdan id alınmıyor.
- **<5 maskesi + ikincil gizleme:** `funnel.ts:110-127`. Küçük grupta hiçbir adım gösterilmiyor (`:141-150`). Birim testinde 2000 durumlu özellik testi var.
- **A→B canlı testi:** var ve geçti ("the agency is the caller: B sees only its own organisation, never A’s").
- **Kurum adı listesi:** yok (KVKK eki §3 ile uyumlu, bilinçli sapma).

**ÖZEL KONTROL — `experimental.authInterrupts` (`next.config.ts:37`):**

- Etki alanı: bayrak yalnız `forbidden()`/`unauthorized()` fonksiyonlarını ve `forbidden.tsx`/`unauthorized.tsx` dosya kurallarını açıyor. Mevcut hiçbir rotanın davranışını değiştirmiyor. `forbidden()` repoda tek yerde çağrılıyor (`ajans/page.tsx:33`), `unauthorized()` hiç yok (grep).
- Build: `next build` bayrakla exit 0, üretim `next start`'ta 403 durumu doğru geliyor (yukarıdaki 403'ler).
- `src/app/forbidden.tsx` kök düzeyde, `[locale]` layout'unun dışında. Bu yüzden dili `getLocale()` ile çözüyor ve uygulama menüsü görünmüyor. Bu kabul edilebilir.
- Riskler → K-5.

Bulgular:

- **Ö-1 — 30/90 gün pencereleri farkı tek kurumu açığa çıkarıyor (§3.1 küçük sayı kuralının amacı).** İki görünüm ayrı ayrı maskeleniyor (`funnel.ts:193`, `:207` `createdAt >= since`). 30 günlük kohort 90 günlüğün alt kümesi, bu yüzden fark 31-90. gün kohortunu verir. Saf fonksiyonla (`buildFunnel`, HEAD kodu) ürettiğim örnek:

  ```
  MUNICIPALITY registered:  30g=5 90g=6  | all registered:  30g=12 90g=13
  MUNICIPALITY pipeline:    30g=5 90g=6  | all pipeline:    30g=11 90g=12
  MUNICIPALITY conceptNote: 30g=5 90g=5  | all conceptNote: 30g=5  90g=5
  ```

  Her hücre ≥5 olduğu için hiçbiri maskelenmiyor. Fark ise tek bir belediyeyi anlatıyor: son 31-90 günde kayıt olan belediye pipeline'a çağrı almış ama konsept not üretmemiş. Ajans kodu kime ve ne zaman verdiğini biliyor. Bu, aydınlatma ekinin §3.1'de verdiği "Çorum'da tek belediye" örneğinin kendisi. Ek, "kural uygulanmazsa anonim iddiası düşer" diyor (`docs/legal/agency-channel-notice-addendum.md:73`). Aynı fark, 30 günlük pencerenin günden güne kaymasıyla da alınabilir.

  Önerilen düzeltme (seçim leed-fb + hukuk):
  - (a) Tek pencere: yalnız "tüm zamanlar" kohortu.
  - (b) İki pencerenin farkı da bir hücre sayılsın: fark 1-4 ise dar pencere de maskelensin.
  - (c) Sayılar 5'in katına yuvarlansın.

  Günlük kayma için (a) ya da (c) gerekir.

  Merge'ü bloke etmiyor: kod DoD'u karşılıyor, ek hâlâ TASLAK ve risk fe-fb raporunda kayıtlı. **Ajans hesabı gerçek bir ajansa açılmadan önce kapanmalı.** Yeni kart önerilir.

- **K-4 — Adım 6-8 kurum değil başvuru sayıyor; ek §2 kurum sayısı diyor.** `countApplicationOutcomes` `Proposal` satırı sayıyor. Ekin §2 tablosu ise "Başvuru gönderdiğini beyan eden **kurum** sayısı" ve "Kabul / red beyan eden **kurum** sayısı" diyor (`agency-channel-notice-addendum.md:43-44`). Ekran metni doğruyu söylüyor ("…başvuru sayısıdır"). Yan etki: tek bir kurumun 5+ başvurusu kendi başına ≥5'lik görünür bir hücre üretir. `registered <5` kuralı bunu küçük grupta kapatıyor, ama büyük grupta "sayı = kurum" varsayımı tutmuyor. Öneri: ya ek "başvuru sayısı" diye düzeltilsin, ya da sayım `count(DISTINCT tenantId)`'ye çevrilsin.
- **K-5 — `authInterrupts` riskleri (öneri).**
  - (1) Bayrak deneysel. Next sürüm yükseltmesinde API ya da davranış değişirse `/ajans` 403 yerine 500 verebilir. Yükseltme kontrol listesine "/tr/ajans ajans olmayan oturumla 403" satırı eklenmeli.
  - (2) `forbidden()` bir hata fırlatarak çalışıyor. İleride `try { … forbidden() } catch {}` içinde çağrılırsa yutulur ve sayfa render olur. Yeni çağrı yerlerinde `unstable_rethrow` kullanılmalı ya da çağrı try dışında tutulmalı (bugünkü tek çağrı try dışında).
  - (3) Kök `forbidden.tsx` sabit koyu tema (`bg-slate-900`) kullanıyor, açık temayı izlemiyor. Bu bir görsel tutarsızlık.
- **K-6 — "all" satırında adımlar arası sınır.** Live testteki A örneği: gönderildi 6, kabul 5, red "<5". Buradan red ∈ {0,1} çıkarılabilir. Tam değer açılmıyor, ama §3.1 "geri hesaplanamamalı" ölçütüne sınırda. Ö-1 ile birlikte hukuka sorulmalı.

### 3.3 TASK-MULU7GVFBTRXX — giriş güvenliği düzeltmesi · **ONAY**

**Ö-1'i kendim yeniden denedim.** Ayrık worktree, `next build` (exit 0), port 3117. :3000'e dokunmadım.

```
[1] NODE_ENV=test        DEMO_LOGIN_ENABLED=true  next start -p 3117  → exit=1, listeners=0
    "DEMO_LOGIN_ENABLED=true is not allowed in a production build or with NODE_ENV=production: …"
[2] NODE_ENV=development DEMO_LOGIN_ENABLED=true  next start -p 3117  → exit=1, listeners=0 (aynı mesaj)
[3] NODE_ENV=test        DEMO_LOGIN_ENABLED=false next start -p 3117  (cwd = kendi worktree'm, lsof ile doğrulandı)
    /api/auth/providers → ['google', 'microsoft-entra-id']            ← credentials yok
    /tr/login type="email" alanı: 0
    POST /api/auth/callback/credentials (csrf + admin@yasinaslan.com.tr, password=x)
      HTTP/1.1 302 Found · location: …/api/auth/error?error=Configuration
    /api/auth/session → null · session-token çerezi: 0
```

**Ö-2'yi kendim yeniden denedim.** Güncel `AUTH_SECRET` ile `next-auth/jwt encode()` kullanarak iki sahte token ürettim, ikisi de `isPlatformAdmin:true, demoAdmin:true` taşıyor. Kullanıcı id'si `cmtv6gz2…` (DB'de `isPlatformAdmin=f`). Değerler yalnız dosyada tutuldu ve silindi.

```
                                                     üretim derlemesi, bayrak KAPALI    next dev, bayrak AÇIK
tokA (email=admin@… demo koltuğu)  session.isPlatformAdmin   False                     True  ← demoAdmin yalnız bayrakla
tokB (email=demo@…, sahte claim)   session.isPlatformAdmin   False                     False ← claim DB'den yeniden hesaplandı
POST /api/admin/cordis/import  tokA → 403 · tokB → 403 · anonim → 401   (üretim, bayrak kapalı)
```

Bayrak kapanınca aynı token admin değil. Sahte claim bayrak açıkken bile işe yaramıyor.

Diğer DoD maddeleri (kod ve test okuması):

- **K-1:** `.env.example`'da `DEMO_LOGIN_ENABLED=false`.
- **K-2:** `auth.ts`'de `User.isPlatformAdmin`'e yazan yol kalmadı. Create çağrısında yok, mevcut kullanıcı dalı yazmıyor. Birim testi var.
- **K-3:** `auth-secret.ts` `MIN_AUTH_SECRET_LENGTH = 32`, trim sonrası kontrol ediliyor.
- **K-4:** `retired` parametresiyle birim testi var.
- **K-6:** `note_agency_invite_rejection` bilinmeyen kod için `AuditEvent` yazmıyor, yalnız `RAISE LOG` + tek bir SystemAlert sayacı. Bilinen ama geçersiz kod ajansın kiracısına `reason` + `codeId` ile yazılıyor. Canlı suite ("a spent code is filed under its agency; an unknown one leaves no tenant-readable row") 16/16 geçti. Migration geçici DB'de iki geçişte exit 0.

Bulgular:

- **K-7 — eski admin satırı (be-fb §5 ile aynı, onay bekliyor).** Yerel DB'de `demo-user-superadmin` hâlâ `isPlatformAdmin=t` (kendi sorgum, e-posta basılmadı). Kod doğru, veri eski. Deploy öncesi her ortamda `SELECT id FROM "User" WHERE "isPlatformAdmin"` denetimi yapılmalı.
- **K-8 — `jwt` callback'i artık her `auth()` çağrısında bir DB sorgusu yapıyor** (`auth.ts:434-461`). Tek satır, birincil anahtar. Doğruluk için gerekli. Bir sayfada `auth()` birden çok kez çağrılıyorsa istek başına sorgu sayısı artar. Gerekirse istek düzeyinde `cache()` kullanılabilir. Bu bir öneri.
- **K-9 — bilinmeyen kod sayacında ilk-kayıt yarışı.** `fix-agency-invite-rejection-audit.sql:71-94`: `SELECT … FOR UPDATE` açık bir satır bulamazsa `INSERT` çalışıyor, benzersizlik kısıtı yok. İlk iki eşzamanlı bilinmeyen deneme iki ayrı SystemAlert satırı açar ve sayaç bölünür. Güvenlik etkisi yok. Tahmin saldırısının görünürlüğü biraz bulanır. Öneri: `meta->>'alertDedupeKey'` için kısmi benzersiz indeks + `ON CONFLICT`, ya da `pg_advisory_xact_lock`.

### 3.4 TASK-MULU7SAA4EPP8 — CI migration · **ONAY**

**İki geçiş, kendi ölçümüm.** Aynı Postgres sunucusunda geçici bir `fb_crw_mig_<ts>` veritabanı açtım (paylaşılan `fabrika` DB'sine dokunmadım): `prisma db push` → `db:rls-role` → `scripts/apply-migrations.sh` iki kez. Host'ta psql yok, bu yüzden `PSQL=` ile docker içindeki psql'e giden bir sarmalayıcı verdim. İş bitince DB'yi `DROP` ettim.

```
pass1 exit=0   apply-migrations: 26 files applied
pass2 exit=0   apply-migrations: 26 files applied     (ikinci geçişte ERROR 0, yalnız "already exists, skipping" NOTICE)
--list son 3:  drop-marketplace.sql · fix-agency-invite-rejection-audit.sql · add-agency-funnel.sql
```

- Betik liste ile disk uyuşmazlığında ve yinelenen satırda reddediyor (`scripts/apply-migrations.sh:36-50`). `set -euo pipefail` ve `ON_ERROR_STOP=1` kullanıyor.
- **CI gerçekten uyguluyor** (`gh run view`):
  - Run 36497365219 (4ad91143): "Prepare database" adımında `==> [1/24] … [24/24]` iki kez ve `apply-migrations: 24 files applied` ×2.
  - Run 36497677140 (b7c25a8f, K-6 dahil): `[25/25] fix-agency-invite-rejection-audit.sql`, `25 files applied` ×2.
- **Önceki B-1 KAPANDI.** CI'da `✓ tests/agency-invite.live.test.ts (16 tests) 2061ms` (run …365) ve `2095ms` (run …677). 2 saniyelik süre gövdelerin gerçekten koştuğunu gösteriyor (400 ms kilit tutan yarış testi dahil). Atlanan suite'ler yalnız `k1-daily-calls` ve `sedia-adapter`. Kodda erken `return` kalmadı: `beforeEach` → `ctx.skip`, migration yoksa `skipOrFailInCi` (`tests/agency-invite.live.test.ts:118-122`, `:140-142`).
- **Şema sapma listesi:** devop-fb raporunda D-1…D-8 olarak var (`TASK-MULU7SAA4EPP8-devop-fb.md:171-192`). Katman ve etki ayrımıyla yazılmış, düzeltme be-fb'ye bırakılmış.

Bulgular:

- **K-10 — dal durumu ve CI kırmızısı (bu kartın kusuru değil, bilgi).**
  - Yerel `dev` origin'le ayrışmış: `git rev-list --left-right --count dev...origin/dev` → `13 6`. Origin'de TASK-MULU828HTNN4N'in 4 commit'i ve iki cherry-pick var. Push'tan önce birleştirme gerekiyor. Cherry-pick'ler patch-id olarak aynı, bu yüzden çakışma beklenmez.
  - Son CI koşularında (…677, …283) kırmızı olan adım **E2E Test**. Migration ve birim adımları yeşil.
  - `docs/RELEASE_CHECKLIST.md` hâlâ "12 dosya" diyor (devop-fb §5'te kayıtlı).
  - `apply-migrations.sh`'nin üretimde `drop-marketplace.sql`'i de koşacağı riski devop-fb §5'te yazılı. K-11 satır sayısı koruması gelene kadar üretimde bu betik çalıştırılmamalı.

### 3.5 TASK-MULV9NYQ1M2R0 — radar a11y · **ONAY**

- **Kontrast (kendi ölçümüm, WCAG göreli parlaklık formülüyle):**
  - Koyu tema `--accent-strong #0E7490` / beyaz → **5.36:1** (≥4.5 ✓).
  - Eski `--accent #0891B2` / beyaz → 3.68:1 (eski kusur buydu).
  - Açık tema `#0369A1` / beyaz → 5.93:1.
  - Seçili cevap `fit-check.tsx:72` ve kurum türü çipi `page.tsx:290` ikisi de `bg-accent-strong`.
- **Native radio:** `<input type="radio" name={groupId} className="sr-only">` + `<label>` (`fit-check.tsx:68-84`), grubun adı `<fieldset><legend>`'den geliyor. :3000'deki `/tr/belediye-cagrilari` HTML'inde 35 fit-check bloğu var: `role="radio"` 0, native radio var, **71 radyo grubu ve isim başına en fazla 2 input**. Kartlar arasında isim çakışması yok, bu yüzden bir karttaki seçim diğerini silmez. Odak halkası `has-[:focus-visible]` ile label'da.
- **Kalıcı status bölgesi:** `<div role="status">` baştan monte ediliyor ve boş duruyor, yalnız içeriği değişiyor (`fit-check.tsx:108`). HTML'de blok başına 1 adet. Bağlantı ve sıfırla butonu bölgenin dışında.
- **CERV/LIFE metni (tr/en):** "başvuru sahibi ya da **fonlanan** ortak olamaz … fonsuz/ilişkili ortak olarak yer almak mümkün olabilir; program rehberini kontrol edin". EN karşılığı aynı anlamda. Eski "ortak olamaz … yine de takip edilebilir" çelişkisi giderilmiş.

Bulgu yok. fe-fb raporu ölçümü Playwright ile de vermiş (`TASK-MULV9NYQ1M2R0-fe-fb.md:36-37`, 5.36). Benim formül sonucum bununla örtüşüyor.

### 3.6 TASK-MULVJV5TCHICH — 'use server' sınıf export'u · **ONAY**

- `AgencyPermissionError` artık `src/lib/agency/errors.ts`'de. `src/lib/agency/actions.ts` ve `src/app/[locale]/(app)/ajans/actions.ts` onu buradan import ediyor. İki `'use server'` dosyası da yalnız async fonksiyon (ve silinen tip) export ediyor.
- **`pnpm build` exit 0** (kendi worktree'm, `env -u NODE_ENV`).
- **Koruyucu test:** `tests/use-server-exports.test.ts`, TypeScript AST ile `src/` altındaki her `'use server'` modülünü tarıyor. Sınıf, enum, sabit, senkron fonksiyon, `export { x }` ve modülden yeniden export durumlarını satır numarasıyla raporluyor. Kendi tarayıcısını 5 bilinen ihlalli bir fixture ile sınıyor. Geçti. Kontrol ettiğim kenar durumlar:
  - `export * from`: `moduleSpecifier` dalına düşüyor ✓.
  - `export default class`: `ClassDeclaration` ✓.
  - Takma adla export (`export const a = b`): yanlış pozitif verir. Bu güvenli yönde.

Bulgu:

- **K-11 — kartların kapı komutu build'i bozuyor (ortam).** `.env` 2. satırda `NODE_ENV=development` var. Görevin önerdiği `set -a; source .env; set +a` ardından `pnpm build` koşulunca Next "non-standard NODE_ENV" uyarısı veriyor ve `/_global-error` prerender'ında `TypeError: Cannot read properties of null (reading 'useContext')` ile **build=1** düşüyor. Aynı ağaç `env -u NODE_ENV pnpm build` ile exit 0 veriyor. Kodun kusuru değil, ama "build kırık" diye yanlış alarm üretebilir. Öneri: `.env`'den `NODE_ENV` satırı çıkarılsın ya da kapı talimatına `env -u NODE_ENV` eklensin.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MULWCLZHRTRK5-crw-fb.md` (bu rapor). Kod değişmedi.
- Paylaşılan DB'ye yazılan: demo girişi yalnız mevcut iki kullanıcıyla yapıldı (K-2 sonrası giriş satır yazmıyor). Migration denemeleri geçici `fb_crw_mig_*` DB'sinde yapıldı, sonra silindi.
- Temizlik:
  - Worktree `git worktree remove --force` ile silindi.
  - Token, çerez kavanozu ve betik dosyaları silindi.
  - :3117'de dinleyici 0. Kapatılan tek süreç, cwd'si benim worktree'm olduğu `lsof` ile doğrulanmış kendi `next` sunucum.
  - :3000 (leed-fb) yerinde.

## 5. Riskler

- Ö-1 kapanmadan ajans panosu gerçek bir ajansa açılırsa aydınlatma ekinin "anonim veri" dayanağı düşer.
- Yerel `dev` ile origin ayrışık (13/6). Push eden kişi birleştirmeyi yapmalı.
- `authInterrupts` deneysel. Next yükseltmesinde /ajans 403'ü yeniden denenmeli.

## 6. Açık sorular

1. Ö-1 için hangi yol seçilecek: tek pencere, fark maskesi ya da yuvarlama? (leed-fb + hukuk, HUKUK-5 ile birlikte.)
2. K-4: adım 6-8 "kurum" mu "başvuru" mu sayacak? Ek ile kod aynı dili konuşmalı.
3. K-7: `demo-user-superadmin` satırının `isPlatformAdmin=false` yapılması onayı (be-fb açık sorusu 1, hâlâ açık).

## 7. Sonraki adım

- Yeni kart: B2 pencere farkı sızıntısı (Ö-1) + K-4 ek/sayım dili.
- be-fb için küçük kart: K-1/K-3 (beyan paneli), K-9 (SystemAlert dedupe kısıtı).
- devop/leed-fb: `.env`'den `NODE_ENV` çıkarılsın (K-11) ve `dev`↔`origin/dev` birleştirilsin (K-10).

## Platform beyanı

**macOS'ta doğrulandı:** Darwin 27.0.0, Next.js 16.3.4 (Turbopack), pnpm, Postgres `fabrika-postgres` (pgvector pg16, :5433), AgentSpace dahili tarayıcısı (:3000). CI kanıtı GitHub Actions `ubuntu-latest` günlüklerinden (Linux) okundu.

Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan beklenen:

- İncelenen yollar platformdan bağımsız: SQL fonksiyonları, Prisma sorguları, NextAuth callback'leri, React bileşenleri ve derlemede sabitlenen `process.env.NODE_ENV`.
- `scripts/apply-migrations.sh` bash + psql ister. Linux CI'da koşuyor. Windows'ta WSL ya da Git Bash gerekir, ürün davranışı değişmez.
- `instrumentation.ts`'deki `process.exit(1)` üç platformda aynı çalışır.
