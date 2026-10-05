# TASK-MUO6ZZVUPY4IT — FB İNCELEME-89 (devop-fb) · RBAC bekçisi düzeltmesi (TASK-MUO4GP1P89HS7, se-fb, a21b3a50 / dev fe33a622)

**Durum:** TAMAM
**Karar:** **ONAY (bloke yok).** İNCELEME-80'deki Y-1, Y-2 ve Ö-1 kapandı, D-2 de kapandı. Her birini gerçek dosyalarla, gerçek `next build` ile ve yük altında doğruladım. Kalan bir yeni kaçış sınıfı (Y-4) ve iki küçük not var. Hiçbiri bugün gerçek ağaçta tetiklenmiyor.
**İncelenen:** dev `c214f02d`. Bekçi dosyası `a21b3a50`'den beri değişmemiş (`git diff a21b3a50 HEAD -- tests/server-action-rbac-guard.test.ts` boş). `fe33a622` bu commit'in atası. Scratchpad'de ayrı bir worktree kullandım (`wt89`, detached, `pnpm install --frozen-lockfile`). İzole DB: `devopfb89-pg`, `127.0.0.1:55589`. Paylaşılan `:5433`'e bağlanmadım.
**Kod değişmedi.** Probe ve düzenek dosyaları yalnız worktree'de koşuldu. Worktree ve DB kabı kaldırıldı.
**Ekler:** `docs/agent-results/TASK-MUO6ZZVUPY4IT-devop-fb-ekler/`

**Platform beyanı:** Doğrulamanın tamamı mac'te yapıldı (Darwin 27, Apple Silicon, 12 çekirdek, Next 16.3.4 Turbopack, Postgres 16 + pgvector Docker'da, APFS büyük/küçük harfe duyarsız). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı test dosyasını koşuyor. Koddan okuduklarım:
- `specBase` ve `resolveSpec` `path.posix` kullanıyor. Dosya varlığını `path.join(SRC, …)` ile soruyor, `scanSrc` ayırıcıyı `/`'ye çeviriyor. Bu yüzden Windows'ta aynı kimlikler üretilmeli.
- Tek platform farkı harf duyarlılığı. Linux'ta harfi yanlış yazılmış bir `@/` specifier'ı artık fail-closed KIRMIZI olur (İNCELEME-80'de sessizdi). Bu güvenli taraf, ve tsc/build de orada kırılır.
- T1 (ikiz `.ts`/`.js`) paketleyiciye bağlı, platforma değil (§2.3).

## Özet

| # | Önem | Bulgu | Bloke? |
|---|---|---|---|
| ✓ Y-1 | — | Kapandı. `.js`, `.mjs`, `.cjs`, `.jsx` ve `.cts` uzantılı 'use server' dosyaları gerçek taramada yakalanıyor (5/5). Uzantısız, index, `./x.js→x.ts`, `.jsx→.tsx`, `.mjs→.mts`, `.cjs→.cts`, `.d.ts`+`.js` ve CJS `module.exports`/`exports.x` biçimleri KIRMIZI (31/31) | — |
| ✓ Y-2 | — | Kapandı. İNCELEME-80 mutantlarından C1, C4, C5 ve C6 KIRMIZI. `require('…')` ve `.js` hedefe dinamik import da KIRMIZI | — |
| ✓ D-2 | — | Kapandı. `@/lib/./rbac` (P6) artık YEŞİL | — |
| ✓ Ö-1 | — | Kapandı. Tarama CPU'su 3.1–4.0 sn'den **0.58–0.82 sn**'ye indi. Bekçi dosyasının tamamı 9.3–9.5 sn'den 2.5–2.7 sn user'a indi. Yapay yükte (load 36–52) sonuç 52/52 yeşil. se-fb'nin "0.4–0.5 sn" rakamı bu makinede biraz daha yüksek çıktı (§3), ama ≤2 sn hedefinin çok altında | — |
| ✓ | — | İNCELEME-80'deki 45 mutantı yeniden koştum: 3/45 sapma (S6, F1, F2). se-fb'nin sonucuyla birebir aynı. Gerekçesine katılıyorum: S6 belgede kapsam dışı yazılı, F1 ve F2 güvenli taraftaki FP'ler (D-1) ve gerçek ağaçta 0 kez tetikleniyor | — |
| **Y-4** | Düşük-Orta | **`package.json#imports` alias'ı (`#…`) ya da `@/` dışında yeni bir tsconfig `paths` alias'ı bekçiden kaçıyor.** `specBase` yalnız `@/` ve `.` ile başlayan specifier'ları src/ sayıyor, gerisini "paket" kabul ediyor. Probe: `"imports": {"#i89/*": "./src/lib/i89/*.js"}` ekleyip readOnly bir action'dan `import { wipe } from '#i89/legacy2'` çağırdım. Sonuç: **tsc 0, Turbopack build 0 (yazan kod paketlendi), bekçi sessiz** | Hayır. package.json ya da tsconfig değişikliği gerektiriyor, bugün yok |
| D-4 | Düşük | Fail-closed mesajı anlaşılır ama eyleme dönük değil. Örnek: `readOnly: true but writes: import of src/lib/i89/missing, which is no file the guard can read (fail-closed)`. Dosyayı ve nedeni veriyor, fakat "writes:" öneki yanıltıcı (yazma değil, bir import) ve ne yapılacağını söylemiyor. İNCELEME-80'deki D-3 (`via ?wipe`, `?*` etiketleri) aynen duruyor. se-fb bunu iddia etmemişti | Hayır |
| N-1 | Bilgi | İkiz dosya (`twin.ts` okur, `twin.js` yazar): bekçi `.ts`'yi yürüyor. **Turbopack da `.ts`'yi paketliyor** (işaret kanıtı), yani bugün kaçış değil. webpack'in `resolve.extensions` sırası `.js`'i önce denediği için `next build --webpack`'e geçilirse bu bir kaçışa dönüşür | Hayır |

## 1) İNCELEME-80 kaçış mutantları, yeniden koşum (`ekler/m-rerun.txt`, `real-rerun.txt`)

```
beklenenden sapan: 3/45
XX  S6  … const s2 = scope; s2.role = x → YEŞİL          (belgede kapsam dışı)
XX  F1  … repo.find() (nesnede save())   → KIRMIZI         (D-1 FP, güvenli taraf)
XX  F2  … Repo.find() (sınıfta save())   → KIRMIZI         (D-1 FP, güvenli taraf)
ok  C1/C4/C5/C6 → KIRMIZI … via ?* (lib/i80/c…)
```
Gerçek dosyalarla (overlay yok):
```
X1   .js kaynak (allowJs)   @/lib/i80/legacy      → KIRMIZI … (lib/i80/legacy.js:2, via wipe)
X1b  .js kaynak, uzantılı   @/lib/i80/legacy.js   → KIRMIZI
X3   .mts kaynak            @/lib/i80/modern.mjs  → KIRMIZI … (lib/i80/modern.mts:2)
P1/P1b/P4/P8 → KIRMIZI · K0/K1 → YEŞİL · K2 (@/lib/RBAC, mac) → KIRMIZI (tsc de TS1261, İNCELEME-80'deki gibi)
```
**"Kalanı kapsam dışı" gerekçesinin değerlendirmesi:** Katılıyorum. S6 bekçi belgesinde ("through another alias of it") yazılı ve davranış testleri kapsıyor. F1/F2 sadece fazla KIRMIZI üretiyor, yani hiçbir yazmayı gizlemiyor. Bir risk kalıyor: ileride "repository" kalıbı gelirse geliştirici bunu `ALLOWED`'a istisna ekleyerek geçmeye çalışabilir. Kart açmayı gerektirmiyor, izlenmesi yeter.

## 2) Yeni probe'lar

### 2.1 Uzantı ve çözüm (gerçek dosyalar `src/lib/i89/*`, `ekler/i89.txt`)
```
U1/U2  uzantısız → .js (alias / göreli)        → KIRMIZI (lib/i89/legacy2.js:2)
E1/E1r './x.js' → x.ts                          → KIRMIZI (lib/i89/tsimpl.ts:2)
E2/E2b './x.jsx' / './x.js' → x.tsx             → KIRMIZI
E3     './x.mjs' → x.mts · E4 './x.cjs' → x.cts · E5 './x.ts'  → KIRMIZI
C1     .cjs ESM sözdizimi                        → KIRMIZI
C2     .cjs module.exports = { wipe } + import { wipe } → KIRMIZI (via ?wipe — fail-closed tüm modül)
C3     .cjs exports.wipe = … · C4 require(…).wipe · C5 default import → KIRMIZI
I1/I1s/I1x/I4 dizin → dir/index.ts ('/' sonlu, açık, göreli)  → KIRMIZI
I2 dirjs/index.js · I3 dirmts/index.mts        → KIRMIZI
T2     typed.d.ts + typed.js                     → KIRMIZI (lib/i89/typed.js:2)
B1     barrel .ts: export * from './legacy2.js'  → KIRMIZI
D1/D2  dinamik import .js / dizin                → KIRMIZI
X1/X2/X3/X7 çözülemeyen @/, göreli, .js, import * as → KIRMIZI (fail-closed)
X4 çözülemeyen yan-etki .css · X6 yalnız tip import  → YEŞİL (FP yok)
T1  ikiz twin.ts(okur)+twin.js(yazar)            → YEŞİL  → §2.3: Turbopack da .ts'yi seçiyor
P1  '#i89/legacy2' (package.json imports)        → YEŞİL  → Y-4
X8  (düzenek yapaylığı: `export const _k = wipe` → "exported value is not a function"; bekçinin doğru kuralı, probe hatası)
```

### 2.2 Yeni 'use server' uç noktaları, gerçek tarama (`ekler/usesrv-probes.txt`)
`src/app/[locale]/i89/actions-{js,mjs,cjs,jsx,cts}` dosyaları ağaçta dururken bekçinin kendi testi:
```
× every write action checks the caller role, and no readOnly action writes
+ "app/[locale]/i89/actions-cjs.cjs#zzDrop: readOnly: true but writes: prisma.evidence.delete (line 6)",
+ "app/[locale]/i89/actions-cts.cts#zzDrop: …"
+ "app/[locale]/i89/actions-js.js#zzDrop: …"
+ "app/[locale]/i89/actions-jsx.jsx#zzDrop: …"
+ "app/[locale]/i89/actions-mjs.mjs#zzDrop: …"
Tests  1 failed | 51 passed (52)
```

### 2.3 Y-4 ve N-1 uçtan uca: tsc + gerçek `next build` (`ekler/probe-T1-P1-kurulum.txt`, `tsc-probes.txt`, `build-probe-*.txt`, `usesrv-probes2.txt`)
```
npx tsc --noEmit        → 0 hata ('#i89/legacy2' moduleResolution=bundler ile çözülüyor)
bekçi gerçek tarama     → i89ts/actions.ts#zzHash ve #zzTwin için BULGU YOK
npx next build          → BUILD_EXIT=0, ƒ /api/zz-i89
.next/server işaretleri → TWIN_TS_MARK: var · TWIN_JS_MARK: YOK · HASH_JS_MARK: var
```
- **Y-4:** Yazan `legacy2.js` paketleniyor, bekçi görmüyor. Önerilen, en ucuz çözüm bekçiye bir test eklemek: "tsconfig `paths` yalnız `{"@/*": ["./src/*"]}` ve package.json'da `imports` yok". Bu varsayım değişirse test kırılır ve bekçinin `specBase`'i birlikte güncellenmek zorunda kalır. se-fb'nin §4'teki alias riski yalnız FP yönünü (`@/` src/ dışını gösterirse) yazıyor. Kaçış yönü (yeni bir alias) belgede yok.
- **N-1:** Turbopack ikiz dosyada `.ts`'yi seçiyor, yani bekçiyle aynı dosyayı görüyor. `node_modules/next/dist/build/webpack-config.js:582` extensions `['.js','.mjs','.tsx','.ts',…]` → webpack'e geçilirse kaçış olur. İsteğe bağlı: bekçiye bir "aynı stem'de iki kod dosyası yok" testi eklenebilir.

### 2.4 Fail-closed mesajı ve FP (`ekler/i89b.txt`)
```
W1 yazma action, çözülemeyen import kontrolden ÖNCE → KIRMIZI  writes before any role check covers them: import of src/lib/i89/missing, which is no file the guard can read (fail-closed)
W2 yazma action, çözülemeyen import kontrolden SONRA → YEŞİL   (doğru: kontrol kapsıyor)
TP1 üçüncü parti zod / next/headers / next/cache / @prisma/client → YEŞİL
TP2 dinamik await import('zod')                     → YEŞİL
J1 var olan src json                                → YEŞİL
J2 var olmayan src json (tsc de kırılır)            → KIRMIZI fail-closed
```
Gerçek ağaç, temiz: `files=42 keys=128 findings=0`, bekçi 52/52. FP 0.
**Mesaj değerlendirmesi (D-4):** Geliştirici hangi dosyanın sorun olduğunu ve neden olduğunu anlıyor. Önerilen metin: `imports src/lib/x, which the guard cannot find (fail-closed): fix the specifier or add the file`. "writes:" öneki bu durumda yazma olmadığı için kafa karıştırıyor.

## 3) Süre (`ekler/timing.txt`) — CPU `process.cpuUsage`, 42 'use server' dosyası, önbelleksiz overlay `{}`
```
                                   load   scan CPU (3 koşu)       bekçi dosyası (/usr/bin/time)
SONRA dev c214f02d, ortam yükü     27.6   817 / 671 / 619 ms      user 2.47 s · 52/52 · 1.50 s vitest
ÖNCE  a21b3a50~1,  ortam yükü      29.0   3055 / 3467 / 4041 ms   user 9.47 s · 44/44 · 22.08 s vitest
SONRA + 16× yes                    36.7   741 / 638 / 576 ms      user 2.71 s · 52/52 · 2.29 s
SONRA + 16× yes (tekrar)           42.9   750 / 655 / 595 ms      user 2.74 s · 52/52 · 2.68 s
ÖNCE  + 16× yes                    51.9   3589 / 3608 / 3717 ms   user 9.25 s · 44/44 · 16.24 s
```
Sonuç: ~5× hızlanma tekrar üretildi. Mutlak değer 0.58–0.82 sn CPU, commit başlığındaki "0.4 sn"den biraz yüksek. Bu yük ve makine farkı. Tam koşuda bekçi 455 ms'de bitti. İNCELEME-80'deki 30 sn `testTimeout` flake riski ortadan kalktı.

## 4) Kapılar: temiz ağaç, dev `c214f02d` (`ekler/gates.txt`, `fullrun-summary.txt`, `build-tail.txt`, `db-prep.txt`)
DB CI'daki sırayla hazırlandı: `db push` → `db:rls-role` → 40 migrasyon ×2 → `db:rls` (28 → 112 politika) → seed. `CI=true`, `AUTH_SECRET` ci.yml'deki fixture değeri.
```
VITEST_EXIT=0   Test Files 294 passed | 2 skipped (296) · Tests 3661 passed | 36 skipped (3697) · 33.42s  (load 26→30)
LIVESKIP_EXIT=0 (36 atlamanın hepsi "allowed")
✓ tests/server-action-rbac-guard.test.ts (52 tests) 455ms
TSC_EXIT=0   LINT_EXIT=0   BUILD_EXIT=0 ✓ Compiled successfully
```

## 5) Değişen dosyalar
- `docs/agent-results/TASK-MUO6ZZVUPY4IT-devop-fb.md` ve `…-devop-fb-ekler/`. Yalnız rapor ve kanıt; uygulama ve test kodu değişmedi.

## 6) Riskler
- **Y-4:** Birisi (ajan ya da geliştirici) `#` alias'ı ya da yeni bir `paths` alias'ı eklerse, readOnly bir action'dan yapılan yazma sessizce geçer. package.json/tsconfig diff'i incelemede görünür, ama bekçi bunu garanti etmiyor.
- **N-1:** Yalnız webpack'e dönüş durumunda risk oluşur.

## 7) Açık sorular
- Y-4 (bir alias-varsayımı testi, ~10 satır) ve D-4 (mesaj metni) tek bir küçük se-fb takip kartında toplansın mı? N-1'deki "ikiz stem yok" testi isteğe bağlı olarak aynı karta eklenebilir.

## 8) Sonraki adım
- Takip kartını açmak lider/PM'in işi. Ben kart açmadım. Push yok.
