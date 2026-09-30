Hüküm: DEĞİŞİKLİK GEREKLİ

# TASK-MUOJ736LL7ILJ — crw-fb — FB İNCELEME-118 (2. koşu): cs-fb/i116-leak-scan-gaps @ 4b11aa01

Bu rapor, rapor kapısından geçmeyen ilk raporun (`TASK-MUOJ736LL7ILJ-crw-fb.md`, "Karar: ONAY") yerine geçer. İlk rapordaki ONAY **geri çekildi**. O koşuda yalnız tek test dosyası koşulmuştu; `tsc`, `next build`, tam vitest ve çalışma anı probe'u yoktu. Bu koşuda hepsini koştum.

İki bloke eden bulgu var:
- **B-1:** dal `tsc` ve `next build`'i kırıyor.
- **B-2:** kartın ana hedefi olan Y-1'in çalışma anında sızdığı kanıtlanmış biçimi (import edilmiş `createRequire`) hâlâ kaçıyor.

Ayrıca Y-4'te dört mutanttan üçü (A1, A4, A10) hâlâ tanıksız. Yeni Y-1 ve Y-2 dallarının hiçbiri de testle korunmuyor.

- **İncelenen:** `cs-fb/i116-leak-scan-gaps`, uç `4b11aa01` (kod `4b47427b`, Y-3/Y-4 kısmı `f4eaca61`). dev `0779e8f8`'e göre değişiklik: `tests/api/action-leak-scan.ts` +89/−5, `action-leak-scan.test.ts` +45 ve rapor dosyası.
- **Ortam:** scratchpad'de `4b11aa01`'den iki ayrı detached worktree açtım: `wt` (kapılar, build, probe) ve `wt-m` (mutantlar). Ana checkout'ta (`/Users/macbook/alan/FONBRIDGE`) checkout, stash veya commit yapılmadı.
- **İzole DB:** `crwfb118-pg`, `127.0.0.1:55118`. `.env`'in yorum dışı satırlarında 5433 sayısı 0. Paylaşılan `:5433`'e dokunulmadı.
- **Ekler:** `docs/agent-results/TASK-MUOJ736LL7ILJ-crw-fb-2-ekler/`. "Eski" tarayıcı `0779e8f8:tests/api/action-leak-scan.ts`.

## 1. Bulgular (önem sırasıyla)

### B-1: Dal typecheck'i ve `next build`'i kırıyor (dev'de temiz)
- **Yer:** `tests/api/action-leak-scan.ts:358` ve `:377`. `noUncheckedIndexedAccess` altında:
  - `x.arguments[1]`, yani `arr`, `Expression | undefined` tipinde.
  - `sym.declarations[0]`, yani `decl`, `Declaration | undefined` tipinde.
  - İkisi de `ts.is*(…)`'e doğrudan veriliyor.
- **Kanıt:** `tsc.txt`, `gates.txt`, `build-branch-as-is.txt`
  ```
  4b11aa01  tsc exit=2
    tests/api/action-leak-scan.ts(358,43): error TS2345: Argument of type 'Expression | undefined' is not assignable to parameter of type 'Node'.
    tests/api/action-leak-scan.ts(377,36): error TS2345: Argument of type 'Declaration | undefined' is not assignable to parameter of type 'Node'.
  0779e8f8 (dev) tsc exit=0, 0 hata
  next build (4b11aa01, olduğu gibi): "Running TypeScript ... Failed to type check."  BUILD_EXIT=1
  ```
- **Etki:** `tsconfig.json` `**/*.ts`'i kapsıyor ve `next build` tip denetimi yapıyor. Bu yüzden dal dev'e girerse CI'daki `pnpm typecheck` ve Docker/`next build` kırmızıya döner. cs-fb raporundaki "ESLint / TypeScript ✓" iddiası yanlış: raporda yalnız `pnpm run lint` çıktısı var.
- **Düzeltme:** `if (arr && ts.isArrayLiteralExpression(arr) …` ve `if (decl && ts.isVariableDeclaration(decl) …`. Bu iki koruma davranışı değiştirmiyor; aynı yamayla build geçti (`probe-only-tsc-patch.diff`).

### B-2: Y-1'in çalışma anında sızdığı kanıtlanmış biçim, import edilmiş `createRequire`, hâlâ görünmüyor
- **Yer:** `tests/api/action-leak-scan.ts:339`. Koşul `!symbolOf(innerCall)?.declarations?.length`, yani `createRequire`'ın **bildirimsiz global** olmasını şart koşuyor. Oysa `createRequire` bir global değil; gerçek kodda her zaman `import { createRequire } from 'node:module'` ile gelir ve o import bir bildirimdir. Bu yüzden dal yalnız tsc'nin zaten reddettiği kodda (import'suz) tetikleniyor.
- **Kanıt:**
  - Sonda `probe118-new.txt`:
    ```
    YAKALADI I5 createRequire global (import YOK — tsc bunu reddeder)          [4]
    KAÇTI    I1 import { createRequire } from 'node:module'; createRequire(…)(…)   []
    KAÇTI    I2 createRequire as cr · I3 nm.createRequire · I4 const req = createRequire(…); req(…) · I6 değişken spesifikatör   []
    ```
  - Gerçek ağaçta `real-tree-116-new.txt`: `KAÇTI R3 createRequire(import.meta.url)(…) []`. Aynı dosyada R1, R2 ve R4 artık [22,30] veriyor.
  - Çalışma anında, `wt` üzerinde gerçek `next build` (Next 16.3.4 Turbopack) ve `next start -p 3918`, `POST /tr/probe116` ile `Next-Action` başlığı (`runtime-probe118.txt`):
    ```
    act       (export let + act = run)            HTTP 200  1:"Error: probe116 secret detail"
    actReq    (const r = require; r(…))           HTTP 200  1:"Error: probe116 secret detail"
    actModReq (module.require)                    HTTP 500  (Turbopack çözemiyor; geçersiz biçim)
    actCreq   (createRequire(import.meta.url))    HTTP 200  1:"Error: probe116 secret detail"
    actReqAs  (const r = require as any; r(…))    HTTP 200  1:"Error: probe116 secret detail"   ← bu koşuda eklendi
    ```
  - Aynı dosyalarda bekçinin hükmü (`scan-probe118.txt`, yamasız `4b11aa01` tarayıcısı):
    ```
    ESKİ: beşi de []
    YENİ: let-actions [[3]] · req-actions [[4]] · modreq-actions [[3]] · creq-actions [] · reqas-actions []
    tam ağaç (probe'lar yerinde): found = let-actions, modreq-actions, req-actions   (creq ve reqas yok)
    ```
  - Gerçek bekçi testi (`guard-with-probes.txt`) "no server action returns what it caught" için yalnız let, modreq ve req'i listeliyor.
- **Neden B:** Kartın tek işi İNCELEME-116'nın Y-1'ini kapatmaktı. Y-1'in çalışma anında kanıtlanmış üç biçiminden biri tam bu `createRequire` idi, ve cs-fb raporu onu "izleniyor" diye sayıyor. Bu kapanmadı. (src'de bugün örneği yok: `src-grep.txt` yalnız bir yorum satırı buluyor. Yani canlı bir sızıntı değil, kapatılmamış bir iddia.)
- **Düzeltme önerisi:**
  - `createRequire`'ı sembolle tanı: import bildirimi `node:module` ya da `module`'den gelen `createRequire` (adlı, `as` ile ya da ad alanı `.createRequire`).
  - Bu çağrının sonucunu yükleyici say: doğrudan `(…)(spec)` biçiminde ve `const req = createRequire(…)` sonrası `req(spec)` biçiminde.
  - Literal değilse UNRESOLVED dön.
  - I1 ve I4'ü tanık test olarak ekle.

### Y-1: `require` takma adı yalnız çıplak `const r = require` biçiminde tanınıyor, fail-closed değil
- **Yer:** `:377`. `isGlobal(decl.initializer, 'require')` sarmalayıcıları (`as`, parantez) soymuyor. Yalnız ilk bildirime ve yalnız `const x = require` biçimine bakıyor.
- **Kanıt** (`probe118-new.txt`):
  - Kaçanlar: `const r = require as any` (R8), `(require)` (R9), `let r; r = require` (R10), `const r = require, s = r` (R11), `require.bind(null)(…)` (R12), `(0, require)(…)` (R13), `module['require']` (R14), `const { require: r } = module` (R15), `const r = module.require` (R16). Hepsi `[]`.
  - R8 çalışma anında HTTP 200 ile sızdırıyor (yukarıdaki `actReqAs`).
- İNCELEME-116'nın önerisi "global `require` tanımlayıcısının çağrı konumu dışındaki **her** okunuşunu fail-closed say" idi. Uygulama bunun yerine tek tek biçimleri eşliyor. `as any`, TS kodunda olağan bir yazım. Bu yüzden en azından `skipWrappers(decl.initializer)` gerekli. Asıl düzeltme şu: `require` ya da `module.require` bir çağrının callee'si değilse okunuşu UNRESOLVED yük say.

### Y-2: Y-4 hâlâ yarım: A1, A4 ve A10 yaşıyor; A1 ve A10'un "tanık" testleri mutantı ayırt etmiyor
- **Kanıt:** `mutants118-out.txt`. Önce taban koşu (136/136), sonra mutantlar; zaman aşımı 0; md5 `eccae237…` önce ve sonra aynı:
  | Mutant (crw2-fb'nin tanımı, aynen) | Sonuç | Not |
  |---|---|---|
  | A1 yük değer olarak → temiz (`:956`) | **SURVIVED** | `Y-4 > A1` testi `const m = await import(); return { svc: m }` kullanıyor; bu girdi mutantta da [4] veriyor |
  | A3 import'a verilen catch bağlamı yazım değil (`:…isImport(rs)`) | KILLED | `Y-4 > A3` testi öldürüyor |
  | A4 `Reflect.apply(fn, e, …)` yazım değil (`:660`) | **SURVIVED** | test yok; cs-fb raporu "A2 ve A4 deferred" diyor |
  | A10 `(await import()).f(out)` etkisi (`:733`) | **SURVIVED** | `Y-4 > A10` testi `const svc = await import(); svc.fill(out, e)` kullanıyor. Bu ad alanı yolu, `(await import()).f` yolu değil |
- **Ayırt edici girdiler** (`witness118-out.txt`):
  ```
  A1  cs-fb testi                         orijinal=[4] · mutant=[4]
  A1  return { m: await import(…) }       orijinal=[4] · mutant=[]
  A4  Reflect.apply(setCode, e, [])       orijinal=[4] · mutant=[]
  A10 cs-fb testi                         orijinal=[6] · mutant=[6]
  A10 (await import()).fill(out, e)       orijinal=[6] · mutant=[]
  ```
- **Düzeltme:** A1 ve A10 testlerinin girdisini alt satırdaki ayırt edici girdiyle değiştir, A4 testini ekle. Test adlarında "A1/A10 witness" yazıp mutantı öldürmemek, İNCELEME-116'daki Y-4'ün tam da kapatmak istediği durum.

### Y-3: Yeni Y-1 ve Y-2 dallarının hiçbiri testle korunmuyor
- **Kanıt:** `mutants118-y12-out.txt`. Beş mutantın beşi yaşıyor (136/136 geçiyor):
  ```
  Y1-cr    createRequire dalı kapalı          SURVIVED
  Y1-call  require.call/.apply dalı kapalı    SURVIVED
  Y1-mod   module.require dalı kapalı         SURVIVED
  Y1-alias const r = require dalı kapalı      SURVIVED
  Y2       let/var yeniden ataması yok sayılır SURVIVED
  ```
- `4b47427b` yalnız tarayıcıya dokunuyor, teste 0 satır ekliyor. İNCELEME-116, R1, R3 ve X8'i tanık olarak açıkça istemişti. Bir sonraki refactor bu dalları sessizce silebilir, ve src'de örnek olmadığı için tam bekçi de bunu fark etmez.
- **Düzeltme:** R1 (takma ad), R3 (import'lu createRequire), `require.call`, `require.apply`, `module.require` ve X8 (`export let` + yeniden atama) için birer `not.toEqual([])` testi yaz. FP1–FP3 gibi temiz modül karşılıkları için de `toEqual([])` testi ekle.

### Ö-1: Y-2 (`export let`) düzeltmesi çalışıyor; kalan kaçışlar egzotik
- **Yakalananlar** (`probe118-new.txt`): V1 `act = run`, V2 `var`, V3 `as any`, V6 fonksiyon içinden atama, V7 ternary. Çalışma anında `act` HTTP 200 sızdırıyor ve bekçi artık [3] veriyor.
- **Kaçanlar:** V4 `[act] = [run]`, V5 `({ act } = { act: run })` ve V10 `act ||= run`. Hepsi `[]`. Kontrol yalnız `=` token'ını ve `ts.isIdentifier(left)`'i arıyor (`:1519`).
- **Yanlış pozitif:** yok. VFP1 (temiz yeniden atama) ve VFP2 (iç kapsamda gölgelenen `act`) temiz kaldı. Eşleşme ad metniyle yapılıyor (`left.text === name.text`), sembolle değil. Gölgelenen durum yine de temiz çıktı, çünkü son hükmü `exportLeaks` veriyor.
- **Öneri:** yazımları sembolle eşle ve atama hedeflerini yapıbozum ile bileşik atamayı da kapsayacak biçimde topla. Sonra "Known limits"e ekle ya da kapat.

### Ö-2: Y-3 (Known limits) belgelendi ama eksik ve bir yerde yanlış tarif ediliyor
- `:82-88` şunları sayıyor: `Object['assign']`, `Reflect['set']`, hesaplanan `Object`/`Reflect`, `.call`/`.apply` yanlış argüman sırası, "callback parameters written through spread" ve `Reflect.apply` zincirleri.
- **Doğrulama** (`escape-new.txt`): C5–C9, C12, C13 ve T1–T5 belgedeki gibi kaçıyor.
- **Belgede olmayanlar:**
  - `const O = Object` (C8/T2) ve `globalThis.Object` (C9/T3). "hesaplanan Object" ifadesi bunları kapsamıyor.
  - `[e].slice()[0]` üzerinden taşıyıcı (C14/T7).
  - `Promise.resolve(e).then(x => x.code = …)` (C19).
  - C10/E5 `[e].forEach(x => { x.code = … })` "spread" değil, düz callback parametresi. İfade yanlış.
- `.call`'ın hedefinin `args[1]` olması gerekirken `args[0]` kullanan hata düzeltilmedi, belgeye yazıldı. İNCELEME-116'nın açık sorusuna göre bu kabul edilebilir.
- **`Array.prototype.push.call` bozulmadı:** FP5 `Array.prototype.push.call(out, e)` ve FP6 `[].push.call(out, String(e))` ikisi de [6], eski ve yeni tarayıcıda aynı.
- **Öneri:** yalnız belge metnini düzelt. B değil.

### Ö-3: cs-fb raporundaki kanıt yetersiz ve kısmen yanlış
- "ESLint / TypeScript ✓" yazıyor ama tsc koşulmamış (B-1).
- "Y-1 … tüm durumlar fail-closed" deniyor. Oysa import'lu `createRequire` (B-2) ve takma ad varyantları (Y-1) kaçıyor.
- Y-3 ve Y-4 durumu yazılmamış; yalnız "A2 ve A4 deferred" notu var.
- Bu inceleme kapısının yakalaması gereken sınıf tam olarak bu.

## 2. Kanıt: önce / sonra özetleri

**Kaçış sondası, crw2-fb'nin `escape.mts`'i aynen** (`escape-old.txt` → `escape-new.txt`):
```
ESKİ toplam=66 sorunlu=24  →  YENİ toplam=66 sorunlu=20
değişenler: D8 (require takma adı) · D9 (module.require) · D16 (require.call) · X8 (export let)  KAÇTI → YAKALADI
hâlâ KAÇTI: D10 (import'lu createRequire), C5–C10, C12–C14, C19, T1–T7, X1 (build reddediyor), X12
```

**Ek sonda, bu koşuda yazıldı** (`probe118.mts`): ESKİ 37'de 26 sorunlu, YENİ 37'de 17 sorunlu. Kapananlar: I5, R5, R6, R7, V1, V2, V3, V6, V7. Açıkta kalanlar B-2, Y-1 ve Ö-1'de sayıldı. FP satırlarının hepsi (FP1–FP6, VFP1–VFP3) doğru.

**Gerçek ağaç, CORDIS `5e674e7f` tek satırlık yeniden yazım** (`real-tree-116-old.txt` → `-new.txt`):
```
R1 const r = require  [] → [22,30]   R2 module.require [] → [22,30]   R4 require.call [] → [22,30]
X8 export let         [] → [3]       R3 createRequire  [] → []   ← B-2
```

**src'de yanlış pozitif yok:**
- `tree-src-new.txt`: yeni tarayıcı src'deki 37 `'use server'` dosyasında `found: {}`.
- Tam vitest yeşil; tam bekçi testi dahil.

**Kapılar** (`gates.txt`, `vitest-full-summary.txt`, `db-prep.txt`):
```
DB: prisma db push → db:rls-role → apply-migrations ×2 (41/41 as fabrika) → db:rls 28→112 → SEED_EXIT=0   (127.0.0.1:55118)
tsc exit=2   (B-1; dev 0779e8f8 exit=0)
lint exit=0
vitest (CI=true, TAM, 4b11aa01):  Test Files  305 passed | 2 skipped (307)
                                  Tests  4101 passed | 52 skipped (4153)
next build (olduğu gibi) BUILD_EXIT=1 "Failed to type check."
next build (yalnız probe için iki satırlık tip yamasıyla + probe dosyaları) BUILD_EXIT=0, ƒ /[locale]/probe116
```
Tip yaması yalnız scratch `wt`'de uygulandı; build'i alabilmek içindi. Bekçi hükümleri ve mutantlar **yamasız** `4b11aa01` tarayıcısıyla koşuldu. Yama geri alındı: dosyanın md5'i `4b11aa01` blob'uyla aynı, `eccae237…`.

## 3. Değişen dosyalar
- `docs/agent-results/TASK-MUOJ736LL7ILJ-crw-fb-2.md` (bu rapor)
- `docs/agent-results/TASK-MUOJ736LL7ILJ-crw-fb-2-ekler/`: sondalar ve çıktıları, mutant betikleri ve çıktıları, probe dosyaları, kapı özetleri. Mutlak scratchpad yolları `<scratchpad>` ile değiştirildi. DB parolası maskelendi; parola araması 0.
- `/Users/macbook/alan/docs/agent-results/TASK-MUOJ736LL7ILJ-crw-fb.md`: görev metnindeki kanıt yolu; bu raporun kopyası.
- `src/` ve `tests/` altında dal üzerinde hiçbir değişiklik yapılmadı. Commit, merge ve push yok. Ana checkout'ta git komutu koşulmadı; yalnız bu rapor ve ekler dizine yazıldı.

## 4. Riskler
- **B-1:** dal olduğu gibi merge edilirse dev'in typecheck'i ve build'i kırılır.
- **B-2 ve Y-1:** kaçan biçimler bugün src'de yok (`src-grep.txt`). Yani canlı bir sızıntı yok. Ama bekçi, "kapandı" denen bir sınıfta sessiz kalıyor.
- **Hafifletici etken:** probe'da `every write action checks the caller role` bekçisi yeni eylemlerin beşini de rol kontrolü olmadığı için yakaladı (`guard-with-probes.txt`). Ancak `requireTenantAction` çağıran gerçek bir eylemde bu ağ yok; sızıntı bekçisi tek savunma.

## 5. Açık sorular
- `require` ve `createRequire` için "biçim listesi" mi, yoksa İNCELEME-116'nın önerdiği "çağrı dışı her okunuş UNRESOLVED" kuralı mı? Ben ikincisini öneriyorum. Liste yaklaşımı bu koşuda 10 yeni kaçış verdi.

## 6. Sonraki adım (cs-fb, aynı dal)
1. B-1: `:358` ve `:377` null koruması; `pnpm typecheck` ve `next build` yeşil.
2. B-2: `node:module` importlu `createRequire`, adlı, `as` ile ve ad alanı biçimiyle, iki adımlı `req` dahil; tanık I1 ve I4.
3. Y-1: `skipWrappers` ya da tercihen çağrı dışı `require`/`module.require` okunuşunu UNRESOLVED say; tanık R8.
4. Y-2 ve Y-3: A1 ve A10 test girdilerini ayırt edici girdiyle değiştir, A4 ekle, Y-1 ve Y-2 dalları için tanıklar ekle. Hedef: `mutants118.py` ile `mutants118-y12-out.txt`'teki 8 mutantın hepsi KILLED.
5. Ö-2: Known limits metnini düzelt.
6. Teslim raporunda `tsc` + `next build` + tam vitest çıktısı olsun.

## Temizlik
- `next start -p 3918` (kendi başlattığım süreç) durduruldu; `lsof :3918 LISTEN` = 0.
- Probe dosyaları (`src/app/probe116`, `src/app/[locale]/probe116`, `src/lib/probe116-svc.ts`) silindi. Tip yaması geri alındı; `git status --short` boş.
- `crwfb118-pg` konteyneri ve `wt`/`wt-m` worktree'leri rapor yazıldıktan sonra kaldırıldı (aşağıdaki son adım).

**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27.0.0, arm64; Node 26.5; Docker `pgvector/pgvector:pg16`; Next 16.3.4 Turbopack `next build` ve `next start`). Linux ve Windows koşulamadı, çünkü bu makinede yalnız macOS var. Koddan çıkarım:
- Tarayıcı saf TypeScript AST ve dize işi yapıyor; yol işleme `node:path` ve `\`→`/` normalizasyonuyla. B-1, B-2 ve Y-1..Y-3 platformdan bağımsız.
- tsc hatası her platformda aynı çıkar.
- `createRequire`, `require` takma adı ve `module.require`'ın çalışma anı davranışı Turbopack'in bundler çözümüne bağlı. Linux'ta aynı olması beklenir, ama koşulmadı.
