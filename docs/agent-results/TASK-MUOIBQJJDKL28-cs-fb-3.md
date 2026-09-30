Hüküm: HAZIR — İNCELEME-118'in bütün bulguları kapandı (B-1, B-2, Y-1, Y-2, Y-3, Ö-2, Ö-3; ek olarak Ö-1). Tek yaşayan mutant (V4) eşdeğer; kanıtı aşağıda. İncelemeyi crw2-fb yapacak.
Entegrasyona hazır: cs-fb/i116-leak-scan-gaps f3892470 (kod commit'i; bu raporun commit'i onun üstünde, dal ucu = rapor commit'i)

# TASK-MUOIBQJJDKL28 — cs-fb — 3. teslim: İNCELEME-118 bulgularını kapatma

- **İnceleme:** `docs/agent-results/TASK-MUOJ736LL7ILJ-crw-fb-2.md` ("DEĞİŞİKLİK GEREKLİ", uç `4b11aa01`).
- **Ortam:** scratchpad'de ayrı worktree `wt` (dal `cs-fb/i116-leak-scan-gaps`, `4b11aa01`'den). "Önce" koşuları için ayrı detached worktree `wt-before` (`4b11aa01`). İzole Postgres `csfb118-pg`, `127.0.0.1:55138`; `.env`'in yorum dışı satırlarında 5433 sayısı 0. Paylaşılan `:5433`'e dokunulmadı.
- **Ekler:** `docs/agent-results/TASK-MUOIBQJJDKL28-cs-fb-3-ekler/` (23 dosya). Mutlak scratchpad yolları `<scratchpad>` ile değiştirildi.
- **Karşılaştırılan üç tarayıcı:** "eski" = dev `0779e8f8`, "önceki" = `4b11aa01` (2. teslim), "yeni" = `f3892470`.

## 1. Bulgu tablosu

| Bulgu | Durum | Nasıl kapandı | Kanıt (ek dosyası) |
|---|---|---|---|
| **B-1** tsc ve `next build` kırık | **kapandı** | `:358`/`:377`'deki korumasız indeksleme kaldırıldı. Yükleyici tanıma yeniden yazıldı; `.apply` dizisinin `elements[0]`'ı ve takma ad bildirimi artık `undefined`'ı kabul eden `load()`'a gidiyor | `tsc-before.txt` exit=2 → `tsc-new.txt` exit=0; `next-build.txt` BUILD_EXIT=0 |
| **B-2** import edilmiş `createRequire` | **kapandı** | `createRequire` değere göre tanınıyor. Kapsanan biçimler: `node:module`'den adıyla ya da `as` ile import, `nm.createRequire`, `const { createRequire: cr } = await import(…)`, import'suz global. Çağrısının sonucu yükleyici: `createRequire(…)('…')` ve `const req = createRequire(…); req('…')`. Literal olmayan spesifikatör UNRESOLVED | `probe118-*.txt` I1–I6; `scan-probe-3.txt` creq; `real-tree-116-*.txt` R3 |
| **Y-1** `require` takma adı fail-closed değil | **kapandı** | `moduleKind` değerin ne olduğuna bakıyor: sarmalayıcılar, virgül (`(0, require)`), `.call`/`.apply`/`.bind`, `module.require`/`module['require']`. Takma adın değeri bildirimden, sonraki atamadan (`r = require`) ya da `const { require: r } = module` yapıbozumundan geliyor. Başka modülün export ettiği yükleyici (`export const r = require`, `export { r }`, `export { r } from`, `L.r`) da tanınıyor. **Fail-closed kuralı:** bir yükleyicinin, `createRequire`'ın ya da `module`'ün izlenmeyen her okunuşu kendi başına bulgu sayılıyor ve o modülün bütün export'larını sızıntılı yapıyor. İzlenmeyen okunuş örnekleri: argüman, dizi, nesne, `void`, `const m = module` | `probe118-*.txt` R5–R16; `scan-probe-3.txt` reqas; testler |
| **Y-2** A1, A4, A10 yaşıyor | **kapandı** | Ayırt edici tanıklar eklendi: A1 `return { m: await import(…) }`, A4 `Reflect.apply(setCode, e, [])`, A10 `(await import(…)).fill(out, e)`. Eski iki test silinmedi, assertion'ları aynı kaldı; yalnız adları yaptıkları şeye göre değişti (ad alanı yolu) | `mutants118-before.txt` / `-after.txt` |
| **Y-3** yeni dallar testsiz | **kapandı** | Her dal için tanık ve temiz karşılık yazıldı (43 yeni test). Her dalı bozan 31 mutant koşuldu: 30 KILLED. 1 SURVIVED (V4); eşdeğer olduğu gösterildi | `mutants-y3.py`, `mutants-y3-out.txt`, `v4-equiv.*` |
| **Ö-1** `export let` kaçışları (V4/V5/V10) | **kapandı** (kartta istenmemişti) | Yeniden atama kontrolü artık her atama işlecine bakıyor (`||=` dahil), yapıbozum hedeflerini topluyor ve eşleşmeyi ad metniyle değil sembolle yapıyor | `probe118-new.txt` V1–V10 YAKALADI, VFP1–3 temiz |
| **Ö-2** Known limits eksik/yanlış | **kapandı** | Metin yeniden yazıldı. Eklenenler: `const O = Object`, `globalThis.Object`, `[x].slice()[0]`, `Promise.resolve(e).then(x => …)`, `globalThis.require`/`eval`. `.call`/`.apply` sınırının nedeni doğru anlatılıyor (`args[0]` ↔ `args[1]`). C10 artık "spread" değil, "callback parametresine yazım" olarak geçiyor. `export *` ve yeniden atanan `export function`'ın build/tsc tarafından reddedildiği not edildi | `tests/api/action-leak-scan.ts` başlık yorumu; `escape-new.txt` |
| **Ö-3** kanıt yetersiz | **kapandı** | Bu raporda tsc, `next build`, lint, tam vitest, mutantlar ve sondaların hepsi kopyalanmış çıktıyla var | §2 |

## 2. Kanıt

### B-1: typecheck ve build
```
4b11aa01 (tsc-before.txt):
tests/api/action-leak-scan.ts(358,43): error TS2345: Argument of type 'Expression | undefined' is not assignable to parameter of type 'Node'.
tests/api/action-leak-scan.ts(377,36): error TS2345: Argument of type 'Declaration | undefined' is not assignable to parameter of type 'Node'.
tsc exit=2

f3892470 (tsc-new.txt):   tsc exit=0
lint (lint.txt):          lint exit=0
next build (next-build.txt, Next 16.3.4 Turbopack):
✓ Compiled successfully in 7.2s
  Running TypeScript ...
  Finished TypeScript in 12.9s ...
BUILD_EXIT=0
```
Build'deki tek uyarı `src/instrumentation.ts:18`'deki `process.exit`'le ilgili (Edge Runtime). Bu uyarı dev'de de var ve bu işle ilgisi yok.

### B-2 ve Y-1: runtime-probe dosyaları, eski [] → yeni bulgu (`scan-probe-3.txt`)
crw2-fb'nin `runtime-probe-116` dosyaları geçici olarak `src/app/probe116/` ve `src/lib/probe116-svc.ts`'e kondu. crw-fb'nin `scan-probe118.mts`'i aynen koşuldu. Sonra dosyalar silindi; `git status` temiz.
```
== _old-scan.ts (dev 0779e8f8)
let-actions [] · req-actions [] · modreq-actions [] · creq-actions [] · reqas-actions []
== _prev-scan.ts (4b11aa01)
creq-actions.ts   []
reqas-actions.ts  []
== action-leak-scan.ts (f3892470)
src/app/probe116/let-actions.ts    [[3,"the export act"]]
src/app/probe116/req-actions.ts    [[4,"src/lib/probe116-svc.ts#run ← catch (line 4)"]]
src/app/probe116/modreq-actions.ts [[3,"src/lib/probe116-svc.ts#run ← catch (line 4)"]]
src/app/probe116/creq-actions.ts   [[4,"src/lib/probe116-svc.ts#run ← catch (line 4)"]]
src/app/probe116/reqas-actions.ts  [[4,"src/lib/probe116-svc.ts#run ← catch (line 4)"]]
```
Bu beş dosyanın çalışma anında HTTP 200 ile sızdırdığını crw-fb `runtime-probe118.txt`'te gösterdi (actCreq, actReqAs dahil). Ben HTTP koşusunu tekrarlamadım; bekçinin hükmünü aynı dosyalar üzerinde yeniden koştum.

**crw-fb'nin ek sondası `probe118.mts`, aynen** (`probe118-{old,prev,new}.txt`):
```
eski  toplam=37 sorunlu=26
önceki toplam=37 sorunlu=17
yeni  toplam=37 sorunlu=0      (I1–I6, R5–R16, V1–V10 YAKALADI; FP1–FP6, VFP1–VFP3 doğru)
```
**crw2-fb'nin `escape.mts`'i, aynen** (`escape-*.txt`): eski 24 → önceki 20 → yeni 19 sorunlu. D10 (import'lu `createRequire`) kapandı. Kalan 19: C5–C10, C12–C14, C19, T1–T7 (hepsi Known limits'te adıyla sayılıyor) ve X1/X12 (build/tsc reddediyor, belgede var).

**Gerçek ağaç, CORDIS `5e674e7f`** (`real-tree-116-*.txt`):
```
R3 createRequire(import.meta.url)(…)   eski []  → önceki []  → yeni [23,31] src/lib/k2-cordis/importer.ts#runCordisImport ← catch (line 669)
R1/R2/R4/X8                            yeni'de de YAKALADI (önceki gibi)
```

### src'de yanlış pozitif yok
`tree-src-new.txt`: yeni tarayıcı src'deki 37 `'use server'` dosyasında `found: {}`. Toplam süre 1425 ms; eski tarayıcıda 1235 ms. Tam bekçi testi (`api-error-body-guard`) tam vitest içinde yeşil.

### Y-2: A1/A3/A4/A10, crw-fb'nin `mutants118.py`'si aynen, önce/sonra
| Mutant | 4b11aa01 (önce) | f3892470 (sonra) | Sonrasında öldüren test |
|---|---|---|---|
| A1 yük değer olarak → temiz | **SURVIVED** (136/136) | **KILLED** | `İNCELEME-118 Y-2 > A1: a dynamic load handed back in place is the whole module` |
| A3 import'a verilen catch bağlamı yazım değil | KILLED | KILLED | `Y-4 > A3: …` |
| A4 `Reflect.apply(fn, e, …)` yazım değil | **SURVIVED** | **KILLED** | `İNCELEME-118 Y-2 > A4: …` |
| A10 `(await import()).f(out)` etkisi | **SURVIVED** | **KILLED** | `İNCELEME-118 Y-2 > A10: …` |

Her iki koşuda md5 önce ve sonra aynı: önce `eccae237…`, sonra `8272293a…`. Zaman aşımı 0.

### Y-3: yeni dalları bozan mutantlar (`mutants-y3.py`, taban 179/179)
| Mutant | Bozduğu dal | Sonuç |
|---|---|---|
| F1–F5 | `createRequire` çağrı sonucu / `nm.createRequire` / `as` import / çıplak ad / yapıbozum | 5× KILLED |
| L1–L8 | `module.require` / `.call`-`.apply` / `.apply` dizisi / `.bind` / virgül / takma ad / sonradan atama / `{ require: r } = module` | 8× KILLED |
| E1–E3 | izlenmeyen okunuş bulgusu / özet `exportLeaks` / özet `effects` | 3× KILLED |
| E4–E9 | "izlenen" konumlar: hepsi, `typeof`, `require.resolve`, `module`, `{ require }`, atama hedefi | 6× KILLED (ikisi FP mutantı; temiz testler öldürüyor) |
| V1–V3 | `export let` yeniden ataması / yapıbozum / `||=` | 3× KILLED |
| X1–X5 | import edilen yükleyici / `L.r` / `export { r } from` / `export { r }` / `export const r = require` | 5× KILLED |
| **V4** | eşleşme sembol yerine ad metniyle | **SURVIVED — eşdeğer** |

**V4'ün eşdeğer olduğunun gerekçesi:**
- Bu kontrol yalnız bir ön-filtre. Son hükmü `exportLeaks(name)` export edilen sembolün kendisi üzerinden veriyor. Bu yüzden ad eşleşmesi daha fazla dosyayı kontrole sokabilir, ama hükmü değiştiremez.
- `v4-equiv.txt`'te altı gölgeleme varyantı var: iç `let`, parametre, iç yapıbozum, iç `||=`, `catch (act)` ve dıştaki kontrol. Orijinal ve mutant `farklı=0/6`.

### Tam vitest (izole Postgres :55138, CI=true)
DB hazırlığı (`db-prep.txt`): `prisma db push` → `db:rls-role` → `apply-migrations.sh` ×2 (41/41) → `db:rls` (28 → 112) → `SEED_EXIT=0`.
```
 Test Files  305 passed | 2 skipped (307)
      Tests  4144 passed | 52 skipped (4196)
VITEST_EXIT=0
```
crw-fb'nin `4b11aa01` koşusu 4101 test veriyordu. Aradaki +43, bu teslimde eklenen testler (136 → 179).

### Commit
```
$ git show --stat f3892470
    TASK-MUOIBQJJDKL28: Close İNCELEME-118 B-1, B-2, Y-1..Y-3, Ö-1, Ö-2 in action-leak-scan
 tests/api/action-leak-scan.test.ts | 169 ++++++++++++++++++-
 tests/api/action-leak-scan.ts      | 322 +++++++++++++++++++++++++++----------
 2 files changed, 408 insertions(+), 83 deletions(-)
```
Rapor ve ekler ayrı bir commit'te, aynı dalda. `src/`'ye dokunulmadı. Mevcut hiçbir assertion değişmedi; iki testin yalnız adı değişti.

## 3. Değişen dosyalar
- `tests/api/action-leak-scan.ts`: `memberName`, `given`, `moduleKind`/`moduleKindOf`, `importedKind`, yeniden yazılan `dynamicLoad`, fail-closed `loaderEscapes`, özet alanı `exportKind`, sembolle çalışan `export let` kontrolü, başlık yorumu ve Known limits.
- `tests/api/action-leak-scan.test.ts`: 43 yeni test. İki testin adı düzeltildi; assertion'ları aynı.
- `docs/agent-results/TASK-MUOIBQJJDKL28-cs-fb-3.md` ve `-3-ekler/`.

## 4. Riskler
- **Fail-closed kuralı gelecekte yanlış pozitif verebilir.** Bir src dosyası `require`'ı ya da `module`'ü izlenmeyen bir yolla okursa bulgu çıkar; örnekler `void require`, `const m = module`. Bugün src'de böyle bir okunuş yok (`found: {}`, 37 dosya), ve hata kasıtlı olarak güvenli tarafta. Bulgunun `via` metni `a module loader the scan does not follow (fail-closed)`, yani nedeni doğrudan okunuyor.
- **Tarama biraz daha fazla modül okuyor.** Import edilen bir bağın yükleyici olup olmadığını anlamak için `importedKind` o modülün özetini okuyor. Tam ağaçta süre 1235 ms'den 1425 ms'ye çıktı. Döngüde `summaryOf`, önceki gibi PENDING'e düşüp fail-closed davranıyor.
- **Known limits'te kalan kaçışlar** (Object/Reflect farklı yazımları, callback parametresine yazım, `globalThis.require`) açık. Hiçbirinin bugün src'de örneği yok.

## 5. Açık sorular
- Known limits'teki `Object.assign.call(null, e, …)` sınırı (`args[0]` ↔ `args[1]`) belgeleniyor ama düzeltilmedi. İNCELEME-116'nın açık sorusuna göre bu kabul edilebilir; ayrı kart gerekip gerekmediğine lider karar versin.
- Çalışma anında HTTP probe'unu yeniden koşmadım (crw-fb İNCELEME-118'de koştu). crw2-fb bunu isterse, aynı probe dosyalarıyla `next start` koşusu 5 dakikalık bir iş.

## 6. Sonraki adım
- crw2-fb incelemesi: dal `cs-fb/i116-leak-scan-gaps`, ucu bu raporun commit'i. dev'e merge ve push yapılmadı.

## Süreç notları (dürüstlük)
- İşin başında görev yönergesinden önce ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`) salt-okuma komutları koştum: `ls`/`cat` ile inceleme raporu, `git worktree list`, `git log`, `.env` anahtar adları için `grep`. Checkout, stash, commit ya da yazma **yapılmadı**.
- Önceki oturumumun `i116-fix` worktree'si (dal bu worktree'de açıktı) temiz olduğu doğrulandıktan sonra `git worktree remove` ile kaldırıldı. Dal, yeni worktree `wt`'de açıldı; commit kaybı yok (`4b11aa01` korunuyor).
- Commit yazar adı depo yapılandırmasından geliyor ("Claude BE-FB"). Ben değiştirmedim.

## Temizlik
- Probe dosyaları silindi; `git status` temiz (yalnız ignore'daki `.env` var).
- `csfb118-pg` konteyneri ve `wt-before` worktree'si rapordan sonra kaldırılıyor. `wt` worktree'si, crw2-fb incelemesi için dal açık kalsın diye duruyor.

**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27.0.0 arm64; Node 26; Docker `pgvector/pgvector:pg16`; Next 16.3.4 Turbopack `next build`). Linux ve Windows koşulamadı, çünkü bu makinede yalnız macOS var. Koddan çıkarım:
- Değişiklik saf TypeScript AST işi, dosya yolu ya da süreç işi yok. Yol normalizasyonu (`\`→`/`) önceden olduğu gibi duruyor, bu yüzden tarayıcının hükmü her platformda aynı olmalı.
- `createRequire`, `require` takma adı ve `module.require`'ın **çalışma anı** davranışı Turbopack'in çözümüne bağlı. Bu davranış crw-fb tarafından yalnız macOS'ta gösterildi. Bekçinin hükmü bundan bağımsız.
- CI (ubuntu-latest) aynı `pnpm typecheck` ve `vitest` komutlarını koşuyor; platforma bağlı bir kod yolu eklenmedi.
