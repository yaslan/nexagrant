Hüküm: ONAY — cs-fb 3. teslimi (dal cs-fb/i116-leak-scan-gaps, uç ce5039f7, kod f3892470): Y-1 (require/createRequire takma adı) ve Y-2 (export let yeniden atama) için bekçi kodunda TEK satır mutasyonların 7'si de ilgili tanıkta KIRMIZI; her mutasyon geri alındı, git status temiz. Bloke eden bulgu yok.

# TASK-MUOIBQJJDKL28 — crw2-fb inceleme turu 2, kart 1 (mutasyon kanıtı)

Yöntem: scratchpad'de detached worktree (`ce5039f7`) + node_modules symlink; her mutasyondan sonra `git diff -U0` ile değişiklik gösterildi (sed no-op tuzağına karşı), vitest, `git checkout -- <dosya>`, `git status`. Ana checkout'a dokunulmadı. Taban: `tests/api/action-leak-scan.test.ts` 179/179 yeşil, `tsc --noEmit` exit 0.

## Mutasyon tablosu (dosya: tests/api/action-leak-scan.ts)

| # | Hedef | Satır | Tek satır değişiklik | Sonuç | Kırmızıya dönen tanık (örnek) |
|---|---|---|---|---|---|
| Y1-a | çıplak `require` yükleyici | 399 | `if (isGlobal(x,'require'))` → `if (false)` | 19 kırmızı | `B-1 > M4 require()`, `Y-1 fail-closed > an alias handed on is a finding even when the module is clean` |
| Y1-b | `module.require` | 403 | `key==='require' && isGlobal(obj,'module')` → `false` | 4 kırmızı | `Y-1 every spelling > module.require(…)`, `module['require'](…)`, `const r = module.require` |
| Y1-c | `.bind` | 413 | `memberName(t)==='bind'` → `false` | 1 kırmızı | `Y-1 every spelling > require.bind(null)(…)` |
| Y1-d | `createRequire(...)` çağrısı yükleyici | 412 | `factory → 'loader'` → `if (false)` | 8 kırmızı | `B-2 > imported under another name`, `…through a namespace`, `…with no import at all` |
| Y2-a | `export let` hiç yargılanmaz | 1669 | `if (!hasLeakingReassignment) continue;` → `continue;` | 7 kırmızı | `Ö-1 > act = run`, `[act] = [run]`, `({ act } = { act: run })`, `export var` |
| Y2-b | atamanın sağ tarafı sızdırmaz | 1667 | `&& nodeLeaks(...)` → `&& false` | 7 kırmızı | aynı 7 test |
| Y2-c | yalnız `=` (`||=` düşer) | 1664 | `!isAssignment(kind)` → `kind !== EqualsToken` | 1 kırmızı | `Ö-1 > act \|\| = run` |

Örnek ham çıktı (Y2-a):
```
=== Y2-a (satır 1669)
-        if (!hasLeakingReassignment) continue;
+        continue;
      Tests  7 failed | 172 passed (179)
 FAIL ... İNCELEME-118 X8/Ö-1: an `export let` action given another value > `act = run` is judged by the value it is given
 FAIL ... > `[act] = [run]` ...   > `act ||= run` ...   > `export var` is judged the same way
git status: []
```
Her koşu sonu `git status: []`; worktree sonra `git worktree remove --force` ile silindi, ana checkout `git status` temiz.

## Bulgular
- Bloke eden: yok. Kırmızıya dönmeyen tanık: yok (7/7 öldü).
- Ö-1 (öneri, bloke değil): ilk denemede kendi yardımcı betiğimde argüman kayması vardı; Y2-a'nın ilk (yanlış) koşusu bekçinin farklı bir satırını (`:682`) bozdu ve 4 başka (Y-3 `this`) testi kırdı — bu bir yazar kusuru değil, yöntem notu; geçerli koşular yukarıdaki tabloda.
- Ö-2: Yazarın "V4 eşdeğer" iddiasını yeniden koşmadım (kapsam: Y-1/Y-2 tanıkları); rapor `v4-equiv` ekini gösteriyor, makul.
- Hatırlatma: dal dev'e merge edilmemiş (yazar da belirtiyor).

**Platform beyanı:** yalnız mac (Darwin 27) doğrulandı. Saf TS AST testi, platforma bağlı yol yok (yol normalizasyonu `\`→`/` önceden var); Linux/Windows koşulmadı çünkü makinede yalnız mac var, CI ubuntu aynı komutları koşar.
