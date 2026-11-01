# TASK-MULQKN4K7SRN0 — FB geliştirme ortamı (devop-fb)

Sprint FB-GAP-1 · dal `dev` · commit `e5a6ebd5` (push yok)

## 1. Ne yapıldı

1. **vitest `.env`'i kendisi yüklüyor** (`vitest.config.mts`). `.env` `util.parseEnv` ile okunup `test.env`'e konuyor.
   - Kartta vite `loadEnv` önerilmişti. `vite` bu projenin doğrudan bağımlılığı değil ve pnpm config dosyasının onu import etmesine izin vermiyor. `package.json` kapsam dışı olduğu için Node'un yerleşik `util.parseEnv`'i kullanıldı (Node ≥ 21.7; CI Node 22).
   - **Kabuktaki env kazanır:** CI'da `.env` yok ve URL'ler job'un `env:`'inden gelir. `DATABASE_URL=… pnpm test` hâlâ `.env`'i ezer.
   - `NODE_ENV` `.env`'den alınmaz (`.env`'de `development` yazıyor, vitest'in `test` değerini ezmesin). `DEMO_LOGIN_ENABLED: 'true'` üstte kalır.
2. **Bekçi kararı** (`tests/relationship-tenant-scope.test.ts`): **gerçek hata**. DB yoksa, yanlış DB cevap verirse ya da kimlik doğrulama düşerse `beforeAll` hata fırlatır. Mesajda parolası maskelenmiş hedef URL ve kök neden yazar.
   - Gerekçe: K-6 kuralı CI'da skip'e izin vermiyor. Eski `expect(skipReason).toBe('__no_database__')` bekçisi hiçbir zaman eşleşemezdi. Yani test zaten fail ediyordu, ama konsola "skipped" yazıyor ve kök nedeni `expected '…' to be '__no_database__'` diff'inin içine gömüyordu. Bu kararla yanlış DB'ye (YUYT :5432) bağlanmak, yeşil ya da "atlandı" görünmek yerine açık bir hata veriyor.
   - "DB yok" ile "başka DB cevap verdi" durumlarını ayırmak için ayrı yol yazılmadı: ikisi de aynı sonuçla (fail) biter ve Prisma'nın mesajı ayrımı zaten gösteriyor.
3. **docker-compose.yml**
   - `name: fabrika` eklendi. Mevcut volume'un etiketleri `com.docker.compose.project=fabrika` ve `volume=pgdata`; dizin adından türeyen `fonbridge` proje adıyla compose bu volume'u başka bir projenin volume'u olarak görürdü.
   - Postgres: `container_name: fabrika-postgres`, `${FABRIKA_PG_PORT:-5433}:5432`, `restart: unless-stopped`, volume `name: fabrika_pgdata`. DB/parola gerçeğe çekildi: `fabrika/fabrika`, DB `fabrika`. Volume'da `fabrika`, `fabrika_db` ve `fabrika_planver_probe` DB'leri var; `.env` `fabrika` DB'sini kullanıyor.
   - `redis` (redis:7-alpine, :6379, volume `fabrika_redisdata`) ve `mailpit` (smtp :1025, arayüz :8025) eklendi. Portların hepsi env ile değişebiliyor.
   - `fabrika-web` artık `app` profilinde. Profil olmasaydı düz `up`, paylaşılan :3000 dev sunucusuyla çakışırdı. Eskimiş `version: '3.8'` satırı kaldırıldı.
4. **README "Yerel çalıştırma"** yeniden yazıldı. Kapsadıkları:
   - `.env.local` yerine `.env` (prisma.config.ts ve vitest yalnız `.env`'i okuyor)
   - :5433 ve port değişkenleri
   - testlerin env önceliği ve K-6
   - paylaşılan :3000 dev sunucusu
   - şema değişince `prisma generate` ve yeniden başlatma
   - `app` profili
   - elle kurulmuş `fabrika-postgres`'i compose'a **devretme adımları ve geri alma yolu**

Konteyner ya da volume silinmedi. `docker compose up` çalıştırılmadı.

## 2. Kanıt

**Önce (baseline)**, yalın `pnpm test` (kabuk env'inde DB URL yok):

```
 Test Files  8 failed | 167 passed | 8 skipped (183)
      Tests  39 failed | 1926 passed | 95 skipped (2060)
```

**Sonra**, paylaşımlı ağaçta yalın `pnpm test`:

```
 Test Files  181 passed | 2 skipped (183)
      Tests  2067 passed | 8 skipped (2075)
```

Kalan 2 atlanan dosya (`adapters`, `k1-daily-calls`, `sedia-adapter` içindeki 8 test) koda gömülü `skip`'ler, DB ile ilgisi yok.

**Paylaşımlı ağaçta ikinci koşu:** `3 failed`, hepsi `tests/rls-coverage.test.ts > C-2 — AuditEvent …`. Bunlar başka bir ajanın commit'lenmemiş işi (`prisma/rls.sql`, `scripts/rls-models.ts`, `auditevent-null-system-only.sql`). Bu yüzden commit'im **izole worktree'de** (`e5a6ebd5`, node_modules klonu, `.env` kopyası, `prisma generate`) koşuldu:

```
exit=0
 Test Files  181 passed | 2 skipped (183)
      Tests  2067 passed | 8 skipped (2075)
```

**CI=1, `.env` yok, env job'dan** (worktree'de `.env` silindi):

```
CI=1 DATABASE_URL=…:5433/fabrika DATABASE_URL_RLS_TEST=… vitest run tests/relationship-tenant-scope.test.ts tests/rls.spec.ts
      Tests  14 passed (14)
```

**CI=1, `.env` yok, env de yok** (skip değil, fail olmalı):

```
exit=1
Error: relationship tenant-scope needs a live FB database at (unset: src/lib/db.ts default): …
 Test Files  1 failed (1)
```

**Yanlış DB, YUYT :5432** (kabuk env'i `.env`'i ezer ve bekçi hata verir):

```
CI=1 DATABASE_URL=postgresql://fabrika:fabrika@localhost:5432/fabrika vitest run tests/relationship-tenant-scope.test.ts
exit=1
Error: relationship tenant-scope needs a live FB database at postgresql://***@localhost:5432/fabrika:
Authentication failed against the database server, the provided database credentials for `fabrika` are not valid
```

**`docker compose config`** (exit 0, özet):

```
name: fabrika
services:
  mailpit:          container_name: fabrika-mailpit   published 1025, 8025
  postgres-vector:  container_name: fabrika-postgres  image pgvector/pgvector:pg16
                    POSTGRES_DB: fabrika  POSTGRES_USER: fabrika
                    published: "5433" → target 5432   volume pgdata
  redis:            container_name: fabrika-redis     published 6379   volume redisdata
volumes:
  pgdata:    name: fabrika_pgdata
  redisdata: name: fabrika_redisdata
```

- `FABRIKA_PG_PORT=5544 docker compose config` → `published: "5544"`.
- `docker compose --profile app config --services` → `postgres-vector redis fabrika-web mailpit`.

**Mevcut konteyner/volume** (`docker inspect`, yalnız okuma):

- `fabrika-postgres`: `pgvector/pgvector:pg16`, `5433→5432`, mount `fabrika_pgdata → /var/lib/postgresql/data`, `unless-stopped`.
- Volume etiketleri: `com.docker.compose.project=fabrika`, `com.docker.compose.volume=pgdata`. Compose tanımı bunlarla eşleşiyor.
- `select count(*) from "Tenant"` → `33` (veri yerinde).

`eslint vitest.config.mts tests/relationship-tenant-scope.test.ts` → temiz.

## 3. Değişen dosyalar

- `vitest.config.mts`
- `tests/relationship-tenant-scope.test.ts`
- `docker-compose.yml`
- `README.md`
- `docs/agent-results/TASK-MULQKN4K7SRN0-devop-fb.md` (bu rapor)

## 4. Riskler

- **Canlı anahtarlar:** `.env`'in tamamı test ortamına giriyor. Şu an dolu olanlar `SEDIA_API_KEY` ve `WORKER_TOKEN`; ANTHROPIC, OPENAI ve STRIPE anahtarları boş. Birisi `.env`'e canlı bir anahtar koyarsa, onu okuyan bir test gerçek servise gidebilir. Bu risk daha önce `source .env` ile koşarken de vardı.
- **Compose'un devralmaması:** Compose elle kurulan konteyneri sahiplenmez. Aynı `container_name` olduğu için devretme yapılmadan `docker compose up` "container name already in use" der ve durur; bu veri kaybı değil. Devretme adımları README'de; o sırada iki konteyner aynı volume'u aynı anda açmamalı.
- **Compose `.env` interpolasyonu:** Compose da `.env`'i okur. `FABRIKA_*` değişkenleri `.env`'e yazılırsa hem compose'u hem vitest'i etkiler; bu istenen davranış.

## 5. Açık sorular

- `.env`'deki `DATABASE_URL_MIGRATE` `fabrika_migrate` rolünü kullanıyor, ama bu rol volume'da **yok** (roller: `fabrika`, `fabrika_app`). `pnpm db:migrate` bu URL'yi kullanıyorsa kırılır. Rolü oluşturmak DB değişikliği olduğu için kapsam dışı bırakıldı; sahibi (be-fb ya da lider) karar vermeli.
- Konteyner env'inde `POSTGRES_DB=fabrika_db` var, uygulamanın kullandığı DB ise `fabrika`. Compose gerçeğe (`fabrika`) çekildi. `fabrika_db` artık kullanılmıyor gibi görünüyor; silinmedi.

## 6. Sonraki adım

- Kimse DB'yi kullanmıyorken README'deki devretme adımlarının patron veya lider onayıyla uygulanması.
- `dev` push'undan sonra CI'ın yeşil kaldığının gözlenmesi. Yerel CI=1 denemesi yeşil, ama push yapılmadı.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, Docker Compose v5.5.1, Node 26.5 yerelde; CI ubuntu-latest + Node 22). Değişen kod platforma bağlı değil: `path.join`, `fs` ve `util.parseEnv` her platformda aynı çalışır. Compose tanımı Linux imajlarını kullanır ve Docker Desktop'ın olduğu her yerde aynıdır. Windows ve Linux'ta **koşulamadı**, çünkü bu makinede yalnız macOS var. `util.parseEnv` Node < 21.7'de yoktur; repo Node 22 istiyor (pnpm 11).
