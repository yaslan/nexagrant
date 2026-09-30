# TASK-MUOBO31H8EPR5 — crw2-fb — İNCELEME-107: eylem sızıntı bekçisi, modüller arası genişletme (saldırgan inceleme)

**Durum:** TAMAM
**Karar:** **DÜZELTME GEREKLİ.** İki bloke eden bulgu var: B-1 dinamik `import()`/`require()` ve B-2 `.code` muafiyetinin alan yazımıyla aklanması. Bunlara ek olarak 6 önemli kaçış (Y-1..Y-6), 11 yaşayan mutant (T-1) ve 4 öneri (Ö-1..Ö-4) var.
**İncelenen:** dev merge `78bda1ba` (cs-fb/muobo3-guard-crossmodule). İnceleme ayrı bir detached worktree'de dev HEAD `a0bec578` üzerinde yapıldı. İzole DB `crw2fb107-pg` (:55117) kullanıldı; paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı.
**Kod değiştirilmedi.** Sondalar yalnız bellek içi okuyucu, overlay ya da git'ten okuma kullandı. Mutant betiği dosyayı bellekten geri yazıyor ve bitince `assert` ile aynı olduğunu kontrol ediyor.
**Ekler:** `docs/agent-results/TASK-MUOBO31H8EPR5-crw2-fb-ekler/`

## 1. Ne yapıldı
- Analizci (`tests/api/action-leak-scan.ts`, 942 satır) ve yeni testler satır satır okundu. RBAC testindeki n18/n18r ve B-2 yorum farkı da okundu.
- **Sonda** (`probe.mts` → `probe-out.txt`): 70 girdi. Bunların 33'ü modüller arası kalıp, 26'sı 11 kalıbın varyantı, 11'i meşru kalıp (yanlış pozitif denetimi). Ek FP sondası: `fp2.mts`.
- **Gerçek ağaç** (`tree-scan.mts`, `real-tree.mts`): kaçış kalıplarının src'de geçip geçmediğine bakıldı. CORDIS eyleminin düzeltme öncesi hâli (5e674e7f) tek satırlık yeniden yazımlarla tarandı.
- **Kendi mutantlarım** (`mutants.py` → `mutants-out.txt`): analizci üzerinde, cs-fb'nin 35 mutantıyla çakışmayan 20 mutant.
- **Süre** (`perf.mts`, `tree.mts`): sentetik büyütme ve 6 eşzamanlı koşu altında ölçüldü.
- **Kapılar:** tam `npx vitest run`, tsc, lint, `next build`.

## 2. Bulgular (önem sırasıyla)

### BLOKE EDEN

**B-1 · Dinamik `import()` ve `require()` ne izleniyor ne de fail-closed sayılıyor.** Dosya: `tests/api/action-leak-scan.ts:322-346` (`importLeaks` yalnız `ImportSpecifier`/`ImportClause`/`NamespaceImport` bildirimlerine bakıyor).
- `const { run } = await import('@/lib/svc')` ile gelen `run`'ın bildirimi bir `BindingElement`. Bu yüzden `importLeaks` `null` döndürüyor ve çağrı "paket" gibi, yalnız argümanlarına göre yargılanıyor.
- Başlık belgesi (satır 25-27) "an import into src/ … fail-closed" diyor. Dinamik import bu sözün dışında kalıyor.
- **Somut senaryo (gerçek ağaç, `real-tree-out.txt`):** 5e674e7f'deki CORDIS eylemi, yani İNCELEME-100 Y-1'in kendisi, statik import'la `[22,30,…]` veriyor, yakalanıyor. Aynı dosyada yalnız import'u `const { runCordisImport } = await import('@/lib/k2-cordis/importer')` yapınca 22 ve 30 kayboluyor. Bu kartın kapattığı açık tek satırla geri açılıyor. (Bu koşudaki 100. satır benim git okuyucumun yapay sonucu: `git show rev:dizin` ağaç listesi döndürüyor. Bekçiyle ilgisi yok.)
- **Kalıp bugün ağaçta var:** `src/modules/m11/server/actions.ts:595` `await import('@/lib/system-scope')` kullanıyor. Overlay ile `withSystemScope`'u yakaladığını döndüren hâle getirdim. Statik import'ta 148. satır sızıntı olarak çıkıyor; gerçek dinamik hâlde çıkmıyor.
- Sonda satırları M1 (`m.run()`), M2 (yapıbozum), M3 (`.then(m => m.run())`) ve M4 (`require`) KAÇTI.
- **Düzeltme:** argümanı `@/` ya da `.` ile başlayan bir `import(spec)`/`require(spec)` çağrısını modül ad alanı olarak ele al. Dönen değerden yapıbozumla ya da `m.f` ile alınan üye `moduleExportLeaks(file, f)` ile yargılansın. Değişken bir spec (`import(x)`) ya da bütünüyle kullanılan ad alanı fail-closed sayılsın. M1–M4 ve m11 kalıbı için birer tanık ekle.

**B-2 · `.code` muafiyeti, catch bağlamasına alan yazımıyla aklanıyor.** Dosya: `action-leak-scan.ts:252-257` ve `:299`.
- `reassigned` yalnız sol tarafı çıplak tanımlayıcı olan atamayı görüyor. Şu yazımların hiçbiri catch bağlamasını `rawSources`'tan çıkarmıyor, dolayısıyla `e.code` güvenli sayılmaya devam ediyor:
  - `e.code = e.message` (V1),
  - `Object.assign(e, { code: String(e) })` (V2),
  - `const err = e as any; err.code = err.message` (V4),
  - `[e] = [{ code: String(e) }]` (V3, yapıbozum ataması),
  - `for (e of …)` (V5).
- **Senaryo:** `catch (e: any) { e.code = e.message; return { code: e.code }; }` → `[]`. Kart, N16/N16b ile aynı sınıfı kapatmayı amaçlamıştı; bu varyantlar onun içinde.
- `e.code = e.code ?? e.message` biçimi gerçek kodda doğal görünen bir "normalize" deyimi (src'de bugün yok, `tree-scan-out.txt`).
- **Düzeltme:** `rawSources` kümesinden bir sembolü çıkaran koşulları genişlet. Sembol şu durumlarda çıkarılmalı:
  - bir atamanın sol tarafının kökü olduğunda (`rootIdentifier(left)`),
  - yapıbozum ataması ya da `for…of`/`for…in` başlığında geçtiğinde,
  - bir mutatör alıcısı ya da `Object.assign`/`defineProperty`/`Reflect.set` ilk argümanı olduğunda.
  - `const` takma adına yapılan yazımlar da kaynağa geri yansıtılmalı (aliases döngüsündeki gibi).

### ÖNEMLİ (bloke değil; takip kartı)

**Y-1 · Eylem dosyası kendi `return`'ü olmadan dışa aktarıyorsa taranmıyor** (M5–M8, KAÇTI). Sink'ler yalnız dosyadaki `return`/`yield` ifadeleri. Kaçan biçimler:
- `'use server'; export { run as act } from '@/lib/svc'`,
- `import { run } …; export const act = run`,
- `export const act = withAuth(run)` (HOF sarmalayıcı),
- `export default run`.

Hepsinde servis kaynak olduğu hâlde sonuç `[]`. Bugün 37 eylem dosyasında bu biçim yok (`tree-scan-out.txt`: 0), ama sarmalayıcı deseni yaygın bir refactor yönü. **Düzeltme:** `'use server'` dosyasında her export'u `exportLeaks(name)` ile de yargıla, yani modül özetini eylem dosyasının kendisine uygula. `true` ise dışa aktarma satırını raporla.

**Y-2 · Servis içinde yakalanan değerin parametre üzerinden çıkışı izlenmiyor** (M11, M11b, M18, M18b).
- `argEffects` (`:827-842`) yalnız parametreden parametreye akışı hesaplıyor, catch'ten parametreye akışı hesaplamıyor. Kaçan örnekler:
  - `export async function run(o) { try {…} catch (e) { o.detail = String(e); } }` ile eylemde `await run(out); return out;` → `[]`,
  - hata callback'i: `run((m) => { msg = m; })`, servis `onError(String(e))` çağırıyor → `[]`. Aynı dosyada da kaçıyor (M11b).
- Mevcut Y-1 tanığı ("writes the caught text into the caller's object") yalnız kirli argümanın eylemden içeri verildiği durumu kapsıyor.
- **Düzeltme:** özete "bu export'u çağırmak şu argümanları kirletir" bilgisini ekle: argüman yokken `analyse([])` ile parametre bağlamaları kirleniyor mu, ona bak. Çağrılan parametreye (callback) verilen kirli argümanı, çağrı yerindeki fonksiyon argümanının parametresine taşı.

**Y-3 · `this.helper()` üzerinden giden metot zinciri** (M9 nesne literali, M10 statik sınıf metodu; KAÇTI).
- `callee` `this.x()` için `'dirty'` döndürüyor ama kaynak saymıyor. Bu yüzden `run() { return this.helper(); }` kaynak olmuyor.
- `new Svc().run()` biçimi, sınıfın tamamına bakıldığı için yakalanıyor (M10b/c).
- **Düzeltme:** `this.m` / `ClassName.m` çağrısını aynı sınıf ya da nesne literali içindeki `m` üyesine çöz.

**Y-4 · Dışa aktarılan değişken durum, çağrı olmadan okunuyor** (M14 `export let lastError`, M14b `state.last`; KAÇTI).
- İçe aktarılan bir sembol yalnız çağrıldığında sorgulanıyor. Bir değer olarak okunduğunda sorgulanmıyor.
- `errors.get(id)` biçimi (M14c) çağrı olduğu için yakalanıyor.
- **Düzeltme:** `leaksOf` içinde tanımlayıcı bir import ise `importLeaks(sym, undefined)` sor. Dışa aktarılan `let`/`const` nesne için modülde o sembol kirli mi, `nodeLeaks` bunu hesaba katmalı.

**Y-5 · Takma ad varyantları** (N6/N7'nin kardeşleri; KAÇTI):
- `let alias = out` (V10),
- `let a; a = out` (V11),
- kapsayıcı içinde takma ad: `const holder = [out]; holder[0].detail = …` (V12) ve `const h = { out }; h.out.detail = …` (V13).

`aliases` yalnız `const` bildirimlerini ve yalın referans başlatıcılarını topluyor (`:244-251`). **Düzeltme:** `let`/`var` bildirimlerini ve basit `a = ref` atamalarını da takma ad say. Dizi ya da nesne literalindeki referans öğeleri de kapsayıcının takma adı olsun.

**Y-6 · `Promise.allSettled` ve `new Promise` varyantları:**
- `Promise.allSettled.bind(Promise)`, `Promise['allSettled']` ve `const { allSettled } = Promise` kaçıyor (M12b–d). `isAllSettled` yalnız `Promise.allSettled` yazımını tanıyor.
- `new Promise(resolve => …catch(e => resolve(String(e))))` kaçıyor, hem modüller arası (M19) hem yerel (M19b). Belgelenen sınır "reject callback"; `resolve` ile dönen hata listede yok.
- src'de bugün allSettled yok. `new Promise` 7 dosyada var, hiçbiri hatayı resolve etmiyor.
- **Düzeltme:** belgeye `resolve` yolunu ekle. İsteğe bağlı olarak executor'un ilk parametresine kirli argümanla yapılan çağrı `new Promise`'i kirletsin.

**T-1 · Test boşluğu: 20 analizci mutantından 11'i yaşadı** (`mutants-out.txt`). Yaşayanlar:
- K2 okunamayan modül → temiz. Eşdeğer mutant: `resolveSpec` zaten okunabilirliği kontrol ediyor, bu yüzden tanık gerekmez.
- K3 `export * from '#x'` (UNRESOLVED) → atla.
- K4 `for…in` akışı kaldırıldı.
- K6 `++e`/`e--` yeniden atama sayılmıyor.
- K7 ve K9 rest parametre (`...xs`) yayılımı, yerel ve modül.
- K12 `export const r = a.b.c()` bilinmeyen çağıran → temiz.
- K15/K16 MUTATORS'tan `unshift`/`splice`/`fill`/`append` çıkarıldı. Testler yalnız `push`, `set` ve `Object`/`Reflect` biçimlerini kullanıyor.
- K18 `export * as ns` bütün ad alanı → temiz.
- K19 `void` (FP yönü).

Ölenler: K1, K5 (memo temizliği), K8, K10, K11, K13, K14, K17, K20.

Ayrıca cs-fb raporu `action-leak-scan.test.ts` için "68 test" diyor. Gerçek sayı 46; 68, `api-error-body-guard` ile birlikteki toplam. Küçük bir kayıt hatası.

### ÖNERİ

**Ö-1 · Bekçinin hata mesajı geliştiriciye yetmiyor.**
- `api-error-body-guard.test.ts:161` yalnız `found[rel(file)] = n` sayısını tutuyor. Kırmızıda geliştirici `{ "src/…/actions.ts": 2 }` görüyor. Satır numarası yok, hangi import zincirinin kaynak olduğu yok.
- Modüller arası bir kaynakta kök neden başka bir dosyada; CORDIS'te importer idi.
- **Öneri:** satırları tut (`actionReturnLeaks` zaten döndürüyor). Mümkünse özetten "kaynak: `src/lib/k2-cordis/importer.ts#runCordisImport`" gibi bir iz de ekle.

**Ö-2 · Yanlış pozitif: iç içe ok fonksiyonlarının ifade gövdesi sink sayılıyor** (`fp2-out.txt`).
- `catch (e) { after(() => console.error('x', e)); return { code: 'failed' }; }` → `[4]`.
- `setTimeout(() => console.error(e))` ve `forEach(() => console.error(String(e)))` da aynı sonucu veriyor.
- `after()` Next.js'in meşru arka plan log deseni. Değer istemciye gitmiyor, ama bekçi kırmızı yanıyor. Geçici çözüm blok gövde yazmak. Gerçek ağaçta bugün FP 0.
- **Öneri:** sink'i, dönüş değeri kullanılan fonksiyonlarla sınırla (dışa aktarılan eylem ya da çağrı zincirinde dönüşü okunan fonksiyon). En azından `void`/log çağrısı gibi dönüşü atılan callback'leri hariç tut.

**Ö-3 · FP: `Promise.allSettled` sonucunun yalnız sayımı** (`rs.filter(r => r.status === 'rejected').length`) kırmızı yanıyor (F11). Bunun nedeni alan-duyarsız taint. `Sentry.captureException(e, ctx)` sonrası `ctx`'i döndürmek de kırmızı (F5): paket argüman kuralı tüm argüman köklerini kirletiyor. İkisi de bugün src'de yok, bu yüzden bilinçli bir sınır olarak belgelenmesi yeterli.

**Ö-4 · Bilinen sınırlar listesini güncelle.** Başlık belgesindeki "Known limits" listesine şunlar eklenmeli: dinamik import (B-1 düzeltilmezse), dışa aktarılan değişken, callback veya parametre ile çıkış, `this.` metot zinciri, `new Promise` resolve.

### Doğru çalışan ve teyit edilenler
- Modüller arası 4 seviyeli zincir, `export { default as run } from`, `export * as ns` + `ns.run()`, `new Svc()`, sınıf örneğinin değişkende tutulması, fabrikanın örnek döndürmesi, servis sonucunu yayma (`...r`), `Object.assign({}, r)`, async generator (`for await`), Map export'u. Hepsi YAKALADI.
- Dosya içi: `push.apply`, `Map.set`/`get`, `Set.add`, indeks ataması, `defineProperties`, kapanışlı yazıcı, yerel `...rest` yardımcısı, `yield*`, getter, tagged template, `AggregateError.errors`, `finally`, `switch`, `??`. Hepsi YAKALADI.
- Meşru kalıplar temiz kaldı: tipli kod birliği (`instanceof ? e.code : 'x'`), `errorCode`, yalnız literal döndüren whitelist fonksiyonu, `includes` whitelist'i, pino ve console logu, servis içi `switch (e.code)` → literal, zod `safeParse`.
- RBAC n18/n18r: tam suite'te yeşil. B-2 yorumları yalnız belge değişikliği; davranış değişmemiş, fark okundu.

## 3. Kanıt

**Sonda özeti** (`probe-out.txt`; tamamı ekte):
```
KAÇTI | M1 dinamik import + ns.run() | []          KAÇTI | V1 .code: e.code = e.message | []
KAÇTI | M2 dinamik import yapıbozum | []            KAÇTI | V2 .code: Object.assign(e,{code}) | []
KAÇTI | M4 require() | []                           KAÇTI | V4 .code: alias.code = … | []
KAÇTI | M5 export { run as act } from | []          KAÇTI | V10 let alias | []
KAÇTI | M7 export const act = withAuth(run) | []    KAÇTI | V12 const holder = [out] | []
KAÇTI | M11 hata callback ile döner | []            YAKALADI | M15 4 seviye zincir | [4]
KAÇTI | M18 servis parametresine yazar | []         YANLIŞ-POZİTİF | F5 Sentry(e, ctx) → ctx | [5]
toplam=70 sorunlu=36 (34 KAÇTI, 2 YANLIŞ-POZİTİF; V6 bilinen sınır dahil)
```

**Gerçek ağaç** (`real-tree-out.txt`):
```
YAKALADI | taban (statik import, İNCELEME-100 Y-1 hâli) | [22,30,100]
YAKALADI | dinamik import | [100]            ← 22 ve 30 kayboldu (100 = okuyucu yapay sonucu)
m11 sızdıran withSystemScope — gerçek dinamik import: [65,66,76,92,121,134,180,368,421,528,570]
                              statik import'a çevrilince: [66,67,77,93,122,135,148,181,…]  ← 148 yalnız statikte
```
`tree-scan-out.txt`: 37 eylem dosyası, 532 src dosyası. Eylemlerde dinamik import var: 1 (m11). `export … from` ya da takma ad export: 0.

**Mutantlar** (`mutants-out.txt`): 9 ÖLDÜ / 11 YAŞADI (§2 T-1).

**Süre** (`perf-out.txt`, `tree.mts`):
```
tek koşu (soğuk):         duvar 1485 / 1202 / 1138 ms  (cs-fb: ~1,1–1,6 sn — tutarlı)
6 eşzamanlı (12 çekirdek): duvar 2566–2724 ms (1. koşu), 1585–1724 ms (2.–3.)
sentetik: 200 halkalı taint zinciri 28 ms · 80 kirli src-yardımcı çağrısı 46 ms · 120 modüllük zincir 49 ms
```
Süre riski yok. Büyüme yaklaşık doğrusal; `moduleArgEffects`'in önbelleksiz olması ölçülebilir bir maliyet üretmedi.

**Kapılar** (`vitest-summary.txt`, `gates.txt`, `db-prep.txt`):
```
DATABASE_URL → 127.0.0.1:55117/fabrika
db: migrate diff --from-empty → db:rls-role → apply-migrations ×2 (41/41) → db:rls 28→112 → SEED_EXIT=0
 Test Files  295 passed | 6 skipped (301)
      Tests  3833 passed | 113 skipped (3946)
vitest exit=0
tsc exit=0 · eslint (değişen 4 dosya) exit=0 · npm run lint exit=0 · next build exit=0
```
Build notu: ilk iki deneme benim ortamım yüzünden düştü. Biri symlink'li `node_modules`'tu (Turbopack "points out of the filesystem root"), diğeri `.env`'i kabuğa export edince `NODE_ENV=development` ile `/_global-error` prerender'ının `useContext` null hatası vermesiydi. node_modules APFS klonuna geçip `.env`'i kabuğa export etmeden koşunca exit 0 oldu. Kodla ilgisi yok; `gates.txt`'te üç satır da duruyor.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUOBO31H8EPR5-crw2-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUOBO31H8EPR5-crw2-fb-ekler/` (sonda, mutant, süre, kapı çıktıları; sır yok, grep ile doğrulandı)

`src/` ve `tests/` altında hiçbir dosyaya dokunulmadı.

## 5. Riskler
- B-1 bugün sömürülmüyor: m11'deki dinamik import temiz bir yardımcıyı yüklüyor. Ama bekçi tam da bu kartın kapattığı Y-1 sınıfını, bir satırlık değişiklikle ve sessizce, yeniden kaçırıyor. Bekçinin "fail-closed" sözü bu yolda geçerli değil.
- B-2 bugün src'de yok (`e.code =` araması 0), ama N16/N16b ile aynı aklama sınıfında.

## 6. Açık sorular
- Y-1 için "eylem dosyasının export'larını modül özetiyle yargıla" yaklaşımı mı, yoksa bir lint kuralıyla (`'use server'` dosyalarında yalnız `export async function` serbest) biçimi kısıtlamak mı? Bu bir mimari karar; bekçi ekibi seçmeli.

## 7. Sonraki adım
- cs-fb takip kartı: önce B-1 ve B-2 düzeltilmeli ve her birine tanık eklenmeli. Sonra Y-1..Y-6 ve T-1 için tanıklar gelmeli: K3, K4, K6, K7/K9, K12, K15/K16, K18.
- Ö-1 (satır numarası ve kaynak izi) küçük ve yüksek getirili; aynı karta eklenebilir.

**Platform beyanı:** Yalnız macOS'ta doğrulandı (Darwin 27, arm64, 12 çekirdek; Docker `pgvector/pgvector:pg16`; `next build`). Linux ve Windows'ta koşulamadı, çünkü bu makinede yalnız macOS var. Koddan çıkarım:
- Analizci saf AST işi yapıyor.
- Yol işleme `node:path` `join`/`normalize` ile yapılıyor ve `\` karakteri `/`'ya çevriliyor (`resolveSpec` `:154`, `trustedImport` `:314`). Windows'ta da aynı sonucu vermeli.
- Bulgularımın hiçbiri platforma bağlı değil: B-1, B-2 ve Y-1..Y-6 AST biçim eksikleri.
- Harfe duyarlılık: mac'te `read()` harfe duyarsız dosya sistemi üzerinden `./SRC/x`'i çözer, Linux'ta aynı yol UNRESOLVED olur ve fail-closed sayılır. Bu güvenli yön.
- Ek betikler (`python3`, `docker exec`, `tsx`) yalnız doğrulama aracı.
