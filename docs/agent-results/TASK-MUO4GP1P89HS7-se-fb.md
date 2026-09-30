# TASK-MUO4GP1P89HS7 — FB TAKİP (İNCELEME-80 Y-1/Y-2/Ö-1) · RBAC bekçisi: JS/MTS kaynaklar, dinamik import() kaçışları, maliyet (se-fb)

**Durum:** TAMAM
**Dal:** `se-fb/muo4gp-guard-js-cost`. Kod commit'i `a21b3a50`. dev (`47c96594`) dala merge edildi (`814a1a27`), dev'e fast-forward yapıldı. Push YOK.
**Değişen tek kaynak:** `tests/server-action-rbac-guard.test.ts`. Bekçi gevşetilmedi: kaldırılan kural yok, istisna listesine (`ALLOWED`/`TRUSTED`) ekleme yok.

## 1) Ne yapıldı

| Bulgu | Düzeltme |
|---|---|
| **Y-1** (a) `.js/.jsx/.mjs/.mts` modüle giden import sessiz geçiyordu | `CODE_EXTS` artık `.ts .tsx .mts .cts .js .jsx .mjs .cjs` uzantılarını kapsıyor. Specifier TS'in yaptığı gibi çözülüyor (`./x.js` → `x.ts`, `./x.mjs` → `x.mts`). `@/` ya da göreli bir specifier src/ altında hiçbir dosyaya çıkmıyorsa bu bir **yazma** sayılır ve fail-closed olur (`import of src/…, which is no file the guard can read`). Önceden bu durum "paket" sayılıp geçiliyordu. |
| **Y-1** (b) `.js` bir `'use server'` modülü taranmıyordu | `sourceFiles()` aynı uzantı kümesini tarıyor. `.d.*ts` ve `.test.*` dosyaları hariç. |
| **D-2** `@/lib/./rbac` tanınmıyordu | `@/` specifier'ı `path.posix.normalize` ile normalize ediliyor. |
| **Y-2** kaçan `import()` biçimleri: C1 koşullu, C4 `await (a ? import : import)`, C5 üst düzey, C6 `Promise.all` | Sabit specifier'lı bir `import('…')` iki biçimde **adıyla** izleniyor: bir üyeye erişim, ya da fonksiyon içindeki düz bir `const`. Başka her biçimde ve her sabit `require('…')` çağrısında modülün **tamamı** yürünüyor (`enterModule(target,'*')`). |
| **Y-3** (se-fb, yeni) | `.ts` dosyası TSX olarak ayrıştırılıyordu. Bu yüzden `<any>tx.x.delete()` yazması görünmüyordu. Artık `.ts`/`.mts`/`.cts` dosyaları `ScriptKind.TS` ile ayrıştırılıyor. |
| **Ö-1** maliyet | Yürüyüş özetleri (overlay, modül, ad, derinlik) anahtarıyla önbelleğe alınıyor. Yürüyüşün dışındaki bir özyineleme durağı tarafından kesilen özet yeniden kullanılmıyor (`cut.min`). `localBinding` ve `writtenTo` memoize ediliyor. Ağaç modülleri overlay'ler arasında bir kez ayrıştırılıyor. |

Yeni kendi-mutant testleri (describe `İNCELEME-80 Y-1/Y-2/Y-3`): Y-1 ×4, Y-2 (10 biçim + hassasiyet), Y-3, Ö-1 bellek sağlamlığı ×2.

## 2) Kanıt

### 2.1 Süre, önce ve sonra (bu makinede, aynı düzenek)
devop-fb'nin `zz-devopfb-i80-timing.test.ts` düzeneği kullanıldı: gerçek ağaçtaki 42 `'use server'` dosyası, önbelleksiz overlay `{}`, `process.cpuUsage`.
```
ÖNCE  (a21b3a50~1)  scan#1 cpu=2826ms  scan#2 cpu=2926ms  scan#3 cpu=2937ms   (files=42 keys=128 findings=0)
SONRA (a21b3a50)    scan#1 cpu=582ms   scan#2 cpu=495ms   scan#3 cpu=575ms
SONRA (tekrar)      scan#1 cpu=598ms   scan#2 cpu=509ms   scan#3 cpu=496ms
```
**Sonuç:** Tarama ~2.9 sn'den ~0.5 sn CPU'ya indi, yani ~5.5× hızlandı. Hedef ≤2 sn'ydi, sağlandı. Bekçi test dosyasının tamamı (`/usr/bin/time`): önce **7.52 s user** (7.0 sn vitest süresi), sonra **2.05 s user** (1.19 sn, 52/52). devop-fb aynı "önce" commit'i için 6.7–8.8 sn ölçmüştü. O ölçüm load ≥50 altındaydı; bu koşudaki load ~10–23 arasındaydı.
Dosyalar: `TASK-MUO4GP1P89HS7-se-fb-ekler/before-timing.txt`, `after-timing{1,2}.txt`.

### 2.2 devop-fb'nin 45 mutantı (İNCELEME-80 düzeneği), önce ve sonra
```
ÖNCE : beklenenden sapan 10/45 — C1 C4 C5 C6 P1 P4 YEŞİL (kaçtı), P6 KIRMIZI (FP), S6, F1, F2
SONRA: beklenenden sapan  3/45 — S6, F1, F2
```
- C1, C4, C5 ve C6 artık KIRMIZI (`via ?*`). P1 ve P4 KIRMIZI. P6 (`@/lib/./rbac`) artık YEŞİL.
- Kalan 3 sapma bu kartın kapsamı dışında:
  - S6 (`const s2 = scope; s2.role = x`): bekçi belgesinde kapsam dışı olarak yazılı.
  - F1 ve F2 (D-1): FP. Güvenli taraftalar, gerçek ağaçta 0 kez tetikleniyorlar.
- T1–T6 ve J1–J3 (tip ve JSON importları) YEŞİL kaldı, yeni FP yok.

Dosyalar: `before-m.txt`, `after-m.txt`.

### 2.3 Bekçi kodunda mutasyon: yeni testler gerçekten ısırıyor mu (8/8 KIRMIZI)
```
M1 CODE_EXTS yalnız .ts/.tsx               → × Y-1: a writer in a .js/.jsx/.mjs/.mts/.cjs/.cts module      1 failed | 51 passed
M2 unresolved() sessiz                     → × Y-1: an import into src/ that names no file is fail-closed  1 failed | 51 passed
M3 izlenmeyen import() biçimi sessiz       → × Y-2: a constant `import()` in a shape … whole module        1 failed | 51 passed
M4 require() sessiz                        → × Y-2 (aynı test, require satırı)                              1 failed | 51 passed
M5 .ts TSX olarak ayrıştırılır             → × Y-3: a `.ts` module is parsed as TypeScript                  1 failed | 51 passed
M6 @/ normalize edilmez                    → × Y-1/D-2: `@/lib/./rbac` is the check                         1 failed | 51 passed
M7 kesilmiş özet yeniden kullanılır        → × Ö-1: a walk cut short by recursion is not reused             1 failed | 51 passed
M8 özet anahtarında derinlik yok           → × Ö-1: … walked again, so MAX_DEPTH still holds                1 failed | 51 passed
```
Her mutasyondan sonra dosya geri yüklendi ve `git status` temiz çıktı.

### 2.4 Gerçek ağaçta: FP 0, gerçek `.js` dosyasıyla kanıt
- Temiz ağaçta `scans the real server action modules` ve `every write action checks the caller role…` testleri YEŞİL (52/52). Gerçek taramada `findings=0`, yani FP 0.
- Diske geçici probe yazıldı (sonra silindi): `src/lib/zzprobe/legacy.js` (yazıcı), `src/app/zzprobe/actions.js` ('use server', rolsüz yazma) ve `actions2.ts` (bu dosya `'@/lib/zzprobe/legacy.js'`'ten import ediyor). Sonuç:
```
+ "app/zzprobe/actions.js#zzDrop: write action without a role check …"
+ "app/zzprobe/actions2.ts#zzViaJs: write action without a role check …"
Tests  1 failed | 51 passed (52)
```
Bu çıktı Y-1 (a) ve (b)'nin gerçek dosya sisteminde kapandığını gösteriyor.

### 2.5 Kapılar (birleşik ağaç `814a1a27` = dal + dev `47c96594`)
İzole DB: kendi konteynerim `sefb4gp-pg` (127.0.0.1:55740). Paylaşılan :5433'e yazılmadı.
```
npx vitest run (1)  EXIT=0  Test Files 293 passed | 2 skipped (295) · Tests 3595 passed | 36 skipped (3631) · 29.86s
npx vitest run (2)  EXIT=0  tests 3631 pass 3595 fail 0 skip 36
check-live-skips    LIVESKIP_EXIT=0 (36 atlamanın hepsi "allowed")
npx tsc --noEmit    TSC_EXIT=0
npx eslint          LINT_EXIT=0
npx next build      BUILD_EXIT=0
```

## 3) Değişen dosyalar
- `tests/server-action-rbac-guard.test.ts` (+414/−36, `a21b3a50`)
- `docs/agent-results/TASK-MUO4GP1P89HS7-se-fb.md` ve `…-se-fb-ekler/` (ölçüm ve mutant çıktıları)

## 4) Riskler
- **Fail-closed kuralının FP maliyeti:** src/ altında dosyaya çıkmayan bir specifier artık KIRMIZI. Bugün gerçek ağaçta 0 kez tetikleniyor. İleride `@/` ile başlayıp src/ dışını gösteren bir tsconfig alias'ı eklenirse bekçi KIRMIZI verir. Bu bilinçli bir tercih: alias eklenince bekçiye de eklenmeli.
- **Büyük/küçük harf:** `@/lib/DB` gibi bir specifier macOS'ta (büyük/küçük harfe duyarsız dosya sistemi) çözülüyor, Linux CI'da çözülmüyor. Bekçi `fs.existsSync` kullanıyor, bu yüzden sonucu platforma göre değişebilir. Linux'ta sonuç fail-closed KIRMIZI olur, yani güvenli taraf. devop-fb'nin K2 satırı (`@/lib/RBAC`) mac'te de KIRMIZI çıkıyor.
- Hesaplanmış specifier'lı `import(x)` hâlâ kapsam dışı. Bu durum belgede yazılı.

## 5) Açık sorular
- D-1 (F1/F2 FP) ve S6 ayrı kart mı olacak? Önerim: D-1 için hayır (güvenli taraf, FP 0). S6 için kart gerekmez, belgede kalsın.

## 6) Sonraki adım
- İnceleme (devop-fb / crw-fb), 45 mutantlık düzenekle `after-m.txt` sonucunu tekrar üretebilir.

**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Apple Silicon). Kod yolu platforma bağlı değil: `path.posix` kullanılıyor ve ayraç her zaman `/`'a çevriliyor (`split(path.sep).join('/')`). Tek platform farkı dosya sisteminin büyük/küçük harfe duyarlılığı (§4). Linux'ta (CI) bu fark daha katı, fail-closed sonuç veriyor. Windows'ta koşulamadı, çünkü bu ofiste Windows makinesi yok. Windows'ta `path.sep` `\` olduğu için göreli yol `/`'a çevrilerek aynı anahtarı üretiyor.
