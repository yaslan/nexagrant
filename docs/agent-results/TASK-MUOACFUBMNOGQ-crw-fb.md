# TASK-MUOACFUBMNOGQ — RBAC bekçisi: baseUrl çıplak specifier (Y-1), imports PATTERN_KEY_COMPARE (Y-2), catch-all paths FP (B-1) (crw-fb)

**Durum:** TAMAM
**Dal:** `crw-fb/muoacf-guard-baseurl` (dev `32eff357`'den açıldı), kendi worktree'm (scratchpad `wt`). Kapılar yeşil olunca dev'e merge edildi. Push yapılmadı.
**İzole DB:** `crwfbacf-pg` kabı (`127.0.0.1:55971`, pgvector pg16). Paylaşılan `:5433`'e bağlanılmadı. Kap iş sonunda kaldırıldı.
**Ekler:** `docs/agent-results/TASK-MUOACFUBMNOGQ-crw-fb-ekler/`

**Platform beyanı:** Her şeyi mac'te doğruladım (Darwin 27, Apple Silicon, Node 26, TS 5.9.3, Next 16.3.4 Turbopack, Postgres 16 Docker'da). Linux ve Windows'u koşamadım, çünkü bu makinede yalnız mac var. Koddan okuduklarım:
- Yeni çözümleme `path.posix` ve `startsWith`/`endsWith` ile çalışıyor, yani harfe duyarlı ve `/` ayraçlı. Bu yüzden üç işletim sisteminde de aynı sonucu verir.
- Dosya varlığı `fs.existsSync` ile bakılıyor (`exists`, `resolvesOutside`, `isPackage`). Harfe duyarsız dosya sistemlerinde (mac, varsayılan Windows) bu fark yaratabilir. İNCELEME-97'deki N-1 (`./SRC/...`) aynen duruyor. Bu işin kapsamı dışında kaldı, bkz. §4.
- `isBuiltin` Node'un kendi listesi, platformdan bağımsız.

## 1) Ne yapıldı

Bekçide (`tests/server-action-rbac-guard.test.ts`) alias çözümünü yeniden yazdım. Eskiden `aliasBase` + `specBase` + `resolveSpec` vardı. Şimdi tsc'nin `moduleResolution: bundler` sırasına uyan bir çözümleyici var:

| Fonksiyon | Satır | Ne yapıyor |
|---|---|---|
| `aliasTableOf` | 485 | tsconfig `compilerOptions.baseUrl` değerini tabloya alıyor. String değilse bu bir `problems` kaydı olur, yani test kırmızı. |
| `matchAlias` | 523 | Tam anahtar her zaman önce gelir, sonra en uzun önek. **package.json** için Node PATTERN_KEY_COMPARE uygulanır: önek eşitse uzun anahtar kazanır, ve `*` en az bir karakterle eşleşmelidir. **tsconfig** için tsc eşitlikte ilk anahtarı seçer, ama bir bundler farklı seçebilir. Bu yüzden eşit önekli anahtarların hepsi döner ve hedefleri birlikte değerlendirilir; farklılarsa sonuç fail-closed olur. |
| `resolveBare` | 594 | Sıra şöyle: tsconfig `paths` → `baseUrl` + specifier → package.json `imports` → node_modules. Bir adım yalnız bir öncekinin hedefi **dosya bulamazsa** çalışır, tsc de böyle yapar. src/ dışındaki bir hedefin dosya olup olmadığına `resolvesOutside` bakar. Aşağıdaki durumlar değişmedi: çok hedefli alias'ta hedeflerden biri src/'deyse fail-closed; iki dosya farklı yer gösterirse fail-closed; Node'da `imports` eşleşmesinin hedefi yoksa bu bir hata, yani sonraki adıma düşmez (`?src/...`, D1 aynen). |
| `isPackage` | 565 | Yalnız src/'ye işaret eden bir alias boşa düştüğünde çağrılıyor. Paketi `node_modules/<ad>` ya da `node_modules/@types/<ad>` varlığıyla, veya Node yerleşik modülü (`isBuiltin`) olarak tanır. Paketse sonuç paket olur (B-1 FP kalkar). Değilse bu bir yazım hatasıdır ve fail-closed "cannot find" verir. |
| `resolveSpec` / `lookup` | 640 / 649 | Göreli specifier davranışı değişmedi. `probed` kümesi baktığı her src/ yolunu kaydediyor. Bu küme `loadModule`'ün gölgeleme tespitinde kullanılan `specs`'in yerine geçti; eski `specBase` kaldırıldı. |

Başlık belgesine yeni sırayı anlatan bir paragraf ekledim.

Üç yeni test ekledim (`İNCELEME-89 Y-4: import aliases` describe'ı içinde):
- **Y-1** (satır 2740): `baseUrl "."` + `'src/lib/…'` ve `baseUrl "./src"` + `'lib/…'` kırmızı. `paths` hedefi boşa düşünce `baseUrl`'e geçiliyor. `src/lib/…/nope` fail-closed. `zod` paket sayılıyor. `baseUrl: 1` bir problem kaydı.
- **Y-2** (satır 2752): Şunlar test ediliyor: eşit önekte uzun anahtar, iki sırada da (A7/A7b); en uzun önek, iki sırada da (m3); tam anahtar önceliği, iki sırada da (m4); anahtar soneki (m7); boş `*` yok; tsconfig'de eşit önek fail-closed; tsconfig dosya bulamayıp `imports` src/'yi bulunca kırmızı (B8); iki dosya farklı dosya gösterirse fail-closed (m11); dizideki bütün fallback'ler (m1); tsconfig parse hatası (m14). Böylece İNCELEME-97 T-1'de hayatta kalan kurallar da kilitlenmiş oldu.
- **B-1** (satır 2785): Bugünkü tsconfig'e catch-all `"*": ["./src/*"]` eklendiğinde:
  - `zod`, `node:crypto`, `fs`, `next/server`, `@prisma/client` paket sayılıyor.
  - `lib/…` kırmızı.
  - src'deki bir `zod.js` aynı adlı paketin önüne geçiyor.
  - Yazım hatası fail-closed.
  - **Gerçek ağaçtaki bütün çıplak import'lar** (>1000) catch-all ile ve `baseUrl "."` ile bugünkü sonuçlarıyla birebir aynı çözülüyor. Bu, FP olmadığının kalıcı kilidi.

Bekçi gevşetilmedi. Fail-closed olan her durum hâlâ fail-closed. Önceden fail-closed olup şimdi kesinleşen yalnız iki durum var:
- tsconfig hedefi dosya bulamıyor ve `imports` src'yi gösteriyor (B8): eskiden "more than one target" veriyordu, şimdi yürünüp **writes** diye kırmızı oluyor.
- catch-all altında gerçekten var olan paketler: artık paket sayılıyorlar.

## 2) Kanıt

### 2.1 Gerçek dosyalarla uçtan uca (`ekler/probe-tsc.txt`, `probe-guard.txt`)

Kurulum:
- tsconfig'e `"baseUrl": "."` eklendi.
- package.json'a `"imports": {"#q/*": "./scripts/*", "#q/*.js": "./src/lib/zzacf/*.js"}` eklendi.
- `src/lib/zzacf/legacy{2,3}.js` dosyaları `prisma.evidence.delete` yapıyor.
- `src/app/[locale]/zzacf/actions.ts` içinde readOnly iki action var: `zzA7` ← `'#q/legacy2.js'` (Y-2) ve `zzB5` ← `'src/lib/zzacf/legacy3'` (Y-1).

```
npx tsc --noEmit → TSC_EXIT=0
YENİ bekçi:
     × every write action checks the caller role, and no readOnly action writes
+   "app/[locale]/zzacf/actions.ts#zzA7: readOnly: true but writes: prisma.evidence.delete (lib/zzacf/legacy2.js:2, via wipe (lib/zzacf/legacy2))",
+   "app/[locale]/zzacf/actions.ts#zzB5: readOnly: true but writes: prisma.evidence.delete (lib/zzacf/legacy3.js:2, via wipe (lib/zzacf/legacy3))",
      Tests  1 failed | 61 passed (62)
ESKİ bekçi (dev) aynı ağaçta:
ESKİ:       Tests  59 passed (59)          ← iki kaçış da sessiz
```
Probe dosyaları silindi, tsconfig ve package.json geri yüklendi (`git status` → yalnız bekçi dosyası değişik).

### 2.2 cs-fb matrisi + yeni satırlar, eski ve yeni karşılaştırması (`ekler/matrix-old.txt`, `matrix-new.txt`)
```
                                            ESKİ                              YENİ
A7  eşit önek #q/*.js (Y-2)                 []                                writes (KIRMIZI)
B5  baseUrl . + src/lib/… (Y-1)             []                                writes (KIRMIZI)
B6  baseUrl ./src + lib/…                   yalnız header src/src/lib/tenant  writes (KIRMIZI)
B8  tsconfig→scripts(yok), imports→src      blind (fail-closed)               writes (KIRMIZI)
E1  catch-all + @/* → zod        (B-1)      "imports src/zod … cannot find"   []
E2  … → node:fs                  (B-1)      "imports src/node:fs …"           []
E3  … → next/server              (B-1)      "imports src/next/server …"       []
E8  baseUrl . → src/lib/nope                []                                "imports src/lib/nope … cannot find"
E10 tsconfig eşit önek ~q/* vs ~q/*.js      []                                "more than one target" (fail-closed)
```
Diğer bütün satırların sonucu değişmedi. Bunlar A1–A6, A7b, A8–A10, B1–B3, B4b, B7, C1, C2, D1, D2, E4–E7, E9, E11 ve E12.
- E5 (catch-all altında yazım hatası) ve E12 (tsconfig ile imports farklı **var olan** dosyaları gösteriyor) yenide de fail-closed.
- A8 (`./SRC`) iki bekçide de `[]` veriyor. Bu N-1 ve kapsam dışı.

### 2.3 Gerçek ağaçta FP (`ekler/real-variants-new.txt`, `real-variants-old.txt`)
529 kaynak dosya, 263 farklı çıplak specifier ve 44 'use server' modülü tarandı. Her config varyantında bekçinin `findingsFor` sonucuna ve specifier çözümüne bakıldı:
```
YENİ  today              specDiffs=0  findings=0
YENİ  baseUrl .          specDiffs=0  findings=0
YENİ  baseUrl ./src      specDiffs=0  findings=0
YENİ  catch-all *        specDiffs=0  findings=0
YENİ  catch-all + base . specDiffs=0  findings=0
ESKİ  catch-all *        specDiffs=51 ["node:crypto: null -> ?node:crypto","next/cache: …","@prisma/client: …","react: …", …]
```
Gerçek ağaçta, overlay olmadan: bekçi **62/62** geçti ve `aliasProblems(NO_OVERLAY) = []`.

### 2.4 Kendi mutantlarım (`ekler/mutants.txt`, üreten dosya `mut-acf.py`): **20/21 öldü**
```
n1 imports eşit önek uzun-anahtar yok (Y-2) ÖLDÜ   n11 isPackage hep false (B-1 FP)   ÖLDÜ
n2 Node boş * kabul                         ÖLDÜ   n12 src dışı hedef düşmüyor        ÖLDÜ
n3 en uzun önek yok                         ÖLDÜ   n13 çok hedefli paths → ilk        ÖLDÜ
n4 tam anahtar önceliği yok                 ÖLDÜ   n14 iki dosya ayrışınca ilk seçim  ÖLDÜ
n5 anahtar soneki yok                       ÖLDÜ   n15 imports dizisi yalnız ilk      ÖLDÜ
n6 tsconfig eşit önek bağı yok              ÖLDÜ   n16 tsconfig parse hatası yutulur  ÖLDÜ
n7 kaynaklar ayrılmıyor                     ÖLDÜ   n17 baseUrl string değil → sessiz  ÖLDÜ
n8 baseUrl adımı yok (Y-1)                  ÖLDÜ   n18 bare: probed eklenmiyor        HAYATTA
n9 kaçan src → hep paket (fail-open)        ÖLDÜ   n19 resolvesOutside hep false      ÖLDÜ
n10 isPackage hep true (fail-open)          ÖLDÜ   n20 kaçan src hedef düşmez (B-1)   ÖLDÜ
                                                   n21 imports eşleşmesi yok sayılır  ÖLDÜ
```
n18 bugünkü ağaçta gözlemlenemez, yani eşdeğer bir mutant. Nedeni şu: gölgeleme ancak alias tablosu aynı kalırken overlay'in çözümü değiştirmesiyle fark yaratır. Alias tablosu değişince `loadModule` zaten yeniden çözüyor. Aynı id'ye düşen overlay ise zaten id üzerinden okunuyor. Eski bekçide bunun karşılığı olan m9 da hayattaydı (İNCELEME-97).

### 2.5 Süre (`ekler/timing.txt`)
44 'use server' modülü için tam `findingsFor`, soğuk önbellek, ölçüm `process.cpuUsage`. Eski ve yeni dönüşümlü 4 tur koşuldu, load 20–27:
```
eski 0.58 / 0.44 / 0.52 / 0.51 s    yeni 0.47 / 0.45 / 0.49 / 0.48 s
```
İkisi de **1 sn CPU'nun altında** ve aralarında fark ölçülemiyor. Yeni B-1 testi gerçek ağacı bir kez daha okuyor: ≈0.2 s duvar saati, load 22.

### 2.6 Kapılar (`ekler/fullrun-summary.txt`, `gates.txt`, `db-prep.txt`)
DB CI sırasıyla hazırlandı: `db push` → `db:rls-role` → 41 migrasyon ×2 → `db:rls` (28 → 112 politika) → seed (`SEED_EXIT=0`). `CI=true` kullanıldı, `AUTH_SECRET` ci.yml'deki fixture. Bu makinede `psql` olmadığı için `PSQL=psqlw.sh` (docker exec sarmalayıcısı) kullanıldı.
```
VITEST_EXIT=0   Test Files 296 passed | 2 skipped (298) · Tests 3757 passed | 41 skipped (3798)
LIVESKIP_EXIT=0 (atlamalar yalnız "allowed": S3 live, k1 REAL OpenAI)
TYPECHECK (tsc --noEmit) EXIT=0   LINT (eslint) EXIT=0
BUILD_EXIT=0  ✓ Compiled successfully in 9.4s
```
Build'deki tek uyarı `src/instrumentation.ts:18`'deki Edge `process.exit` uyarısı. Bu uyarı önceden de vardı (İNCELEME-97 §2.1) ve bu işle ilgisiz. Build'den önce worktree'deki `node_modules` symlink'i gerçek `pnpm install --offline` ile değiştirildi, çünkü Turbopack symlink'i reddediyor.

## 3) Değişen dosyalar
- `tests/server-action-rbac-guard.test.ts`: çözümleyici, 3 yeni test, başlık belgesi.
- `docs/agent-results/TASK-MUOACFUBMNOGQ-crw-fb.md` ve `…-crw-fb-ekler/`.

## 4) Riskler
- **Bundler'ın tsc'den ayrıldığı durumlar.** Bekçi tsc sırasını izliyor. Turbopack'in `paths`'te boşa düşen bir hedeften sonra node_modules'a düşmesi, tsc ile uyumlu olduğu için güvenli yön. Ama çok hedefli alias'larda ve eşit önekte bekçi zaten tahmin etmiyor, fail-closed kalıyor. Bu durumları gerçek build ile ayrıca ölçmedim. Gerçek build ölçümü yalnız Y-1 ve Y-2 için İNCELEME-97'de yapıldı: Turbopack src'yi seçiyor, bu da bekçinin yeni seçimiyle aynı.
- **`isPackage` yalnız paket adının kökünü kontrol ediyor.** Örneğin `zod/v4` için yalnız `zod`'a bakıyor. Alt yol yoksa tsc ve build zaten kırılır, yani bu bir fail-open değil.
- **N-1 (`./SRC/…`, harfe duyarsız dosya sistemi) açık kaldı.** Kartın kapsamında değildi. Prod'a Linux build'i ulaşıyor, orada bu yol kırılır.
- **`.d.ts`:** src/ altında yalnız `.d.ts` olarak var olan bir modül bekçi için "cannot find", yani fail-closed. Bu davranış önceden de böyleydi ve bugünkü ağaçta böyle bir durum yok.

## 5) Açık sorular
- tsconfig'de eşit önekli iki anahtarı fail-closed yapmak tsc'den katı (E10). tsc burada TS2307 verir ve build'deki typecheck zaten kırmızı olur. Bu yüzden pratikte bekçinin katılığının bedeli yok. Yine de "tsc gibi ilkini al" tercih edilirse tek satırlık bir değişiklik (n6'nın tersi).

## 6) Sonraki adım
- Kapılar yeşil olduğu için dal dev'e merge edildi, push yapılmadı. Push kararı liderde.
- İsteğe bağlı bir takip: N-1 için hedef önekini harfe duyarsız karşılaştırıp fail-closed yapmak.
