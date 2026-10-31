# Kalite kapısı (`pnpm gate`) — yeni bir makinede yeşil koşturma tarifi

Kapı = `gate:core` (`package.json`): `db:generate → lint → typecheck → test → i18n:check → rls:check → rls:bypass-check → rls:verify --require-db → db:rls-role → test:e2e → alerts:check`. `pnpm gate` bunu makine çapındaki kilitle (`scripts/gate-lock.mjs`, aynı anda tek gate) koşar. `githooks/pre-push` da aynısını koşar (`pnpm hooks:install`).

## Kısa yol: `pnpm gate:isolated` (önerilen)

```bash
pnpm install --frozen-lockfile
pnpm storage:up                 # MinIO :9000 (yoksa); mailpit :1025/:8025 docker-compose'tan
pnpm gate:isolated
# push: kancanın gate'i de aynı izole ortamda koşar (--no-verify yok)
pnpm gate:isolated git push -u origin <dal>
```

`scripts/gate-isolated.sh` şunları yapar, sonra **değiştirilmemiş** `pnpm gate`'i koşar:

1. Boş bir port üzerinde yeni `pgvector/pgvector:pg16` konteyneri (CI'ın imajı), DB adı `fabrika_gate` — `fabrika` değil: `tests/expert-prereg-retention.live.test.ts` o adda kendini atlar. Paylaşılan `:5433` veritabanına ve oradaki `fabrika_app` parolasına dokunmaz.
2. `pnpm db:setup` (CI'ın kullandığı yol: ensure_rls → db push → db:rls-role → db:rls → migrations → db:rls → seed).
3. `pnpm storage:setup` ile `test-evidence` + `test-public` (anonim okuma) bucket'ları.
4. CI'ın test değerleri: `DATABASE_URL`, `DATABASE_URL_RLS_TEST` (`fabrika_app_ci`), `AUTH_SECRET` + `KEEP_EU_LIVE=1` (vitest), `R2_*` → MinIO (e2e); boş bir `E2E_PORT` (3400'den başlar).
5. Çıkışta konteyneri siler (`GATE_KEEP=1` tutar) ve `next dev`'in yeniden biçimlendirdiği `tsconfig.json`'ı, başta temizse geri alır.

Buradaki değerler `./.env`'den önce gelir (vitest ve playwright süreç ortamını öncelikli okur); checkout'un kendi `.env`'i karışmaz. Tüm kimlik bilgileri atılabilir yerel değerlerdir (ci.yml'deki ile aynı); sır değildir.

### Kilit beklerken foreground zaman aşımı (FO-254)

`pnpm gate` ve `pnpm gate:isolated` makine çapındaki kilidi (`scripts/gate-lock.mjs`, `~/.cache/fonbridge-gate.lock`) bekleyebilir: başka bir worktree'nin gate'i bitene kadar sıra bekler. Bu bekleme, tam bir gate süresine (~15–17 dk) eklenir. Bash aracı foreground'da 600 sn'de keser; kesilen bir gate kilidi bırakmaz ama çıktı kaybolur. Bu yüzden:

- Gate'i **arka planda** koş ve logu dosyaya yaz: `bash scripts/gate-isolated.sh > /path/gate.log 2>&1; echo "GATE_EXIT=$?" >> /path/gate.log`.
- Kilit beklenip beklenmediğini `gate.log`'daki `⏳ Gate kilidi meşgul` satırından gör.
- `git push` (pre-push kancası) da aynı kilidi kullanır; push'u da arka planda ya da kilit boşken yap.

## Elle koşarken düşülen 6 tuzak — FO-161

`.env`'li elle tarif (worktree başına kalıcı izole DB): `CLAUDE.md` "Worktree'de gate".

`pnpm gate`'i doğrudan, paylaşılan `fabrika-postgres :5433` üzerinde koşacaksan:

| # | Belirti | Sebep | Çözüm |
|---|---------|-------|-------|
| 1 | `28P01 password authentication failed for user "fabrika_app"`, ~31 canlı test kırmızı | `fabrika_app` küme genelinde tek; parolası başka bir checkout'un `.env`'indeki `DATABASE_URL_RLS_TEST` ile kurulmuş | O checkout'un `DATABASE_URL_RLS_TEST`'ini kopyala; ya da `pnpm db:rls-role:rollback` + `pnpm db:rls-role` (diğer checkout'ları kırar — ya da izole yol) |
| 2 | `rls:verify --require-db` → `ExpertFounderCounter` permission denied | `DATABASE_URL_RLS_TEST` tanımsız / rol `db:rls`'ten sonra kuruldu | `pnpm db:rls-role && pnpm db:rls`, `DATABASE_URL_RLS_TEST` export |
| 3 | e2e `admin-blog-image-upload` kırmızı / atlandı | MinIO'da `test-public` yok, `R2_*` boş | `R2_BUCKET=test-evidence R2_PUBLIC_BUCKET=test-public pnpm storage:setup` + ci.yml E2E adımındaki `R2_*` |
| 4 | Davet/posta testleri 500 ya da SMTP hatası | `.env.example`'daki boş anahtarlar rastgele doldurulmuş | SMTP'yi `playwright.config.ts`'e bırak (mailpit :1025); vitest SMTP'siz koşmalı |
| 5 | e2e `EADDRINUSE :3000` | Başka bir `next dev` 3000'de | `E2E_PORT=<boş port>` |
| 6 | Sonraki koşuda `server-action-rbac-guard` B-1 kırmızı | e2e'nin `next dev`'i `tsconfig.json`'ı yeniden yazdı | `git checkout -- tsconfig.json` |

Ek: `CI=true` verirsen `keep-eu-sync.live` `KEEP_EU_LIVE` tanımsızsa "CI'da atlanamaz" diye düşer; ya ikisini birlikte ver (CI gibi) ya da hiçbirini.

## CI karşılığı

`.github/workflows/ci.yml` aynı kontrolleri ayrı adımlarda koşar: `pnpm db:setup` (iki kez, idempotans), `rls:verify --require-db` (DB'siz exit 1), `rls:bypass-check`, `alerts:check`, lint, typecheck, vitest + canlı-atlama kapısı (`scripts/check-live-skips.ts`), e2e. YAML doğrulaması: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -no-color`.

## Platform

Betikler bash (macOS 3.2 ve Linux bash ile uyumlu; `/dev/tcp` port yoklaması bash yerleşiği). Docker ve pnpm gerekir. Windows'ta yalnız WSL/Git Bash içinde çalışır; denenmedi.
