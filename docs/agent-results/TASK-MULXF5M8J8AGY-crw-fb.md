# TASK-MULXF5M8J8AGY — FB İNCELEME-6: B12 eki düzeltmesi, geliştirme ortamı, E2E 6 kırmızı (CRW-FB)

Sprint FB-KAMU-2 · dal `dev` · inceleme başı `1e82e1f9` (kapılar bu commit'te, ayrı worktree'de koşuldu) · 29.09.2026 · Kod değiştirilmedi.

Önem kodları: **B** = bloke eden · **Ö** = önemli (kapanmadan önce düzeltilmeli ya da sahibine açıkça devredilmeli) · **K** = küçük / öneri.

## Özet karar

| Kart                                                     | Karar                                                          | B   | Ö   | K   |
| -------------------------------------------------------- | -------------------------------------------------------------- | --- | --- | --- |
| 1. TASK-MULWC74HGLY9T — B12 KVKK eki düzeltmesi (cs-fb)  | **DÜZELTME GEREKLİ** — içerik ONAY, teslimat commit'te yok     | 1   | 1   | 2   |
| 2. TASK-MULQKN4K7SRN0 — geliştirme ortamı (devop-fb)     | **DÜZELTME GEREKLİ** — README akışı temiz klonda `up`'ta düşer | 0   | 1   | 3   |
| 3. TASK-MULU828HTNN4N — E2E 6 kırmızı + identity-strings | **DÜZELTME GEREKLİ** — #1–2 kök nedeni açık ve tekrarlıyor     | 0   | 1   | 2   |

Hiçbir kartta test gevşetme ya da sır sızıntısı yok. Üç düzeltme de küçük: Kart 1 bir commit, Kart 2 bir satır + README adımı, Kart 3 bir devir kartı (kod gerekmez).

## Kapı çıktıları (bu oturumda, `1e82e1f9` worktree'si)

Ortak ağaçta başka ajanların commitlenmemiş işi var (29 değişik dosya: il alanı, B11, rls.sql). Bu yüzden kapılar `git worktree add --detach … 1e82e1f9` ile ayrı ağaçta koşuldu. `node_modules` ana ağaçtan bağlandı (`prisma generate` koşulmadı, paylaşılan istemci yeniden üretilmedi).

| Kapı                                                | Sonuç                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                    | `rc=0`                                                                                                |
| `eslint`                                            | `rc=0`                                                                                                |
| `pnpm test` (yalın, `.env` var)                     | `Test Files 181 passed \| 2 skipped (183)` · `Tests 2067 passed \| 8 skipped (2075)` · `rc=0`         |
| `bash -c 'set -a; source .env; set +a; vitest run'` | `source rc=0` · `Tests 2067 passed \| 8 skipped (2075)` (aynı)                                        |
| CI benzeri: `.env` yok, yalnız 2 DB URL'si kabuktan | `Tests 2067 passed \| 8 skipped (2075)` · `rc=0` (aynı)                                               |
| `.env` yok, DB URL'si de yok                        | `Tests 35 failed \| 1868 passed \| 172 skipped` — beklenen: canlı testler :5432 YUYT'ye düşüp kırmızı |
| `rls:check`                                         | `✅ SUCCESS … ENABLE + FORCE + tenant_isolation` · `rc=0`                                             |
| `rls:bypass-check`                                  | `✅ SUCCESS: no new tenant bypass … 0 still owed` · `rc=0`                                            |
| `rls:verify` (canlı, `fabrika_app`)                 | `✅ 46 kiracıya özel tabloda … GERÇEKTEN ölçüldü` · `rc=0`                                            |
| `i18n:check`                                        | `✅ i18n check passed` · `rc=0`                                                                       |
| `docker compose config` (`.env` ile)                | `name: fabrika`, postgres `published: "5433"`, `fabrika_pgdata`, `fabrika-redis`, `fabrika-mailpit`   |
| `docker compose --env-file .env.example config`     | `rc=1` — `required variable AUTH_SECRET is missing a value` (Kart 2 Ö-1)                              |

Yalın koşudaki 8 atlanan test sabit `it.skip`'ler (`adapters`, `k1-daily-calls`, `sedia-adapter`); ortama bağlı değiller.

## 1. TASK-MULWC74HGLY9T (cs-fb, B12 eki) — DÜZELTME GEREKLİ

İncelenen: çalışma ağacındaki `docs/legal/agency-channel-notice-addendum.md` (0.2-taslak), `docs/legal/processing-register.md` §18c/§18b/§20/§22, `docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md`, cs-fb raporu. Bunlar `1e82e1f9` koduyla karşılaştırıldı. İncelediğim dosyaların blob özetleri: ek `edac7f16f630`, envanter `9a28bb5a5f40`, B12 raporu `5879aad3bed0`, cs-fb raporu `3530579a9c51`.

**Doğru olanlar (koddan doğrulandı):**

- **B-1 (eşik 5):** `grep -n -E "3'ten|<3|fewer than 3"` rapor + `docs/legal/*.md` → boş. TR `sees` (:70) ve EN `sees` (:99) "5". §1, §5, §8 güncel. Düzeltme notu :55'te.
- **Ö-1 (bugünkü kodla hizalı):** Kırılım yalnız kurum türü. `funnel.ts:34-44` `ORG_TYPES`, `:68-74` `AgencyFunnel` yalnız `all` + `byOrgType`. `add-agency-funnel.sql:73-76` `GROUP BY t."orgType"`. İl, program ve ortalama puan §2.2'de "gelecek" diye ayrı. Kullanıcı metnine (§4, §5) girmiyorlar. Kod kiracıya bağlanmıyor: `auth.ts:286-300` yalnız `agencyId` yazıyor, `:339-347` redeemed kaydı `{ agencyId }`. `schema.prisma:67` "The code itself is never stored". Bağ kaldırma özelliği yok: `grep "agencyId: null|agencyId = NULL" src prisma/migrations` → boş. Madde 10 "bugün kaldıramazsınız; talep üzerine elle" + A3 + HUKUK-8.
- **Ö-2 (§18c envantere taşındı):** Satır gerçek dosya adlarıyla yazılmış. `agency.invite.created` (`codes.ts:104`), `agency.invite.revoked` (`codes.ts:127`), `noteInviteRejection` (`codes.ts:177`, `auth.ts:383`), `ON DELETE SET NULL` / `CASCADE` (`add-agency-invite-code.sql:52`, `:100`): hepsi var. §20'ye `AgencyInviteCode` satırı eklenmiş, `AuditEvent`/`Tenant`/`SystemAlert` notları doğru. Taslak dosya silinmiş.
- **K-1 (ret denemeleri):** §2.1 son satır + TR md.6 / EN item 6. Kodla aynı: `fix-agency-invite-rejection-audit.sql:61-65`. Yazılanlar `tenantId = agency`, `{reason, codeId}` ve zaman; `actorId` yok. Bilinmeyen kod için yalnız `SystemAlert` sayacı yazılıyor (`:68-93`).
- **K-2 (kurum adı):** TR md.7 "Kurumunuzun adı ajansa gösterilmez." EN item 7 aynı. HUKUK-4 yalnız "ileride" sorusu.
- Eşleşme tablosundan örneklediğim 16 satır (#1-3, 5, 8, 11, 12, 14, 16, 18, 20, 21, 23-26) `1e82e1f9`'da tuttu. Kartta olmayan "başvuru sayısı ≠ kurum sayısı" düzeltmesi de doğru (`applicationOutcome.ts:57`, `submittedWhere`).

**B-1: Kartın teslimatı commit'te yok. `0b79d575` yalnız biçim değişikliği.**
Kanıt: `git status --porcelain` → ` M docs/legal/agency-channel-notice-addendum.md`, ` M docs/legal/processing-register.md`, ` M docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md`, `?? docs/agent-results/TASK-MULWC74HGLY9T-cs-fb.md`. Ayrıca `git diff --cached` → `D docs/legal/processing-register-draft-agency-channel.md`. Kartın verdiği tek hash `0b79d575`: "prettier-format … (no content change)", 235+/235-. cs-fb raporu §3 "sonraki commit §18c" diyor, ama o commit yok (HEAD `849d7708`'e kadar).
Senaryo 1: Paylaşılan ağaçta silme **index'te staged**. Başka bir ajan pathspec'siz `git commit` yaparsa taslak dosyanın silinmesi onun commit'ine girer. §18c eklemesi ise dışarıda kalır, commitlenmemiş olduğu için. Sonuçta envanter satırı hiçbir yerde olmaz.
Senaryo 2: AgentSpace worktree sıfırlaması commitlenmemiş işi siler (bilinen olay). Kartın bütün içeriği kaybolur.
Düzeltme: `git commit -- docs/legal/agency-channel-notice-addendum.md docs/legal/processing-register.md docs/legal/processing-register-draft-agency-channel.md docs/agent-results/TASK-MULRRHM9N7XPM-cs-fb.md docs/agent-results/TASK-MULWC74HGLY9T-cs-fb.md`. Commit'teki blob'lar yukarıdaki özetlerle aynıysa içerik yeniden incelenmez, kart ONAY'a döner.

**Ö-1: fe-fb'nin il alanı ve tek pencere düzeltmesi gelince ek ve §18c YENİDEN güncellenmeli. Ek bunu kendisi şart koşuyor.**
Ekin kendi kuralı md.6 (:125): "Ajansa yeni bir sayı gösterilmeden önce bu ek güncellenir." §2.2 de "Kod gelince bu ek ve envanter §18c **önce** güncellenir" diyor. Ortak ağaçta commitlenmemiş fe-fb işi (TASK-MULV3JXS1AW5X) şunları getiriyor:

- `Tenant.province` (`schema.prisma` diff).
- Kayıtta il alanı: `auth.ts` diff, `credentials.province` → `toTenantProvince` → `tenant.create({ province })`.
- Ajans hunisine il filtresi: `funnel.ts` diff, `agency_funnel_counts_by_province`, `maskProvinceTable`, `AgencyFunnel.province`.

Bu commitlenince eskiyecek yerler:

- TR md.3 (:116) / EN :162 "bunun için yeni bir veri toplanmaz": il kayıtta yeni toplanıyor.
- md.6 (:125) / EN :171 "kurum türüne göre": il de eklenecek.
- §2.1 tablosu: il kırılımı satırı yok. §2.2'deki "İl kırılımı" satırı da "henüz toplanmıyor" diyor.
- §3.1 küçük sayı kuralı yalnız tür kırılımını anlatıyor, tür × il tablosunun maskelenmesini anlatmıyor.
- Envanter §18c (e) "il ve program kırılımı **yok**".
- Eşleşme tablosu #5, #6.

Tek pencere düzeltmesi gelince (30/90 → tek dönem) şunlar da değişmeli: §2 giriş (:35), md.6 "son 30 ya da 90 gün" (TR :125, EN :171) ve eşleşme #11. İki pencerenin farkı, 60 günlük dilimde gizlenmiş küçük bir grubu geri hesaplatabilir. Ek bugün "sayı başka sayılardan geri hesaplanamaz" diyor, yani bu düzeltme ekin anonimlik iddiasının da şartı.
Senaryo: fe-fb kodu commitlenir, ek güncellenmez. Ek "il toplanmıyor" der, ama kayıt formu il sorar ve pano il filtresi gösterir. Bu, Ö-1'de kapanan az beyan / fazla beyan hatasının tersidir.
Öneri: Kart kapanabilir (bugünkü koda doğru). leed-fb, fe-fb'nin il ve pencere commit'lerine bağımlı bir cs-fb kartı açmalı. Kapsamı: yukarıdaki satır listesi ve eşleşme #5, #6, #11. Kabul ölçütü: fe-fb kodu canlıya çıkmadan önce ek sürümü 0.3.

**K-1: B12 raporundaki kısa kayıt metni `sees` hâlâ "Bölgedeki kurumların" / "organisations in its region" diyor** (`TASK-MULRRHM9N7XPM-cs-fb.md:70`, `:99`). Kod bölgeyi değil, ajansın **kodlarıyla** kayıt olan kohortu sayıyor (`add-agency-funnel.sql:73` `t."agencyId" = agency`). Kodsuz kayıt olan bölge kurumları bu sayılarda yok. Öneri: "Kodunuzla kayıt olan kurumların toplu sayıları" / "organisations that signed up with its codes". Ayrıca `unlinkHint` (:74, :103) hâlâ kopyalanacak JSON bloğunun içinde. Koşul notu (:124) bloğun dışında. FE bloğu aynen kopyalarsa olmayan bir özelliği vaat eder. Öneri: anahtarı bloktan çıkar, koşullu anahtarlar listesinde tut.

**K-2: cs-fb raporundaki `messages/tr.json` satır numaraları kirli çalışma ağacına göre.** Tablo #1 `:2084-2086`, #6 `:2079` diyor. `1e82e1f9`'da bunlar `:2081-2083` ve `:2076` (`nl -ba messages/tr.json`). Kayma başka ajanların commitlenmemiş `messages` değişikliklerinden geliyor. Rapor "bu commit'teki dosyalara göre" dediği için commit'le hizalanmalı. Ekteki düzeltme notu zaten `:2081-2083` diyor, yani iki belge birbirini tutmuyor.

**Görev notuna cevap:** Evet, ek ve §18c yeniden güncellenmeli (Ö-1). Güncelleme bu kartın kapanmasını bloke etmez. Ama fe-fb kodunun canlıya çıkışını bloke etmelidir.

## 2. TASK-MULQKN4K7SRN0 (devop-fb, geliştirme ortamı) — DÜZELTME GEREKLİ

İncelenen: `e5a6ebd5` (vitest.config.mts, tests/relationship-tenant-scope.test.ts, docker-compose.yml, README.md), `1e82e1f9` (rapor).

**Doğru olanlar:**

- **`.env` yükleme:** `vitest.config.mts:21-31` `.env`'i `util.parseEnv` ile okuyor. Kabukta tanımlı değişken kazanıyor (`process.env[key] !== undefined → continue`). `NODE_ENV` atlanıyor. `DEMO_LOGIN_ENABLED: 'true'` spread'den sonra geldiği için `.env`'deki değeri eziyor. Yalın `pnpm test` yeşil (kapı tablosu).
- **CI davranışı değişmedi:** CI'da `.env` yok (`grep "\.env" .github/workflows/*.yml` → workflow `.env` üretmiyor), `existsSync` → `{}`. Node 22 (`ci.yml:47`) `util.parseEnv`'i taşıyor (≥21.7). `e5a6ebd5` henüz push edilmedi, dolayısıyla CI koşusu yok. Kod yolunu yerelde CI benzeri koşuyla doğruladım: `.env` kaldırılıp yalnız 2 DB URL'si verildi, sonuç yalın koşuyla birebir aynı (2067/8).
- **Ortamdan bağımsızlık (özel kontrol):** `.env` 47 anahtar taşıyor. Bunlardan `REDIS_URL`, `AI_PROVIDER`, `EMBEDDING_*`, `CALENDAR_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL` gibi CI'da olmayan dolu değerler var. Yine de sonuç sayısı değişmedi. Takvim testi anahtarını kendisi kuruyor (`tests/calendar-token-db.live.test.ts:21`). `BETA_APP_URL`'e dayanan test sabit URL veriyor (`tests/beta/invite-email.test.ts:8`). `REDIS_URL`'i `src/`'de okuyan kod yok. K-6 rol kalkanı (`tests/helpers/live-db-role.ts`, `agency-invite.live.test.ts:12`) `.env`'deki `fabrika_app` URL'siyle koşuyor ve yeşil. CI'da job `env:`'i aynı rolü veriyor (`ci.yml:205`). Sonuç: ilke bozulmamış. Tek fark, canlı testlerin yerelde artık gerçekten koşması. Bu da amaçlanan davranış.
- **Compose:** `name: fabrika`, `"${FABRIKA_PG_PORT:-5433}:5432"`, `volumes.pgdata.name: fabrika_pgdata` (ayakta olan `fabrika-postgres` :5433 ve `fabrika_pgdata` volume'uyla aynı), `redis` + `mailpit` var, `fabrika-web` `app` profilinde. `up` ÇALIŞTIRILMADI. Yalnız `config`, `config --services`, `ps` ve `--dry-run` koşuldu.
- **Bekçi kararı gerekçeli:** Eski `expect(skipReason).toBe('__no_database__')` hiçbir zaman eşleşmiyordu. Yeni `beforeAll` hedefi maskeli URL'yle birlikte fırlatıyor. DB'siz koşuda doğrulandı: `Error: relationship tenant-scope needs a live FB database at (unset: src/lib/db.ts default)`. Parola `://***@` ile maskeleniyor.

**Ö-1: README'nin yerel çalıştırma akışı temiz klonda 3. adımda düşüyor. `fabrika-web` profilde olsa da `AUTH_SECRET` zorunlu.**
Yer: `docker-compose.yml` `fabrika-web.environment` → `AUTH_SECRET=${AUTH_SECRET:?set AUTH_SECRET …}`. `.env.example:16` → `AUTH_SECRET=` (boş). README akışı: `cp .env.example .env` → URL'leri 5433'e çevir → `docker compose up -d`.
Kanıt:

```
$ docker compose --env-file .env.example config        → rc=1
error while interpolating services.fabrika-web.environment.[]: required variable AUTH_SECRET is missing a value
$ docker compose --env-file .env.example --dry-run up -d redis   → aynı hata
$ AUTH_SECRET=x docker compose --env-file .env.example config --services
mailpit / postgres-vector / redis
```

Compose zorunlu değişken enterpolasyonunu profil filtresinden **önce**, bütün dosya için yapıyor. Devop-fb'nin `config` kanıtı geçti, çünkü bu makinedeki `.env`'de `AUTH_SECRET` dolu.
Senaryo: Yeni bir geliştirici (ya da temiz worktree'deki bir ajan) README'yi izler. `docker compose up -d` DB'yi hiç başlatmaz, hata `fabrika-web`'i gösterir, ama README "varsayılan `up` onu başlatmaz" diyor.
Düzeltme (biri yeter): (a) README'ye `cp` sonrası "`AUTH_SECRET`'i doldur: `openssl rand -base64 32`" adımı ekle. (b) `fabrika-web`'de `${AUTH_SECRET:-}` kullan. Kontrol zaten uygulamada var (f7a36779 K-1: min uzunluk). (c) `.env.example`'da açıkça yer tutucu değer ver. Bu davranış `e5a6ebd5`'ten önce de vardı. Ama kart README'yi "yerel çalıştırma güncel" DoD'siyle yazdı, profil notu da yanlış güven veriyor.

**K-1: `.env.example` hâlâ `localhost:5432` diyor** (`:7`, `:8`, `:12`). Compose'un varsayılanı 5433. README "3 URL'yi elle çevir" diyor. Öneri: örnek dosya compose varsayılanıyla aynı olsun (5433). Böylece kopyalayan kişi YUYT'nin 5432'sine yanlışlıkla bağlanmaz. Yeni bekçi bu durumda artık yüksek sesle hata veriyor, yani zarar yok, yalnız sürtünme.

**K-2: Mailpit ve Redis ayağa kalkıyor ama uygulama ikisini de kullanmıyor.** E-posta yalnız Resend API'siyle gidiyor (`new Resend(` → `request-deletion.ts:38`, `alerts-daily.ts:14`, `digest-run.ts:101`). `src/`'de SMTP taşıyıcısı (`createTransport`) yok. `REDIS_URL`'i okuyan kod da yok. Compose yorumu "Catches outgoing mail locally" diyor ve README de öyle anlatıyor. Bugün mailpit'e tek bir e-posta düşmez. DoD bunları istediği için bu bir kusur değil. Öneri: yorumlara "uygulama henüz SMTP/Redis'e bağlı değil" notu düş, ya da Resend için yerel yönlendirme kartı aç.

**K-3: DB'siz koşuda bekçi mesajının "neden" kısmı boş.** `… at (unset: src/lib/db.ts default): ` (Prisma başlatma hatasının `message`'ı boş satırla başlıyor). Hedef yazıldığı için teşhis yine mümkün. İstenirse `e.message.trim() || e.name` kullanılabilir.

## 3. TASK-MULU828HTNN4N (se-fb, E2E 6 kırmızı + identity-strings) — DÜZELTME GEREKLİ

İncelenen: `47c7a821`, `4ad91143` (7 dosya, yalnız `tests/e2e/`), rapor (`a304624a`, `f21e526a`). Koşular `gh run view --repo yaslan/fonbridge` ile doğrulandı.

**CI koşuları (doğrulandı):**

| Koşu        | Commit     | Sonuç                                                                          |
| ----------- | ---------- | ------------------------------------------------------------------------------ |
| 36491973080 | `6d1df9e1` | failure (başlangıç)                                                            |
| 36495597483 | `47c7a821` | failure (identity-strings, #7)                                                 |
| 36497365219 | `4ad91143` | **success** — `build-and-test=success`                                         |
| 36497677140 | `b7c25a8f` | failure — E2E: 4 failed                                                        |
| 36499232011 | `a304624a` | failure — E2E: 1 failed                                                        |
| 36499253610 | `f21e526a` | failure — E2E: 2 failed (`m9-calendar-connect:135`, `registration-consent:72`) |

**Doğru olanlar:**

- **Gevşetme yok:** Diff'te `skip`, `fixme`, `retries` ya da `continue-on-error` eklenmemiş, silinen `expect(` yok. Yeni timeout'lar (`expectHydrated` 30 sn, `waitForURL` 30 sn) test sınırının (60 sn, `playwright.config.ts:45`) altında. Şişirme değil, daha dar bir bekleme.
- **Kendi fixture'ı:** `fixtures/evidence-tenant.ts` kiracı, abonelik, M3, workspace, user ve membership kuruyor. Önce `teardown()` çağırıyor, ölü koşudan kalanı temizliyor. `m8-matching` kendi `M8E2E-PROJ-1..3` projelerini kuruyor. `identity-strings` kendi admin `User` satırını kuruyor ve siliyor.
- **Hedef 6 test** sonraki bütün koşularda yeşil. Sonraki üç koşunun hiçbir kırmızısı `auth.spec`, `evidence-*`, `m8-matching`, `invoice-foreign-currency-export` ya da `identity-strings` değil.
- **identity-strings ve be-fb tutarlılığı (fail-closed korunuyor):** `auth.ts:431-446` jwt callback önce `token.isPlatformAdmin = false` yazıyor, sonra değeri `User` satırından okuyor. `:500-501` `session.isPlatformAdmin` = DB cevabı ya da (demo açıkken) `demoAdmin`. Spec ürün kontrolüne dokunmuyor. Basılan token hâlâ `isPlatformAdmin: true` diyor (`identity-strings.spec.ts:148`), ama artık DB satırıyla destekleniyor. Satırsız token'ın admin olamadığı se-fb'nin negatif kontrolünde görülüyor ("NO row → New Post buttons: 0"). Test e-postası (`zeynep.editor@e2e.fabrika.test`) demo-admin listesinde değil, yani `demoAdmin` yolundan geçmiyor.

**Ö-1: #1–2'nin kök nedeni bulunmadı, ve aynı arıza "düzeltmeden" sonra 3 koşuda 6 kez başka spec'lerde çıktı. E2E kapısı `dev`'de yine kırmızı.**
Kanıt: sonraki kırmızıların 7'sinden 6'sı aynı imza, `Error: page.waitForLoadState: Test timeout of 60000ms exceeded` + `waitForLoadState('networkidle')`:

- 36497677140: `plan-storefront.spec.ts:132`, `:203`, `price-lock-deeper-campaign.spec.ts:71`, `registration-consent.spec.ts:119`.
- 36499232011: `plan-storefront.spec.ts:203`.
- 36499253610: `registration-consent.spec.ts:75`. Bu, `/tr/register`'daki **aynı rota** ve se-fb'nin "11 dk sonra geçti" diye kanıt olarak kullandığı spec.

Rapor #1–2'yi dürüstçe "varsayım" diye işaretliyor. Ama DoD "her biri kök nedenle düzeltildi **ya da gerekçeyle devredildi**" istiyor. #1–2 ikisi de değil: yalnız iki testte bekleme koşulu değiştirildi. Sorun sistemik: E2E `next dev`'e karşı koşuyor (`playwright.config.ts:58` `pnpm dev --port`), aynı loglarda `[WebServer] ⨯ Error: The destination stream closed early.` görünüyor. `networkidle` hâlâ 36 spec dosyasında (`grep -rl networkidle tests/e2e | wc -l` → 36). CI'da trace'ler yüklenmiyor (`trace: 'retain-on-failure'` var, ama artifact adımı yok).
Senaryo: Sonraki her push'ta E2E kapısı rastgele bir `networkidle` spec'inde kırmızı verir. Kapı sinyal değil gürültü olur, yeşil tek koşu (36497365219) şans eseri görünür.
Düzeltme (kod gerekmez, devir): leed-fb, devop-fb/se-fb için ayrı bir kart açar. Kapsam: (1) `ci.yml`'e başarısızlıkta `test-results/` artifact yüklemesi ekle, açık isteği trace'ten adıyla bul. (2) E2E'yi `next build && next start`'a karşı koşmayı değerlendir. (3) Kök neden bulunana kadar `networkidle` kullanan spec'leri `fixtures/hydration.ts`'e taşı. Bu kartın raporuna #1–2 için "devredildi → <kart>" satırı eklenince kart ONAY'a döner.

**K-1:** `m9-calendar-connect.spec.ts:135` (36499253610): `.ics` bağlantısını kesme sonrası satır DB'de kalıyor (`expect(survivor).toBeNull()`, `isConnected: true`). Bu kartın kapsamı değil ve `networkidle` imzası taşımıyor. Ayrı bir ürün hatası ya da yarış olabilir. Lidere not olarak bırakıyorum, sahibi M9.

**K-2:** `identity-strings` `beforeAll` sabit kimlik ve bilinen e-postayla `isPlatformAdmin: true` satırını `upsert` ediyor. Spec yerelde paylaşılan geliştirme DB'sine karşı koşulursa, `afterAll`'a kadar demo e-posta girişiyle platform admin olarak girilebilen bir hesap var olur. Etki yalnız yerel ve kısa süreli. Öneri: e-postaya koşu başına rastgele bir son ek eklenebilir.

## Kapsam dışı (lidere)

- **Ortak ağaçta staged silme:** `D docs/legal/processing-register-draft-agency-channel.md` index'te duruyor. Pathspec'siz commit atan herkes bunu kendi commit'ine alır (Kart 1 B-1).
- **B1 yayın şartı hâlâ açık:** Kodlu kayıtta ek gösterilmiyor, `consent-documents.ts`'de `agency` yok (`grep -c` → `0`). Ek §6 md.6 ve envanter §22 md.9 bunu doğru kaydediyor. Pilot bu şartla bağlı.

## Değişen dosyalar

- `docs/agent-results/TASK-MULXF5M8J8AGY-crw-fb.md` (bu rapor). Kod değiştirilmedi. İnceleme worktree'si scratchpad'de, repo dışında.

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27.0.0, Node 26.5.0, Docker Compose v5.5.1; typecheck, lint, vitest üç modda, rls ×3, i18n, `docker compose config/ps/--dry-run`). E2E için **Linux** kanıtı GitHub Actions `ubuntu-latest` koşularından alındı (`gh run view`). Yerel E2E AgentSpace kill-guard yüzünden koşulmadı. **Windows** koşulamadı, çünkü bu makinede yok ve repoda Windows CI hedefi yok. Koddan: `vitest.config.mts` yolu `path.join` ile kuruyor, platforma bağlı değil. CRLF satır sonlu bir `.env`'in `util.parseEnv` ile okunması Windows'ta denenmedi (varsayım: sorun yok). Compose değişkenleri ve port eşlemesi Docker Desktop'ta (Windows/mac) aynı çalışır. README'deki `cp`/`openssl` komutları Windows'ta PowerShell karşılığı ister.
