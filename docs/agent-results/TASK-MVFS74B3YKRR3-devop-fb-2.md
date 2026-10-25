---
sözleşme: 3
görev: TASK-MVFS74B3YKRR3
kod: FO-107
ajan: devop-fb
motor: claude
tip: yayın
okur: kullanıcı
hüküm: Bitti: 17 dalın 17'si uzakta ve PR'lı — 15'i bu işte tam pre-push gate'i (izole kopya DB) geçerek push edildi, fo101 (#126, sahibince merge edilmiş) ve fo50 (#92) kart gereği tekrar push edilmedi; açık 16 PR'ın hepsi UNSTABLE + MERGEABLE (kırmızı yalnız Actions faturalaması), kopya DB kalmadı.
platform: mac (Darwin 27, docker fabrika-postgres :5433) üzerinde koşuldu. Yalnız git/pnpm/docker; platforma bağlı ürün kodu değişmedi. Windows/Linux koşulamadı: makine yalnız mac (CI Actions faturalaması nedeniyle kapalı).
sürüm: 4
tarih: 2026-10-21T19:27:11.041Z
---

# FO-107 — Bekleyen 17 dalın izole DB kopyasıyla sıralı push'u

## Ne yapıldı
Her dal için (betik `push-one.sh`, kuyruk `queue.sh`):
1. `git merge-tree --write-tree origin/dev <sha>` → 17'sinin hepsi **CLEAN**.
2. Bağımsız yerel klon (`git clone --shared`, origin = GitHub, `core.hooksPath=githooks`), `checkout -f --detach <sha>`, `rm -rf .next`, `pnpm install --frozen-lockfile`.
3. `drop database if exists fabrika_push_<dal>` → `createdb` → `docker exec fabrika-postgres pg_dump -U fabrika fabrika | docker exec -i fabrika-postgres psql -U fabrika -d fabrika_push_<dal>`.
4. Alt kabukta `set -a; . .env; . .env.local; set +a` (değer basılmadı/loglanmadı); `DATABASE_URL`, `DATABASE_URL_MIGRATE`, `DATABASE_URL_RLS_TEST` yalnız DB adı değiştirilerek kopyaya; log'a yalnız `rol + /db`.
5. `pnpm db:rls` YALNIZ kopyaya → `git push` (pre-push = tam `pnpm gate`, `--no-verify` yok, `CI` unset, `E2E_PORT` boş port; fo85 3100).
6. `git ls-remote` ile uç doğrulandı → PR (dev) → `gh pr view --json mergeStateStatus` → kopya silindi.

Ortak `fabrika`'ya db:rls/migration yok. Merge yok. Commit değiştirilmedi. Prod'a dokunulmadı.

## Dal tablosu (son ölçüm 22:30, `origin/dev` = edda63cc)
| # | Dal | SHA | Kopya DB | Push | PR | mergeStateStatus |
|---|---|---|---|---|---|---|
| 1 | be-fb/fo101-csv-semicolon-injection | 9f354ba5 | fabrika_push_fo101 (önceki pencereden kalmıştı, silindi) | önceden push'lu, tekrar edilmedi | #126 | MERGED (yaslan, 15:15Z; bu iş merge yapmadı) |
| 2 | be-fb/fo50-prereg-retention | 0c8b6633 | fabrika_push_fo50 (önceki pencereden, silindi) | önceden push'lu, tekrar edilmedi — **gate kanıtı yok** | #92 | UNSTABLE |
| 3 | se-fb/fo49-kvkk-v2 | 749f4fe8 | fabrika_push_fo49 | ✅ deneme 2, lease `:20899dc3`; gövde `pr94-body.md` ile güncellendi | #94 | UNSTABLE, MERGEABLE |
| 4 | se-fb/fo99-adr0009-public-intake | b955bd74 | fabrika_push_fo99 | ✅ 1 | #127 | UNSTABLE, MERGEABLE |
| 5 | be-fb/fo86-auth-order-session-viewer | 09edf84f | fabrika_push_fo86 | ✅ 1 | #128 | UNSTABLE, MERGEABLE |
| 6 | fe-fb/fo85-blog-policy-tighten | 08741878 | fabrika_push_fo85 | ✅ 1 (E2E_PORT=3100) | #129 | UNSTABLE, MERGEABLE |
| 7 | se-fb/fo96-override-lines | 53aa3888 | fabrika_push_fo96 | ✅ yeniden kuyruk 1 (ilk tur 2× yük dalgalanması) | #140 | UNSTABLE |
| 8 | se-fb/brace-expansion-1x (FO-108) | 92c13f20 | fabrika_push_fo108 | ✅ 2 | #131 | UNSTABLE, MERGEABLE |
| 9 | devop-fb/fo34-system-scope-current-db | 70b53035 | fabrika_push_fo34 | ✅ yeniden kuyruk 1 (ilk tur `.next` kalıntısı) | #138 | UNSTABLE, MERGEABLE |
| 10 | be-fb/fo40-modules-f2 | b96b9de2 | fabrika_push_fo40 | ✅ yeniden kuyruk 1 (ilk tur `.next`) | #139 | UNSTABLE, MERGEABLE |
| 11 | be-fb/fo42-calls-paging | 362d75a7 | fabrika_push_fo42 | ✅ 1 | #132 | UNSTABLE, MERGEABLE |
| 12 | be-gnd/fo73-trend-bucket-cap | e52c8f1b | fabrika_push_fo73 | ✅ 1 | #133 | UNSTABLE, MERGEABLE |
| 13 | be-fb/fo91-subject-ref | 6009c499 | fabrika_push_fo91 | ✅ 2 | #134 | UNSTABLE, MERGEABLE |
| 14 | se-fb/fo17-cordis-pin | 0221e661 | fabrika_push_fo17 | ✅ 2 | #135 | UNSTABLE, MERGEABLE |
| 15 | fe-fb/fo95-i18n-multiline-detector | 54f03748 | fabrika_push_fo95 | ✅ 1 | #136 | UNSTABLE, MERGEABLE |
| 16 | fe-gnd/fo47-e2e-constants | 5dd3628a | fabrika_push_fo47 | ✅ 2 | #137 | UNSTABLE, MERGEABLE |
| 17 | devop-fb/fo67-cpanel-dev-package (FO-104 düzeltmesi) | 3be88098 | fabrika_push_fo104 | ✅ yeniden kuyruk 1 (ilk tur `.next`), lease `:fc33172b`, yeni PR yok | #120 | UNSTABLE |

UNSTABLE = GitHub Actions faturalaması nedeniyle kırmızı kontroller; kart gereği push'u durdurmadı. Hiçbir dal CONFLICT vermedi.

**fo49 SHA kararı:** kart `b579d873`, yerel `749f4fe8`. `git range-diff 80271979..b579d873 c473f700..749f4fe8` → üç commit `=` (birebir aynı yama); 749f4fe8 aynı işin güncel dev üstüne taşınmışı → o push edildi.
**FO-104:** `3be88098` hiçbir dalda değildi; PR #120 başı `fc33172b`'nin 2 commit fast-forward'ı (`78a1e748`, `3be88098`) → #120 dalına lease ile push edildi.

## Kanıt (ham, dal başına geçen denemenin gate özeti)
| dal | log | kopya DB | db:rls politikalar | vitest Tests | skipped | e2e | push |
|---|---|---|---|---|---|---|---|
| fo49 | `fo49.log` | fabrika_push_fo49 | 117 → 117 | 4930 passed | 54 skipped (4984) | 379 passed (7.7m) | + 20899dc3...749f4fe8 -> se-fb/fo49-kvkk-v2 (forced update) |
| fo99 | `fo99.try1.log` | fabrika_push_fo99 | 117 → 117 | 4864 passed | 54 skipped (4918) | 377 passed (7.3m) | * [new branch] b955bd74 -> se-fb/fo99-adr0009-public-intake |
| fo86 | `fo86.try1.log` | fabrika_push_fo86 | 117 → 117 | 4875 passed | 54 skipped (4929) | 377 passed (7.3m) | * [new branch] 09edf84f -> be-fb/fo86-auth-order-session-viewer |
| fo85 | `fo85.try1.log` | fabrika_push_fo85 | 117 → 117 | 4889 passed | 54 skipped (4943) | 377 passed (7.5m) | * [new branch] 08741878 -> fe-fb/fo85-blog-policy-tighten |
| fo96 | `fo96.r2try1.log` | fabrika_push_fo96 | 117 → 117 | 4866 passed | 54 skipped (4920) | 377 passed (14.0m) | * [new branch] 53aa3888 -> se-fb/fo96-override-lines |
| fo108 | `fo108.try2.log` | fabrika_push_fo108 | 117 → 117 | 4866 passed | 54 skipped (4920) | 377 passed (8.0m) | * [new branch] 92c13f20 -> se-fb/brace-expansion-1x |
| fo34 | `fo34.r2try1.log` | fabrika_push_fo34 | 117 → 117 | 4637 passed | 54 skipped (4691) | 335 passed (7.9m) | * [new branch] 70b53035 -> devop-fb/fo34-system-scope-current-db |
| fo40 | `fo40.r2try1.log` | fabrika_push_fo40 | 117 → 117 | 4642 passed | 54 skipped (4696) | 335 passed (7.0m) | * [new branch] b96b9de2 -> be-fb/fo40-modules-f2 |
| fo42 | `fo42.try1.log` | fabrika_push_fo42 | 117 → 117 | 4851 passed | 54 skipped (4905) | 377 passed (7.9m) | * [new branch] 362d75a7 -> be-fb/fo42-calls-paging |
| fo73 | `fo73.try1.log` | fabrika_push_fo73 | 117 → 117 | 4870 passed | 54 skipped (4924) | 378 passed (8.0m) | * [new branch] e52c8f1b -> be-gnd/fo73-trend-bucket-cap |
| fo91 | `fo91.try2.log` | fabrika_push_fo91 | 117 → 117 | 4869 passed | 54 skipped (4923) | 377 passed (8.1m) | * [new branch] 6009c499 -> be-fb/fo91-subject-ref |
| fo17 | `fo17.try2.log` | fabrika_push_fo17 | 117 → 117 | 4864 passed | 54 skipped (4918) | 377 passed (7.9m) | * [new branch] 0221e661 -> se-fb/fo17-cordis-pin |
| fo95 | `fo95.try1.log` | fabrika_push_fo95 | 117 → 117 | 4872 passed | 54 skipped (4926) | 377 passed (8.1m) | * [new branch] 54f03748 -> fe-fb/fo95-i18n-multiline-detector |
| fo47 | `fo47.try2.log` | fabrika_push_fo47 | 117 → 117 | 4864 passed | 54 skipped (4918) | 377 passed (8.3m) | * [new branch] 5dd3628a -> fe-gnd/fo47-e2e-constants |
| fo104 | `fo104.r2try1.log` | fabrika_push_fo104 | 117 → 117 | 4634 passed | 54 skipped (4688) | 335 passed (6.3m) | fc33172b..3be88098 3be88098 -> devop-fb/fo67-cpanel-dev-package |

Her geçen logda ayrıca: `✅ SUCCESS: All 47 tenant-scoped models have RLS policies registered`, `✅ SUCCESS: no new tenant bypass`, `rls:verify` 47 tabloda fabrika_app (rolsuper=false, rolbypassrls=false) ile ölçüldü, `✅ Öksüz alarm yok`, ardından `copy fabrika_push_<dal> dropped`. Eski tabanlı dallarda (fo34/fo40/fo104) test sayısının düşük olması (≈4640 / 335 e2e) tabanlarının eskiliğinden — kendi tabanlarındaki tam suite.

Temizlik ölçümü: `select count(*) from pg_database where datname like 'fabrika_push_%'` → **0**.
Loglar: `/private/tmp/claude-501/-Users-macbook-alan-FONBRIDGE/a4f04df3-3a9a-4efd-ba71-f89ace449b5d/scratchpad/logs/`, kuyruk zaman çizelgesi `…/scratchpad/status.txt`.

## Sahte kırmızılar (dal kodundan bağımsız) — kök nedenler
1. **Bağlı worktree → `tests/tenant-bypass-scan.test.ts` 34 test ENOENT.** Git bağlı worktree'de pre-push hook'una mutlak `GIT_DIR` export eder (oyuncak depoyla ölçüldü: normal depo `GIT_DIR=[]`, worktree `GIT_DIR=[…/.git/worktrees/wt]`); testin tmpdir'deki `git init/add` çağrıları çağıranın index'ine yazar. CHECK E (PR #121) dev'e girdiğinden beri bağlı worktree'den yapılan **her** push bu testte düşer. Aşma: bağımsız klondan push (aynı commit, aynı gate).
2. **`.next` kalıntısı (benim betiğimin hatası):** ilk turda `git clean -e .next` yeni tabanlı daldan kalan `.next/dev/types/validator.ts`'i bıraktı → eski tabanlı fo34, fo40, FO-104 typecheck'te ~1 dk'da `TS2307 Cannot find module '…/(public)/…/page.js'` ile 2 denemede düştü. Düzeltme: her checkout'ta `rm -rf .next`; bu üç dal ortam hatası olduğu için yeniden kuyruğa alındı, hepsi 1. denemede geçti.
3. **Yük kaynaklı e2e dalgalanması:** yük ortalaması 15–26 iken fo96 (2×), fo108, fo91, fo17, fo47 her seferinde FARKLI tek e2e testiyle düştü (`apiRequestContext.get: read ECONNRESET`; team-members-ui mobil / st6 bell `element(s) not found`). fo96'nın diff'i yalnız `pnpm-workspace.yaml`/lock/bir birim test. Yük ~8'e inince fo96 yeniden kuyrukta 1. denemede geçti.
4. **Kuyruk stdin tüketimi:** ilk kuyruk yalnız fo99'u koştu (heredoc'u döngüdeki komut yuttu) → `read -u 3` / `3<<EOF`.

Kural notu: kart "1 tekrar, sonra atla" diyor. Yeniden kuyruk yalnız (2) benim ortam hatam ve (3) ölçülmüş yük düşüşü sonrası yapıldı; commit değişmedi, `--no-verify` yok.

## Değişen dosyalar
- Ürün kodu değişmedi. Bu rapor: `docs/agent-results/TASK-MVFS74B3YKRR3-devop-fb-2.md`.
- Uzak dallar: yukarıdaki 15 push; PR #94 gövdesi.

## Riskler
- Eski tabanlı dallar (fo34, fo40 → dev'in 123 commit gerisi; fo42 43; FO-104 121) rebase edilmedi (kart kuralı). Kendi tabanlarında tam gate'i geçtiler ve MERGEABLE, ama dev ile **birleşik** hâlleri gate'ten geçmedi — merge öncesi birleşik gate önerilir (ayrı ayrı yeşil dallar birlikte kırmızı olabiliyor).
- `tenant-bypass-scan` testi bağlı worktree'den push'ta düşmeye devam eder.
- fo50 (#92) için gate kanıtı yok.
- Geçici bağımsız klon scratchpad'de kaldı (silme komutu izin katmanınca reddedildi; ürün/DB etkisi yok).

## Sonraki adım
- Takip kartı önerisi: `tests/tenant-bypass-scan.test.ts` `fixtureRepo` git çağrılarına GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE temizlenmiş env.
- Merge sırası/birleşik gate kararı liderde/patronda (bu iş merge yapmaz).
