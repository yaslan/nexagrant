# TASK-MULU9J81KMT4N — FB İNCELEME-3: CI/test altyapısı + radar/karne/B8 (crw-fb)

İnceleyen: crw-fb (Kod İnceleme Uzmanı) · Dal: `dev` · İncelenen HEAD: `1fd89006` · Tarih: 29.09.2026

> **Dal inceleme sırasında yeniden yazıldı.** Yerel `dev`, origin üzerine rebase edildi. `1fd89006` artık HEAD'in atası değil, ama incelenen içerik değişmedi:
>
> - Kartlardaki commit'lerin 10'u HEAD'in atası olarak duruyor: 6a89e764, 218abbab, 2d94335c, cd895589, 6c7cfe0c, 6d1df9e1, 819aff09, e0198dd5, 959c1e80 ve 9fcb6549.
> - 56890f1f'in yerini `d1fbeb0f`, 91f4752a'nın yerini `195f80ab` aldı. `git patch-id --stable` iki çiftte de aynı: `966e41ec76ef` ve `858db3505935`, yani yamalar birebir aynı.
> - **Düzeltme notu:** Yerel `pnpm test` koşum `1fd89006` ağacındaydı ve o ağaçta 6d1df9e1'in system-scope değişikliği YOKTU (`git diff 1fd89006 5b8d9302` yalnız bu dosyayı gösteriyor). Kart 5 bu yüzden aşağıda 6d1df9e1 sürümüyle (HEAD'dekiyle aynı) ayrıca yeniden koşuldu.

Kod DEĞİŞTİRİLMEDİ. Kapıların hepsi bu makinede yeniden koşuldu. CI için rakam kendi `gh run view --log` okumamdan geliyor, yazarın raporundan değil.

## Özet karar

| #   | Kart                                                   | Ajan     | Karar    | Bloke eden          |
| --- | ------------------------------------------------------ | -------- | -------- | ------------------- |
| 1   | TASK-MULREXNKPS3BF (CI: pnpm/Node/YAML)                | devop-fb | **ONAY** | yok                 |
| 2   | TASK-MULSMP4IFCB6B (CI fabrika_app rolü)               | devop-fb | **ONAY** | yok (B-1 yeni kart) |
| 3   | TASK-MULS4C0R8EEIE (Plan* updatedAt)                   | be-fb    | **ONAY** | yok                 |
| 4   | TASK-MULRU574R88BA (canlı test rol/CI kalkanı)         | se-fb    | **ONAY** | yok (B-1 yeni kart) |
| 5   | TASK-MULT5YZUFQR5F (system-scope fixture)              | se-fb    | **ONAY** | yok                 |
| 6   | TASK-MULSVMYRRS9FV (takvim testleri .env'den bağımsız) | se-fb    | **ONAY** | yok                 |
| 7   | TASK-MULRUCLPGIVIL (.gitignore / .env.example)         | devop-fb | **ONAY** | yok                 |
| 8   | TASK-MULR39X1K5K6C (kamu kataloğu + radar)             | se-fb    | **ONAY** | yok (Ö-1 öncelikli) |
| 9   | TASK-MULR3TQ24ZZ7N (/fon-hazirlik karnesi)             | fe-fb    | **ONAY** | yok                 |
| 10  | TASK-MULRS12Y8F087 (WAU / Ö1)                          | se-fb    | **ONAY** | yok                 |

10 kartın hiçbirinde bloke eden bulgu yok. Her kartın DoD'u kanıtla karşılanıyor. Kartlar arası bir **B-1** var: CI'da bir canlı suite hiçbir şey ölçmeden yeşil geçiyor. Bu, bu 10 kartın DoD'unu bozmuyor (suite 41ec739c ile sonradan geldi). Yine de CI'yı yanlış yeşil gösterdiği için **yeni bir kart açılmalı**.

Etiketler: **B** = hata (düzeltilmeli) · **Ö** = öneri · **K** = kayıt/bilgi, iş gerekmez.

## Kapı çıktıları (bu makinede, HEAD 1fd89006)

Test, `.env` yüklenerek koşuldu: `bash -c 'set -a; source .env; set +a; …'`. 91f4752a'dan sonra `.env` bash'te de zsh'ta da source edilebiliyor (`source-ok rc=0`, `zsh-source-ok`). `DATABASE_URL`, `DATABASE_URL_RLS_TEST` ve `EMAIL_FROM` yüklendi.

```
pnpm typecheck      → $ tsc --noEmit          EXIT 0
pnpm lint           → $ eslint                EXIT 0
pnpm test           →  Test Files  175 passed | 2 skipped (177)
                        Tests  2014 passed | 8 skipped (2022)     EXIT 0
pnpm rls:check      → ✅ SUCCESS: All 46 tenant-scoped models have RLS policies registered.
                       CHECK 4b ✅ every one of them carries ENABLE + FORCE + tenant_isolation   EXIT 0
pnpm rls:bypass-check → ✅ SUCCESS: no new tenant bypass. 1 call site(s) allowed with a recorded
                       reason, 23 on the sanctioned cross-tenant path, 0 still owed.            EXIT 0
pnpm rls:verify     → ✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle
                       GERÇEKTEN ölçüldü: okuma ve yazma, kiracı sınırında reddedildi.         EXIT 0
pnpm i18n:check     → ✅ i18n check passed: both catalogs agree, every key used in src/ resolves,
                       and no file gained hard-coded text. (325/325 baseline)                 EXIT 0
pnpm a11y:check (A11Y_PATHS = yeni sayfalar) →
   ✅  93  /tr/belediye-cagrilari      ✅  93  /en/municipal-calls
   ✅  99  /tr/fon-hazirlik            ✅  99  /en/funding-readiness
   ✅ 100  /tr/fon-hazirlik?kurum=municipality&cevap=210120012100221&il=Samsun
```

Odaklı koşu, verbose (`weekly-active-users.live`, `system-scope.live`, `agency-invite.live`, `src/lib/{metrics,public-sector,readiness}`): `Test Files 9 passed (9) · Tests 85 passed (85)`. Canlı WAU testlerinin üçü de gerçekten koştu, örneğin `✓ … bound to tenant B, a query for tenant A's id returns nothing: RLS, not only the WHERE`.

**CI, run 36491973080** (head `6d1df9e1`, benim okumam):

- Adımlar: `Install pnpm ✓ · Use Node.js ✓ · Install dependencies ✓ · Validate Prisma schema ✓ · Generate Prisma client ✓ · Prepare database ✓ · Lint ✓ · Typecheck ✓ · Test ✓ · E2E Test ✗`.
- Test adımı: `Test Files 175 passed | 2 skipped (177)` ve `Tests 2014 passed | 8 skipped (2022)`.
- Canlı suite'lerin 16'sı da `✓` ile koştu.
- Prepare database adımı: `fabrika_app rolsuper=false rolbypassrls=false`, ardından `prisma/rls.sql applied. Policies in public: 0 → 112`.
- E2E: `6 failed · 1 skipped · 2 did not run · 169 passed`. Bu kısım se-fb'nin paralel `tests/e2e` işi, bu incelemenin kapsamı DIŞINDA. CI'nın genel sonucu hâlâ kırmızı.

## Kart kart bulgular

### 1. TASK-MULREXNKPS3BF (devop-fb) — ONAY

DoD kontrolü:

- **pnpm sürümü:** `pnpm/action-setup@v4` artık `version:` almıyor. Sürüm `package.json#packageManager = pnpm@11.25.0` alanından geliyor (ci.yml, a11y-check.yml, check-rls.yml, i18n-check.yml). Node 22'ye geçildi. CI'da `Install pnpm` ve `Install dependencies` adımları yeşil.
- **protobufjs/esbuild kararı:** `pnpm-workspace.yaml` içinde `protobufjs: false` ve `esbuild: true` var, her birinin gerekçesi yorum satırında yazılı.
- **check-rls.yml geçerli YAML:** 4 workflow da `yaml.safe_load` ile `OK` veriyor. 6a89e764'ten önce check-rls "0s failure" veriyordu (runs 36486304564, 36484781634).
- **Kapı gevşetilmemiş:** check-rls'te `continue-on-error: true` zaten vardı ve yine `Fail if RLS Check Failed → exit 1` ile kapanıyor. Yorum adımına yalnız `github.event_name == 'pull_request'` koşulu eklendi, fail adımına dokunulmadı. ci.yml'e `continue-on-error` eklenmedi. `dlx` yerine `exec` kullanılması sabitlenmiş sürümü kullandırıyor.

Bulgular:

- **Ö-2 (ci.yml:73-80):** "Prepare database" adımı `prisma db push` kullanıyor, `prisma/migrations/*.sql` uygulanmıyor. Bunun iki sonucu var:
  - (a) Migration ile şema arasındaki kayma CI'da görünmüyor. Kart 3'teki hata tam olarak bu sınıftandı.
  - (b) Yalnız migration'da yaşayan nesneler CI veritabanında hiç yok. Örneğin `redeem_agency_invite()` yalnız `prisma/migrations/add-agency-invite-code.sql` içinde tanımlı. B-1'in kök nedeni bu.
  - Öneri: `db push`'tan sonra ya da onun yerine ham SQL migration'ları uygulayan bir adım ekleyin, ya da `prisma migrate diff --from-migrations … --to-schema …` ile bir kayma kapısı kurun.
- **Ö-3 (package.json `pnpm.onlyBuiltDependencies`):** pnpm 11 her komutta şu uyarıyı basıyor: `The "pnpm" field in package.json is no longer read … "pnpm.onlyBuiltDependencies"`. Kararlar artık `pnpm-workspace.yaml#allowBuilds` içinde. package.json'daki eski alan ölü ayar ve okuyanı yanıltıyor. Silinmesi önerilir.
- **K:** CI'da Node 20'yle ilgili deprecation uyarısı çıkıyor: `actions/checkout@v4, setup-node@v4, action-setup@v4 forced to Node 24`. Şu an zararsız.

### 2. TASK-MULSMP4IFCB6B (devop-fb) — ONAY

DoD kontrolü:

- **Rol ve env:** ci.yml:19'da `DATABASE_URL_RLS_TEST` job-env olarak tanımlı. Parola bir servis-konteyner parolası, gerçek bir sır değil. `pnpm db:rls-role` sırası doğru: `db push → db:rls-role → db:rls → db:seed`. `prisma/rls-app-role.sql:40` rolü `NOSUPERUSER NOBYPASSRLS` ile oluşturuyor.
- **CI kanıtı:** CI logunda `fabrika_app … rolsuper false … rolbypassrls false` görünüyor. 16 canlı suite'in 16'sı `✓` ile koştu. RLS suite'lerini `assertRlsSubjectRole` koruyor.
- **B-1 (kapsam dışı commit; yeni kart önerilir):** `tests/agency-invite.live.test.ts:108-111` CI'da da **sessizce atlıyor**.
  - CI logunda şu satır var: `agency-invite live test skipped: add-agency-invite-code.sql is not applied.` Satırın ardından `✓ tests/agency-invite.live.test.ts (16 tests)` geliyor. Yani 16 test hiçbir şey ölçmeden yeşil geçiyor, çünkü her test `if (!ready) return expect(skipReason).toBeTruthy()` ile dönüyor.
  - Senaryo: CI'daki DB `db push` ile kuruluyor, bu yüzden `redeem_agency_invite` fonksiyonu yok (Ö-2). Test bu dala `skipOrFailInCi` çağırmadan `console.warn` ile giriyor. Sonuç: ajans davet kodu RLS'i CI'da hiç ölçülmüyor ama kapı yeşil gösteriyor.
  - Yerelde fonksiyon uygulanmış, suite yerelde gerçekten koşuyor (odaklı koşuda 85/85, atlama yok).
  - Düzeltme: satır 110'daki `console.warn`'u `skipOrFailInCi(SUITE, skipReason)` ile değiştirin ve CI'da `add-agency-invite-code.sql` uygulansın (Ö-2).
  - Suite 41ec739c (TASK-MULSMUB1XU9) ile geldi, 2d94335c'den sonra. Bu nedenle kart 2'nin DoD'u, commit'lendiği andaki haliyle sağlanıyor.

### 3. TASK-MULS4C0R8EEIE (be-fb) — ONAY

DoD kontrolü:

- **Hizalama:** `schema.prisma:280/296/311` içinde `PlanVersion`, `PlanFeature` ve `PlanAssignment` `updatedAt` alanları `@default(now()) @updatedAt` oldu. Bu, migration'daki `"updatedAt" … NOT NULL DEFAULT CURRENT_TIMESTAMP` tanımıyla birebir eşleşiyor (`add-plan-versioning/migration.sql:48/62/74`).
- **Yeni migration yok:** commit yalnız `schema.prisma` ve raporu değiştiriyor.
- **Kayma kontrolü:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` (yerel DB migration'larla kurulu) artık Plan* `updatedAt` için fark vermiyor.

Bulgular:

- **Ö-4 (aynı hata sınıfı, iki kardeş kayma kaldı):** aynı diff şunları hâlâ gösteriyor:
  - `ALTER TABLE "PlanVersion" ALTER COLUMN "modules" DROP DEFAULT;` Migration'da `"modules" TEXT[] NOT NULL DEFAULT '{}'` var (satır 44), şemada `@default([])` yok.
  - `ALTER TABLE "TenantBillingIdentity" ALTER COLUMN "updatedAt" DROP DEFAULT;`
  - `db push` ile kurulan CI DB'sinde bu iki kolonun varsayılanı yok. `modules` alanını vermeyen bir ham `INSERT INTO "PlanVersion"` 23502 hatası alır. Bugünkü ham INSERT'lerin hepsi (`tests/plan-*.spec.ts`) `modules` alanını açıkça veriyor, o yüzden henüz patlamıyor.
  - Öneri: `@default([])` ve `@default(now())` eklensin.
- **K:** Aynı diff PlanVersion, PlanFeature, PlanAssignment ve Subscription FK'larını drop edip aynı tanımla yeniden ekliyor. Bu, constraint tanım farkından doğan kozmetik bir gürültü, davranış farkı değil.

### 4. TASK-MULRU574R88BA (se-fb) — ONAY

DoD'u, `.env`'siz izole bir worktree'de (node_modules sembolik bağlı) **kendim negatif senaryolarla** doğruladım. Denenen suite'ler: pipeline-surface ve system-scope.

```
(a) CI=1, DATABASE_URL_RLS_TEST yok → Test Files 2 failed (2)
    Error: pipeline-surface tenant-scope test: refusing to skip in CI — DATABASE_URL_RLS_TEST is not set …
    Error: system-scope live test: refusing to skip in CI — DATABASE_URL_RLS_TEST is not set …
(b) CI=1, DATABASE_URL_RLS_TEST = fabrika (BYPASSRLS) → Test Files 2 failed (2)
    Error: … connected as "fabrika" (rolsuper=true, rolbypassrls=true). RLS does not apply to this role …
(c) yerel, CI yok, env yok → Test Files 1 passed | 1 skipped (2)   (yerelde uyarı + atlama, tasarım gereği)
```

16 canlı suite'in hepsi `tests/helpers/live-db-role` kullanıyor. Kendi `console.warn` atlaması olan tek dosya `agency-invite.live.test.ts:110`, bkz. B-1. App-owner rolünde ölçen suite'ler ters yönde korunuyor (`assertAppOwnerRole`): calendar-token, concept-template, gdpr, m9, relationship, stripe-webhook-*. RLS rolü verilirse bu suite'ler kırmızıya düşüyor.

Bulgular:

- **K (Ö-5, tasarım notu):** Yerelde env yokken `system-scope.live` 6 testi "passed" sayıyor (senaryo c). Sebep, `return expect(skipReason).toBeTruthy()` kalıbı. CI'da artık bu yol throw ediyor, dolayısıyla risk yalnız yerelde "yeşil" görünen bir sonuç. Ayrı bir iş gerektirmiyor. İstenirse `it.skipIf` ile "skipped" olarak raporlanabilir.

### 5. TASK-MULT5YZUFQR5F (se-fb) — ONAY

DoD kontrolü:

- **Fixture:** `system-scope.live.test.ts` `beforeAll` içinde iki throwaway kiracı, kullanıcı ve üyeliği owner handle üzerinden yazıyor. Yazımı `groupBy` ile geri okuyup doğruluyor (`rows.length !== 2 → throw`). `afterAll` → `wipeFixture` ile temizliyor. Sayım fixture kiracılarıyla sınırlı, bu da eşzamanlı suite'lerle yarışmayı önlüyor.
- **Yerel koşu (6d1df9e1 sürümü; `git diff --quiet 6d1df9e1 HEAD -- tests/system-scope.live.test.ts` ve çalışma ağacı == HEAD):** `✓ outside the path, a cross-tenant read returns nothing`, `✓ inside the path, the same read spans tenants` ve kalan 4 test ✓. Sonuç: `Tests 6 passed (6)`.
- **Yarış kontrolü:** system-scope, weekly-active-users ve registration-consent birlikte 3 kez koşuldu, üçünde de `Tests 13 passed (13)`.
- **Temizlik kanıtı:** koşulardan sonra canlı DB'de `{ tenants: 0, users: 0 }` (`t-sysscope-%` / `u-t-sysscope-%`).
- **CI:** run 36491973080'da Test adımı ✓, `tests/system-scope.live.test.ts (6 tests)` ✓. Yazarın verdiği run id doğru.
- Bulgu yok.

### 6. TASK-MULSVMYRRS9FV (se-fb) — ONAY

DoD'u üç ortamda kendim koştum (`encryption.test.ts` + `sync.test.ts`):

```
env'de anahtar yok                         → Test Files 2 passed (2) · Tests 26 passed (26)
.env source (CALENDAR_ENCRYPTION_KEY dolu) → Test Files 2 passed (2) · Tests 26 passed (26)
başka bir anahtar (ffff…)                  → Test Files 2 passed (2) · Tests 26 passed (26)
```

`vi.mock('@/lib/env')` dondurulmuş `env.CALENDAR_ENCRYPTION_KEY` değerini boşaltıyor. Test başına ayar `vi.stubEnv` ile yapılıp `unstubAllEnvs` ile geri alınıyor.

Bulgular:

- **K:** `encryption.test.ts` "missing key" testindeki ikinci `try/catch`, throw olmazsa hiçbir assert çalıştırmadan geçer. Hemen üstteki `expect(...).toThrow` bu durumu zaten yakaladığı için bu bir boşluk değil.

### 7. TASK-MULRUCLPGIVIL (devop-fb) — ONAY

DoD kontrolü (değer basılmadı):

- **Desenler ignore ediliyor:** `git check-ignore -v` sonuçları: `foo/client_secret_123.json → .gitignore:106`, `service-account.json → :107`, `x.p12 → :108`, `key.pem → :25`, `.env`/`.env.local → :34`.
- **`.env.example` izleniyor:** `git ls-files` listesinde var (`!.env.example`).
- **Source edilebiliyor:** `.env` ve `.env.example` bash'te de zsh'ta da hatasız source ediliyor.
- **Sırsız (md5 ile):** commit'teki `.env.example` (`git show 91f4752a:.env.example`, HEAD ile aynı) alındı. ≥8 karakterlik değerlerin md5'i yerel `.env` değerleriyle karşılaştırıldı.
  - 12 eşleşme çıktı, hepsi sır olmayan anahtarlar: NODE_ENV, NEXT_PUBLIC_APP_URL, REDIS_URL, WORKER_URL, AI_PROVIDER, EMBEDDING_MODEL, SEDIA__/CORDIS__ URL'leri, EMAIL_FROM ve WORKER_TOKEN.
  - WORKER_TOKEN'ı ayrıca kontrol ettim: 9 karakter, "dev/token" sözcüğünü içeren yerel bir yer tutucu. Yerel `.env` de aynı yer tutucuyu kullanıyor, gerçek bir sır değil.
  - Uzun ve rastgele görünen değer: `[]`. Sağlayıcı desenleri (`sk_live`, `AKIA`, `GOCSPX-`, `AIza`, `whsec_`, `-----BEGIN`): eşleşme yok.
  - Git geçmişindeki `+` satırlarında yerel `.env` değerleri (≥16 karakter, 18 anahtar): eşleşme `[]`.

Bulgular:

- **Ö-6 (şablon eksik):** Kodda kullanılan ama `.env.example`'da olmayan anahtarlar var: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (yerel `.env`'de mevcut), `NEXTAUTH_SECRET`, `BETA_*`, `BILLING_ACTIVE_TIER`, `ALERTS_SWEEP_FAILURE_THRESHOLD` ve başkaları. Yeni bir checkout bunları şablondan öğrenemiyor. Boş değerle eklenmeleri önerilir.
- **K:** Çalışma ağacında `.env.example` üzerinde başka bir ajanın commit'lenmemiş değişikliği var (`+5/−2`). Bu incelemenin kapsamı yalnız commit'lenmiş sürüm.

### 8. TASK-MULR39X1K5K6C (se-fb) — ONAY

DoD kontrolü:

- **Her kayıtta resmî kaynak:** 12 programın hepsinde `sourceNote ≥ 1`, her URL `https://` ile başlıyor ve `note` dolu (tsx ile tüm kataloğu gezdim). Kaynakların çoğu ec.europa.eu; geri kalanlar ua.gov.tr, oka.gov.tr, cbc.ab.gov.tr ve dutpartnership.eu.
- **CERV ve LIFE kapalı işaretli:** `cerv-town-twinning`, `cerv-networks-of-towns` ve `life` → `not_eligible`. Tarayıcıda "Son turu yeni kapanan çağrılar" bölümünde üçü de "Türkiye bu programa katılmıyor" rozeti ve açıklama notuyla görünüyor. FitCheck bunlarda gösterilmiyor (page.tsx:167 ve :347).
- **Oturumsuz açılıyor:** `curl` çerezsiz `/tr/belediye-cagrilari → 200` ve `/en/municipal-calls?orgType=metropolitan → 200`. Tarayıcıda sayfa "Giriş / Kayıt Ol" başlığıyla, 30 açık/yakında çağrıyla yüklendi.
- **"Size uygun mu?" çalışıyor:** gerçek tıklamayla denedim. İlk DIGITAL kartında summary açıldı, PIC = Evet, Ortak = Hayır, Eş finansman = Evet seçildi. Sonuç: "Hazırlık gerekli · Başvurmadan önce şunları tamamlamanız gerekiyor: • Ortak bulma" ve "Fon Hazırlık Karnesi" linki. `fit.ts` saf fonksiyon (YZ yok, I/O yok).
- **RLS bypass yok:** `radar.ts` yalnız `prisma.topic.findMany` çağırıyor. `Topic` modelinde `tenant` alanı yok (`awk … | grep tenant → rc=1`). `withSystemScope` ya da kiracı verisi kullanılmıyor. `rls:bypass-check` yeşil.

Bulgular:

- **Ö-1 (öncelikli, WCAG AA): `belediye-cagrilari/fit-check.tsx:74-76`.** Seçili cevap butonu `bg-accent text-white` kullanıyor. Koyu temada `--accent` #0891B2 ve beyaz arasındaki kontrast **3.68:1**, `text-sm font-medium` için gereken 4.5:1'in altında. Açık temada 5.93:1 ile sorun yok.
  - Senaryo: koyu temadaki bir kullanıcı "Evet"i seçer ve seçili butonun metni AA'dan kalır.
  - Lighthouse bunu yakalamıyor (93 puan), çünkü `<details>` kapalı geliyor ve seçili durum ilk render'da yok.
  - Bu, projede kayıtlı tekrarlayan hata sınıfı (globals.css:17-19 yorumu ve `--accent-strong` "5.36:1 against white"). Düzeltme tek sınıf: `bg-accent` → `bg-accent-strong`.
- **Ö-7 (a11y deseni): `fit-check.tsx:63-71`.** `role="radiogroup"` içinde `role="radio"` verilmiş `<button>`'lar var. ARIA radio deseni ok tuşlarıyla gezinme ve tek tab durağı bekliyor. Burada her buton ayrı bir tab durağı ve ok tuşu çalışmıyor. Klavyeyle kullanılabiliyor ama ekran okuyucuya yanlış sözleşme veriyor. İki çözüm var: ya native `<input type="radio">` (fon-hazirlik'teki gibi), ya da `role` yerine `aria-pressed`.
- **Ö-8: `fit-check.tsx:89`.** `role="status"` bölgesi ancak sonuç oluşunca DOM'a ekleniyor. Birçok ekran okuyucu içeriğiyle birlikte eklenen canlı bölgeyi okumuyor. Kapsayıcı baştan boş olarak render edilmeli.
- **K: `radar.ts:208-212`.** `take: 500` önce, programa göre filtre sonra uygulanıyor. Yerel DB'de ilgili önekli satırların radar penceresindeki toplamı 137 (HORIZON-MISS 54, LIFE 28, DIGITAL 23, NEB 19, CERV 8, ERASMUS 5), bugün güvenli. Horizon kapsamı büyürse eski "recently_closed" satırları sınırı doldurabilir.
- **K (metin):** "Türk kurumları … ortak olamaz. Program AB'li ortaklarınızın projelerine katılım için yine de takip edilebilir." cümlesi kendi içinde çelişkili okunuyor. "Fonsuz/ilişkili ortak" gibi bir netleştirme önerilir.

### 9. TASK-MULR3TQ24ZZ7N (fe-fb) — ONAY

DoD kontrolü:

- **15 soru:** `questions.ts` içinde 15 `id` var. `share.ts` deseni `^[012]{15}$`.
- **Saf puanlama:** `score.ts` içinde `Math.random`, `Date` ya da `fetch` yok, YZ çağrısı yok.
- **Katalogdan 3 program:** `RECOMMENDATION_COUNT` ile öneri geliyor. `isApplicable`, `not_eligible` programları ve kapsam dışı illeri eliyor. Tarayıcıda paylaşım linkiyle (`?kurum=municipality&cevap=210120012100221&il=Samsun`) sonuç 50/100 "Gelişen" çıktı. Önerilen 3 program: Erasmus+ KA2, Interreg NEXT Karadeniz ("Samsun dahil 25 ilimiz") ve OKA. Hiçbiri CERV ya da LIFE değil.
- **PII yok:** Cevaplar yalnız URL'de. `history.replaceState` sunucuya istek atmıyor. `analytics.track` bugün bir stub (`src/lib/analytics.ts`: yalnız development ortamında `console.log`) ve gönderdiği alanlar `orgType`, `total` ve `level`.
- **İletişim formu yok:** üç `<input>`'tan ikisi radio grubu, üçüncüsü salt okunur paylaşım URL'si. E-posta ya da telefon alanı yok.
- **Erişilebilirlik:** native `input[type=radio]` + `fieldset/legend` kullanılıyor, `focus-visible` halkası var, hata için `role="alert"` var. Lighthouse puanları: `/tr/fon-hazirlik` 99, `/en/funding-readiness` 99, sonuç sayfası 100. Butonlarda `bg-accent-strong` kullanılmış (koyu temada 5.36:1).

Bulgular:

- **K (ileriye dönük):** PostHog gerçekten bağlandığında otomatik `$current_url` yakalaması, `replaceState` ile URL'ye yazılan `kurum`, `cevap` ve `il` değerlerini analitik sunucusuna taşır. Bu kişisel veri değil ama "sunucuya kaydedilmez" metnini bozar. Bağlama kartına not düşülmeli.
- **K:** Tarayıcı aracı tuş basışı desteklemediği için klavye akışını kendim sürüp doğrulayamadım. Yukarıdaki değerlendirme kod okumasına ve fe-fb'nin `04-keyboard-focus.png` karesine dayanıyor.

### 10. TASK-MULRS12Y8F087 (se-fb) — ONAY

DoD kontrolü:

- **PII'siz alt sınır:** Sonuç yalnız `{ weekStart, activeUsers }` dönüyor, kullanıcı id'si yok (`weekly-active-users.ts`). Kaynak olarak yalnız aktörü ve zamanı taşıyan yazma satırları sayılıyor. "Alt sınır" olduğu açıkça belgelenmiş: Session tablosu yok ve yerinde düzenlemeler sayılmıyor.
- **Kiracı kapsamı:**
  - `assertTenantScope` var ve `withTenant` içinde çalışıyor.
  - UNION'daki 11 kolun her birinde açık `"tenantId" = ${tenantId}` koşulu var (BYPASSRLS rolde tek çit bu).
  - `Membership` join'i de aynı `tenantId` ile sınırlı, platform yöneticileri sayılmıyor.
  - Parametreler `Prisma.sql` ile bağlanıyor, SQL enjeksiyonu yüzeyi yok.
  - Canlı testte, tenant B'ye bağlı RLS rolüyle A'nın id'si sorulduğunda boş dönüyor (✓, yerelde ve CI'da).
- **Şema değişikliği yok:** commit'te `prisma/` dosyası yok (`grep -c prisma → 0`).
- **Hafta hesabı:** JS'teki `weekWindow` ve SQL'deki `date_trunc('week', at + 3h)` aynı Pazartesi kuralını uyguluyor.
- Bulgu yok.
- **K:** Fonksiyonun henüz bir çağıranı yok (`grep` ile yalnız kendi dosyası ve testleri bulunuyor). Kart kapsamı zaten "ölçü fonksiyonu".

## Değişen dosyalar

- `docs/agent-results/TASK-MULU9J81KMT4N-crw-fb.md` (bu rapor). Başka dosyaya dokunulmadı.
- Geçici izole worktree (scratchpad/wt) kullanıldı ve `git worktree remove` ile kaldırıldı.

## Riskler

- **B-1:** CI şu an ajans davet kodu RLS'ini ölçmüyor ama yeşil gösteriyor. Kök neden Ö-2: `db push` kullanılıyor, ham SQL migration'lar uygulanmıyor.
- **Paylaşımlı ağaç:** incelemenin başında ağaç temizdi. Sonradan başka ajanlar 15 dosyayı commit'lemeden değiştirdi: `src/lib/auth*.ts`, `demo-login*`, `prisma/migrations/*` ve `.env.example`. Ürün dosyalarının hiçbiri (`public-sector`, `readiness`, sayfalar, `messages`) değişmedi, yani :3000 incelenen kodu sundu. `pnpm test` bu değişiklikler yazılırken koşmuş olabilir. Buna karşın yalnız commit'lenmiş dosyalara dayanan odaklı koşular da yeşil.
- CI E2E adımı kırmızı (6 başarısız), kapsam dışı (se-fb).

## Açık sorular

- B-1 ve Ö-2 için yeni kart gerekiyor mu? Rapor yazılırken dala **TASK-MULU7SAA4EPP8** commit'leri geldi:
  - `754aa884 fix(db): make every forward migration replayable on top of db push`
  - `22c4d508 ci: apply prisma/migrations in CI, twice`
  - `9869650f test(kamu): agency-invite live suite … fails in CI without its migration`
  - Başlıklara bakılırsa bu commit'ler B-1'i ve Ö-2'yi hedefliyor. Ancak bu incelemenin kapsamı DIŞINDA, kodlarını okumadım ve doğrulamadım. Onaylamak için bir sonraki CI koşusunda `agency-invite live test skipped` satırının kaybolduğunu görmek gerekir.
- Ö-1 (kontrast) ayrı bir kart mı olsun, yoksa se-fb radar kartına düzeltme mi eklensin?

## Sonraki adım

1. **B-1 + Ö-2** (TASK-MULU7SAA4EPP8 bunu ele alıyor gibi görünüyor, doğrulanmadı): CI'da `prisma/migrations/*.sql` uygulansın ve `agency-invite` atlaması `skipOrFailInCi` üzerinden geçsin. Ardından CI'da `agency-invite live test skipped` satırı görünmemeli.
2. **Ö-1:** `fit-check.tsx:74` içinde `bg-accent` → `bg-accent-strong`, ve Ö-7/Ö-8 ile aynı PR'da yapılsın.
3. **Ö-4:** `PlanVersion.modules @default([])` ve `TenantBillingIdentity.updatedAt @default(now())`.
4. **Ö-3, Ö-6:** package.json'daki ölü `pnpm` alanı silinsin, `.env.example`'a eksik anahtarlar eklensin.

## Platform beyanı

- **macOS (Darwin 27, zsh + bash):** bütün yerel kapılar (typecheck, lint, test, rls:check, rls:bypass-check, rls:verify, i18n:check, a11y:check), negatif senaryo koşuları ve AgentSpace iç tarayıcısıyla localhost:3000'de yapılan gerçek tıklama testi burada koşuldu.
- **Linux (ubuntu-latest, GitHub Actions):** bunu kendim koşmadım. Run 36491973080'in tam logunu `gh run view --log` ile okudum. Test ve Prepare database adımları, rol özellikleri ve 16 canlı suite o logdan alındı.
- **Windows:** koşulamadı, bu makinede Windows yok. Koddan çıkarımım şöyle:
  - İncelenen değişiklikler CI YAML'ı (Linux runner), Postgres rol ve SQL tarafı, saf TS mantığı ve istemci React'ı. Hiçbiri platforma bağlı yol, süreç ya da kabuk kullanmıyor.
  - İstisna, dokümanda geçen `set -a; source .env` tarifi. Bu POSIX kabuk gerektirir ve Windows'ta PowerShell/cmd ile çalışmaz. 91f4752a'daki `EMAIL_FROM` tırnaklaması yalnız bash ve zsh için anlamlı.
