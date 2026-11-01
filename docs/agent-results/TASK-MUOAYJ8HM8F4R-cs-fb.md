# TASK-MUOAYJ8HM8F4R — FB İNCELEME-101: RBAC bekçisi baseUrl / PATTERN_KEY_COMPARE / catch-all düzeltmesi (cs-fb)

**Durum:** TAMAM
**Karar:** **ONAY.** İNCELEME-97'de bulduğum Y-1, Y-2 ve B-1 kapandı. Bunu bekçinin kendi testleriyle değil, TypeScript'in kendi çözücüsüyle (`ts.resolveModuleName`) karşılaştırarak doğruladım. Gerçek ağaçta FP 0. Kapılar yeşil. Bloklayan bulgu yok. Aşağıda 2 düşük önemli bulgu (B-1, B-2) ve 4 not (N-1..N-4) var. Hiçbiri merge'i geri almayı gerektirmiyor.

**İncelenen:** crw-fb `556d01e2` (dev merge `c3ba06d2`), TASK-MUOACFUBMNOGQ.
**Ortam:** Kendi worktree'lerim, dev `829dbf4b` üzerinde (scratchpad `wt101` temiz kapılar için, `wt101b` gerçek build probe'u için). İzole DB `csfb101-pg` kabında (`127.0.0.1:55981`, pgvector pg16). Paylaşılan `:5433`'e bağlanılmadı. Kod değiştirilmedi. İş sonunda iki worktree de kap da silindi.
**Ekler:** `docs/agent-results/TASK-MUOAYJ8HM8F4R-cs-fb-ekler/`

**Platform beyanı:** Her şey mac'te doğrulandı (Darwin 27, Apple Silicon, Node 26, TS 5.9.3, Next 16.3.4 Turbopack, Postgres 16 Docker'da). Linux ve Windows koşulamadı, çünkü bu makinede yalnız mac var. Koddan okuduklarım:
- Yeni çözümleme `path.posix`, `startsWith` ve `endsWith` kullanıyor. Yani harfe duyarlı ve yalnız `/` ayracını tanıyor. Bu yüzden Linux, mac ve Windows'ta aynı sonucu verir.
- **Windows'a özgü tek açık nokta ters bölü.** Bkz. N-1. tsc `\`'yi her platformda `/` olarak okuyor, bekçi okumuyor. Mac'te Turbopack bu yolu çözemediği için build kırılıyor (ölçüldü). Windows'ta Turbopack'in `\`'yi ayraç sayıp sayamayacağını ölçemedim. Prod ve CI Linux'ta build aldığı için orada build kırılır.
- `fs.existsSync` harfe duyarsız dosya sistemlerinde (mac, varsayılan Windows) farklı davranabilir. Bu, İNCELEME-97'deki N-1 (`./SRC/…`) ile aynı konu. Hâlâ açık ve kapsam dışı (matris A8).

## 1) Ne yapıldı

1. **Diff okundu.** `aliasTableOf` (baseUrl), `matchAlias` (Node PATTERN_KEY_COMPARE ve tsconfig eşitlikte fail-closed), `resolveBare` (paths → baseUrl → imports → node_modules), `isPackage`, `resolvesOutside`, `probed` ve 3 yeni test incelendi.
2. **Bağımsız kâhin kuruldu.** Bekçinin kopyasını `tests/zz-probe101.test.ts` olarak açtım ve ana describe'ı `skip` yaptım. Aynı overlay'i TypeScript'in kendi `ts.resolveModuleName` fonksiyonuna, bir overlay host'u ve `parseJsonConfigFileContent` üzerinden verdim (`extends` de böylece çözülüyor). Sonra her durumda bekçinin `resolveSpec` sonucunu tsc'nin sonucuyla karşılaştırdım. crw-fb'nin "FP yok" kanıtı bekçiyi bekçiyle karşılaştırıyordu. Bu karşılaştırma ise dışarıdan bir ölçüye dayanıyor.
3. **İNCELEME-97 matrisini (21 satır) ve 29 yeni durumu** kâhine karşı koştum.
4. **Gerçek ağaçtaki 263 farklı çıplak specifier'ı** 4 config varyantında kâhine karşı koştum.
5. **Mutantlar:** İNCELEME-97'de hayatta kalan 8 mutantı yeni koda taşıdım. Ayrıca crw-fb'nin hayatta kalan n18'ini ve 7 yeni mutantı koştum.
6. **Gerçek build probe'ları (Turbopack):** baseUrl `./src`, ters bölülü iki `paths` biçimi ve mutlak baseUrl denendi.
7. **Süre:** soğuk `scanSrc()`, eski ve yeni bekçi dönüşümlü, 4 tur.
8. **Kapılar:** CI sırasıyla hazırlanmış DB'de tam `vitest` ve live-skip kapısı, sonra `tsc`, `eslint` ve `next build`.

## 2) Kanıt

### 2.1 Kâhin matrisi (`ekler/i101-matrix.txt`)
Sütunlar: tsc'nin çözdüğü yer, bekçinin çözdüğü yer ve hüküm. `ok(closed)` şu demek: tsc src'yi buluyor, bekçi ise hangi hedef olduğunu bilemediği için fail-closed kalıyor. `FP` şu demek: tsc hiçbir şey bulamıyor (build zaten kırılır), bekçi ise src'yi yürüyüp kırmızı veriyor. İkisi de güvenli yön.
```
A7  eşit önek #q/*.js (Y-2)          tsc=SRC:lib/i89/legacy2.js  guard=SRC:…legacy2.js  ok
A7b sıra ters                         tsc=SRC                     guard=SRC              ok
B5  baseUrl . + src/lib/… (Y-1)       tsc=SRC                     guard=SRC              ok
B6  baseUrl ./src + lib/…             tsc=SRC                     guard=SRC              ok
B4  catch-all → zod (B-1)             tsc=OUT:pkg                 guard=OUT/PKG          ok
B4b catch-all → lib/…                 tsc=SRC                     guard=SRC              ok
N1  baseUrl + paths birlikte          tsc=SRC                     guard=SRC              ok
N2  paths göreli hedef, baseUrl yok   tsc=SRC                     guard=SRC              ok
N3  baseUrl yok, 'lib/…' (paket kalmalı)  tsc=NONE               guard=OUT/PKG          ok
N3c baseUrl . , zod                   tsc=OUT:pkg                 guard=OUT/PKG          ok
N3d baseUrl ./src , next/server       tsc=OUT:pkg                 guard=OUT/PKG          ok
N4  extends ile gelen baseUrl         tsc=SRC                     guard=OUT/PKG  ama problems=["tsconfig.json `extends`: …"] → suite kırmızı
N5  imports koşullu nesne + eşit önek tsc=SRC                     guard=SRC              ok
N5b … koşullar farklı hedef           tsc=SRC                     guard=CLOSED           ok(closed)
N5c koşullu nesne kısa anahtarda      tsc=NONE                    guard=OUT/PKG          ok
N6  catch-all + @/lib/rbac            tsc=SRC:lib/rbac.ts         guard=SRC:lib/rbac     ok
N6b/c/d catch-all + @prisma/client, zod/v4, node:fs   hepsi OUT/PKG                      ok
N7  catch-all, src'ye çözülen çıplak  tsc=SRC                     guard=SRC              ok
N12 baseUrl . + açık uzantı           ok      N13 exact paths + baseUrl   ok
N14 baseUrl ./src/ (sonda /)          ok      N15/N16 dizin → index.js    ok
B8  tsconfig→scripts(yok), imports→src  tsc=NONE   guard=SRC → FP (bkz. B-2)
N8c tek hedef src-dışı(yok) + baseUrl   tsc=NONE   guard=SRC → FP (bkz. B-2)
N8/N8b/N8d çok hedefli / eşit önek src-dışı + baseUrl  tsc=NONE  guard=OUT/PKG  ok
N9  baseUrl ".\\src"   N10 mutlak baseUrl   N11 baseUrl "../<repo>/src"
                                      tsc=SRC  guard=OUT/PKG, problems=[]  → bkz. N-2 (suite yine de kırmızı)
N9b paths hedefi ".\\src\\lib\\*"     tsc=SRC  guard=OUT/PKG, problems=[]  → bkz. N-1 (build kırılıyor)
```
tsc'nin izi, B8 ve N8c'de bir `paths` anahtarı eşleşip hedef boş çıkınca doğrudan node_modules'a geçildiğini gösteriyor:
```
Module name 'lib/i89/legacy2', matched pattern 'lib/*'.
Loading module as file / folder, candidate module location '…/scripts/i89/legacy2' …
Loading module 'lib/i89/legacy2' from 'node_modules' folder …
======== Module name 'lib/i89/legacy2' was not resolved. ========
```

### 2.2 Gerçek ağaç ve tsc (FP 0 kâhinle doğrulandı)
```
today:         distinct bare=263 {"ok":263} bad=[]
catch-all:     distinct bare=263 {"ok":263} bad=[]
baseUrl .:     distinct bare=263 {"ok":263} bad=[]
baseUrl ./src: distinct bare=263 {"ok":263} bad=[]
```
Bekçi, bugünkü ağaçtaki her çıplak import'u dört varyantta da tsc ile aynı dosyaya çözüyor (`.ts` uzantısı düşürülmüş id ile).

### 2.3 Mutantlar (`ekler/mutants101.txt`, üreten dosya `mut101.py`)
```
İNCELEME-97'de hayatta kalanlar, yeni kodda:
m1  imports dizisi: yalnız ilk eleman                 ÖLDÜ
m3  en uzun önek yok                                  ÖLDÜ
m4  tam anahtar önceliği yok (sıraya bağlı)           ÖLDÜ
m7  anahtar sonekini denetleme                        ÖLDÜ
m8  src öneki gevşek (srcx/ de src)                   HAYATTA  (yalnız FP yönü: 'srcx/…' → bulunamaz → fail-closed)
m9  alias tablosu değişince yeniden çözme yok         HAYATTA  (yalnız test altyapısı, bkz. N-3)
m11 kaynaklar ayrı değil                              ÖLDÜ
m14 tsconfig parse hatası yutuluyor                   ÖLDÜ
crw-fb'nin "eşdeğer" dediği:
n18 bare: probed eklenmiyor                           HAYATTA — ama EŞDEĞER DEĞİL, bkz. B-1
Yeni:
x1 missed atanmıyor (catch-all typo → paket)          ÖLDÜ
x2 isPackage @types'a bakmıyor                        HAYATTA  (FP yönü: yalnız-@types paket → fail-closed)
x3 isBuiltin yok                                      ÖLDÜ
x4 baseUrl normalize yok                              HAYATTA  (eşdeğer: join zaten normalize ediyor)
x5 tsconfig '*' boşa izin yok                         HAYATTA  (yalnız `'@/'` gibi kenar; tsc izin veriyor)
x6 src-dışı imports → blind                           ÖLDÜ
x7 imports probed eklenmiyor                          HAYATTA  (n18 ile aynı sınıf, test altyapısı)
```
Özet: İNCELEME-97'nin 8 hayatta kalanından 6'sı artık ölüyor. Kalan m8 ve m9'un ikisi de fail-open değil.

### 2.4 n18'in eşdeğer olmadığının kanıtı (`zz-probe101.test.ts.txt`, "shadowing" testi)
Gerçek `lib/rag.ts`, `'@/lib/ai/prompts'` import ediyor ve bugün bu `lib/ai/prompts/index.ts`'e çözülüyor. Overlay önüne bir `lib/ai/prompts.ts` koyuyor, `renderPrompt` da yazıyor. readOnly bir action `formatRagPrompt`'u çağırıyor:
```
bugünkü bekçi:   SHADOW ["readOnly: true but writes: prisma.evidence.delete (lib/ai/prompts.ts:2, via renderPrompt (lib/ai/prompts.ts))"]
n18 mutantı:     SHADOW []
```

### 2.5 Gerçek build probe'ları (`ekler/build-probes.txt`)
Hepsi `wt101b`'de. Kurulum: `src/lib/i101/legacy{5,6}.js` işaretli yazıcılar, `src/app/[locale]/i101/actions.ts` (zzN10 sınanan yol, zzCtrl `@/` pozitif kontrol), `src/app/api/zz-i101/route.ts`.
```
baseUrl ./src + '@/*': ['./*'], zzN10 ← 'lib/i101/legacy5'
  TSC_EXIT=0 · bekçi: zzN10 KIRMIZI + zzCtrl KIRMIZI · BUILD_EXIT=0, ƒ /api/zz-i101, N10_MARK .next/server'da 2 dosya
N9b paths '~l/*': ['.\\src\\lib\\*'] (baseUrl yok)
  TSC_EXIT=0 · bekçi: yalnız zzCtrl · BUILD_EXIT=1 "Non-relative paths are not allowed when 'baseUrl' is not set" (next.config yükleme)
N9c baseUrl '.' + '~l/*': ['src\\lib\\*']
  TSC_EXIT=0 · bekçi: yalnız zzCtrl · BUILD_EXIT=1 "Module not found: Can't resolve '~l/i101/legacy5'", N10_MARK 0 dosya
N10 mutlak baseUrl + '@/*': ['./*']
  TSC_EXIT=0 · bekçi: 36 failed | 26 passed (bütün '@/' çözümü src dışına düşüyor → gürültülü kırmızı)
```

### 2.6 Süre (`ekler/timing101.txt`)
Soğuk `scanSrc()` (37 action dosyası), `process.cpuUsage` (süreç geneli, GC iş parçacıkları dahil). Eski bekçi `32eff357`'den alındı. Load 18–20.
```
eski  cpu 1.290 / 0.987 / 1.084 / 0.992 s   wall 1.286 / 0.573 / 0.656 / 0.575 s
yeni  cpu 1.011 / 1.029 / 1.057 / 0.996 s   wall 0.584 / 0.604 / 0.646 / 0.580 s
```
Eski ve yeni arasında fark yok. Duvar saati ≈0.6 s. Süreç geneli CPU ≈1.0 s, sınırda. Bunun nedeni ölçümün GC iş parçacıklarını da saymasıydı. crw-fb'nin iş parçacığı içindeki `findingsFor` ölçümü (0.45–0.49 s) aynı işi daha dar ölçüyor. Değişiklik bir süre gerilemesi getirmiyor.

### 2.7 Kapılar (`ekler/fullrun-summary.txt`, `gates.txt`, `db-prep.txt`)
DB'yi CI sırasıyla hazırladım: `db push` → `setup-rls-role` → 41 migrasyon ×2 → `apply-rls` (28 → 112 politika) → seed ("Seeding completed"). Ortam `CI=true` ve ci.yml'deki `AUTH_SECRET` fixture'ıydı. `PSQL=psqlw.sh` bir docker exec sarmalayıcısı. Worktree'de `.env` yoktu, yani hiçbir test `:5433`'ü göremedi.
```
Test Files  296 passed | 2 skipped (298)
     Tests  3788 passed | 41 skipped (3829)
VITEST_EXIT=0 · LIVESKIP_EXIT=0 (atlamalar yalnız "allowed": S3 live, k1 REAL OpenAI)
TSC_EXIT=0 · LINT_EXIT=0 · BUILD_EXIT=0 (✓ Compiled successfully in 8.4s, temiz ağaç)
```

## 3) Bulgular

**B-1 (düşük, test boşluğu): n18 eşdeğer değil.** crw-fb raporundaki §2.4, n18'i "bugünkü ağaçta gözlemlenemez" diye eşdeğer saymış. §2.4'teki probe bunun tersini gösteriyor. Gerçek bir modülün `@/` import'u bir dizin `index`'ine çözüldüğünde, overlay'in önüne eklediği dosya ancak `probed` sayesinde görülüyor. Etki yalnız bekçinin overlay'li öz-testlerinde, çünkü gerçek tarama `NO_OVERLAY` ile koşuyor. Yani bu bir prod kaçışı değil, bekçinin kendi testinin kör noktası. Öneri: §2.4'teki üç satırlık probe'u kalıcı test olarak eklemek. x7 (`imports` için aynı sınıf) bu testle ölmez, çünkü probe `@/` üzerinden geçiyor. Onu öldürmek için `#…` import eden gerçek bir modül gerekir ve bugün ağaçta böyle bir modül yok.

**B-2 (düşük, belge doğruluğu): "tsc de böyle yapar" iddiası TS 5.9 için yanlış.** Başlık belgesi, `resolveBare` yorumu ve `u3` testindeki "falls through to `baseUrl`, as in tsc" yorumu, bir `paths` hedefi boşa düşünce tsc'nin baseUrl'e ve imports'a geçtiğini söylüyor. tsc izi (§2.1) bir `paths` anahtarı eşleşince doğrudan node_modules'a geçtiğini gösteriyor. Bu yüzden bekçi tsc'den katı çalışıyor ve B8 ile N8c'de "FP" veriyor. Bu güvenli yön, çünkü tsc TS2307 verir ve build'in typecheck'i zaten kırılır. Bekçinin davranışını değiştirmek gerekmiyor. Yalnız yorumlar şöyle düzeltilmeli: "tsc stops at node_modules; the guard goes on, which is stricter". Ayrıca crw-fb raporundaki "B8 artık KIRMIZI" kazancı tsc'ye göre bir FP. Zararsız, ama bir kazanç sayılmamalı.

**N-1 (Windows'a özgü, ölçülemedi): ters bölülü `paths` hedefi ve `baseUrl`.** tsc her platformda `\`'yi `/` olarak okuyor (N9, N9b tsc=SRC). Bekçi okumuyor ve `problems` de boş kalıyor. Mac'te iki biçim de build'i kırıyor (§2.5), dolayısıyla mac ve Linux'ta kaçış değil. Windows'ta Turbopack'in davranışını ölçemedim. Ucuz bir kapatma şu olurdu: `aliasTableOf` içinde `\` içeren bir hedefi ya da baseUrl'i `problems`'a yazmak (fail-closed).

**N-2 (gürültülü ama fail-closed): mutlak ya da `../<repo>/src` baseUrl.** Çözüm düzeyinde sessiz (N10, N11). Ama bütün `@/` yolları da aynı baseUrl'e bağlandığı için suite 36 testle kırmızı oluyor (§2.5). Sessiz bir kaçış yok, yalnız hata mesajı yanıltıcı. İstenirse `path.posix.relative(REPO_ROOT, path.resolve(REPO_ROOT, baseUrl))` ile normalize edilebilir.

**N-3 (öz-test kırılganlığı):** B-1 kilit testi tsconfig'in `"@/*": ["./src/*"]` metnine `replace` ile bağlı. `baseUrl ./src` + `"./*"` probe'unda test yalnız `expected … not to be …` mesajıyla kırmızı oldu. Bugün sorun değil, ama tsconfig biçimi değişirse mesaj yol göstermiyor. m9 (alias tablosu değişince yeniden çözme) İNCELEME-97'den beri hayatta. O da yalnız test altyapısını etkiliyor.

**N-4 (önemsiz):** crw-fb'nin eklerindeki `psqlw.sh` dosyasında `-f` olmayan dal hâlâ benim eski kabımı (`csfb97-pg`) gösteriyor. Bu dal kopyalanmaktan kalmış ve raporun sonuçlarını etkilemiyor.

## 4) Değişen dosyalar
- `docs/agent-results/TASK-MUOAYJ8HM8F4R-cs-fb.md` ve `…-cs-fb-ekler/` (probe, mutant betiği ve çıktılar). Ürün koduna ve teste dokunulmadı.

## 5) Riskler
- Kâhin tsc'dir, Turbopack değil. Turbopack'i yalnız §2.5'teki dört durumda ölçtüm. tsc'nin durduğu yerde Turbopack'in devam ettiği durumlarda (B-2) bekçi zaten katı tarafta kalıyor.
- Windows ölçülemedi (N-1).

## 6) Açık sorular
- B-1 testi ve B-2 yorum düzeltmesi küçük bir takip kartına mı alınsın, yoksa bir sonraki bekçi işine mi eklensin? Liderin kararı.

## 7) Sonraki adım
- Kart `review` → `done` (ONAY).
- İsteğe bağlı takip: B-1 (shadow testi), B-2 (yorumlar), N-1 (`\` → problems).
