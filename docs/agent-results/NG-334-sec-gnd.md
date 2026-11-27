---
hüküm: BLOKE — izole tam gate kırmızı (3 canlı-DB testi); push ve draft PR YAPILMADI
tip: runtime (teslim/PR)
platform: Windows 11 + WSL2 Ubuntu-24.04 (birim testi platformdan bağımsız; CI Linux)
kart: NG-334 · TASK-MWSGN7X1QH01Q
dal: task/ng-277 (yerel, push edilmedi)
---

# NG-334 — NG-277'yi dev'e indir (kısmi teslim)

## Ne yapıldı

- Worktree: `~/alan/.agentspace/worktrees/nexagrant/sec-gnd-ng277`. Başlangıçta `task/ng-277` tepesi `32edd6cf` (eski `origin/dev` ile yapılmış önceki merge), worktree temizdi.
- `origin/dev` ilerlemişti (`48760af0`); `task/ng-277` üzerine **merge** edildi (rebase yok, force push yok). Commit: `1b3d52a4f merge origin/dev into task/ng-277 (NG-334)`. Çakışma YOK.
- Merge sonrası `task/ng-277` ile `origin/dev` farkı: yalnız `tests/page-role-gate.test.ts` (+570 / −11).
- Prisma client üretildi (`pnpm db:generate`; ilk koşuda `.prisma/client/default` eksik olduğu için test yüklenemedi).
- Mutant doğrulaması (kartın 2 mutantı), `api-keys/page.tsx` üzerinde geçici uygulanıp `git checkout` ile geri alındı.
- Tam izole gate (`pnpm gate:isolated`) koşuldu: **kırmızı**.

## Kanıt (ham çıktı özeti)

Merge sonrası page-role-gate:
```
 Test Files  1 passed (1)
      Tests  215 passed (215)
```

Mutant 1 — kapıdan önce `await peekKeysBeforeDoor(locale)` (yardımcı içinde `withTenant`):
```
× settings/api-keys/page.tsx: no call or DB token before requireTenantPageRole(view_partner_search)
AssertionError: calls before the door: peekKeysBeforeDoor: expected [ 'peekKeysBeforeDoor' ] to deeply equal []
Tests  1 failed | 214 passed (215)
```
Geri alma sonrası: `Tests 215 passed (215)`.

Mutant 2a — kapıdan önce `await`'siz `prisma.apiKey.findMany(...)`:
```
× ... requireTenantPageRole(view_partner_search) comes before any read in the page body
AssertionError: read(s) before the door: prisma.: expected [ 'prisma.' ] to deeply equal []
× ... no call or DB token before requireTenantPageRole(view_partner_search)
Tests  2 failed | 213 passed (215)
```

Mutant 2b — kapıdan önce `await`'siz yardımcı çağrısı (`const preDoor = loadApiKeys(locale);`):
```
× ... no call or DB token before requireTenantPageRole(view_partner_search)
AssertionError: calls before the door: loadApiKeys: expected [ 'loadApiKeys' ] to deeply equal []
Tests  1 failed | 214 passed (215)
```
Geri alma sonrası: `Tests 215 passed (215)`, `git status` temiz.

eslint + tsc (merge sonrası):
```
ESLINT_EXIT=0
TSC_EXIT=0   (0 × "error TS")
```

Not: mutant 2 varyantlarında tarayıcı `await` olup olmadığına bakmadan kapıdan önceki her çağrıyı yakalıyor; `await`'siz çağrı ayrı bir kural gerektirmeden kırmızı veriyor.

İzole tam gate (`pnpm gate:isolated`, log: `scratchpad/ng334-gate.log`):
```
Test Files  2 failed | 610 passed | 2 skipped (614)
Tests       3 failed | 8714 passed | 67 skipped (8784)
FAIL  tests/province-lead-route.live.test.ts > ... > D-2 (review bulgu 2): the mark restored is the one the CLAIM replaced ...
FAIL  tests/public-lead-stuck.live.test.ts > ... > (i) consented but never routed ...
FAIL  tests/public-lead-stuck.live.test.ts > ... > (j) the never-routed lead gets routed and its copy lands → its alert closes
AssertionError: expected { stuck: 5, raised: +0, …(4) } to match object { stuck: 4, alreadyOpen: 4, … }
[ELIFECYCLE] Command failed with exit code 1.
```

## Değişen dosyalar

- Dal: `task/ng-277` merge commit'i `1b3d52a4f` (yalnız merge; kapsam: `tests/page-role-gate.test.ts` dışında dev'den gelen değişiklikler).
- Bu teslimde kendi değişikliğim: yok (test dosyasına dokunulmadı; mutantlar geri alındı).

## Riskler ve açık sorular

1. **Gate kırmızı, push yapılmadı.** Kart yeşil izole gate ister; bu sağlanmadı.
2. Kırmızı 3 test kapsam dışı: `province-lead-route.live.test.ts` ve `public-lead-stuck.live.test.ts` (canlı DB, NG-181 / public lead). `git diff origin/dev HEAD` bu iki dosyayı ve `src/` altını **göstermiyor** — yani bu dalın kodu dev ile aynı; hata dev'de de var olabilir ya da paylaşılan durum / zamanlama (`TEST_TIMING_SLACK=1`, load1 2.52) kaynaklı olabilir. **Doğrulanmadı**: origin/dev'in kendisinde bu üç test kırmızı mı, henüz koşulmadı.
3. Gate kilidi ilk ~50 dk başka ajanların gate'lerini bekledi (be-gnd-ng250, ng-331); bu süre gate sonucuna girmez.

## Sonraki adım (lider kararı gerekli)

- (a) origin/dev üzerinde aynı üç testi izole koşup dev'de de kırmızı olduğunu doğrulamak, ardından NG-277 PR'ını "dev kırmızısı, bilinen" notuyla açmak; ya da
- (b) bu üç testi ayrı bir karta devredip NG-277 dalını kendi PR'ına ancak yeşil gate sonrası almak.

Ajan, lider onaylamadan push/PR açmayacak.

DONE:st1 değil — **FAIL:st1 gate kırmızı (kapsam dışı 3 canlı-DB testi)**.
