# Fabrika — Avrupa Proje Fabrikası SaaS

KOBİ, danışmanlık ve üniversite proje ofisleri için Avrupa fonlarına sürekli başvuru pipeline'ı. Çok kiracılı, modüler (M1–M11), yönetici tarafından açılıp kapatılabilen modüller; abonelik + eklenti + hizmet + veri/API gelir modeli (pazar yeri kaldırıldı, ADR-0005).

## Belgeler (önce bunları oku)
1. `PROJECT.md` — tek doğruluk kaynağı (hedefler, roller, katmanlar, modüller, kapılar, stack, kabul kriterleri)
2. `CLAUDE.md` — Claude Code çalışma kuralları
3. `docs/BUSINESS_MODEL.md` — iş ve gelir modeli
4. `docs/ARCHITECTURE.md` · `docs/DATA_MODEL.md` · `prisma/schema.prisma`
5. `docs/MODULES.md` · `docs/BILLING.md` · `docs/API.md` · `docs/SECURITY_COMPLIANCE.md` · `docs/UI_GUIDE.md`
6. `docs/ROADMAP.md` — epikler ve sprintler; buradan görev al

## Claude Code ile başlangıç
```bash
git init fabrika && cd fabrika        # bu klasörü kopyala
claude                                # Claude Code'u aç
> PROJECT.md ve CLAUDE.md'yi oku, docs/ROADMAP.md E0'ı uygula.
```
Komutlar: `/new-module`, `/add-table`, `/review-rls`, `/gate-rule`, `/i18n-check` (`.claude/commands/`).

## Yerel çalıştırma

```bash
cp .env.example .env           # prisma, vitest ve docker compose .env'i okur (.env.local'ı değil)
# .env'deki 3 URL'yi (DATABASE_URL, DATABASE_URL_MIGRATE, DATABASE_URL_RLS_TEST) localhost:5433'e çevir
docker compose up -d           # postgres+pgvector (:5433), redis (:6379), mailpit (smtp :1025, arayüz :8025)
pnpm install && pnpm db:migrate && pnpm db:rls && pnpm db:seed
pnpm dev                       # Next.js :3000
pnpm test                      # .env'i vitest.config.mts kendisi yükler; `source .env` gerekmez
```

- **Portlar.** Bu makinede 5432 başka bir projenin Postgres'inde (yuyt-postgres). Fabrika'nın
  Postgres'i host'ta **5433**'te. Portlar env ile değişir: `FABRIKA_PG_PORT`, `FABRIKA_REDIS_PORT`,
  `FABRIKA_SMTP_PORT`, `FABRIKA_MAILPIT_PORT`, `FABRIKA_WEB_PORT` (compose bunları kabuktan ya da
  `.env`'den okur). Değiştirirsen `.env`'deki URL'leri de aynı porta çevir.
- **Testler ve env.** `pnpm test` `.env`'i okur, ama kabukta tanımlı bir değişken `.env`'i ezer
  (CI'da `.env` yok; URL'ler job'un `env:`'inden gelir). `NODE_ENV` `.env`'den alınmaz. Canlı DB
  isteyen testler DB yoksa, yanlış DB cevap verirse ya da kimlik doğrulama düşerse **hata verir**,
  atlanmaz (K-6).
- **Paylaşılan dev sunucusu.** :3000'deki `pnpm dev` ortak sunucudur (şu an leed-fb'nin); ikinci bir
  `pnpm dev` açma, kapatma. Bir commit'i izole denemek için ayrı worktree + boş port kullan.
- **Şema değişince.** `prisma/schema.prisma` ya da migration değiştiren iş `pnpm prisma generate`
  koşar ve :3000 sunucusunun yeniden başlatılmasını ister; ayaktaki süreç eski Prisma istemcisini
  tutar ve yeni alanlar "yok" gibi davranır (bkz. `docs/ROADMAP.md`, `BRIEF_NOT_PERSISTED`).
- **Uygulama konteyneri.** `fabrika-web` `app` profilinde: `docker compose --profile app up -d`.
  Varsayılan `up` onu başlatmaz, çünkü :3000 dev sunucusunda.

### Elle kurulmuş fabrika-postgres'i compose'a devretme

Bu makinedeki `fabrika-postgres` konteyneri compose'suz, elle kuruldu (aynı imaj, host :5433,
volume `fabrika_pgdata`). Compose aynı konteyner adını ve aynı volume'u kullanır, ama elle kurulan
konteyneri sahiplenmez: o dururken `docker compose up` "container name already in use" der.
Veri volume'da; konteyner ya da volume **silinmez**. Adımlar (kimse DB'yi kullanmıyorken):

```bash
docker compose config --volumes                      # pgdata → fabrika_pgdata olmalı
docker stop fabrika-postgres                         # iki konteyner aynı volume'a aynı anda yazmasın
docker rename fabrika-postgres fabrika-postgres-manual
docker compose up -d postgres-vector                 # aynı volume ile yeni fabrika-postgres
docker compose ps                                    # postgres-vector: healthy
docker exec fabrika-postgres psql -U fabrika -d fabrika -Atc 'select count(*) from "Tenant"'
pnpm test                                            # yeşil
```

Geri alma: `docker compose stop postgres-vector && docker compose rm -f postgres-vector`, sonra
`docker rename fabrika-postgres-manual fabrika-postgres && docker start fabrika-postgres`. Volume
iki yolda da aynıdır. Devir doğrulandıktan sonra `fabrika-postgres-manual` konteyneri (volume değil)
`docker rm` ile kaldırılabilir. Redis ve mailpit yeni; `docker compose up -d redis mailpit` ile ayrıca
başlatılabilir.
