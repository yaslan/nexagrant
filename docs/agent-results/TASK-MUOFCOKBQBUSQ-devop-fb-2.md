# TASK-MUOFCOKBQBUSQ — FB DEV ENTEGRATÖRÜ, 2. koşu (devop-fb)

**Sonuç: TAMAM.** İki yarım iş kendi wip dallarında kurtarıldı, ana checkout'ta tracked değişiklik kalmadı ve raporlar commit'lendi. HSTS ile I-1 dev'de. Son kapılar 0 (rls:verify dahil). Prosedür RELEASE_CHECKLIST §9'da. Push yapılmadı.
Önemli not: koşu sırasında **dev'i benden bağımsız biri üç kez ilerletti** (ayrıntı §4). İlk seferde durup sordum, "üstüne merge ile devam et" yanıtını aldım.

## 1. Ne yapıldı
**A — Yarım işlerin kurtarılması**
- Ön koşulu iki kez, 60 sn arayla kontrol ettim (21:18:24 ve 21:19:24). İki ölçümde de tracked değişiklik yalnız beklenen iki dosyadaydı: `src/lib/tenant.ts` (+7) ve `tests/evidence-confirm-store-faults.live.test.ts` (+23). md5 değerleri iki ölçümde aynı çıktı, yani dosyalara o arada yazan olmadı.
- İki dal açıldı:
  - `be-fb/g1-wip` = **5d2ac526**, TASK-MUOF85BU7BV3X, tenant.ts
  - `crw-fb/t5-wip` = **7a6e666d**, TASK-MUOFAD4JSUCCP, test dosyası
  - Her iki dalda `git diff dev <dal> | cmp - <patch>` sonucu AYNI.
- Ancak bu kanıttan sonra ana checkout'ta `git checkout -- <iki dosya>` koştum. Kalan tracked değişiklik **0**.
- Worktree ve konteynerler:
  - be-fb'nin `…/ca6e3058…/wt-g1` worktree'sinde (`be-fb/g1-pool-timeout`) **commit edilmemiş iş var**: `evidence/actions.ts` değişikliği, `tenant.ts.m0` ve `tests/g1-pool-timeout-mutants.test.ts`. Bu yüzden **SİLMEDİM**.
  - crw-fb'nin eski `wtt5` worktree'si temizdi. Yeni crw-fb oturumu onu 21:21'de kendisi kaldırdı ve `crw-fb/t5-wip` dalını kendi worktree'sine aldı.
  - `crwfb-t5-pg` ve `crwfb-t5-minio` konteynerlerini sildim. `befb-g1-pg` diye bir konteyner yoktu.
  - Bu konteynerlerin anonim volume'leri (3 adet) duruyor. Prune yapmadım, çünkü açık onay gerekiyor.

**B — Untracked raporlar**
- `TASK-MUOEGWSV8I7H0-se-fb.md` dosyası `se-fb/i1-owner-chain-merge` dalındakiyle birebir aynıydı (`cmp` AYNI), sildim. Dosya merge ile geri geldi.
- Kalan raporlar tek commit'e girdi: **3dfa77c1**. İçerik: MUOEUYV0GMU12 devop-fb, MUOFCOKBQBUSQ devop-fb 1. koşu + ekler, MUODYSLQ8HIRT crw-fb-3, MUOEPL87MCXJH fe-fb. Commit'ten önce sır taraması yaptım, eşleşme yok.
- FON_BRIDGE.md ve TASK-MUNQB0GR306U0-be-fb.md dosyalarına dokunulmadı.

**C — Merge'ler**
- C1: `git merge --no-ff devop-fb/merge-hsts` → **956124f3**, çakışma yok.
  - `grep -rn "Strict-Transport-Security\|HSTS_VALUE" src/ next.config.ts` → eşleşme yok (exit 1).
  - Kapılar 0.
- C2: `git merge --no-ff se-fb/i1-owner-chain-merge` → **75dfc800**, çakışma yok (önceden `merge-tree` ile de kontrol ettim).
  - Dal ucu 064e2897. af2e7be7'nin üstünde yalnız se-fb'nin iki doküman commit'i var.
- DB: izole `devopfb-int-pg` (127.0.0.1:55223). Her merge'den önce sıfırdan kurdum, CI "Prepare database" sırasıyla hazırladım. I-1 sonrası `apply-migrations.sh` iki geçişte de "41 files applied as fabrika" verdi. Bu DB silindi.

## 2. Kanıt (ekler: `TASK-MUOFCOKBQBUSQ-devop-fb-2-ekler/`)
| Adım | HEAD | lint | tsc | vitest (tam) | live-skip | rls:check / bypass / verify | build |
|---|---|---|---|---|---|---|---|
| C1 HSTS | 956124f3 | 0 | 0 | 0 — 4025 geçti, 51 atlandı | 0 | — | 0 |
| C2 I-1 (1. koşu) | 75dfc800 | 0 | 0 | **1** — worker OOM, 23 test koşmadı | 0 | 0/0/0 | 0 |
| C2b I-1 (temiz DB ile yeniden) | 6537d210* | 0 | 0 | **0 — 4031 geçti, 51 atlandı** | 0 | **0/0/0** | 0 |

- \* 6537d210 = 75dfc800'ün üstüne crw2-fb'nin **yalnız doküman** commit'i. Kodu 75dfc800 ile aynı.
- C2'nin 1. koşusundaki kırmızının nedeni şu: `tests/rag-pdf-worker-isolation.test.ts` testi bilerek bir heap taşması (OOM) üretiyor. Bu OOM, iş parçacığıyla kalmayıp bütün vitest fork'unu düşürdü ("Worker exited unexpectedly"). Dosyanın 23 testi "pending" kaldı.
  - Dosyayı tek başına 3 kez koştum, 3'ü de 25/25 geçti (`C2-oom-tekrar.txt`).
  - I-1 `src/` altına ve rag koduna dokunmuyor (`git diff --stat e8c6e7ca 75dfc800 -- src` boş).
  - Tam koşuyu tekrarladım (C2b), 0 çıktı. Bu yüzden kırmızıyı yük altında ortaya çıkan bir flake olarak değerlendiriyorum. Aynı anda makinede başka ajanların vitest koşuları da vardı.
- `rls:verify` (C2b): "47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü".
- Değişkenleri komut satırında verdim ve her ham çıktının başına bastım:
  - `DATABASE_URL=postgresql://fabrika:fabrika@127.0.0.1:55223/fabrika`
  - `DATABASE_URL_RLS_TEST=…fabrika_app…@127.0.0.1:55223/fabrika`
  - `CI=true`
  - `AUTH_SECRET` = ci.yml'deki test fikstürü
  - `.env`'e dokunulmadı; :5433 kullanılmadı.
- `Z-son.txt` içeriği:
  - `merge-base --is-ancestor`: c6fad2ac ✔, af2e7be7 ✔ (ayrıca 5c8361b6 ✔ ve 064e2897 ✔)
  - fe-fb/muoepl-merge-temp, be-fb/g1-wip, crw-fb/t5-wip dev'de DEĞİL
  - tracked değişiklik 0
  - devopfb-int-pg silindi
- Ham dosyalar: A1-before, A2-wip-branches, A3-after, A4-worktrees-containers, B-untracked, C0-eszamanli-yazici, C1-*, C2-*, C2b-*, Z-son.

## 3. Değişen dosyalar / commit'ler (hepsi dev üzerinde, push yok)
- 3dfa77c1: docs, bekleyen raporlar
- 956124f3: merge HSTS
- 75dfc800: merge I-1
- 1cc51388: `docs/RELEASE_CHECKLIST.md` §9, dev entegrasyon prosedürü
- Bu rapor ve eklerin commit'i (son commit)
- Dallar: `be-fb/g1-wip` 5d2ac526 ve `crw-fb/t5-wip` 7a6e666d (yeni dallar, merge edilmedi)

## 4. Riskler
- **Eşzamanlı dev yazıcıları.** Talimatta "bekliyor" denen dallar benim dışımda merge edildi:
  - 21:19:59 **ac2ec5f3** `crw2-fb/live-skip-gate` merge'ü. Reflog mesajı boş. Bunu görünce durdum ve sordum; yanıt "üstüne devam".
  - 21:25:30 **e8c6e7ca** `spike/job-queue` merge'ü. Mesajında "patron 30.09, TASK-MUOEY2GBFHY7U" yazıyor. Yalnız `scripts/spike-jobq/*` ekliyor. C1 vitest'i sürerken geldi; C2/C2b kapıları bunu da kapsıyor.
  - 21:30:03 **6537d210**, crw2-fb raporu (yalnız doküman).
  - Üçü de TASK-MUOEY2GBFHY7U (crw2-fb) işine ait görünüyor. Ref'i `update-ref` ya da benzeri bir yolla ilerletiyorlar; reflog mesajları boş.
  - Kimse kod çakışması yaşamadı. Yine de kural ihlali var: merge'ü entegratörden başka biri yapmış.
- Ana checkout'ta başka ajanların yeni untracked raporları var: `TASK-MUOFAD4JSUCCP-crw-fb-ekler/`, `TASK-MUOFKI8C1009Z-se-fb(.md|-ekler/)`. Bu yüzden görevde beklenen "untracked yalnız FON_BRIDGE.md + be-fb.md" durumu sağlanmadı. Bu dosyalar başkalarına ait ve şu an yazılıyor olabilir; silmedim, commit'lemedim.
- `rag-pdf-worker-isolation` testi yük altında bütün vitest fork'unu düşürebiliyor. CI'da da aralıklı kırmızı verebilir. Ayrı bir kart açılmalı.
- be-fb'nin `wt-g1` worktree'sinde commit edilmemiş iş duruyor. Oturum kapandıysa bu iş kaybolabilir.
- Commit yazarı repo ayarından "Claude BE-FB" olarak geliyor. Bu depo genelinde böyle; commit içeriğine etkisi yok.

## 5. Açık sorular
1. ac2ec5f3 ve e8c6e7ca'yı kim ve hangi onayla merge etti? Talimata göre bu iki dal bekliyordu.
2. `rag-pdf-worker-isolation` flake'i için kart açılsın mı? (Öneri: bu dosyayı `pool: forks` altında tek başına izole etmek ya da OOM'u alt süreçte üretmek.)
3. be-fb `wt-g1` worktree'sindeki commit edilmemiş iş (mutant testleri ve actions.ts): bunu be-fb'nin yeni oturumu mu toplayacak?
4. 3 anonim volume prune edilsin mi?

## 6. Sonraki adım
- Push, patronun 1 Ekim onayıyla (RELEASE_CHECKLIST §8 madde 12). origin/dev'in önünde 630 commit var.
- Bekleyen dallar: fe-fb/muoepl-merge-temp (mobil teslim yeniden doğrulanacak), crw2-fb/live-skip-gate (fiilen merge edildi, bkz. §4), be-fb/g1-wip, crw-fb/t5-wip.

## DEV ENTEGRASYON PROSEDÜRÜ
(RELEASE_CHECKLIST.md §9 ile aynı metin, commit 1cc51388)
1. İşçi ajan yalnız kendi worktree'sinde ve kendi dalında çalışır. Ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`, dal `dev`) tracked dosya değiştirmez, `dev` ref'ini de ilerletmez. Merge'ü yalnız entegratör (devop-fb) yapar.
2. Entegratör başlamadan önce `git status --short --untracked-files=no` çıktısını ≥20 sn arayla iki kez alır. Çıktıda başka birinin tracked değişikliği varsa durur. Değişikliğin sahibi kapandıysa değişiklik kaybolmasın diye önce kurtarılır: `git diff -- <dosya> > x.patch`, ardından `git worktree add <wt> -b <sahip>/<iş>-wip dev`, `git -C <wt> apply x.patch`, `git -C <wt> commit -- <dosya>` ve `git diff dev <dal> | cmp - x.patch`. Ancak bu kanıttan sonra ana checkout'ta `git checkout -- <dosya>` koşulur.
3. Yalnız inceleme raporu TAMAM/ONAY olan ve görev metninde adı geçen dal merge edilir: `git merge --no-ff <dal>`. Çakışma olursa entegratör durur ve raporlar, çakışmayı çözmez. Merge'den önce `git merge-tree --write-tree HEAD <dal>` ile çakışma olup olmadığına bakılır.
4. Her merge'den sonra kapılar CI sırasıyla koşulur. DB, izole ve sıfırdan kurulmuş bir Postgres'tir (ör. `devopfb-int-pg`, 127.0.0.1:55223; :5433 yasak, `.env`'e dokunulmaz). DB hazırlığı `prisma db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed` sırasıyla yapılır. Kapılar: `lint`, `typecheck`, tam `vitest run` + `check-live-skips`, `build`. Şema veya RLS değiştiyse bunlara `rls:check`, `rls:bypass-check` ve `rls:verify` eklenir. `DATABASE_URL`, `DATABASE_URL_RLS_TEST` ve `CI=true` komut satırında verilir ve çıktıya basılır.
5. Ham çıktılar `docs/agent-results/<TASK>-devop-fb-ekler/` altına yazılır. Bir kapı 0'dan farklı biterse sonraki dala geçilmez.
6. Her adımdan önce ve sonra `git reflog -3 dev` kontrol edilir. Entegratörün yapmadığı bir `dev` hareketi görülürse raporda "eşzamanlı yazıcı" olarak kaydedilir. Kapılar o hareketi de kapsayacak biçimde yeniden koşulur.
7. Commit'ler `git commit -- <yollar>` ile atılır; geniş `git add -A` kullanılmaz. İş bitince `git merge-base --is-ancestor <sha> dev` ile her dalın dev'de olduğu kanıtlanır. Push yalnız ayrı ve açık onayla yapılır.

## Platform beyanı
Doğrulama **mac** üzerinde yapıldı: Darwin 27.0, zsh, Docker'da pgvector/pgvector:pg16, Node 26.5.
- Merge edilen kod platforma bağlı değil:
  - HSTS başlığı uygulamadan kaldırıldı; artık Caddy'nin işi.
  - `scripts/apply-migrations.sh` bash betiği. CI'da ubuntu-latest'te bash + psql ile, macOS'ta bash 3.2 ile koşuyor ve burada iki geçişte de geçti.
- Windows'ta bu betik yalnız WSL ya da Git Bash altında çalışır; koşulmadı, çünkü dağıtım hedefi Linux.
- Linux'ta yerel olarak koşulmadı. CI aynı sırayı ubuntu-latest'te koşuyor, ama push olmadığı için henüz tetiklenmedi.

## DoD
- [x] A: iki wip dalı kanıtlı (cmp AYNI), ana checkout tracked-temiz
- [x] B: raporlar commit'lendi (3dfa77c1), se-fb kopyası silindi (birebir aynıydı)
- [x] C: HSTS ve I-1 dev'de. Kapılar: C1 0, C2 önce flake nedeniyle 1 verdi, C2b 0. rls:verify 0.
- [x] Prosedür belgelendi (1cc51388)
- [~] Son durum: tracked 0. Untracked listesinde başka ajanların canlı raporları da var (bkz. §4)
- [x] devopfb-int-pg silindi, push yok
- [x] Platform beyanı
