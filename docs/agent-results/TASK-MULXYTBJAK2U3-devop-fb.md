# TASK-MULXYTBJAK2U3 — FB dev ortamı düzeltme (devop-fb)

Sprint FB-GAP-1 · Kaynak: `docs/agent-results/TASK-MULXF5M8J8AGY-crw-fb.md` §2 · Dal `dev`, push yok.

## 1. Ne yapıldı

**Ö-1 (AUTH_SECRET): README adımı seçildi, compose'daki `:?` korundu.**

- Compose "yalnız o profil çalışırken zorunlu" diye bir koşul ifade edemiyor. Değişkenleri profil süzgecinden **önce** bütün dosya için çözüyor. Bu yüzden iki seçenek vardı: `:?` (her komut düşer) ya da `:-` (hiçbiri düşmez).
- `:-` seçilseydi `docker compose --profile app up` boş anahtarla bir konteyner başlatırdı. Konteyner uygulamanın kendi kontrolüne (`src/lib/auth-secret.ts`) takılıp `restart: unless-stopped` ile sürekli yeniden başlardı. Anahtar `pnpm dev` için de zorunlu. Yani geliştiricinin bu adımı zaten yapması gerekiyor.
- Bu yüzden README'ye 2. adım olarak idempotent bir doldurma satırı eklendi. Satır yalnız değer boşsa yazıyor, ikinci koşuda dosya aynı kalıyor. Ardından `docker compose config -q` kontrolü geliyor. Compose'a bu kararın gerekçesini yorum olarak yazdım.
  ```
  perl -pi -e "s|^AUTH_SECRET=\$|AUTH_SECRET=$(openssl rand -base64 32)|" .env
  ```

**Temiz klon denemesinde kartın dışında 4 kırılma daha çıktı. Kapsam içindekileri düzelttim:**

| #   | Kırılma (temiz klon)                                                                                                                                                                                                                                          | Düzeltme                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y-1 | README'deki `pnpm db:migrate` boş DB'de düşüyor: `P3006 … add-m10-dual-approval-persistence … relation "FollowupDoc" does not exist`. Repo'da baseline migration yok. Migration'lar `db push` üstüne yazılmış ek dosyalar.                                    | README kurulumu CI'nin "Prepare database" sırasına çevrildi: `db:generate` → `prisma db push` → `db:rls-role` → `apply-migrations.sh` → `db:rls` → `db:seed`. |
| Y-2 | `db:seed` → `Cannot find module '.prisma/client/default'`. Temiz kurulumda Prisma istemcisi üretilmiyor.                                                                                                                                                      | README'ye `pnpm db:generate` eklendi (CI'da da var).                                                                                                          |
| Y-3 | `.env.example` → `FEEDBACK_DIGEST_TO=` boş. `env.ts` bunu e-posta olarak doğruluyor, bu yüzden seed ve dev sunucusu `Invalid environment variables — FEEDBACK_DIGEST_TO` ile düşüyor.                                                                         | Satır yorum satırına alındı, gerekçesi yazıldı.                                                                                                               |
| Y-4 | `.env.example` → `CALENDAR_ENCRYPTION_KEY=` boş. `pnpm test` 1 kırmızı veriyor (`tests/calendar-token-db.live.test.ts`). `encryption.ts:18` `env.X ?? process.env.X` kullanıyor. Boş string nullish olmadığı için testin sonradan kurduğu anahtar görünmüyor. | Satır yorum satırına alındı. CI'da da anahtar hiç tanımlı değil, bu yüzden CI'da geçiyor.                                                                     |
| Y-5 | `.env.example` → `DATABASE_URL_RLS_TEST=…:generated-by-pnpm-db-rls-role@…` dolu. `setup-rls-role.ts:72-76` anahtar varsa parolayı ondan alıyor. Dosyanın "parolayı üretir" yorumu yanlıştı: rol yer tutucu parolayla kuruluyordu.                             | Satır yorum satırına alındı. Script artık parolayı üretip `.env`'e ekliyor (kanıt: `generated a password and appended`).                                      |

**crw-fb §2 K bulguları:**

- **K-1 (`.env.example` 5432) DÜZELTİLDİ.** 3 URL artık `localhost:5433`, yani compose varsayılanıyla aynı. README'deki "URL'leri çevir" adımı kalktı. Yalnız port değiştirilirse gerekiyor, README bunu söylüyor.
- **K-2 (Redis/Mailpit kullanılmıyor) BELGELENDİ.** Compose yorumları ve README'ye "uygulama bağlı değil" notu düştüm. Mailpit için: e-posta yalnız Resend ile gidiyor, `RESEND_API_KEY` boşsa hiç gönderilmiyor (`digest-run.ts:99`, `request-deletion.ts:216`). Resend'i yerelde mailpit'e yönlendirmek kod işi. Kapsam dışı, kart önerisi aşağıda.
- **K-3 (bekçi mesajının "neden" kısmı boş) DÜZELTİLMEDİ.** Değişiklik `tests/relationship-tenant-scope.test.ts`'te. Kartın kapsamı README, compose ve `.env.example` ile sınırlı, tests/ ise se-fb'nin alanı. Teşhis zaten mümkün: hedef URL mesajda yazıyor. Kozmetik.

**Ek bulgu (düzeltildi, belgelendi):** Konteyner ve volume adları sabit (`container_name`, `volumes.*.name`). `-p başka-ad` bunları **değiştirmiyor**. Kartın önerdiği `-p` + `FABRIKA_PG_PORT` tek başına kullanılsaydı paylaşılan `fabrika-postgres`/`fabrika_pgdata` ile çakışacaktı. Deneme bu yüzden adları da değiştiren bir `-f` ek dosyasıyla yapıldı (aşağıda). README'ye "Sabit adlar" notu eklendi.

## 2. Kanıt

**Önce (HEAD'deki compose + `.env.example`):**

```
$ docker compose -f old-compose.yml --env-file old.env config -q
error while interpolating services.fabrika-web.environment.[]: required variable AUTH_SECRET is missing a value: set AUTH_SECRET (openssl rand -base64 32)
baseline rc=1
```

**Sonra: temiz klonda README akışının tamamı.** Klon `dev` HEAD `b11ed48b` + bu 3 dosya, boş volume. Script: `scratchpad/fbclean/run.sh`.
İzolasyon: `COMPOSE_PROJECT_NAME=fbscratch`, `COMPOSE_FILE=docker-compose.yml:../isolate.yml` (konteyner adları `fbscratch-*`, volume'lar `fbscratch_*`), portlar 55433/56379/51025/58025, dev için :3137. Host'ta `psql` olmadığı için `PSQL=` yerine `docker exec -i fbscratch-postgres psql` sarmalayıcısı kullanıldı.

```
HEAD b11ed48b  + working-tree:  M .env.example  M README.md  M docker-compose.yml
[01-cp] rc=0 :: cp .env.example .env
[02-authsecret] rc=0 :: bash -c perl -pi -e "s|^AUTH_SECRET=\$|AUTH_SECRET=$(openssl rand -base64 32)|" .env
     AUTH_SECRET length=44
[03-config] rc=0 :: docker compose config -q
[04-up] rc=0 :: docker compose up -d --wait
[05-install] rc=0 :: pnpm install --frozen-lockfile
[05b-generate] rc=0 :: pnpm db:generate
[06-dbpush] rc=0 :: pnpm exec prisma db push
[07-rlsrole] rc=0 :: pnpm db:rls-role
[08-migrations] rc=0 :: … scripts/apply-migrations.sh        (29 files applied)
[08b-migrations-again] rc=0 :: … scripts/apply-migrations.sh  (idempotent 2. geçiş)
[09-rls] rc=0 :: pnpm db:rls                                  (Policies in public: 28 → 112)
[10-seed] rc=0 :: pnpm db:seed
[11] pnpm dev -p 3137 -> GET /tr 200
[12-test] rc=0 :: env -u DATABASE_URL -u DATABASE_URL_RLS_TEST pnpm test
 Test Files  191 passed | 2 skipped (193)
      Tests  2202 passed | 8 skipped (2210)
```

Ek kontroller:

- `perl` satırı hem zsh'de hem bash'te rc=0, uzunluk 44. İkinci koşuda `.env` değişmiyor (`cmp` → unchanged).
- `config --services`: `mailpit / postgres-vector / redis` görünüyor. `--profile app` ile `fabrika-web` de ekleniyor.
- Temizlik: `down -v` rc=0, `fbscratch_pgdata`/`fbscratch_redisdata` silindi. Kalan `fbscratch-*` konteyneri yok. :3137 boş (kendi `next-server` pid'imi kapattım).
- **Paylaşılan kaynaklara dokunulmadı:** `fabrika-postgres Up 5 hours`, `fabrika_pgdata created=2026-09-06T16:02:40Z`. Paylaşılan ağaçta `docker compose config -q` rc=0.
- Ara koşularda Y-1…Y-5 hatalarının ham çıktıları `scratchpad/fbclean/*.log` altında (seed, migrate, test logları).

## 3. Değişen dosyalar

- `README.md`: kurulum bloğu (AUTH_SECRET doldurma, `config -q`, `up --wait`, CI sırası), notlar (kurulum sırası, AUTH_SECRET, portlar, Redis/Mailpit, sabit adlar).
- `docker-compose.yml`: yalnız yorumlar (AUTH_SECRET `:?` gerekçesi, redis/mailpit "uygulama bağlı değil"). Davranış değişmedi.
- `.env.example`: 3 URL 5433'e çekildi. `DATABASE_URL_RLS_TEST`, `FEEDBACK_DIGEST_TO` ve `CALENDAR_ENCRYPTION_KEY` yorum satırına alındı. AUTH_SECRET yorumu güncellendi.
- `docs/agent-results/TASK-MULXYTBJAK2U3-devop-fb.md`: bu rapor.

Geri alma: `git revert <bu commit>`. Yalnız doküman, örnek env ve yorum değişti. Paylaşılan `.env` ve konteynerlere dokunulmadı.

## 4. Riskler

- Bu makinedeki mevcut `.env`'ler etkilenmez, `.env.example` yalnız yeni kopyalarda kullanılıyor. Paylaşılan `.env` DB'yi zaten 5433'te gösteriyor.
- README artık `psql` istiyor (`apply-migrations.sh`). Bu makinede host `psql` yok. Denemede `docker exec` sarmalayıcısı kullanıldı, README `PSQL=` seçeneğini anıyor.
- Y-3 ve Y-4'ün kökü kodda: boş string doğrulaması ve `??`. Örnek dosyada satırı yorum yapmak semptomu kapatıyor. Birisi `.env`'e boş satır yazarsa aynı hata geri gelir.

## 5. Açık sorular

- `pnpm db:migrate` script'i yeni migration üretmek için mi duruyor? Boş DB'de çalışmıyor. Kaldırılması ya da adının değişmesi (ör. `db:migrate:new`) leed-fb kararı.

## 6. Sonraki adım (kart önerileri, kapsam dışı)

1. **be-fb:** `src/lib/env.ts` `FEEDBACK_DIGEST_TO` alanında `optionalUrl` gibi boşu undefined'a çeviren bir preprocess kullanılsın. `src/lib/calendar/encryption.ts:18` `??` yerine boş-string'e dayanıklı olsun (`||` ya da trim).
2. **devop-fb / leed-fb:** `scripts/setup-dev-db.sh` gibi tek bir komut hem README'yi hem CI'nin "Prepare database" adımını beslesin, böylece iki tarif birbirinden kopmasın. Host `psql` yoksa `docker exec`'e düşsün.
3. **se-fb:** crw-fb K-3 (`e.message.trim() || e.name`).
4. İsteğe bağlı: Resend'i yerelde mailpit SMTP'ye yönlendirmek (K-2).

## Platform beyanı

Doğrulama **macOS**'ta yapıldı (Darwin 27, Docker Compose v5.5.1, zsh + bash).
Platforma bağlı parçalar:

- README'deki `perl -pi -e` ve `sed -n 's/^DATABASE_URL=//p'` GNU (Linux) ve BSD (macOS) araçlarında aynı davranır. Bilerek `sed -i` kullanılmadı, çünkü GNU ile BSD arasında farklı. Linux'ta koşulmadı ama bu yollar taşınabilir. CI (ubuntu) aynı DB sırasını zaten koşuyor.
- Windows'ta koşulamadı: README bloğu POSIX kabuğu varsayıyor (`$(…)`, `perl`, `openssl`, bash script). Windows için WSL/Git Bash gerekir. Bu değişiklikten önce de öyleydi.
