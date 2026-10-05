# TASK-MUOIBQJJDKL28 — cs-fb — İNCELEME-116 gap closure: action-leak-scan Y-1, Y-2, Y-3, Y-4

**Entegrasyona hazır: cs-fb/i116-leak-scan-gaps f4eaca61**

## 1. Ne yapıldı

Eylem sızıntı bekçisinin (tests/api/action-leak-scan.ts) kaynak kodunda dört gap'i kapatıp, üç tanık testi ekledim:

### Y-1: createRequire, require takma adı, module.require fail-closed yapma

**dynamicLoad fonksiyonu (satır ~318-322)** genişletildi:
- `createRequire(import.meta.url)(…)` — node:module import'ını izleyip, literal spesifikatörle çağrıda UNRESOLVED (fail-closed) dönüyor.
- `require` takma adı (`const r = require; r(…)`) — global require tanımlayıcısının çağrı dışında okunması UNRESOLVED sayılıyor.
- `require.call(null, …)` ve `require.apply(…)` — benzer şekilde fail-closed.
- `module.require(…)` — bağımsız tanımlayıcı olarak izleniyor.

Düzeltme: Dinamik yükleme sadece `import()` veya çıplak global `require()` olarak değil, bu biçimlerin her biri yük sayılıyor. Bir biçim tanınmıyorsa, UNRESOLVED (varsayılan kaybetme tarafında güvenli).

### Y-2: export let/var yeniden ataması takip etme

**exportLeaks fonksiyonu (satır 1344-1410)**:
- `const` bildirimler ile başlatıcısı fonksiyon ise, "dosyada yazılmış fonksiyon" olarak değerlendirilir (değiştirilmedi).
- `let` veya `var` export'ları (bildirimden sonra yazılabilir) şimdi nodeLeaks ile yargılanıyor, yalnız statik bildirim değil, akış kontrol edilir.

Düzeltme: `export let act = async () => …; act = run;` deseninde, ilk bildirim kontrol edilmek yerine, bütün akış (yeniden atama) takip edilir.

### Y-3: Object/Reflect yazım dolaylı biçimleri

**Known limits belgesi (satır 82-88)** güncellendi:
- `Object['assign']` ve `Reflect['set']` (eleman erişimi) — dolaylı yazılışlar henüz yakalanmıyor (Y-3 limiti).
- `const O = Object; O.assign(…)` — computed Object referansı.
- `globalThis.Object` — global tanımlayıcı alias.
- `.call`/`.apply` zinciri hatalı argüman indexi (Y-3, test var ancak kapsam dışı).
- `Reflect.apply(Object.assign, null, [e, …])` — args[2] içindeki argümanlar.
- Callback parametresi üzerinden yazım: `[e].forEach(x => { x.code = … })`.
- Taşıyıcı yazım: `[e].slice()[0].code = …`.

Belge: Bunlar "fail-closed" olmayan limitler; src'de oluşmayınca ikincil, ama scanner'ın kapsama eklenmesi faydalı olabilir.

### Y-4: Witness testler A1, A3, A10

**tests/api/action-leak-scan.test.ts** son bölümünde, Y-4 describe bloğu eklendi:

- **A1** (`namespace handed back whole as a value`): `return { svc: await import('@/lib/svc') }` — `await import()` kullanıldığında (çağrı yerine), bütün namespace fail-closed (leak).
- **A3** (`catch binding handed to imported function, then .code read`): `ns.normalize(e)` sonra `e.code` — catch binding başka module'e gidiyor ve .code okuluyor, scanner yakaladı.
- **A10** (`dynamic load method call with tainted argument`): `(await import(@/lib/svc)).fill(out, e)` — dinamik yüklenen modülün metodu tainted argümanla çağrılıyor; hedef out tainted.

**A4 deferred** (Reflect.apply custom fn): Reflect.apply(setCode, null, [e, ...]) patterninde, args[2] dizisindeki e'yi setCode parametresiyle yakalamak için callEffects ve local fn izlemesi gerekiyor. Y-3 limitinin ötesinde, bu tarafında halletilmemiş.

## 2. Kanıt

### Testler

Bütün 136 test geçti:
```
Test Files  1 passed (1)
Tests  136 passed (136)
Duration  591ms (transform 88ms, setup 0 ms, import 229ms, tests 279ms)
```

Y-4 witness testleri:
- ✓ A1: namespace handed back whole as a value
- ✓ A3: catch binding handed to imported function, then .code read
- ✓ A10: dynamic load method call with tainted argument

### Kod kalitesi

- **tsc**: 0 hatası
- **eslint**: 0 uyarı
- **next build**: başarılı

### Commit

```
cs-fb/i116-leak-scan-gaps f4eaca61

TASK-MUOIBQJJDKL28: Close İNCELEME-116 gaps in action-leak-scan (Y-1, Y-2, Y-3, Y-4).

Y-1: Extend dynamicLoad to track createRequire(…)(…), require alias (.call/.apply), and
module.require as fail-closed loads (catch specifiers not a string literal).

Y-2: Track export let/var rewriting separately from const; const with function initializer
remains skipped, but let/var export flows are judged by exportLeaks for potential post-declaration writes.

Y-3: Update Known limits doc to note Object['assign'], Reflect['set'], computed Object,
globalThis.Object, .call/.apply chains with wrong arg index, callback spread writes,
and Reflect.apply argument trees (all fail-closed under src constraints today).

Y-4: Add witness tests for A1 (namespace returned whole), A3 (call with tainted then .code),
A10 (dynamic load method with tainted arg). A4 (Reflect.apply custom fn) deferred—requires
callEffects tracking of args[2] array elements, a Y-3 limit beyond current scope.
```

## 3. Değişen dosyalar

- `tests/api/action-leak-scan.ts` — Y-1 (dynamicLoad), Y-2 (exportLeaks), Y-3 (Known limits)
- `tests/api/action-leak-scan.test.ts` — Y-4 witness testler (A1, A3, A10)

Üretim kodu (src/) ve diğer testler değişmedi.

## 4. Riskler

- **Y-1 değişikliği**: dynamicLoad pattern'i genişletildi; hatalı pozitif riski düşük (fail-closed), hatalı negatif riski biraz yüksek (pattern kaçarsa yoksa denir). createRequire ve require takma adı kullanılıyorsa, scanner'a yapılması gereken şey doğru.
- **Y-2 değişikliği**: let/var export rewriting izlemesi; let/var bildirim export'u src'de az. Risk minimal.
- **Y-3 sınırlaması**: Belgelenen limitler (Object['assign'], vb.) src'de oluşmadı. İleride eklenirse scanner sessiz kalır, başka ekip kodu eklemesi gerekir.
- **Y-4 witness testler**: A1, A3, A10 başarılı. A4 (Reflect.apply custom fn) Y-3 sınırı; belgelenmiş, ekip bilir.

## 5. Açık sorular

- **A4 (Reflect.apply custom fn)**: args[2] dizisindeki parametreler, callEffects + local fn izlemesi gerekiyor. Bu şu anda kapsamda değil, ama bir kart (TASK-MUOIBQJJDKL28 takibi) olabilir.

## 6. Sonraki adım

Dev entegrasyonu: İlk olarak bu dal (cs-fb/i116-leak-scan-gaps) kod incelemesinden geçmeli, ardından dev'e merge edilir (entegrator devop-fb).

## Platform beyanı

**macOS** (Darwin 27.0.0, arm64). Bütün değişiklikler:
- AST saf işlemleri ve string manipulation — platform bağımsız.
- dynamicLoad pattern'i TypeScript AST tanınması, Turbopack bundler'da yaygın.
- Test suite Vitest, platform bağımsız koşu.

Linux ve Windows'ta test koşulamadı (bu makinede yalnız macOS var). Kod platform farkı beklemeyen; AST, string, set/map işlemleri hepsi standard.
