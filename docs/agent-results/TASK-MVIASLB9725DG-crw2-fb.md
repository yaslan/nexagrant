---
sözleşme: 3
görev: TASK-MVIASLB9725DG
kod: FO-114
ajan: crw2-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti, incelemeye hazır: koruma, testler ve belge 674d6f91'de; dal tam pre-push gate'i yeşil geçerek push edildi (6. deneme, --no-verify yok) ve dev'e PR #145 açıldı (merge edilmedi): https://github.com/yaslan/fonbridge/pull/145
platform: mac (Darwin 27, git 2.54.0) üzerinde doğrulandı. Kanca ve yardımcı betik POSIX sh; Linux'ta aynı çalışır (CI ubuntu). Windows: Git-for-Windows sh'si ile çalışır; `tests/core-bare-guard.test.ts` `sh` ve chmod'lu stub kullanır, Git-bash PATH'te değilse ENOENT verir (FO-111 testindeki Ö3 ile aynı sınır) — Windows'ta koşulamadı, makine yok.
sürüm: 2
tarih: 2026-10-21T20:45:00.000Z
---

# FO-114 · core.bare=true koruması (kancalar + regresyon testi + belge)

## Ne yapıldı
Dal: `crw2-fb/fo114-core-bare-guard` (origin/dev edda63cc üstünde), worktree `.claude/worktrees/fo114-core-bare-guard`, commit **674d6f91**. FO-111'in `unset GIT_DIR…` düzeltmesi tekrar edilmedi.

- **(a) Kanca koruması:** `scripts/git-core-bare.sh` (`core_bare_guard`, `scripts/db-target.sh` gibi source edilir). `githooks/pre-commit` başında, `githooks/pre-push` ise unset'ten sonra **ve gate'ten sonra** bakıyor. Gate sonrası kontrol bilinçli bir ek: FO-114'te ayarı gate'in kendisi çevirdi, gate yeşil olsa bile ana checkout bozulduysa push durur. Kanca ayarı kendisi düzeltmez; kontrol ve düzeltme komutunu `--file <ortak-dir>/config` ile yazdırır.
- **(b) Ö2 regresyon testi:** `tests/tenant-bypass-scan.test.ts`'e yeni test eklendi: tuzak repoya `git worktree add` yapılıyor, `GIT_DIR=<tuzak>/.git/worktrees/wt` veriliyor, `fixtureRepo` çalışıyor ve tuzağın `core.bare` değeri `false` kalmalı. Kanca testleri ayrı dosyada (`tests/core-bare-guard.test.ts`, 4 test). Kancalar geçici bir repoda gerçek `git commit` ve gerçek `sh githooks/pre-push` ile koşuyor; pnpm stub.
- **(c) Belge:** `docs/RELEASE_CHECKLIST.md` §9.1 (belirti → kontrol → düzeltme + "GIT_DIR set iken başka dizinde git init/config koşma" kuralı + "FO-111'siz daldan push etme" notu). `CLAUDE.md` "Worktree'de gate" altında tek satırlık işaret var.
- **(d)** `eslint.config.mjs` → `.claude-fo49/**`. `vitest.config.mts`'e de aynısı eklendi, çünkü ESLint yorumu "Mirrors the exclusions in vitest.config.mts" diyor ve dev'de vitest'te de bu hariç tutma yoktu. Küçük bir kapsam genişlemesi, bilerek yapıldı.

## Kök neden (bugünkü tekrar)
- 22:17:59'da ana checkout `core.bare=true`, `.git/config` mtime **22:14:34**; ortamda `GIT_DIR` yok.
- Oturum kayıtları (`~/.claude/projects/-Users-macbook-alan-FONBRIDGE/*.jsonl`, yalnız okuma): `dc835266` oturumu **19:13:28Z**'de `git push -u origin be-fb/fo112-keep-eu-sync` koşmuş, 19:15:43Z'de `a7ce5d4c in HEAD?` kontrolü yapıp rebase etmiş. Yani FO-111'i içermeyen bir dal, linked worktree'den push edilmiş → gate'te `tenant-bypass-scan` fixture'ı `git init` → bare. 19:14:34Z'deki mtime aynı dakikadaki bir `git worktree add -b` (34781fd3) ile de örtüşüyor. O komut config'i yeniden yazar ama bare'i kendisi koymaz. Kesin yazar tek komuta kadar kanıtlanamadı; en güçlü aday fo112 push'u.
- Ders: PR #130 dev'de olsa bile eski dallar rebase olmadan push ederse tekrar eder. Bu kartın koruması tam bu durumu yakalar.

## Kanıt (ham çıktı)
Kopya repo, kök nedenin yeniden üretilmesi + gerçek commit (`scratchpad/probe2.sh`):
```
$ (fixture) GIT_DIR=<main>/.git/worktrees/wt git init   # the leak
$ git config --get core.bare   -> true
$ git status   (main checkout)
fatal: this operation must be run in a work tree
$ git commit   (linked worktree)
✗ pre-commit: paylaşılan git yapılandırmasında core.bare=true (…/p2/main/.git/config).
  Ana checkout bu durumda çalışmaz ("must be run in a work tree"); bu kanca devam etmiyor.
  Kontrol:   git config --file "…/p2/main/.git/config" --get core.bare
  Düzeltme:  git config --file "…/p2/main/.git/config" core.bare false
  …
exit=1
$ git config --get core.bare   -> true   (hook did not repair it)
$ git config core.bare false
commit exit=0
```
Ana checkout'un `GIT_DIR`'i (`.git`) ile aynı `git init` → `core.bare=false` (tahmin yalnız worktree gitdir'inde bare'e kayıyor). `core.bare=true` iken ana checkout'ta `git commit` kancaya ulaşmadan ölüyor. Koruma, sessiz yayılmanın olduğu linked worktree'lerde devreye giriyor.

Ö2 testinin bitirici olduğu, `gitEnvFor` geçici olarak bozularak gösterildi (sonra geri alındı, `git diff` boş):
```
FAIL … a worktree GIT_DIR does not turn the decoy into a bare repository
AssertionError: expected 'true' to be 'false'
```
Düzeltilmiş kodla: `tests/core-bare-guard.test.ts` + `tenant-bypass-scan` + `pre-push-hook` → **51 passed (51)**. Yeni kancanın kendisi 674d6f91 commit'inde koştu (`✓ Kapı temiz`). `pnpm lint` 0 hata (4 eski uyarı), `pnpm typecheck` temiz. ESLint `.claude-fo49/x.ts` → "File ignored because of a matching ignore pattern".

Ana checkout şu an:
```
$ git -C /Users/macbook/alan/FONBRIDGE config --get core.bare
false
$ git status -sb
## feat/partner-search-interreg
```

## Push / gate (BLOKE)
İzole DB: `crw2-fo114-pg` (127.0.0.1:5614), `.env` worktree'de. `git push` 4 kez denendi, `--no-verify` kullanılmadı. Her seferinde ~4990 testten 1–4'ü kırmızı ve her seferinde FARKLI testler:
| deneme | kırmızı |
|---|---|
| 1 | expert-prereg-form.test.tsx (30 sn timeout) |
| 2 | expert-prereg-form.test.tsx ×2 |
| 3 | expert-prereg.live.test.ts (pg-pool "timeout exceeded when trying to connect") |
| 4 | expert-prereg-form ×2, rag-pdf-worker-isolation, api-error-body-guard |

Load average 23–25. Kırmızı dosyaların yedisi birlikte tek başına koşunca **120 passed (120)**. Diff `src/`'ye ve bu testlere dokunmuyor. Bu koşularda ana checkout `core.bare` her seferinde `false` kaldı; yeni gate sonrası kontrol tetiklenmedi.

### Push sonucu (ikinci tur, 21.10 23:09–23:43)
- **Deneme 5** (load başta ~7, koşu sırasında 31'e çıktı): 3 kırmızı. `expert-prereg-form.test.tsx` ×2 (30 sn timeout) ve `rag-pdf-worker-isolation.test.ts` "128 MB-inflating stream … fast" (`expected 3602 to be less than 3000`). İkisi tek başına koşunca: **44 passed (44)**. Yük kaynaklı, test gevşetilmedi.
- 1-dk load 8'in altına inene kadar beklendi (23:29, load 6.92).
- **Deneme 6:** tam gate yeşil. `Test Files 368 passed | 7 skipped (375)`, `Tests 4872 passed | 120 skipped (4992)`; e2e `380 passed (12.4m)`; `alerts:check` "Öksüz alarm yok"; gate sonrası `core_bare_guard` geçti. Push çıktısı: `* [new branch] crw2-fb/fo114-core-bare-guard -> crw2-fb/fo114-core-bare-guard`.
- **PR:** https://github.com/yaslan/fonbridge/pull/145 (base `dev`, merge edilmedi). Dal, dev'in iki yeni docs merge'ünün (#141, #142) gerisinde; dosya çakışması yok, rebase yapılmadı.
- Ana checkout `git config --get core.bare` → `false` (push sonrası).
- İzole DB `crw2-fo114-pg` kaldırıldı (`docker rm -f`).

## Değişen dosyalar
`githooks/pre-commit`, `githooks/pre-push`, `scripts/git-core-bare.sh` (yeni), `tests/core-bare-guard.test.ts` (yeni), `tests/tenant-bypass-scan.test.ts`, `eslint.config.mjs`, `vitest.config.mts`, `docs/RELEASE_CHECKLIST.md`, `CLAUDE.md`.

## Riskler
- Ana checkout'un kendi kancası, o checkout'un dalındaki eski `githooks/`'tan gelir. Koruma ancak dallar dev'i aldıkça yayılır.
- `core-bare-guard` testi gerçek repo config'ine değil geçici repoya bakar. `pre-push-hook.test.ts` ise ROOT'ta koşar: makinede `core.bare=true` iken o test (doğru biçimde) kırmızı olur.
- Windows: yukarıdaki platform satırına bakın.

## Açık noktalar / koordinasyon
- **Kart ↔ görev metni çelişkisi:** Kart sonuç dosyası olarak `…-devop-fb.md` diyor, delegasyon `…-crw2-fb.md` diyor. Delegasyondaki yol kullanıldı.
- FO-111 kartına yorum gerekmedi: aynı dosyada çifte düzeltme yok, unset satırına dokunulmadı.
- GitHub Actions dev'de "failure" görünüyor, ama nedeni testler değil: job "recent account payments have failed or your spending limit needs to be increased" yüzünden hiç başlamıyor (run 39659796275). Bu, patronun faturalama ayarı.

## Sonraki adım
PR #145'i CRW-FB incelesin, sonra lider merge etsin. Merge'den sonra ana checkout ve açık dallar dev'i alınca koruma yayılır. Worktree `.claude/worktrees/fo114-core-bare-guard`, merge'den sonra silinebilir.
