# TASK-MVUPDK0P6ZT0N (FO-250) — #218 VPS deploy paketi düzeltmeleri

**Ajan:** devop-fb · **Dal:** `devop-fb/fo244-vps-deploy` · **Kod head:** `43803aba` (rapor commit'i bunun üstüne)
**Platform kapsamı:** mac (yerel Docker Desktop + geçici pgvector:pg16). Linux sunucu ve Hostinger'a ERİŞİLMEDİ, dokunulmadı.
**Hüküm:** Düzeltmeler tamam ve push'a hazır. Ancak RUNBOOK'un zorunlu `verify` kapısı, geçici DB provaasında KIRMIZI. Bu, FO-250 kapsamı dışında bir ölçüm hatası (aşağıda). Canlıya geçiş bu engel kapanana kadar yapılmamalı.

## Ne yapıldı (madde madde, FO-249 incelemesine göre)

| Madde | Durum | Not |
|---|---|---|
| B-1 `--network host` (compose run) | Kaldırıldı | `ops.sh` artık `docker compose … run --rm --no-deps worker`; URL dönüşümü yok, `postgres` servis adı çözülür |
| B-2 `prisma db push --skip-generate` | Kaldırıldı | Prisma 7.10'da geçersiz. Yerel koşumda `db push` sahip rolle başarılı |
| B-3 tüm adımlar `fabrika_app` ile | Düzeltildi | `bootstrap` (sahip + jobs rolü, süper kullanıcı `fabrika` ile), `push`/`rls-role`/`rls`/`migrate` sahip rolle, `verify` uygulama rolüyle |
| Y-1 `.dockerignore` kök-only `.env*` | Düzeltildi | `**/.env*` + `!**/.env*.example`. Bağlam testi: `.env` ve `deploy/vps/.env.prod` girmiyor, `.env.prod.example` giriyor |
| Y-2 derleme belleği / swap | Belgelendi | RUNBOOK §1 adım 1a: 4 GB swapfile; §6 derleme öncesi `stop worker`; CORDIS için 5 GB sınırlı tek seferlik konteyner (§5) |
| Y-3 compose bellek bütçesi | Güncellendi | ≈4,7 GB (postgres 2g, web 1536m + `NODE_OPTIONS=--max-old-space-size=1024`, worker 1g, caddy 128m). `config` doğrulandı |
| Y-4 `seed.ts` prod kapısı | Fail-closed | `ops.sh seed`, `SEED_DEMO` yoksa çalışmaz (FO-251 birleşene kadar) |
| Ö-1 yedek şifresiz gidebilir | Düzeltildi | `BACKUP_AGE_RECIPIENT` zorunlu; yalnız `*.dump.age` gönderilir, diğer uzantılar `fail` |
| Ö-2 restore drill komutu | Düzeltildi | RUNBOOK §8.2: `RESTORE_ADMIN_URL` + `BACKUP_DATABASE_URL` (parolasız URL, PGPASSWORD/.pgpass) |
| Ö-3 `WORKER_URL`/`WORKER_TOKEN`/`K1_EMBEDDING_MAX_USD_PER_RUN` | .env örneğine eklendi | |
| Ö-4 `ensure_rls` / güncelleme sırası | K4 kararı: tetikleyici KURULMAZ | Güncellemede `ops.sh rls && ops.sh verify` zorunlu (RUNBOOK §6) |
| Ö-5 RELEASE_CHECKLIST 0a/2a atıfları | RUNBOOK §6'da eklendi | |
| D-1 sshd: parola ve root girişi | RUNBOOK §1: `PasswordAuthentication no`, `PermitRootLogin no` | |
| D-6 `ops.sh bootstrap`/`verify` | RUNBOOK §0 tablosuna eklendi | |
| ACME e-postası | `deploy/vps/Caddyfile`: `email info@nexagrant.com` | |
| ROADMAP M1 satırı | "çözüldü: 602 MB RSS" (`e46d9798`, TASK-MUMJ7W0GUI6N1) | "Kapandı" başlığına taşındı |

Lider kararları uygulandı: sahip rol `fabrika_owner` (süper kullanıcı değil, BYPASSRLS, CREATEROLE); `fabrika_jobs` (`JOBS_DATABASE_URL`, yalnız CREATE ON DATABASE, BYPASSRLS yok); `ensure_rls` tetikleyicisi yok; CORDIS panelden değil tek seferlik konteynerden; push `scripts/gate-isolated.sh` ile; merge YOK.

## Ek bulgular ve değişiklikler (FO-249'da yoktu)

1. **`prisma/rls-app-role.sql` default privileges döngüsü (kod değişikliği).** Döngü `fabrika` ve `fabrika_migrate` için `ALTER DEFAULT PRIVILEGES FOR ROLE` çalıştırıyordu. Sahip rol `fabrika_owner` bunu yapamaz ("permission denied to change default privileges"), VPS'te de `fabrika` süper kullanıcı olarak var. Düzeltme: döngü yalnız çağıranın üyesi olduğu roller için (`pg_has_role`), `fabrika_owner` listeye eklendi. Yerel geliştirmede (süper kullanıcı `fabrika`) davranış aynı.
2. **Guard regex'i (kod değişikliği, güvenlik).** `scripts/apply-rls.ts` ve `scripts/setup-rls-role.ts` yerel-DB kapısı `@postgres:` alt dizgisini kabul ediyordu. `postgresql://u:p@prod.example.invalid/db?x=@postgres:` gibi bir URL geçiyordu. Artık `new URL(...).hostname` ∈ {`localhost`, `127.0.0.1`, `postgres`} tam eşleşmesi; ayrıştırılamayan URL reddedilir (fail-closed). Doğrulandı: uzak URL reddedildi, yerel çalıştı. **Açık not:** bu, önceki regex'in gevşetilmesi değil, sıkılaştırılması; ama guard'ın birim testi yok (`tests/db-target.test.ts` başka bir çözücüyü test ediyor, 17/17 geçti).
3. **`scripts/setup-rls-role.ts` `.env` yazımı.** `DATABASE_URL_RLS_TEST` ortamda verilince betik worktree `.env` dosyasına yazmadı (doğrulandı). `ops.sh rls-role` bu değişkeni zorunlu kılar.

## Kanıt (gerçek koşum, yerel Mac, geçici konteyner `127.0.0.1:55432`, paylaşılan 5433 KULLANILMADI)

- `docker compose -f deploy/vps/docker-compose.prod.yml config --quiet` → geçerli (geçici dummy env, sonra silindi). `mem_limit` değerleri: caddy 128 MB, postgres 2 GB, web 1,5 GB, worker 1 GB.
- `bash -n deploy/vps/ops.sh` ve `backup-to-r2.sh` → sözdizimi temiz.
- Bootstrap (`deploy/vps/bootstrap-roles.sql`, stdin `\set`): başarılı.
  ```
  fabrika       | super=t bypassrls=t login=t createdb=t createrole=t
  fabrika_jobs  | super=f bypassrls=f login=t createdb=f createrole=f
  fabrika_owner | super=f bypassrls=t login=t createdb=f createrole=t   (db owner: fabrika_owner)
  vector extension: var
  ```
- `prisma db push` (sahip rol): "Your database is now in sync" (523 ms).
- `scripts/apply-rls.ts` (sahip rol): `prisma/rls.sql` uygulandı, politika 0 → 131.
- `scripts/setup-rls-role.ts` (sahip rol, düzeltmeden sonra): `fabrika_app` oluşturuldu, `super=f bypassrls=f`, giriş ve "Tenant" okuma kanıtlandı, `.env` yazılmadı.
- `apply-migrations.sh` (sahip rol, host psql): **61/61 dosya uygulandı.**
- `scripts/check-rls-live.ts --require-db` (uygulama rolü `fabrika_app`): **BAŞARISIZ** — aşağıda.
- `seed`: `grep SEED_DEMO prisma/seed.ts` → yok; `ops.sh seed` beklendiği gibi kapıda durur (FO-251).
- `.dockerignore` bağlam testi: çıktı `/ctx/.dockerignore`, `/ctx/Dockerfile`, `/ctx/app.txt`, `/ctx/deploy/vps/.env.prod.example` — `.env` ve `deploy/vps/.env.prod` YOK.
- `tests/db-target.test.ts`: 17/17 geçti.
- Temiz kapanış: geçici konteyner kaldırıldı (`docker ps -a` ile fo250 yok). Test imajı kaldırıldı; `alpine` imajına dokunulmadı.

## BLOKER — `verify` kapısı kırmızı (kapsam dışı, ayrı iş)

`ExpertFounderCounter`: migrasyon `id=1` satırını tohumluyor (`lastNumber` 0). `scripts/check-rls-live.ts` (satır ~1034) beklenen satır sayısını **uygulama rolünün** sistem kapsamı dışı sayımından (0) alıyor. Sistem kapsamı İÇİNDE gerçek 1 satır görülüyor → `❌ ExpertFounderCounter: sistem kapsamı İÇİNDE 1/0 satır görüldü`.

- Politika doğru: `system_scope|ALL|system_scope_open('"ExpertFounderCounter"')`; sistem kapsamı dışında 0 satır görünüyor.
- Hata ölçümde: beklenti, RLS'li bir tablonun gerçek satır sayısı yerine uygulama rolünün görünürlüğünden çıkıyor.
- Aynı hata canlıda da olur (migrasyon sonrası tohum her DB'de var). Yani `ops.sh verify` her kurulumda kırmızı kalır ve RUNBOOK §4 adım 7 gereği web açılmaz.
- Bu betik ve test kapsamı bu PR'da DEĞİŞTİRİLMEDİ. Düzeltme seçenekleri: (a) beklenen sayıyı sahip/BYPASSRLS bağlantıdan ölç; (b) tohum satırlarını beklenen sayı olarak kabul et. Öneri: (a), çünkü "politika doğru mu" sorusunu beklentiyi görünürlükten türetmeden cevaplar. Karar lidere ait.

## Push durumu (gerçek kanıt)

- Uzak dal `devop-fb/fo244-vps-deploy`: `407b6394` (PR #218 `headRefOid` aynı, draft, açık, merge YOK). Yerel head: `f1135d65` (kod `43803aba` + rapor commit'i) — **push henüz başarılı değil**.
- Deneme 1 (`bash scripts/gate-isolated.sh git push origin devop-fb/fo244-vps-deploy`): gate-lock başka bir çalışanın (`be-fb-fo245`) `gate:core` kilidini bekledi; 600 sn zaman aşımıyla sonlandırıldı. Push yapılmadı.
- Deneme 2: kilit alındı, `pnpm gate` koştu, **pre-push hook reddetti**: `PUSH_EXIT=1`, `error: failed to push some refs`. Kırmızı: 7 test dosyası (`team-management.live`, `expert-prereg-form`, `m17-interreg-extract` ×2 test, `rag-pdf-worker-isolation`, `service-busy-pool.live`, `api-error-body-guard`, `funnel.attack`). Koşum 358 sn, yoğun makine yükü altında (diğer gate'lerle paralel).
- İzole tekrar (aynı worktree, gate dışı): 5 dosya **geçti**; `m17-interreg-extract` 3/3 koşuda 36/36 geçti (gate altında "5000 ms / 3000 ms" zamanlama eşikleri aştı → yük kaynaklı). `service-busy-pool.live` `DATABASE_URL` ortamında olmadığı için atlanıyor / dosya düşüyor (ortam, kod değil).
- Deneme 3 (gate-isolated, yeni koşum): hook yine reddetti, `PUSH_EXIT=1`. Bu sefer kırmızı küme farklıydı: `expert-prereg.live` (founder number race, 3 test), `m17-interreg-extract` (2, zamanlama eşiği), `rag-pdf-worker-isolation` (1). 463 dosyadan 3 kırmızı, 5995 geçti. Kırmızı küme her koşuda değişiyor → yük kaynaklı kararsızlık. 3 deneme sonunda push yapılmadı; daha fazla deneme paylaşılan gate kilidini tüketir, durduruldu.
- Sonuç: kırmızılar bu dalın değişikliğiyle bağlantılı değil (dal yalnız `deploy/vps/**`, `.dockerignore`, `scripts/{apply-rls,setup-rls-role}.ts`, `prisma/rls-app-role.sql`, `docs/**`, `tests/db-target.test.ts` dokunur). Ama hook'u atlamadım (`--no-verify` YOK). Push, gate'in temiz koşumu ile yapılmalı; ya da lider kararıyla kapıdaki flaky testler ayrı kartta düzeltilmeli.

## Yapılmadı / sınırlar

- Linux sunucu ve Hostinger'a erişim YOK; canlı kurulum, sshd ayarları, swap, gerçek derleme ve yedek prova SUNUCUDA koşulmadı.
- Tam `docker compose build` (web/worker imajları) bu oturumda koşulmadı; önceki denemeler npm registry zaman aşımı nedeniyle düşmüştü (repo sorunu değil). `config` ve bağlam testi yapıldı.
- `seed` gerçek çalıştırılmadı (FO-251 bekleniyor).
- `ops.sh rls-role` ve `rls` yolu, yerel koşumda sahip rol bağlantısıyla doğrulandı; VPS'teki `worker` konteyneri içinde (compose ağı, `postgres` çözümü) koşulmadı.
- Lider talimatına göre: merge YOK, canlıya geçiş YOK.

## Açık sorular

1. `check-rls-live` sayım düzeltmesi (yukarıda (a)/(b)) — lider kararı; onsuz canlı `verify` geçmez.
2. Guard için birim testi eklensin mi (ayrı kart)?
3. FO-251 (`SEED_DEMO`) birleşmeden seed kapısı kapalı kalır — onaylı mı?

## Sonraki adım

- Lider: check-rls-live sayım düzeltmesi kararı; onaylanırsa aynı PR'da ya da ayrı kartta uygulanır.
- Sonra `ops.sh verify` yeşil koşumu tekrar edilir (geçici DB provaası betik olarak tekrarlanabilir).
- Canlıya geçiş: açık onay gerekir; onay gelmeden yapılmaz.

## Değişen dosyalar (kod commit'i `43803aba`)

`.dockerignore` · `deploy/vps/.env.prod.example` · `deploy/vps/Caddyfile` · `deploy/vps/RUNBOOK.md` · `deploy/vps/backup-to-r2.sh` · `deploy/vps/bootstrap-roles.sql` (yeni) · `deploy/vps/docker-compose.prod.yml` · `deploy/vps/ops.sh` · `docs/ROADMAP.md` · `prisma/rls-app-role.sql` · `scripts/apply-rls.ts` · `scripts/setup-rls-role.ts`

**Yeni karar gerekli (lider):** (1) gate kararsızlığı için ayrı kart (yük altında zamanlama eşikleri ve live DB yarışı testleri), (2) `check-rls-live` sayım düzeltmesi (yukarıdaki BLOKER), (3) push'un hangi koşumla yapılacağı. Push tamamlanınca yeni head SHA bu rapora eklenecek.

DONE/FAIL: `FAIL:st1` — düzeltmeler commit'li ama (a) uzak dala PUSH EDİLMEDİ (pre-push gate 3 denemede kırmızı, PR #218 head hâlâ `407b6394`), (b) zorunlu `verify` kapısı kapsam dışı ölçüm hatası yüzünden kırmızı (BLOKER).
