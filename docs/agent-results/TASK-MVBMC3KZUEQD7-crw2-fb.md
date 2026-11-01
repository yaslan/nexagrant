# TASK-MVBMC3KZUEQD7 (FO-27) — PR #79 inceleme (crw2-fb)

**PR:** https://github.com/yaslan/fonbridge/pull/79 · base `dev` @7f8d3de4 · head `devop-fb/fo27-e2e-origin` @62e222f6 (tek commit)
**Hüküm: DÜZELTME GEREKLİ** — tek bloke eden: `CLAUDE.md` güncel `dev` ile içerik çakışması veriyor (rebase gerekiyor, çözümü önemsiz). Kodda hata yok; kilit gerçek çakışmayı ölçülebilir biçimde çözüyor. Merge edilmedi, approve verilmedi.

## Ne yapıldı
Diff satır satır okundu (5 dosya, yalnız test + CLAUDE.md; ürün kodu yok). PR head worktree'sinde (`.claude/worktrees/fo27-e2e-origin`, temiz) canlı koşular yapıldı: grep, iki eşzamanlı owner-chain koşusu (kilitli ve kilitsiz), advisory lock kapsam ölçümü, iki e2e spec farklı portta, typecheck, `git merge-tree` ile dev çakışma kontrolü.

## Bulgular (önem sırasıyla)

### B-1 (BLOKE EDİCİ) — `CLAUDE.md` dev ile çakışıyor
- `git merge-tree --write-tree origin/dev 62e222f6` → `CONFLICT (content): Merge conflict in CLAUDE.md`, exit=1.
- Sebep: dev'e `67dabd39 fix(devop): FO-7 align CLAUDE gate line` girdi; `pnpm gate` satırını `db:generate + lint + … + db:rls-role + e2e + alerts:check` diye değiştirdi. PR aynı satırın hemen altına iki yorum satırı ekliyor, bitişik hunk → çakışma.
- **Düzeltme:** `dev` üzerine rebase; çözümde dev'in `pnpm gate` satırı + PR'ın `pnpm test:e2e` satırı ve iki `# Ayni Postgres'te…` satırı birlikte kalsın. Diğer 4 dosya dev'de değişmemiş (çakışma yok); dev'in 15 yeni commit'i (#69/#73/#76/#78 dahil) bu dosyalara dokunmuyor.

### Ö-1 (öneri, aynı rebase'de yapılması önerilir) — Kilit DB-kapsamlı; belge "aynı Postgres" diyor
- `pg_advisory_lock` anahtarı veritabanına bağlıdır. Ölçüm (aynı anahtar, ilk oturum `fabrika`'da kilidi tutarken):
  ```
  same db, try_lock: f
  db=postgres, try_lock: t
  ```
- Test kilidi `admin` oturumunda, yani `DATABASE_URL`'in veritabanında alıyor (`tests/migration-owner-chain.live.test.ts:126,142`). İki worktree aynı küme ama **farklı** veritabanı kullanırsa (ör. `…:5433/fabrika` ve `…:5433/fabrika_wt2`) kilit birbirini görmez; ama `apply-migrations.sh` stored-default kontrolü `pg_db_role_setting` üzerinden **küme genelinde** çalıştığı için çakışma yine olur. Bugün tüm worktree'ler `localhost:5433/fabrika` kullandığı için PR pratikte çalışıyor (devop-fb de bunu not etmiş), ama `CLAUDE.md` ("Ayni Postgres'te iki gate … sira bekler") ve `tests/helpers/test-db-lock.ts:47-53` yorumu ("two gates sharing one Postgres") küme genelinde bir garanti varmış gibi okunuyor.
- **Düzeltme (küçük):** kilidi sabit bir veritabanına (`postgres`) açılan ayrı bir oturumda al, ya da metni "aynı DATABASE_URL veritabanında" diye daralt. Önerim birincisi: zaten süperkullanıcı gerekiyor, `urlFor(ADMIN_URL, 'postgres')` ile tek bağlantı yeterli; afterAll'da `end()`.

### Ö-2 (öneri, bloke etmez) — Bekleme bütçesi aşılırsa afterAll da bekler
- `beforeAll` bütçesi `2 * LONG` = 480 s; ölçülen dosya süresi ~52 s → sırada ~8 bekleyen koşu olabilir, yeterli.
- Kenar durum: 480 s aşılırsa vitest hook'u düşürür ama `pg_advisory_lock` sorgusu `admin` istemcisinde bekler; afterAll'daki `DROP DATABASE` sorguları pg istemci kuyruğunda onun arkasına girer → afterAll da `LONG` kadar bekleyip zaman aşımına uğrar. Kilit yine bırakılır, çünkü süreç bitince bağlantı kapanır; sızıntı yok, yalnız gereksiz 4 dk. İstenirse `SET lock_timeout`, ya da `pg_try_advisory_lock` + yoklama döngüsü. Bloke etmez.

### Ö-3 (öneri, kapsam dışı) — DRY
- `signInAs` / `signInAndOpenPartB` çerez yazımını `tests/e2e/fixtures/session.ts` zaten origin'den yapıyor; iki spec ileride bu fixture'a taşınabilir. Bu PR'ın kapsamı değil.

## Odak maddeleri

| # | Soru | Sonuç |
|---|---|---|
| 1 | Çerez url'i `baseURL` fixture'ından mı; `grep -rn "localhost:3000" tests/e2e` boş mu | ✅ İki spec `url: baseURL` (fixture, `playwright.config.ts:72` `use.baseURL`). grep boş (exit=1). `baseURL!` güvenli: config her zaman set ediyor. |
| 2 | Advisory lock her yolda bırakılıyor mu, bekleme makul mü, asıl kontrol zayıfladı mı | ✅ Bırakılıyor: kilit `admin` oturumunda; afterAll `admin.end()` kilidi düşürür; beforeAll/afterAll hatasında ya da süreç ölünce bağlantı kapanır → kilit düşer. Erken skip yolları kilidi hiç almıyor. Bekleme makul (Ö-2). Hiçbir assertion değişmedi; yalnız beforeAll'a kilit + timeout ×2 eklendi → kontrol zayıflamadı. ⚠ Kapsam DB düzeyinde (Ö-1). |
| 3 | CLAUDE.md eklemesi doğru mu | ⚠ İçerik büyük ölçüde doğru (E2E_PORT/E2E_BASE_URL, ~30 sn bekleme; ölçülen bekleme ~27 sn). "Ayni Postgres" ifadesi fazla geniş (Ö-1). Dev ile çakışıyor (B-1). |
| 4 | Güncel dev ile çakışma | ❌ `CLAUDE.md` çakışıyor (B-1); diğer dosyalar temiz. |

## Kanıt (ham çıktı)

```
$ git rev-parse origin/devop-fb/fo27-e2e-origin origin/dev
62e222f611d076ef611db99b59625e64a7856769
7f8d3de4110363a5b3930a7d097f0c4e87e1da68
$ git rev-list --count 62e222f6..origin/dev
15
$ git merge-tree --write-tree --name-only origin/dev 62e222f6
017651dadc1e72d3b7f5b992d29a543dfef586e9
CLAUDE.md
Auto-merging CLAUDE.md
CONFLICT (content): Merge conflict in CLAUDE.md
exit=1

$ grep -rn "localhost:3000" tests/e2e ; echo grep-exit=$?
grep-exit=1
```

**Kilitli suite, iki eşzamanlı koşu (B 4 sn sonra başladı), localhost:5433/fabrika:**
```
== A  Tests  12 passed | 5 skipped (17)   Duration  51.79s
== B  Tests  12 passed | 5 skipped (17)   Duration  79.26s   (≈27 s kilit bekledi)
```
**Aynı dosya kilit satırı silinmiş geçici kopya (`tests/zz-crw2-nolock.live.test.ts`, koşudan sonra silindi; worktree temiz), iki eşzamanlı koşu:**
```
== A
     × after db:rls, the FORCE-RLS backfills update as many rows as under the superuser 7960ms
AssertionError: apply-migrations: app.system_scope has a stored default (fb_owner_chain_mvc543789e40dc/*); every new session, fabrika_app's included, would skip tenant isolation.
      Tests  1 failed | 11 passed | 5 skipped (17)
== B
      Tests  12 passed | 5 skipped (17)
```
→ Çakışma gerçek ve kilit onu gideriyor (5 skip, `DATABASE_URL_RLS_TEST` isteyen testler; iki koşuda da aynı, PR'dan bağımsız).

**Advisory lock kapsamı:** yukarıda Ö-1 (`same db: f`, `db=postgres: t`).

**E2E, standart olmayan port (`E2E_PORT=3197`; 3100 başka bir süreçte dinliyordu):**
```
  ✓  1 identity-strings.spec.ts:127 › the workspace switcher offers no organisation the session is not in
  ✓  2 identity-strings.spec.ts:155 › the login page headlines the demo seat, not a person
  ✓  3 identity-strings.spec.ts:175 › the login page in English shows the same seats, translated
  ✓  4 identity-strings.spec.ts:194 › the admin editor opens a new post signed by the admin who is signed in
  ✓  5 identity-strings.spec.ts:223 › the public blog carries no byline nobody wrote
  ✓  6 partb-template-identity.spec.ts:185 › tr: no invented author, organisation or prose reaches the screen
  ✓  7 partb-template-identity.spec.ts:185 › en: no invented author, organisation or prose reaches the screen
  7 passed (16.5s)   exit=0
```
Not: çerezler porta göre ayrışmadığı için (RFC 6265) port değişikliği eski sabit `localhost:3000` hatasını da geçirirdi; düzeltmenin asıl sınaması host değişikliğidir (`E2E_BASE_URL=http://127.0.0.1:…`). Kod düzeyinde değişiklik doğrudan `use.baseURL`'e bağlı olduğu için doğru.

**Typecheck:** `npx tsc --noEmit -p .` çıktısında değişen 4 TS dosyası için hata yok.

**CI:** PR'ın `build-and-test` koşusu (run 39015569472) hiç başlamadı: "The job was not started because recent account payments have failed or your spending limit needs to be increased". Kod hatası değil; dev'in son 3 koşusu da aynı durumda. CI kanıtı yok, doğrulama yukarıdaki yerel koşulara dayanıyor.

## Değişen dosyalar
Yalnız bu rapor: `docs/agent-results/TASK-MVBMC3KZUEQD7-crw2-fb.md`. PR worktree'sine dokunulmadı (geçici test kopyası silindi, `git status` temiz).

## Riskler
- B-1 çözülmeden merge edilemez.
- Ö-1: ileride bir worktree ayrı veritabanına geçerse paralel gate kırmızısı sessizce geri gelir.
- devop-fb raporu `docs/agent-results/TASK-MVBMC3KZUEQD7-devop-fb.md` ana checkout'ta ve herhangi bir dalda bulunamadı (`git log --all` boş); inceleme kartın ve PR'ın kendisine dayandı.

## Açık sorular
- Yok. Ö-1 için kilidin `postgres` DB'sine taşınmasını öneriyorum (seçtim, değiştirilebilir).

## Sonraki adım
devop-fb: `dev` üzerine rebase et, CLAUDE.md'yi B-1'deki gibi çöz; aynı commit'te Ö-1'i uygula (ya da metni daralt) → kısa yeniden inceleme.

**Platform beyanı:** mac'te doğrulandı (Darwin 27, Postgres localhost:5433, Chromium/Playwright). Değişiklik platformdan bağımsız: çerez origin'i config'ten geliyor; advisory lock Postgres sunucusunda çalışıyor, istemci OS'undan etkilenmiyor. Windows/Linux'ta koşulmadı; buna gerek görülmedi çünkü kod yolunda süreç, dosya yolu ya da kabuk farkı yok. Owner-chain suite zaten `bash` + `psql` istiyor ve bu PR öncesinden beri öyle.
