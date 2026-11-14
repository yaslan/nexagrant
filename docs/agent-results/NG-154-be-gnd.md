# NG-154 — rls_auto_enable() PUBLIC EXECUTE kapatıldı (CI/yerel kopya)

- **Hüküm:** DÜZELTİLDİ ve izole DB'de doğrulandı. Ortak DB (5433) kendiliğinden düzelmez: patronun betiği / sonraki `pnpm db:setup` gerekir (henüz KOŞULMADI, ortak DB'ye yazmadım).
- **Tip:** bug (güvenlik/RLS, yerel+CI)
- **Platform:** macOS (Darwin) üzerinde doğrulandı; SQL platformdan bağımsız, Linux CI aynı `scripts/db-setup.sh` yolunu kullanır. Linux/Windows'ta koşulamadı (makine yok).
- **Dal:** `task/ng-154` (dev 74f48161 üstüne fast-forward); push/PR yok.

## Ne yapıldı
`.github/ci/supabase-ensure-rls.sql`: CREATE FUNCTION'dan sonra `REVOKE ALL ... FROM PUBLIC` + (anon/authenticated varsa) DO bloğuyla onlardan REVOKE; neden yorumu eklendi. `tests/rls-coverage.test.ts`: dosya içeriği pin'i. Canlıya giden dosyaya dokunulmadı.

## Kanıt
RED (anon+authenticated rolleri önceden oluşturulmuş izole DB, db:setup exit 0):
```
$ pnpm rls:verify --require-db   (exit=1)
❌ KİRACI İZOLASYONU EKSİK ...
   ... rls_auto_enable() → anon, rls_auto_enable() → authenticated
$ select proacl from pg_proc where proname='rls_auto_enable'
{=X/fabrika,fabrika=X/fabrika}
```
GREEN (aynı DB, düzeltmeyle):
```
$ pnpm db:setup  → exit 0   (1. koşu)
$ pnpm db:setup  → exit 0   (2. koşu)
$ pnpm rls:verify --require-db → exit 0
✅ 67 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü ...
$ select proacl ...   →  {fabrika=X/fabrika}
$ create table public.ng154_probe(id int); select relrowsecurity ...  →  t   (tetikleyici hâlâ RLS açıyor)
```
Rolsüz boş DB (ayrı container, anon/authenticated yok): db:setup 2x exit 0, rls:verify exit 0.
Regresyon pini: düzeltme kaldırılınca `tests/rls-coverage.test.ts` → 1 failed | 36 passed; düzeltmeyle 37 passed.
lint exit 0 (4 uyarı, hata 0), typecheck exit 0.
`pnpm test` (süre duvarlı, izole DB env'i): 539 dosya geçti, 13 test düştü — hepsi `tests/invitation-mail-limit.live.test.ts` (`emailSent:false`, SMTP/mailpit ortamı yok). Dokunduğum dosyalarla ilgisiz; SMTP env'iyle yeniden denemede dosya atlandı, bu yüzden "yeşil" demiyorum. Tam kapı için `pnpm gate` (mailpit'li) gerekir.

## Gotcha
`rls:verify` rolsüz DB'de `DATABASE_URL_RLS_TEST` yoksa .env'deki eski URL'yi okuyup "invalid snapshot identifier" verir (başka DB'nin URL'si). İzole koşuda env'e açık ver.

## Değişen dosyalar
`.github/ci/supabase-ensure-rls.sql`, `tests/rls-coverage.test.ts`, bu rapor. Patron betiği (repo dışı): `/Users/macbook/alan/yedekler/ng-fix-rls-auto-enable.sh` (yedek → db:setup → rls:verify; sonda `tail -15` + `exit=`; `bash -n` OK, KOŞULMADI).

## Riskler / Açık sorular
Betik FONBRIDGE/.env'i kaynak alır ve worktree'de koşar; worktree silinirse yol değişmeli. dev'e birleştirme lider onayında.
