# TASK-MUN66PFFWT9MA — FB CANLI HAZIRLIK-1: tüm kapılar temiz worktree'de (fe-fb)

Sprint FB-GAP-1 · Ölçüm işi. **Kod değiştirilmedi.** Bu dosyadan başka dosyaya dokunulmadı.

## Özet

| | |
|---|---|
| Ölçülen commit | `dev` HEAD `59c29737`, `git worktree add --detach` ile temiz kopya (`git status` 0 satır) |
| İzole DB | `fefb_gate1` (docker `fabrika-postgres`, :5433). Paylaşılan `fabrika` DB'sine dokunulmadı. İş bitince `DROP DATABASE` yapıldı |
| Sonuç | Statik kapıların hepsi yeşil. Build ve docker `runner`/`worker` yeşil. Tam süit seed'li DB'de 3 koşudan 1'i tam yeşil, 2'sinde her seferinde **farklı bir flake** çıktı. Kartta yazan `docker build --target web` **kırmızı**: Dockerfile'da `web` diye bir aşama yok, web aşamasının adı `runner` |
| Canlıya engel | Kod tarafında engel yok. 2 flake ve 1 doküman/sıra riski için düzeltme kartı öneriyorum (aşağıda) |

## Kapı tablosu

Süreler duvar saati. Makinede başka ajanlar da çalışıyordu, bu yüzden süreler gürültülü.

| # | Kapı | Sonuç | Süre | Kanıt (çıktıdan kopya) |
|---|---|---|---|---|
| 0 | `pnpm install --frozen-lockfile` | ✅ exit 0 | 6s | `Done in 6s using pnpm v11.25.0` |
| 0b | `pnpm db:generate` (CI'daki gibi, typecheck öncesi) | ✅ 0 | 4s | `Start by importing your Prisma Client` |
| DB-1 | `npx prisma db push` | ✅ 0 | 3s | `🚀  Your database is now in sync with your Prisma schema. Done in 811ms` |
| DB-2 | `scripts/apply-migrations.sh` ×2 (idempotency) | ✅ 0 / 0 | 3s / 2s | `apply-migrations: 35 files applied` (iki kez) |
| DB-3 | `pnpm db:rls-role` | ✅ 0 | 1s | `✅ fabrika_app connects as fabrika_app, app.tenant_id unset by default.` |
| DB-4 | `pnpm db:rls` | ✅ 0 | 0s | `✅ prisma/rls.sql applied. Policies in public: 28 → 112` |
| 1 | `pnpm typecheck` | ✅ 0 | 28s | `$ tsc --noEmit` (çıktı yok) |
| 2 | `pnpm lint` | ✅ 0 | 12s | `$ eslint`, 0 uyarı (`grep -c warning` → 0) |
| 3 | `pnpm i18n:check` | ✅ 0 | 1s | `✅ i18n check passed: both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text.` |
| 4 | `pnpm rls:bypass-check` | ✅ 0 | 1s | `✅ SUCCESS: no new tenant bypass. 0 call site(s) allowed with a recorded reason, 36 on the sanctioned cross-tenant path, 0 still owed.` |
| 4b | `pnpm rls:check` (ek) | ✅ 0 | 0s | `✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.` |
| 4c | `pnpm rls:verify` (ek, canlı) | ✅ 0 | 0s | `✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü` |
| 5a | `pnpm vitest run`, **seed'siz** DB (kartın tarif ettiği kurulum) | ❌ 1 | 22s | `Test Files  4 failed \| 236 passed \| 2 skipped (242)` · `Tests  7 failed \| 2802 passed \| 13 skipped (2822)` |
| 5b | `pnpm db:seed` + `pnpm vitest run` (CI kurulumu), koşu 1 | ❌ 1 (flake) | 21s | `Test Files  1 failed \| 239 passed \| 2 skipped (242)` · `Tests  1 failed \| 2813 passed \| 8 skipped (2822)` |
| 5c | aynısı, koşu 2 | ✅ 0 | 23s | `Test Files  240 passed \| 2 skipped (242)` · `Tests  2814 passed \| 8 skipped (2822)` |
| 5d | aynısı, koşu 3 | ❌ 1 (flake) | 35s | `Test Files  1 failed \| 239 passed \| 2 skipped (242)` · `Tests  1 failed \| 2813 passed \| 8 skipped (2822)` |
| 5e | aynısı, `--reporter=verbose` (skipped listesi için) | ✅ 0 | – | `Tests  2814 passed \| 8 skipped (2822)` |
| 6 | Tenant sayısı (teardown guard) | ✅ değişmedi | – | seed'siz: `tenant_before=0` → `tenant_after=0` · seed'li: `1` → `1` (3 koşunun hepsinden sonra 1), id+slug listesi `diff` → `SAME_TENANT_SET` |
| 7 | `pnpm build` | ✅ 0 | 23s | `✓ Compiled successfully in 6.3s` · `✓ Generating static pages using 11 workers (30/30)` |
| 8a | `docker build --target web .` (kartta yazan komut) | ❌ 1 | 0s | `ERROR: failed to build: failed to solve: target stage "web" could not be found` |
| 8b | `docker build --target runner .` (web imajının gerçek adı) | ✅ 0 | 47s | `unpacking to docker.io/library/fefb-gate1-runner:latest 0.6s done` · 362MB |
| 8c | `docker build --target worker .` | ✅ 0 | 16s | `unpacking to docker.io/library/fefb-gate1-worker:latest 10.5s done` · 2.27GB |
| 8d | İmajlarda `.env` var mı (ek) | ✅ yok | – | `find / -name .env` iki imajda da boş döndü (`.dockerignore` `.env*` dışlıyor) |
| 9 | E2E (Playwright) | ⏸ koşulmadı | – | Kill-guard hook'u engelliyor. Patronun koşacağı komutlar aşağıda |

## Kırmızılar: kök neden ve düzeltme kartı önerisi

### K-1. `docker build --target web` → aşama yok (kart/doküman hatası, kod değil)
- **Kök neden:** `Dockerfile:46` `FROM base AS runner`. Yorum satırı da `docker build .` ya da `--target runner` diyor. `web` adı hiçbir yerde geçmiyor.
- **Öneri (küçük, devops):** Canlı hazırlık dokümanlarında ve kartlarda `--target web` yerine `--target runner` yazılsın. İstenirse Dockerfile'a `FROM runner AS web` takma adı eklenir, ama `runner` son aşama kalmalı (İNCELEME-38 B-2).

### K-2. Seed'siz DB'de 7 test düşüyor (kurulum farkı, kod değil)
Dördü de "veri yok" hatası. CI `pnpm db:seed` koşuyor (`.github/workflows/ci.yml` "Prepare database"), kartın tarifi koşmuyor:

| Dosya | Test | Hata (kopya) |
|---|---|---|
| `src/lib/jobs/tasks/__tests__/cron-tenant-scope.test.ts` | 4 test (alerts-daily) | `no Topic rows locally — every search would be skipped, not mailed: expected 0 to be greater than 0` |
| `src/lib/billing/plan-admin.test.ts` | 2 test | `ModuleNotGrantedError: Feature row names module M6, which this plan version does not grant.` |
| `tests/stripe-webhook-tenant-scope.live.test.ts` | 1 test | `AssertionError: expected 0 to be greater than 0` (:263) |
| `tests/double-charge-prevention.test.ts` | beforeAll → 5 skipped | `Foreign key constraint violated on the constraint: CreditLedger_tenantId_fkey` |

`db:seed` sonrası dördü de geçti (5c).
- **Öneri:** "Canlı hazırlık" kurulum sırasına `pnpm db:seed` eklensin. Alternatif: bu testler seed yoksa `skipOrFailInCi` ile açık bir nedenle atlasın. Önceki notum: CI'da `skipOrFailInCi`'ye çevirmek CI'ı kırar, dikkat. Kart: **"FB: izole/tek-seferlik DB kurulum reçetesi = CI Prepare database adımlarıyla birebir (seed dahil)"**.

### K-3. Flake: `tests/agency-invite.live.test.ts` "a revoked code is filed under its agency…"
- 5b'de düştü: `AssertionError: expected 1 to be greater than or equal to 2` (`tests/agency-invite.live.test.ts:451`, `repeats(counter) >= repeats(counterBefore)+1`).
- Tek başına 3 kez koştu, 3'ünde de `Tests  18 passed (18)`.
- **Kök neden tahmini:** Test paylaşılan "açık" `SystemAlert` sayaç satırını okuyor (`openCounter()`, `meta.alertRepeatCount`). Aynı DB'de başka live suite'ler de `systemAlert.delete/update` yapıyor: `tests/system-alert.live.test.ts`, `stripe-webhook-*.live.test.ts`, `iyzico-webhook-idempotency-rls.live.test.ts`, `oauth-registration.live.test.ts`. Vitest dosyaları paralel koşuyor. Sayaç test ortasında kapanıp yeniden açılırsa `repeats` 1'e düşer.
- **Öneri kartı:** "agency-invite.live: sayaç iddiasını paylaşılan açık SystemAlert yerine bu testin kendi `since` sonrası kayıtlarına bağla (ya da ilgili live suite'leri aynı dosya grubunda sırala)". Test gevşetilmesin, izolasyon düzeltilsin.

### K-4. Flake: `tests/pilot-expired-write-paths.test.tsx` "Invite: a refused invite (success: false) does not show the seat as INVITED"
- 5d'de düştü: `Error: Test timed out in 5000ms.` (`:292`). Bu koşu 35s sürdü, diğerleri 21–23s: makine yüklüydü.
- Tek başına 3 kez koştu, 3'ünde de `Tests  12 passed (12)`.
- **Kök neden tahmini:** jsdom render + mock zinciri yük altında varsayılan 5s `testTimeout`'u aşıyor. Test TASK-MUN509G2ICKWI ile yeni eklendi.
- **Öneri kartı:** "pilot-expired-write-paths: yavaş render testine açık timeout ya da `findBy*` bekleme süresi; tam süitte 5 ardışık koşu yeşil kanıtı".

## Skipped (seed'li DB: 2 dosya, 8 test)

| Dosya | Atlanan | Neden |
|---|---|---|
| `tests/k1-daily-calls.test.ts` | dosya tümüyle (4 test) | `describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS)` (:13): canlı ağ adaptörleri |
| `tests/sedia-adapter.test.ts` | dosya tümüyle (2 test) | `describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS)` (:11): canlı SEDIA API |
| `tests/adapters.test.ts` | 2 test (Eurostars/Tubitak init); dosyanın 6 testi geçti | `describe.skipIf(!process.env.RUN_LIVE_ADAPTER_TESTS)` (:118) |

Seed'siz koşuda ek 5 skipped vardı. Bunlar `tests/double-charge-prevention.test.ts`'in 5 testi: beforeAll FK hatasıyla düştüğü için atlandılar (K-2).

## Teardown guard (Tenant sayısı)
- Seed'siz: tam süitten önce `0`, sonra `0`.
- Seed'li (demo kiracı var): 3 tam süit koşusunun hepsinden sonra `1`. Kiracıların `id, slug` listesi önce/sonra birebir aynı (`SAME_TENANT_SET`).
- Sonuç: testler kendi açtıkları kiracıları temizliyor, önceden var olan kiracıyı silmiyor. Seed'li ölçüm daha anlamlı: boş DB'de "fazla silme" hatası görünmez.

## E2E: patronun `!` ile koşacağı komutlar

Kill-guard hook'u Bash'ten e2e'yi engellediği için koşmadım. Aşağıdaki komutlar temiz worktree ve izole DB kurar. Port 3000 paylaşılan dev sunucusuyla çakışmasın diye `E2E_PORT=3310` kullanılıyor. `reuseExistingServer: false` (playwright.config.ts): config kendi `pnpm dev --port $E2E_PORT` sunucusunu açar ve `DEMO_LOGIN_ENABLED=true`, test `AUTH_SECRET` ve `INVOICE_SUPPLIER_*` değerlerini kendisi verir.

```bash
# 1) temiz kopya + bağımlılıklar
! cd /Users/macbook/alan/FONBRIDGE && git worktree add --detach /tmp/fb-e2e dev && cd /tmp/fb-e2e && pnpm install --frozen-lockfile && pnpm db:generate

# 2) izole DB + worktree .env (paylaşılan fabrika DB'sine dokunmaz)
! docker exec fabrika-postgres psql -U fabrika -d postgres -c "CREATE DATABASE fb_e2e OWNER fabrika"
! cd /tmp/fb-e2e && sed -E '/^DATABASE_URL(_MIGRATE|_RLS_TEST)?=/ s#@localhost:5433/fabrika$#@localhost:5433/fb_e2e#' /Users/macbook/alan/FONBRIDGE/.env > .env && chmod 600 .env

# 3) DB kurulumu (CI sırası; psql yoksa docker sarmalayıcı)
! printf '%s\n' '#!/usr/bin/env bash' 'a=();f=;while [ $# -gt 0 ];do case "$1" in -f)f=$2;shift 2;;*)a+=("${1//localhost:5433/localhost:5432}");shift;;esac;done' 'docker exec -i fabrika-postgres psql "${a[@]}" -f - < "$f"' > /tmp/psqlw && chmod +x /tmp/psqlw
! cd /tmp/fb-e2e && export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" && npx prisma db push && pnpm db:rls-role && PSQL=/tmp/psqlw scripts/apply-migrations.sh && PSQL=/tmp/psqlw scripts/apply-migrations.sh && pnpm db:rls && pnpm db:seed

# 4) Playwright (tarayıcı + e2e), port 3310
! cd /tmp/fb-e2e && pnpm exec playwright install chromium && E2E_PORT=3310 pnpm test:e2e 2>&1 | tee /tmp/fb-e2e.log; echo "e2e exit=${pipestatus[1]}"
#    prod build'e karşı (demo girişli specler bilerek düşer, playwright.config.ts yorumu):
#    ! cd /tmp/fb-e2e && pnpm build && E2E_WEB_SERVER=start E2E_PORT=3310 pnpm test:e2e

# 5) temizlik
! docker exec fabrika-postgres psql -U fabrika -d postgres -c "DROP DATABASE fb_e2e" ; cd /Users/macbook/alan/FONBRIDGE && git worktree remove --force /tmp/fb-e2e ; rm -f /tmp/psqlw
```

Özet satırı: `grep -E 'passed|failed|skipped' /tmp/fb-e2e.log | tail -3`. Kabuk zsh olduğu için çıkış kodu `${pipestatus[1]}` ile alınır.

## Ne yapıldı
1. `dev` HEAD `59c29737` için scratchpad'de `git worktree add --detach` açıldı. Paylaşılan ağaçtaki commit'lenmemiş dosyalara dokunulmadı.
2. İzole DB `fefb_gate1` oluşturuldu. Worktree'ye `.env` kopyalandı ve yalnız 3 `DATABASE_URL*` satırı `fefb_gate1`'e çevrildi (gitignore'da, commit'lenmez). Ana `.env` md5'i baştan sona değişmedi (`main-env-unchanged`).
3. İlk denemede `apply-migrations.sh` `DATABASE_URL is not set` ile düştü: betik `.env` okumuyor, değişkenin export edilmesi gerekiyor. Sıra bozulmasın diye DB silinip baştan kuruldu: push → migrations ×2 → rls-role → rls.
4. Kapılar koşuldu. Tam süit önce seed'siz (kartın tarifi), sonra CI gibi `db:seed` ile 3 kez koşuldu.
5. Temizlik: imajlar `docker rmi` ile silindi (`docker images | grep -c fefb-gate1` → 0). `DROP DATABASE fefb_gate1` → `pg_database` sayımı 0. `git worktree remove --force` → listede 0.

## Riskler
- **R-1 (canlıya çıkışta önemli): Kartın DB sırası taze bir sunucuda yanlış.** Kart "db push → apply-migrations → db:rls-role → db:rls" diyor. CI sırası ise "db push → **db:rls-role** → apply-migrations ×2 → db:rls" (`ci.yml` yorumu: "After `db:rls-role`, so their `GRANT … TO fabrika_app` guards find the role"). 10 migration dosyası grant'ı `IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fabrika_app')` ile koruyor (ör. `add-agency-funnel.sql:86`, `agency-invite-no-max-uses.sql:96`). `fabrika_app` rolü yoksa grant **sessizce atlanır** ve `redeem_agency_invite` gibi fonksiyonlar uygulama rolüne kapalı kalır. Burada fark görünmedi, çünkü `fabrika_app` küme genelinde zaten vardı. Taze bir prod kümesinde kartın sırası bu hatayı üretir. Bu çıkarımı koddan yaptım, taze kümede koşmadım. **Öneri:** canlı runbook'unda CI sırası kullanılsın.
- **R-2:** `db:rls-role` rolü `.env`'deki `DATABASE_URL_RLS_TEST` parolasıyla yeniden onaylar ve rol küme geneli bir nesnedir. Aynı parola kullanıldığı için `fabrika` DB'sindeki davranış değişmedi.
- **R-3:** Worker imajı 2.27GB. Bu tasarım gereği: `tsx` tam `node_modules` ile koşuyor (`Dockerfile:29-43` yorumu). Canlıda registry/çekme süresi için not.
- **R-4:** Flake'ler (K-3, K-4) canlıyı engellemez ama CI'da ara sıra kırmızı üretir.

## Değişen dosyalar
- `docs/agent-results/TASK-MUN66PFFWT9MA-fe-fb.md` (yalnız bu rapor). Kod değişikliği yok.

## Açık sorular
- Canlı runbook'u hangi DB sırasını izliyor? Kartın sırası mı, CI'ın sırası mı? (R-1)
- Kartta "ters sıra 11 kırmızı üretir" deniyor. Bu, `db:rls`'in `db:rls-role`'den önce koşulmasını mı kastediyor? Bu ölçümde kartın sırası 0 kırmızı üretti, çünkü rol önceden vardı.

## Sonraki adım
1. Patron E2E komutlarını (yukarıdaki blok) koşsun, özet satırını rapora eklesin.
2. Düzeltme kartları: K-1 (`--target runner` dokümanı), K-2/R-1 (kurulum reçetesi = CI sırası + seed), K-3 (agency-invite sayaç izolasyonu), K-4 (pilot-expired timeout).

## Platform beyanı
**macOS (Darwin 27.0.0, arm64)**, Node v26.5.0, pnpm 11.25.0, Docker Desktop (linux/arm64 imajları). Bu makinede `psql` yok. Migration betiği `PSQL=` ile verilen bir `docker exec fabrika-postgres psql` sarmalayıcısıyla koşuldu.
- **Linux:** CI (ubuntu-latest) aynı kapıları koşuyor ve `psql` hazır geliyor, bu yüzden sarmalayıcı gerekmez. Docker imajları `node:22-alpine` tabanlı. amd64'te ayrıca build alınmalı, burada yalnız arm64 üretildi.
- **Windows:** koşulamadı, makine yok. `scripts/apply-migrations.sh` bash betiği ve `ls`/`diff`/`sed` kullanıyor, bu yüzden Windows'ta WSL ya da Git Bash gerekir. Diğer kapılar (`tsc`/`eslint`/`vitest`/`next build`) platformdan bağımsız.
