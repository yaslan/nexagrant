# Fabrika — Avrupa Proje Fabrikası SaaS

KOBİ, danışmanlık ve üniversite proje ofisleri için Avrupa fonlarına sürekli başvuru pipeline'ı. Çok kiracılı, modüler (M1–M11), yönetici tarafından açılıp kapatılabilen modüller; abonelik + eklenti + hizmet + pazar yeri + API gelir modeli.

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

## Yerel çalıştırma (E0 sonrası)
```bash
cp .env.example .env.local
docker compose up -d           # postgres+pgvector, redis, mailpit
pnpm install && pnpm db:migrate && pnpm db:rls && pnpm db:seed
pnpm dev
```
