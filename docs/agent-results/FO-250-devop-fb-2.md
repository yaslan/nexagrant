# FO-250 (TASK-MVUPDK0P6ZT0N) — PR #218 düzeltmeleri: sonuç raporu — devop-fb

**Ajan:** devop-fb · **Dal:** `devop-fb/fo244-vps-deploy` · **PR:** #218 (draft, açık, merge YOK)
**Yeni head (push sonrası, PR #218 `headRefOid` ile doğrulandı):** `fa9948db`  (önceki uzak head: `407b6394`)
**Platform kapsamı:** mac (darwin) — yerel Docker Desktop + geçici pgvector:pg16 + pre-push gate (`gate-isolated`). Linux sunucu ve Hostinger'a ERİŞİLMEDİ, dokunulmadı.
**Hüküm:** Kod düzeltmeleri PUSH EDİLDİ ve gate temiz geçti. Canlıya geçiş YOK (açık onay gerekir). `seed` kapısı FO-251 birleşene kadar kapalı.

## Push kanıtı

```
To https://github.com/yaslan/fonbridge.git
   407b6394..fa9948db  fo250-clean-push -> devop-fb/fo244-vps-deploy
[gate-isolated] ok: git finished on an isolated database
gh pr view 218 → headRefOid fa9948db1225df981a840c2af0e55a707602faf1, isDraft true, state OPEN
```
Pre-push gate: `pnpm gate` koşumu tamamlandı; e2e `456 passed, 7 skipped`; `check-orphan-alerts`: öksüz alarm yok.

## Push'a giden commit'ler (yalnız FO-250 kapsamı)

Yerel `devop-fb/fo244-vps-deploy` dalında FO-254'e ait iki commit vardı (`70007c62` expert-prereg test, `619db789` FO-254 kısmi raporu). PR #218'e karıştırmamak için bunlar **dışarıda bırakıldı**; FO-250 commit'leri temiz bir dal üstünde yeniden uygulandı (cherry-pick, içerik değişmedi):

| Yeni SHA | Konu |
|---|---|
| `660c2ee3` | fix(deploy): FO-250 VPS deploy fixes — owner/jobs roles, compose-safe ops, guards |
| `0710bb1a` | docs: FO-250 #218 fixes report |
| `cf2166e8` | docs: push attempts blocked by gate |
| `03600807` | fix(rls): check-rls-live row expectation from BYPASSRLS owner |
| `756c2e1e` | docs: verify fix |
| `94a37687` | docs: push held until FO-254 |
| `fa9948db` | docs: status report (push blocked) — son commit = PR head |

## Kart maddeleri — durum

| Madde | Durum | Not |
|---|---|---|
| B-1 `--network host` kaldır | Yapıldı | `ops.sh`: `run --rm --no-deps worker`, compose ağı; "network host" yalnız yorum satırında |
| B-2 `db push --skip-generate` kaldır | Yapıldı | Yalnız yorumda geçiyor |
| B-3 `OWNER_DATABASE_URL`, owner/app ayrımı, RUNBOOK §4 sırası | Yapıldı | `.env.prod.example`: `OWNER_DATABASE_URL`; push/rls-role/rls/migrate owner ile; verify app ile |
| Y-1 `.dockerignore` | Yapıldı | `**/.env*` + `!**/.env*.example` |
| Y-2 bellek / swap | Yapıldı (belgeli) | RUNBOOK 4 GB swap, derleme öncesi worker durdurma, CORDIS tek seferlik 5g konteyner |
| Y-3 limitler | Yapıldı | postgres 2g, web 1536m + `NODE_OPTIONS=--max-old-space-size=1024`, worker 1g, caddy 128m |
| Y-4 K3 "referans veri zorunlu, demo yok" | Yapıldı | RUNBOOK `SEED_DEMO=false`; seed kapısı fail-closed (FO-251 birleşene kadar) |
| Ö-1 yedek şifreli | Yapıldı | `BACKUP_AGE_RECIPIENT` zorunlu; yalnız `*.dump.age` |
| Ö-2 drill komutu | Yapıldı | RUNBOOK §8.2: `RESTORE_ADMIN_URL`, `BACKUP_DATABASE_URL` |
| Ö-3 env adları | Yapıldı | `WORKER_URL`, `WORKER_TOKEN`, `K1_EMBEDDING_MAX_USD_PER_RUN` |
| Ö-4 ensure_rls metni | Yapıldı | "db-setup.sh'tan farkı: ensure_rls kurulmaz" |
| Ö-5 §6 0a/2a atfı | Yapıldı | |
| D-1 sshd | Yapıldı | `PasswordAuthentication no`, `PermitRootLogin no` (RUNBOOK §1) |
| D-6 tabloya verify | Yapıldı | |
| ACME e-posta | Yapıldı | `Caddyfile`: `email info@nexagrant.com` |
| `ALERTS_OPS_EMAIL` | RUNBOOK'ta değer olarak | `info@nexagrant.com`; değişken FO-246 ile gelir |
| ROADMAP:347 M1 | Yapıldı | "602 MB RSS, çözüldü" |

## Doğrulama (önceki koşumlar, `99056cce` sonrası)

- Geçici pgvector:pg16 (127.0.0.1:55432, paylaşılan 5433 kullanılmadı) üzerinde: bootstrap, db push, apply-rls, setup-rls-role, 61/61 migrasyon, `check-rls-live` (uygulama `fabrika_app` + owner `fabrika_owner`): `ExpertFounderCounter 1/1`, 51 kiracı tablosu ölçüldü, exit 0.
- Negatif: owner URL yok → exit 1; owner URL RLS'e tabi → exit 1.
- `docker compose -f deploy/vps/docker-compose.prod.yml config --quiet` geçerli (dummy env).
- Konteyner temizlendi.

**Doğrulanamayan / yapılmayan:** tam `docker compose build` (önceki denemeler npm registry zaman aşımında düştü); `seed` (FO-251 bekleniyor); sunucuda `ops.sh` uçtan uca koşumu (sunucuya erişim yok, onaysız dokunulmayacak).

## Riskler

- FO-254'e ait iki commit (`70007c62`, `619db789`) PR dışında yerel dalda kaldı; FO-254 kendi dalında ayrıca ele alınmalı.
- Gate kararsızlığı (zamanlama eşikli testler) bu turda geçti, ama yük altında yeniden kırılabilir.
- `seed` kapısı kapalı: FO-251 birleşmeden canlı seed yapılamaz.

## Açık sorular

1. Canlıya geçiş onayı (sunucu/Hostinger) — açık onay olmadan yapılmaz.
2. FO-251 (`SEED_DEMO` ayrımı) ne zaman birleşecek?

## Değişen dosyalar (push kapsamı)

`.dockerignore` · `deploy/vps/.env.prod.example` · `deploy/vps/Caddyfile` · `deploy/vps/RUNBOOK.md` · `deploy/vps/backup-to-r2.sh` · `deploy/vps/bootstrap-roles.sql` (yeni) · `deploy/vps/docker-compose.prod.yml` · `deploy/vps/ops.sh` · `docs/ROADMAP.md` · `prisma/rls-app-role.sql` · `scripts/apply-rls.ts` · `scripts/setup-rls-role.ts` · `scripts/check-rls-live.ts` · `docs/agent-results/TASK-MVUPDK0P6ZT0N-devop-fb.md` · `docs/agent-results/FO-250-devop-fb.md`

## Sonraki adım

- Bu rapor commit'lenip push edilecek (docs-only; pre-push gate yeniden koşar); sonra PR #218 head'i tekrar doğrulanacak.
- Canlıya geçiş: açık onay bekleniyor. Merge: yok.

DONE:st3
