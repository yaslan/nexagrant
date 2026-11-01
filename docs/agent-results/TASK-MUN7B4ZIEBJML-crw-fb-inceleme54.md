# İNCELEME-54 — TASK-MUN7B4ZIEBJML (fe-fb): tam süit flake'lerinin kök-neden düzeltmesi — crw-fb

Sprint FB-GAP-1 · İncelenen: `90007fe3` (13 test dosyası), `884c7233` (rapor) · Kaynak: `TASK-MUN66PFFWT9MA-fe-fb.md` · Kod değiştirilmedi.

## Karar: **ONAY** (kartın diff'i için). Bloke eden bulgu yok.

Hiçbir test gevşetilmemiş. Beş düzeltmenin beşi de gerçek izolasyon ya da deterministik bekleme. Seed kapısı CI'da skip'e izin vermiyor. Seed'li izole DB'de, CI'ın ortamıyla ve `AUTH_SECRET` verilerek koşulan tam süit **8/8 yeşil**. Seçilen 7 seed kapılı testin ve kilitli dosyaların hiçbiri atlanmadı.

Ancak ölçüm sırasında **kartın dışında iki sorun** çıktı. İkisi de bu diff'ten gelmiyor, ikisi de ayrı kart istiyor (Y-1, Y-2):
- **Y-1:** CI'da `AUTH_SECRET` yok. Bu yüzden kilitli iki dosyadan biri olan `oauth-registration.live` (20 test) ve `invitation-accept.live` (18 test) CI'da **sessizce atlanıyor**, `CI=true` olsa bile.
- **Y-2:** Tam süitte altıncı bir flake var: `gdpr-data-subject.live` × `stale-relationship-reminder.live`. 15 tam koşuda 1 kez kırmızı, iki dosya birlikte koşunca 10/10 kırmızı. Dev HEAD'de hâlâ açık.

## Bulgular (önem sırasıyla)

### Y-1 — YÜKSEK · kapsam dışı, önceden var · CI'da 38 canlı test hiçbir şey ölçmeden atlanıyor
- **Yer:** `.github/workflows/ci.yml:23-28`. Job `env`'inde yalnız `DATABASE_URL` ve `DATABASE_URL_RLS_TEST` var, `AUTH_SECRET` yok (`grep AUTH_SECRET ci.yml` → boş). `vitest.config.ts` de bunu sağlamıyor: `setupFiles` yok, `.env` CI'da yok.
- **Kaçış yolu:** `tests/oauth-registration.live.test.ts:148-150` ve `tests/invitation-accept.live.test.ts:163-165` dosyalarında `AUTH_SECRET` eksikse kod yalnız `skipReason` atayıp `return` ediyor. `skipOrFailInCi` çağrılmıyor. Testler de `ctx.skip(skipReason)` ile atlanıyor (`invitation-accept.live.test.ts:218`). Oysa aynı dosyalar DB eksikse CI'da düşüyor. Repodaki `skipOrFailInCi` kuralı burada delinmiş.
- **Kanıt (CI'ı taklit eden ortam: `CI=true`, `.env` yok, CI'daki URL'ler, seed'li DB):**
  - `AUTH_SECRET` olmadan: `Tests 2886 passed | 47 skipped (2933)`. Atlananlar: `tests/oauth-registration.live.test.ts [skipped]: 20`, `tests/invitation-accept.live.test.ts [skipped]: 18`.
  - `AUTH_SECRET` verilince: `Tests 2924 passed | 9 skipped (2933)`. Kalan 9 test, ağ ya da canlı adaptör kapılı (`adapters`, `sedia-adapter`, `k1-daily-calls`, `k1-embeddings.live`).
- **Bu kartla ilişkisi:** Flake A (sayaç) ve C (DDL ↔ `lock_timeout`) bu dosyayla `agency-invite.live`'ın çakışmasından doğuyor. CI'da oauth dosyası hiç koşmadığı için bu iki yarış CI'da oluşamaz. Kilidin CI'daki etkisi de ölçülemez. Kilit yerelde doğru çalışıyor (aşağıda). Ama "CI'da ilk dev koşularında bu 5 testin kırmızısı görülmemeli" gözlemi A ve C için bilgi vermez.
- **Önerilen düzeltme (yeni kart, devop-fb/be-fb):**
  1. `ci.yml` job `env`'ine atılabilir bir `AUTH_SECRET` ekle. Mevcut `fabrika_app_ci` şifresiyle aynı gerekçe: sır değil, servis konteynerinin değeri.
  2. İki dosyada `AUTH_SECRET` eksikse `skipOrFailInCi(SUITE, …)` çağır. Böylece bir daha sessizce kapanamaz.

### Y-2 — YÜKSEK · kapsam dışı, yeni (b80d8360) · tam süitte altıncı flake: GDPR purge koruması × stale-reminder'ın silinmiş kullanıcısı
- **Belirti (tam süit, 7. koşu):** `gdpr-data-subject.live` 6 test kırmızı. İlk hata: `expected [ 'u-st-gone-dw84jcgr', …(1) ] to deeply equal [ 'u-subj-97c20862' ]` (`tests/gdpr-data-subject.live.test.ts:439`). Diğer 5 test aynı `describe`'daki purge'ün koşmamasının sonucu (`expected 'u-subj-…' to be null` ×2, `calendarConnection: 1`, `SECRET_CALENDAR_ACCESS_TOKEN`, `expected [] to have a length of 1`).
- **Kök neden:** `gdpr-data-subject.live` purge'ü tüm DB'yi tarıyor. Koruması şu: `deletionRequestedAt` dolu kullanıcılar = yalnız benim deneğim (`:434-439`). `tests/stale-relationship-reminder.live.test.ts:138` ise (dev HEAD'de `:150`) `U.gone` kullanıcısını `deletionRequestedAt: new Date()` ile açıyor. Paralel koşuda koruma bu satırı görüp düşüyor. Bu, kartın A/E ile aynı sınıftan: paylaşılan global durum.
- **Güvenlik notu:** Koruma işini yapıyor. `expect` `purgeDueUsers` çağrısından önce patladığı için başka dosyanın kullanıcısı silinmiyor. Veri kaybı yok, yalnız kırmızı test var. Koşulardan sonra `deletionRequestedAt` dolu kullanıcı sayısı: `0` (sızıntı yok).
- **Deterministik yeniden üretim:** `vitest run tests/gdpr-data-subject.live.test.ts tests/stale-relationship-reminder.live.test.ts` ×10 → **10/10** `Tests 6 failed | 22 passed (28)`, her birinde `expected [ 'u-st-gone-…', …(1) ]`.
- **Kapsam:** `stale-relationship-reminder.live` b80d8360 ile geldi (30.09 00:30, `90007fe3`'ten 35 dk önce). fe-fb'nin 10 koşusu `246` test dosyası gösteriyor, benim `884c7233` koşularım `250`. fe-fb'nin worktree'si bu dosyadan önceki bir commit'te olabilir. Bunu doğrulayamadım. Dev HEAD `5e196e86` stale testini değiştirdi ama `deletionRequestedAt` satırı duruyor (`git show HEAD:… | grep` → `150`). Koruma da değişmedi. Bu yüzden sorun HEAD'de açık. Bunu koddan söylüyorum, HEAD'de koşmadım.
- **Önerilen düzeltme (yeni kart, se-fb):** Kartın yardımcısı tam buna uyuyor. `test-db-lock.ts`'e `User:deletion-due` kilidi eklenir. gdpr purge testi korumadan purge sonuna kadar bu kilidi tutar. stale testi de `U.gone`'u açtığı andan sildiği ana kadar tutar. Alternatif: stale testi silinmiş kullanıcı yerine `deletedAt`/üyeliksiz bir kullanıcıyla aynı durumu kurar. Bu, testin ne ölçtüğüne bağlı, se-fb karar vermeli.

### O-1 — Öneri · kilit beklemesi testin 5 sn varsayılan süresine dahil
`vitest.config.ts`'de `testTimeout` yok (varsayılan 5000 ms). `withTestDbLock` beklemesi test gövdesinde geçiyor. `agency-invite.live`'ın `lock_timeout` testi, oauth'un `withCodeDyingAfterProbe` yardımcısı `fn()`'i bitirene kadar bekliyor. O yardımcı yavaşlarsa bekleyen test zaman aşımıyla düşer, bu da başka bir kılıkta flake olur. 14 yeşil tam koşuda ve 8 kilitli-oauth koşusunda hiç görülmedi. Bu yüzden hata değil, gözlem. İstenirse iki kilitli teste açık bir `timeout` verilebilir ya da kilit bekleme süresi loglanabilir.

### O-2 — Öneri · fe-fb R-1'e katılıyorum
`upsertPublicSectorPlans` (`src/lib/billing/public-sector-plans.ts:128-137`) atomik değil. Üretimde eşzamanlı çağrılmıyor, kart kapsamı dışı. İstenirse be-fb için transaction + `FOR UPDATE`.

## Satır satır kontrol: gevşetme var mı?

| Değişiklik | Gevşetme? | Gerekçe |
|---|---|---|
| `pilot-expired-write-paths`: `{ timeout: 5000 }` kaldırıldı, `enabled()` eklendi | **Hayır, sıkılaştırma** | Beklemeler 5 sn'den varsayılan 1 sn'ye indi. `enabled()` yeni bir koşul: buton `disabled=false` olmadan tıklanmıyor. Kök neden (React disabled butonda `onClick` çağırmaz) doğru. Beklentiler (`toHaveBeenCalledWith('s-1','org-new')`, `INVITED` metni, alert metni) aynen duruyor. |
| `findCandidates`: `getByRole` → `findByRole` | Hayır | Bekleme sırasında buton adı "computing" oluyor. Boşta adıyla bulunuyor, beklenti değişmedi. |
| `agency-invite` sayaç testi: `afterAll` → `finally` + kilit | Hayır | `toBeGreaterThanOrEqual(+1)` önceden de `>=` idi (`git show -w`). Geri koyma artık kilidin içinde, önceden kilitsizdi. |
| `oauth-registration` sayaç testi | Hayır | `toBe(repeats+1)` ve `toBe(agencyRejectionsBefore+1)` aynen. Yalnız girinti değişti. |
| `agency-invite` `lock_timeout` testi, oauth trigger DDL | Hayır | `100ms` `lock_timeout`, `800` ms tutma, `/lock timeout/i` beklentileri aynen. Yalnız kilit sarmalandı. |
| `public-sector-assignment` idempotency testi | Hayır | `[3,4,4]`, fiyatlar, `private` aynen. Seed ve okuma kilidin içinde. |
| 4 dosyanın `beforeAll` seed'i | Hayır | Aynı çağrı, kilit altında. |
| `cron-tenant-scope`: `expect(topics).toBeGreaterThan(0)` → `skipUnlessSeeded` | **Yerelde evet, CI'da hayır** | CI'da `isCi()` → `throw`, yani eskisi gibi kırmızı. Yerelde gerekçeli atlama. "stale tenant id" testine eklenen önkoşul yerinde: test `a`'ya mail bekliyor (`toEqual([a.email])`), bu da Topic eşleşmesi ister. |
| `plan-admin` ×2, `stripe-webhook-tenant-scope` ×1, `double-charge` | Aynı | Yerelde atlanıyor, CI'da düşüyor. |

Kilidin kapsamı tam mı? Paylaşılan nesnelerin tüm kullanıcılarını taradım:
- `upsertPublicSectorPlans` yalnız bu 4 test dosyasında ve `prisma/seed.ts` / `scripts/…` içinde çağrılıyor.
- `agency.invite.rejected.unknown` sayacına dokunan test yalnız bu iki dosya. oauth `:450` testi `disclosure_required` ile daha önce reddediliyor.
- `AgencyInviteCode` üzerinde DDL yalnız oauth'ta var. `lock_timeout` yalnız agency-invite'ta var.
- Kilit dışındaki okumalar (`storefrontPlans`, entitlements) `PlanFeature`'a bakmıyor. Kalan bir yarış yok.
- Kilidin kendisi: session advisory lock, kendi bağlantısında. `finally`'de `client.end()` çağrılıyor. Bağlantı ölürse kilit kendiliğinden düşüyor. Her dosya kilidi aynı DB'ye açıyor: agency-invite `ADMIN_URL=envValue('DATABASE_URL')`, oauth `env.admin=process.env.DATABASE_URL`, billing `process.env.DATABASE_URL`. Advisory lock DB başına geçerli, yani üçü aynı ad alanında.

## Kanıt

**Ortam:** Temiz worktree, `git worktree add --detach … 884c7233`. İzole Postgres: kendi konteynerim `crwfb-i54-pg` (`pgvector/pgvector:pg16`, :55454, CI'daki kimlik bilgileriyle). Paylaşılan `fabrika` DB'sine ve `fabrika-postgres` konteynerine dokunmadım. Kurulum sırası CI'daki gibi:
```
prisma db push            → "Your database is now in sync with your Prisma schema"
pnpm db:rls-role          → "fabrika_app connects as fabrika_app, app.tenant_id unset by default."
apply-migrations.sh ×2    → mig1=0 "37 files applied" · mig2=0 "37 files applied"
pnpm db:rls               → "prisma/rls.sql applied. Policies in public: 28 → 112" rls=0
pnpm db:seed              → seed=0 "Seeding completed with E10 data."
ModuleCatalog|Topic|demo-tenant → 11|20|1
```
(İlk denemede `db push --skip-generate` bayrağı prisma 7'de yok, push olmadı ve migration'lar `relation "Evaluation" does not exist` ile düştü. Bayraksız tekrarlandı. Seed ilk denemede `Cannot find module '.prisma/client/default'` verdi, `pnpm db:generate` sonrası geçti.)

**Tam süit, `CI=true`, `AUTH_SECRET` yok (CI ortamının birebir kopyası):**
```
full run 1 CI=true exit=0 22s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
full run 2 CI=true exit=0 18s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
full run 3 CI=true exit=0 20s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
full run 4 CI=true exit=0 17s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
full run 5 CI=true exit=0 18s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
full run 6 CI=true exit=0 21s | Test Files 248 passed | 2 skipped (250) | Tests 2886 passed | 47 skipped (2933)
json run 7 exit=1 → 'tests/gdpr-data-subject.live.test.ts [failed]': 6   (Y-2)
                    'tests/oauth-registration.live.test.ts [skipped]': 20, 'tests/invitation-accept.live.test.ts [skipped]': 18   (Y-1)
```

**Tam süit, `CI=true` + atılabilir `AUTH_SECRET` (kilitli oauth dosyası da koşuyor). Asıl ölçüm bu:**
```
auth run 1 exit=0 21s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 2 exit=0 22s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 3 exit=0 24s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 4 exit=0 18s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 5 exit=0 23s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 6 exit=0 18s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 7 exit=0 23s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
auth run 8 exit=0 24s | Test Files 248 passed | 2 skipped (250) | Tests 2924 passed | 9 skipped (2933) | FAIL: -
```
Toplam: 15 tam koşunun 14'ü yeşil. Tek kırmızı Y-2 (kart dışı).

**Kartın dokunduğu dosyalar, auth run 1 JSON'u (hepsi `passed`, sıfır skip):**
```
agency-invite.live 18 · oauth-registration.live 20 · pilot-expired-write-paths 12 · double-charge-prevention 5
stripe-webhook-tenant-scope.live 5 · settings-modules-plan 6 · pilot-gates 5 · pilot 14 · plan-admin 25
public-sector-assignment 6 · cron-tenant-scope 14
SKIP yalnız: adapters ×2, k1-daily-calls ×4, k1-embeddings.live ×1, sedia-adapter ×2
```

**Seed kapısı, seed'siz DB (`fabrika_noseed`, yalnız `db push`). `plan-admin` + `double-charge`:**
```
CI=''     → Tests 13 failed | 10 passed | 7 skipped (30)   — 7 skip = double-charge 5 + plan-admin 2, "skipped: … run `pnpm db:seed`"
CI='true' → Tests 15 failed | 10 passed (25)               — "refusing to skip in CI — ModuleCatalog has no M6 row: run `pnpm db:seed`" ×2,
                                                              "refusing to skip in CI — the demo tenant 'demo-tenant' is missing" ×1
```
Kalan 13 kırmızı seed'le ilgili değil. `db:rls` kurulmadığı için `function enter_system_scope(unknown) does not exist` veriyorlar. Bu yan DB'yi kasıtlı olarak eksik kurdum, yalnız kapının iki kolunu görmek içindi. fe-fb'nin tam kurulumlu seed'siz ölçümüyle (`37 passed | 12 skipped` / `CI=true: 7 failed`) tutarlı.

**Y-2 yeniden üretimi (çift, ×10):**
```
pair 1..10 exit=1  Tests 6 failed | 22 passed (28) expected [ 'u-st-gone-<RUN>', …(1) ]   (10/10)
select count(*) from "User" where "deletionRequestedAt" is not null → 0
```

**Temizlik:** `git worktree remove --force …/wt` → `wt-removed`. `docker rm -f crwfb-i54-pg` → `pg-removed`. İki DB de o konteynerle birlikte gitti.

## Değişen dosyalar
- Yalnız bu rapor: `docs/agent-results/TASK-MUN7B4ZIEBJML-crw-fb-inceleme54.md`. Kod değişmedi.

## Riskler
- CI'daki yeşil, Y-1 kapanana kadar oauth/invitation akışının 38 canlı testini içermiyor.
- Y-2 kapanana kadar tam süit yaklaşık 1/15 oranında kırmızı (bu makinede). Kartın "flake'ler kapandı" sonucu kendi 5 flake'i için doğru, "tam süit kararlı" iddiası için değil.

## Açık sorular
- Y-1 ve Y-2 için ayrı kart açılsın mı? Önerim: Y-1 devop-fb (ci.yml + iki dosyada `skipOrFailInCi`), Y-2 se-fb (b80d8360'ın sahibi).

## Sonraki adım
- Y-1 kapanınca CI'da ilk koşuda `oauth-registration.live 20 passed` görülmeli. Kartın A/C kilidi ancak o zaman CI'da da sınanmış olur.

## Platform beyanı
**macOS (Darwin 27.0.0, arm64)**, Node v26.5.0, pnpm 11.25.0, Postgres `pgvector/pgvector:pg16` docker, vitest 4.1.11.
- **Linux (CI, ubuntu-latest):** Koşulamadı, CI'ı tetiklemedim. Ortamını birebir taklit ettim (`CI=true`, `.env` yok, CI'daki URL ve rol şifreleri, aynı hazırlık sırası). İncelenen kod platformdan bağımsız: advisory lock Postgres tarafında, `pg` istemcisi Node'da, jsdom beklemeleri saf JS. Dosya yolu, kabuk ya da süreç öldürme yok.
- **Windows:** Koşulamadı, makine yok. Aynı gerekçeyle davranış farkı beklenmez. İzole DB reçetesi (`apply-migrations.sh`) bash istediği için WSL ya da Git Bash gerekir. Bu makinede `psql` olmadığından `PSQL=` docker-exec sarmalayıcısı kullandım.
