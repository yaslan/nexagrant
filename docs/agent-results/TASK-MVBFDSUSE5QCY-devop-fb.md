---
sözleşme: 3
görev: TASK-MVBFDSUSE5QCY
kod: TASK-MVBFDSUSE5QCY
ajan: devop-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: pnpm db:setup boş DB'de iki kez exit 0, prisma migrate deploy/dev açık mesajla duruyor, worktree'den gerçek push --no-verify olmadan geçti; PR #119 (base dev) açık, merge edilmedi.
platform: mac (darwin 27, Docker pgvector/pgvector:pg16) üzerinde doğrulandı. Linux (CI): koşulamadı, çünkü GitHub CI ödeme sorunu yüzünden başlamıyor. Koddan: db-setup.sh POSIX bash + psql + pnpm kullanıyor, ubuntu-latest'te psql hazır. Yalnız CLAUDE.md worktree tarifindeki `sed -i ''` macOS sözdizimi; Linux'ta `sed -i` yazılır. Windows: koşulamadı (bash betiği; WSL/Git Bash gerekir, CI'da Windows yok).
sürüm: 1
tarih: 2026-10-19T16:02:38.315Z
---

# FO-16 · Boş DB kurulumu tek komut (db:setup)

## Ne yapıldı
Dal `devop-fb/fo16-db-setup` (origin/dev 32a0a33d'den), worktree `/Users/macbook/alan/FONBRIDGE-fo16`, izole DB Docker `fo16-pg` → 127.0.0.1:5446. Ortak `fabrika` DB'sine (5433) ve 3000 portuna dokunulmadı. Commit'ler: a486e484, 1f3bb04a. PR: https://github.com/yaslan/fonbridge/pull/119 (base dev, merge EDİLMEDİ).

1. **Bağımlılık:** PR #73 MERGED 2026-10-17T08:01Z (5848db6c), PR #71 MERGED. İşe başlanabilirdi.
2. **Kök neden (yeniden üretildi):** Prisma `prisma/migrations` altında yalnız 6 KLASÖRÜ migration sayıyor (`add-calendar-connections`, `add-m10-dual-approval-persistence`, `add-m9-meeting-schedule`, `add-plan-versioning`, `add-stripe-event-log`, `topicmatch-per-opportunity`); 38 düz `.sql`'i görmüyor. Boş DB'de alfabetik sırayla `add-calendar-connections` uygulanıyor, `add-m10` `FollowupDoc`'a (yalnız `db push`'un kurduğu tablo) dokunduğu için düşüyor. DB yarım kalıyor: `_prisma_migrations` + `CalendarConnection`, add-m10 satırı `finished=f`.
3. **Tek komut:** `scripts/db-setup.sh` + `pnpm db:setup`. Sıra: db:generate → `.github/ci/supabase-ensure-rls.sql` → `prisma db push` → `db:rls-role` → `db:rls` → `scripts/apply-migrations.sh` → `db:rls` → `db:seed`. DATABASE_URL ortamdan, yoksa `./.env`'den okunuyor. localhost dışı hedefi reddediyor (canlı §3.1'e göre tek tek koşulur). CI "Prepare database" = `pnpm db:setup` ×2: ikinci koşu tüm zincirin idempotentlik kontrolü (eskiden yalnız apply-migrations iki kez koşuyordu).
4. **Yanlış yolu kapatma, seçilen yol ve nedeni:** `prisma.config.ts` Prisma CLI'nin her komutunda yükleniyor. `migrate deploy|dev|reset` görünce açık mesaj yazıp exit 1 veriyor; DB'ye hiç bağlanmıyor. `migrate status` ve `diff` salt-okur, açık bırakıldı. Klasörleri düz `.sql`'e taşımak reddedildi, çünkü: (a) paylaşılan/yerel DB'lerde `_prisma_migrations` bu klasörlerin adlarıyla baseline'lı (shared hafıza), (b) şema yorumları, DATA_MODEL, RELEASE_CHECKLIST, rls-coverage testi klasör yollarını anıyor, (c) taşıma `migrate deploy`'u yalnız "No migration found" ile sessizce exit 0 yapar, yönlendirme mesajı vermezdi. Prod akışı (RELEASE_CHECKLIST §3.1) `migrate deploy` kullanmıyor (db push + apply-migrations.sh + db:rls). Değişmedi; §3.1'e bir not eklendi.
5. **Belgeler:** CLAUDE.md "Komutlar" (`db:setup` + `db:migrate` uyarısı) ve yeni "Worktree'de gate (izole DB)" tarifi; README kurulum bloğu `pnpm db:setup`'a indi; RELEASE_CHECKLIST §3.1 notu; ci.yml yorumu.
6. **Worktree'de gate:** Tüm araçlar (vitest, playwright, tsx betikleri, prisma) cwd'deki `.env`'i okuyor. Tarif: izole konteyner, `.env.example`'dan port'u değiştirilmiş `.env`, `pnpm db:setup`, `E2E_PORT=<boş> git push`. `githooks/pre-push` artık `→ veritabanı: host:port/db` yazıyor (parola yok). `.env` de DATABASE_URL de yoksa reddediyor: kanca sıkılaştı, atlatma yolu yok. İlk gerçek push'ta `tests/e2e/auth.spec.ts` 3/3 düştü: `.env.example`'da `AUTH_GOOGLE_ID` boş olduğu için Google düğmesi çizilmiyordu, CI ise bunu workflow env'inde veriyor. `playwright.config.ts`, CI'ın aynı yer tutucularını yalnız değer boşsa veriyor.
7. `tests/rls-coverage.test.ts`'teki sıra testi artık `scripts/db-setup.sh`'in komut kısmını okuyor ve CI adımının `pnpm db:setup` çağırdığını doğruluyor. Gevşetilmedi. Mutasyonla kontrol edildi: `db push` trigger'ın önüne alınınca test kırmızı oldu (`expected 1060 to be less than 993`), sonra dosya geri yüklendi (`cmp` → restored).

## Kanıt (ham çıktı)
Hata üretimi (boş DB, değişiklikten önce):
```
6 migrations found in prisma/migrations
Applying migration `add-calendar-connections`
Applying migration `add-m10-dual-approval-persistence`
Error: P3018 ... Migration name: add-m10-dual-approval-persistence
ERROR: relation "FollowupDoc" does not exist
-- sonra: _prisma_migrations | CalendarConnection ; add-calendar-connections|t ; add-m10-dual-approval-persistence|f
```
Değişiklikten sonra:
```
$ prisma migrate deploy
prisma migrate deploy is not how this repository builds a database: prisma/migrations is applied by scripts/apply-migrations.sh on top of `prisma db push`.
  Local / CI / worktree database: pnpm db:setup (scripts/db-setup.sh)
  Production: docs/RELEASE_CHECKLIST.md §3.1
Nothing was applied.
EXIT=1          (migrate dev: aynı mesaj, EXIT=1; DB'de tablo sayısı değişmedi)
```
Boş DB'de `pnpm db:setup`, 1. ve 2. koşu (yeni konteyner, `tables before: 0`):
```
run1: [3/7] ✅ fabrika_app connects as fabrika_app ; [4/7] Policies in public: 0 → 113 ; [5/7] apply-migrations: 49 files applied as fabrika ; [6/7] 113 → 113 ; Blog posts seeded (4 inserted, 0 already present) ; db-setup: done ; EXIT=0
run2: [3/7] ✅ fabrika_app already exists ... Password left unchanged ; 113 → 113 ; 49 files applied ; Blog posts seeded (0 inserted, 4 already present) ; db-setup: done ; EXIT=0
```
Uzak host reddi: `db-setup: refusing db.example.supabase.co:5432/postgres: only a local or CI database (localhost).` EXIT=1, parola yazılmadı.
RLS: `pnpm rls:check` → 47/47 model + 4b/4c SUCCESS, EXIT=0. `pnpm rls:verify --require-db` → `✅ 47 kiracıya özel tabloda ... GERÇEKTEN ölçüldü`, EXIT=0. `pg_policies` public = **113**. fe-fb raporundaki 112'den 1 fazla, çünkü dev o tarihten sonra politika ekledi (FO-52 public-intake). CI aynı betiği koştuğu için sayı tanım gereği CI ile aynı.
Tam test, `CI=true perl -e 'alarm 1800;exec @ARGV' pnpm exec vitest run` (AUTH_SECRET = CI'ın fixture değeri):
```
Test Files  367 passed | 2 skipped (369)
     Tests  4853 passed | 54 skipped (4907)      EXIT=0
```
fe-fb ile karşılaştırma: 4489 / 54 / 0 → 4853 / 54 / 0. Atlanan sayısı aynı. Geçen sayısındaki +364, dev'e o tarihten sonra eklenen testler.
Gerçek push (worktree, `--no-verify` YOK, `E2E_PORT=3166`). 1. deneme EXIT=1: e2e 375 geçti, 3 düştü (auth.spec Google düğmesi, yukarıda madde 6). Düzeltmeden sonra 2. deneme:
```
→ veritabanı: localhost:5446/fabrika
 Test Files  362 passed | 7 skipped (369)
      Tests  4787 passed | 120 skipped (4907)
✅ 47 kiracıya özel tabloda politika yerinde ...
  9 skipped
  378 passed (7.0m)
$ tsx scripts/check-orphan-alerts.ts
 * [new branch]        devop-fb/fo16-db-setup -> devop-fb/fo16-db-setup
EXIT=0
```
(Gate'teki vitest `CI=true` olmadan koşuyor; bu yüzden 120 atlanan var, CI'daki 54 değil. Bu mevcut davranış, bu iş değiştirmedi.)
Kanca reddi: `.env`'siz dizinde `pre-push: bu checkout'ta .env yok ve DATABASE_URL tanımlı değil ...` HOOK_EXIT=1.
`pnpm lint` 0 hata (4 uyarı, önceden var olan dosyalarda). `pnpm typecheck` EXIT=0. `git diff -- prisma/migrations prisma/schema.prisma | wc -l` → **0**.

## Değişen dosyalar
`scripts/db-setup.sh` (yeni), `package.json` (yalnız scripts: `db:setup`), `.github/workflows/ci.yml` (Prepare database + yorumu), `prisma.config.ts`, `githooks/pre-push`, `playwright.config.ts`, `tests/rls-coverage.test.ts`, `CLAUDE.md`, `README.md`, `docs/RELEASE_CHECKLIST.md`.

## Riskler
- `prisma.config.ts` korunağı argv'ye bakıyor. Prisma'nın gelecekte config'i ayrı bir süreçte yüklemesi korunağı sessizce etkisiz bırakabilir; o durumda eski davranış (yarım kurulum) geri gelir. Prisma yükseltmesinde `pnpm exec prisma migrate deploy` → EXIT=1 tekrar ölçülmeli.
- `tests/rls-coverage.test.ts` ve `playwright.config.ts` kartın izin listesinde açıkça yok. İlki, sıranın taşınmasının zorunlu sonucu (testin garantisi korundu). İkincisi "gerekirse playwright.config.ts" kapsamında.
- CI'da `db:setup` iki kez seed koşuyor. Seed idempotent (2. koşu "0 inserted"), süre birkaç saniye artar.
- GitHub CI ödeme yüzünden koşmadığı için Linux'ta ölçülmedi.

## Açık sorular
Yok. Eski `db:migrate` anan belgeler kapsam dışında bırakıldı: `.claude/commands/add-table.md` (`pnpm db:migrate --name`), `docs/DEVOPS-POSTGRES-SETUP.md`, `docs/SECURITY_COMPLIANCE.md:39`, `docs/ARCHITECTURE.md:88`. Komut artık açık mesajla yönlendirdiği için zarar vermiyor; ayrı bir temizlik kartı önerilir.

## Sonraki adım
- PR #119 incelemesi + merge (patron/lider). Merge'den sonra FO-44 (PR #28) push'u yeniden verilebilir. O dala bu işte dokunulmadı.
- İzole DB `fo16-pg` (127.0.0.1:5446) ve worktree, inceleme düzeltmeleri için duruyor. PR merge edilince `docker rm -f fo16-pg` + `git worktree remove ../FONBRIDGE-fo16`.
- Not: delegasyon metnindeki KANIT yolu (`/Users/macbook/alan/docs/agent-results/FO-44-devop-fb.md`) hem kartla hem lider talimatıyla çelişiyordu. Kart esas alındı, rapor `docs/agent-results/TASK-MVBFDSUSE5QCY-devop-fb.md`'de.
