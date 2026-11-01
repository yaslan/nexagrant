# TASK-MUODXBIM9H1PP — cs-fb — FB DÜZELTME: eylem sızıntı bekçisi (İNCELEME-107 B-1/B-2 + Y-1..Y-6 + T-1 + Ö-1)

**Durum:** TAMAM · dev'e merge edildi (`bb855b31`), **push yok**.
**Dal:** `cs-fb/muodxb-guard-dyn` (dev `b8cde55e`'den açıldı; iş commit'i `bdde68b0`; güncel dev `a89fdef6` dala merge edilip yeniden doğrulandı).
**Kaynak:** `docs/agent-results/TASK-MUOBO31H8EPR5-crw2-fb.md` ve `-ekler/` (probe.mts, mutants.py, fp2.mts).
**Ekler:** `docs/agent-results/TASK-MUODXBIM9H1PP-cs-fb-ekler/`
**Dokunulan dosyalar:** yalnız `tests/api/action-leak-scan.ts`, `tests/api/action-leak-scan.test.ts`, `tests/api/api-error-body-guard.test.ts`. Ö-1 için bekçinin mesaj satırı değişti; bu dosya bekçinin tüketicisi. `src/` altında hiçbir dosya değişmedi.
**Gerçek ağaçta yeni sızıntı:** YOK. 37 eylem dosyasının hepsi temiz; DUR gerekmedi.

## 1. Ne yapıldı

### B-1 · Dinamik `import()` / `require()` artık izleniyor
- `dynamicLoad()`, `await import('…')`, `require('…')` ve `import x = require('…')` çağrılarını tanır ve modülü `resolveSpec` ile çözer. Bu çağrılarla bağlanan adlar, statik import'larla aynı `importTarget()` yolundan geçer:
  - ada bağlama (`const m = await import(…)`, ad alanı olarak),
  - tek seviyeli yapıbozum (`const { run } = …`, `{ run: r }`, `...rest`),
  - yerinde kullanım (`(await import('…')).run()`),
  - üyeyi okuyup sonra çağırma (`const f = m.run; f()`).
- **Fail-closed** sayılanlar:
  - dize olmayan specifier (`import(p)`),
  - bir yükün `.then(…)` ile kullanılması (M3),
  - iki seviyeden derin yapıbozum,
  - ad alanının bütün olarak döndürülmesi,
  - var olmayan modül.
  - Paket yükü (`await import('zod')`) paket import'u gibi yargılanır.
- 5e674e7f CORDIS eyleminin import'u tek satırla dinamiğe çevrilince artık `[22,30]` veriyor. Önceden `[]` veriyordu (§2.3).

### B-2 · `.code` güveni yazımla bitiyor
Catch bağlaması (ya da onun `const`/`let` takma adı) yazıldığı anda `rawSources` kümesinden çıkar. Yazım sayılanlar:
- `e.code = …` ve `e.code = e.code ?? e.message` (normalize deyimi),
- `Object.assign`, `defineProperty`, `defineProperties`, `setPrototypeOf`, `Reflect.set`, `Reflect.apply(…, e)` çağrılarının ilk argümanı olmak,
- `[e] = …` yapıbozum ataması,
- `for (e of …)`,
- `e++`, `e--`, `delete e.x`,
- bir import'a verilmek,
- parametresine yazan yerel bir fonksiyona verilmek.

Takma ada yazım bağlamaya, bağlamaya yazım takma adlara yansır; bunun için iki yönlü bir kapanış kullanılıyor.

Yan düzeltme: eski kod `!e`, `-e` ve `+e` ifadelerini de "yeniden atama" sayıyordu. Artık yalnız `++` ve `--` sayılıyor, çünkü `!e` bağlamayı okur, yazmaz.

### Y-1 · Kendi yazmadığını dışa aktaran eylem dosyası — seçim (a)
Üst düzey `'use server'` içeren dosyada, dosyada yazılmış bir fonksiyon olmayan her export modül özetiyle yargılanır (`exportLeaks`). Örnekler: `export { run as act } from`, `export const act = run`, `withAuth(run)`, `export default run`. Tip export'ları ve satır içi direktifli sayfalar hariç. Bulgu, export satırına yazılır.

**Gerekçe (a):**
- Mevcut `exportLeaks` makinesini aynen kullanıyor ve bilinmeyen biçimde zaten fail-closed. Yani yeni bir güven yüzeyi açmıyor, eklenen kod yaklaşık 15 satır.
- Değeri yargılıyor, biçimi değil. `withAuth(temizFn)` gibi meşru bir sarmalayıcı yeşil kalıyor. (b) gibi biçim kuralı ise bugün temiz olan geçerli kodu reddederdi, ve Next'in zaten izin verdiği bir biçimi yasaklamak ekibe mimari bir kısıt yüklerdi.
- (b) de kaçan biçimin sızıp sızmadığını söylemez; yalnız "bu biçimi yazma" der ve yanlış bir hata mesajı verir.

### Y-2 · Parametre ve callback üzerinden çıkış
Her fonksiyon için bir **etki özeti** tutuluyor: `writes` (catch değerini hangi argümana yazdığı) ve `calls` (hangi callback parametresini catch değeriyle çağırdığı).
- Modül export'unda `effects(name, i|null)` kullanılır. Yerel fonksiyonda bu özet, çağrı noktası kirli argüman vermese de uygulanır.
- Özet **izole** bir koşuyla (`analyse(…, isolate)`) çıkarılıyor: başka bir çağrı noktasının kirli argümanı özete karışmıyor. `fill(a, e); fill(b, 'ok'); return b` temiz kalıyor.
- Seçenek nesnesi (`{ onError(m) {…} }`), yeniden dışa aktarılan yazıcı ve ad alanı üyesi (`svc.run(out)`) de kapsanıyor.

### Y-3 · `this.helper()` ve `Cls.helper()`
- Bu çağrılar, kapsayan sınıfın ya da nesne literalinin üyesine çözülüyor.
- Aynı aileden olduğu için şunu da kapattım: metot içinde `this.x = String(e)` yazımı sınıfı (tüm örneklerini) ya da nesneyi kirletiyor, ve `b.put(e)` / `box.put(e)` yerel metoda çözülüyor. Bu, eski başlıktaki "bilinen sınır"lardan biriydi (sondada M10d, V6 ve V7).

### Y-4 · Çağrılmadan okunan import
- Bir import değer olarak okunduğunda (`lastError`, `state.last`, `svc.lastError`) modülde tuttuğu değer sorgulanıyor.
- Dışa aktarılan değişken, modülün kendi analizinde kirliyse sızıntı sayılıyor.
- Fabrika zinciri artık kökten yargılanıyor (`z.string().trim().max(64)` → `z`, paket). Böylece gerçek ağaçtaki `idSchema` yanlış pozitif vermiyor (§4).

### Y-5 · Takma ad çeşitleri
Artık takma ad sayılanlar:
- `let a = out`,
- `a = out` ataması,
- kapsayıcılar: `[out]`, `{ out }`, `{ o: out }`, yayılım.

### Y-6 · `allSettled` ve `new Promise`
- `Promise.allSettled` değeri her yazımda kaynak sayılıyor: `.bind`, `['allSettled']`, `const { allSettled } = Promise`.
- Kirli bir fonksiyon değerini çağırmanın sonucu kirli.
- `new Promise`, executor'ın `resolve` parametresi kirli bir değerle çağrılırsa kirli sayılıyor. Buna `.catch(resolve)` biçimi de dahil.

### Ek · Hesaplanan anahtar
`{ [String(e)]: true }` önceden kaçıyordu. K4 tanığını yazarken bulundu. Artık yakalanıyor.

### Ö-1 · Bulgu satırı ve kaynak izi
- Yeni `actionReturnFindings()` her bulgu için `{ line, via }` döndürüyor. `via` örnekleri: `catch (line 4)` ya da `src/lib/k2-cordis/importer.ts#runCordisImport ← catch (line 669)`.
- `api-error-body-guard.test.ts` bekçisi kırmızıda artık `{ "dosya": ["line 22 ← …#runCordisImport ← catch (line 669)"] }` gösteriyor; eskiden yalnız bir sayı gösteriyordu.

### Ö-2 · Yanlış pozitif
Doğrudan bir çağrıya argüman olarak verilen fonksiyonun `return`'ü artık sink değil (`after(() => log(e))`, `setTimeout`, `forEach`). Değeri çağrının sonucu üzerinden izlenmeye devam ediyor: `callbackLeaks` artık `new` için de geçerli ve kirli fonksiyon değerini çağırmak kirli sayılıyor. `ids.map(() => String(e))`, yerel `wrap(() => …)` ve import edilen `wrap` hâlâ yakalanıyor (testte).

### T-1 · Tanıklar
- 11 yaşayan mutantın her birine ayırt edici bir tanık yazıldı.
- K2 için "bulunan ama okunduğunda kaybolan modül" okuyucusu kullanıldı. Bu, `resolveSpec` ile okuma arasındaki yarışın kendisi; crw2-fb bunu eşdeğer mutant saymıştı.
- K15/K16 için 11 MUTATORS girdisinin hepsi, artı `Reflect.apply`, ayrı ayrı test ediliyor.

### Başlık belgesi
- Başlık belgesi yeni kuralları ve güncel "Known limits" listesini yazıyor (Ö-4).
- Güncel sınırlar: `EventEmitter` hata dinleyicisi, catch bağlamasını alan yerel nesne metodu (bu durumda `.code` güveni sürer), `return` dışı çıkış (yönlendirme URL'si, çerez).

## 2. Kanıt

### 2.1 Tanıklar — önce kırmızı, sonra yeşil
Yeni testler dev HEAD'in bekçisiyle (dosya geçici olarak değiştirilip md5 ile geri konarak) koşuldu: **61 kırmızı** (`ekler/red-list.txt`):
```
  11 B-1 · 12 B-2 · 5 Y-1 · 8 Y-2 · 6 Y-3 · 4 Y-4 · 5 Y-5 · 6 Y-6
   2 T-1 (K4 for…in + hesaplanan anahtar, Reflect.apply) · 1 Ö-1 (yeni API) · 1 Ö-2 (after/setTimeout/forEach FP)
Tests  61 failed | 72 passed (133)          ← eski bekçi
Tests  155 passed (155)                     ← yeni bekçi (action-leak-scan.test.ts 133 + api-error-body-guard.test.ts 22)
```
Eski bekçide yeşil geçen 72 testin içeriği:
- mevcut 46 test,
- T-1 mutant tanıkları (doğru kodda yeşil olur, mutantta kırmızı),
- "temiz kalmalı" hassasiyet testleri.

### 2.2 crw2-fb sondası (70 girdi) — önce / sonra (`probe-before.txt`, `probe-after.txt`)
```
ÖNCE:  toplam=70 sorunlu=36   (34 KAÇTI + 2 YANLIŞ-POZİTİF)
SONRA: toplam=70 sorunlu=2
       YANLIŞ-POZİTİF | F5  | Sentry.captureException(e, ctx) sonra ctx döner | [5]
       YANLIŞ-POZİTİF | F11 | Promise.allSettled yalnız sayım | [5]
```
Kalan iki madde Ö-3'tür: alan-duyarsız taint sınırı, bu kartın kapsamı dışında ve src'de yok. fp2 (Ö-2):
```
ÖNCE:  F12 forEach [4] · F13 setTimeout [4] · F14 after() [4]
SONRA: F12 [] · F13 [] · F14 []
```

### 2.3 Gerçek ağaç (`real-tree.mts`, `real-tree-before.txt`, `real-tree-after.txt`)
```
ESKİ bekçi:
YAKALADI | CORDIS 5e674e7f, static import | [22,30]
KAÇTI    | CORDIS 5e674e7f, import made dynamic (one line) | []          ← B-1
KAÇTI    | m11 as is (real tree) | []
YAKALADI | m11, withSystemScope made to leak | [65,66,76,92,121,134,180,368,421,528,570]   (147 yok)
YENİ bekçi:
YAKALADI | CORDIS 5e674e7f, static import | [22,30]
           line 22 ← src/lib/k2-cordis/importer.ts#runCordisImport ← catch (line 669)
YAKALADI | CORDIS 5e674e7f, import made dynamic (one line) | [22,30]
KAÇTI    | m11 as is (real tree) | []                                   ← doğru: gerçek hâl temiz
YAKALADI | m11, withSystemScope made to leak | [65,121,134,147,180,368,421,528,570]
```
Satır 147, m11'in gerçek `await import('@/lib/system-scope')` satırı. Artık yakalanıyor (B-1).

66, 76 ve 92 artık bildirilmiyor. Bunlar `withTenant(…, (tx) => …)` callback gövdeleri (Ö-2). Değerleri gerçekten istemciye çıktıkları yerde raporlanıyor: 66 → 65, 92 → 121 (`return createdPart`). 76'nın değeri yalnız `result.count > 0` karşılaştırmasına giriyor, yani istemciye hiç ulaşmıyor. Bu, eski bekçinin fazladan verdiği uyarıydı; kör nokta değil.

Tam bekçi: `api-error-body-guard.test.ts > no server action returns what it caught` → yeşil, `found: {}` (37 dosya).

### 2.4 Mutantlar — önce / sonra
Önce (`mutants-before-crw2.txt`, crw2-fb): 20 mutanttan 9 ÖLDÜ / 11 YAŞADI (K2, K3, K4, K6, K7, K9, K12, K15, K16, K18, K19).

Sonra (`mutants.py` → `mutants-after.txt`): aynı 20 mutant yeni koda aynı anlamla yeniden yazıldı, yeni kurallar için 15 mutant (N1..N15) eklendi. Dosya her koşudan sonra bellekten geri yazıldı ve `assert` ile doğrulandı:
```
KILLED | K2 | unreadable module → clean | 1 failed | 154 passed (155)
KILLED | K3 | export * from UNRESOLVED → skipped | 1 failed
KILLED | K4 | no for…in flow | 1 failed
KILLED | K6 | ++/-- not a write | 1 failed
KILLED | K7 | local rest parameter spread dropped | 1 failed
KILLED | K9 | module rest: no Math.min | 1 failed
KILLED | K12 | call export with unnamed callee → clean | 1 failed
KILLED | K15 | MUTATORS without splice/unshift/fill | 3 failed
KILLED | K16 | MUTATORS without append | 1 failed
KILLED | K18 | export * as ns: whole → clean | 1 failed
KILLED | K19 | void carries taint (FP side) | 1 failed
… K1 K5 K8 K10 K11 K13 K14 K17 K20: KILLED
N1..N15 (B-1 ×2, B-2 ×3, Y-1, Y-2 ×2, Y-3, Y-4, Y-5, Y-6, Ö-2, izolasyon, this-yazımı): hepsi KILLED
35/35 KILLED · restored byte-for-byte
```

### 2.5 Süre (`perf.txt`, `tree.mts`; 12 çekirdek)
```
                       tek koşu            6 eşzamanlı
eski (dev b8cde55e):   1492–1720 ms        2661–2878 ms
yeni:                  1297–1392 ms        2909–3265 ms
```
- Tek koşu eskisinden hızlı: `resolveSpec` ve `importTarget` önbellekleri eklendi.
- Yük altında eskisinden yaklaşık %10 yavaş ve "≤ ~3 sn" sınırında (2,9–3,3 sn).
- İlk sürüm 15,4 sn'ydi. Nedeni, her tanımlayıcıda `isImport` → `resolveSpec` ile en fazla 17 dosya okuması yapılmasıydı; önbellekle düzeldi.

### 2.6 Kapılar (izole Postgres, `db-prep.txt`, `gates.txt`, `vitest-full*.txt`)
```
DATABASE_URL → postgresql://fabrika:***@127.0.0.1:55187/fabrika   (konteyner csfb-muodxb-pg; paylaşılan :5433'e yazılmadı, .env'de 5433 sayısı 0)
db push → db:rls-role → apply-migrations ×2 (41/41) → db:rls 28→112 → SEED_EXIT=0
vitest (dal):             Test Files 297 passed | 6 skipped (303) · Tests 3944 passed | 114 skipped · exit 0
vitest (güncel dev merge): Test Files 297 passed | 6 skipped (303) · Tests 3960 passed | 115 skipped
tsc exit=0 · eslint (3 dosya) exit=0 · npm run lint exit=0 (merge sonrası da 0) · next build exit=0
```
- Build, worktree'de APFS klonu `node_modules` ile koşuldu; `env -u NODE_ENV`, `.env` kabuğa export edilmedi.
- Güncel dev'den gelen 15 commit'te `src/` altında yalnız test dosyaları değişti. Build'i etkileyen kod yok, bu yüzden build yeniden koşulmadı.

## 3. Değişen dosyalar
- `tests/api/action-leak-scan.ts`: bekçi (B-1, B-2, Y-1..Y-6, Ö-1, Ö-2, hesaplanan anahtar, önbellekler, başlık belgesi).
- `tests/api/action-leak-scan.test.ts`: +87 test (46 → 133).
- `tests/api/api-error-body-guard.test.ts`: bekçi mesajı `line N ← kaynak`; `KNOWN_ACTION_LEAKS: Record<string, string[]>` (içerik hâlâ `{}`).
- `docs/agent-results/TASK-MUODXBIM9H1PP-cs-fb.md` ve `-ekler/` (sondalar, mutant betiği, çıktılar; mutlak yol ve sır yok, grep ile doğrulandı).

## 4. Riskler
- **Bilinçli fail-closed yanlış pozitifler (src'de bugün yok):**
  - Temiz modülde bile `import('…').then(…)`.
  - Catch bağlamasının import edilmiş bir fonksiyona verilmesi (`logger.error('x', e)`) ardından `e.code` döndürülmesi. Bu durumda `.code` güveni biter.
  - Bir metot `this`'e yazınca sınıfın tüm örnekleri kirli sayılır.
  - Çözüm yolu: bağlamayı yalnız okuyan kodla ya da `errorCode(e)` ile yazmak.
- **Gerçek ağaçta ilk koşuda 2 yanlış pozitif çıktı ve düzeltildi.** Kaynak m6 `idSchema` idi: Y-4 değer okuması, eski "çağrıyla kurulmuş export, callee kökü tanımlayıcı değil → fail-closed" kuralına takıldı, çünkü o kural zincirin yalnız bir seviyesine bakıyordu. Zinciri köke kadar izleyince düzeldi ve tanığı eklendi (Y-4, zod şeması). Benzer builder zincirleri (paket kökü) artık paket olarak yargılanıyor.
- **Süre, yük altında sınırda (≤3,3 sn).** Yeni kurallar ağaçta daha fazla modülün analiz edilmesine yol açıyor (değer okumaları). Ağaç büyüdükçe izlenmeli.
- **Kalan Ö-3 yanlış pozitifleri (F5, F11)** değişmedi. Alan-duyarsız taint'ten kaynaklanıyorlar; src'de yoklar.

## 5. Açık sorular
- Yok. Y-1 mimari seçimi (a) olarak yapıldı, gerekçesi §1'de. Ekip biçim kuralını (b) da isterse, bu ayrı bir lint kuralı olarak (a)'nın yanına eklenebilir. Biri diğerini gereksiz kılmıyor.

## 6. Sonraki adım
- İnceleme kartı (crw2-fb): 2.1–2.4'teki testlerin ve sondanın yeniden koşulması.
- İsteğe bağlı takip kartları:
  - Ö-3: alan-duyarlı `allSettled` sayımı ve `Sentry(e, ctx)`.
  - Kalan sınırlar: emitter dinleyicisi; yerel nesne metodunun bağlamayı değiştirmesi.

## Temizlik
- `csfb-muodxb-pg` konteyneri silindi.
- `scratchpad/wt` worktree'si `git worktree remove` ile kaldırıldı.
- `cs-fb/muodxb-guard-dyn` dalı merge kaydı olarak duruyor. Push yapılmadı.

**Platform beyanı:** Yalnız **macOS**'ta doğrulandı (Darwin 27, arm64, 12 çekirdek; Docker `pgvector/pgvector:pg16`; `next build`). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan çıkarım:
- Bekçi saf AST ve dize işi yapıyor. Süreç, kabuk ya da ikili çağırmıyor.
- Yol işleme `node:path` `join`/`normalize` ile yapılıyor ve `\` karakteri `/`'ya çevriliyor (`resolveUncached`, `trustedImport`). Yeni `resolveSpec` önbellek anahtarı `dirname(from)` ve specifier'dan oluşuyor; Windows'ta da aynı normalize edilmiş yolu verir.
- Harf duyarlılığı önceki raporla aynı: mac'te `./SRC/x` çözülür, Linux'ta UNRESOLVED olur ve fail-closed sayılır. Bu güvenli yön.
- Ek betikler (`python3`, `docker`, `git cat-file`, `tsx`) yalnız doğrulama aracı; CI'da koşmuyor.
