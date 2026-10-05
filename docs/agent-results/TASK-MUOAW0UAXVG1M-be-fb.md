# TASK-MUOAW0UAXVG1M — be-fb — FB İNCELEME-100: eylem hata-sızıntı bekçisi (AST) saldırgan inceleme

**Durum:** TAMAM
**Karar:** **ONAY + 3 takip.** İddia edilenler doğru: X2–X7 kırmızı, gerçek ağaçta FP 0 (37 eylem dosyası, ~0,25–0,8 sn), G-1 canlıda 29/29 doğru ret ya da kabul veriyor, Ö-1 ve Ö-2 testleri kendi mutantlarımı öldürüyor. Bekçinin sözü ise ("hiçbir eylem yakaladığını döndürmez") gerçek ağaçta bugün de tutmuyor: **Y-1** modüller arası akış (canlı örnek: admin CORDIS). **Y-2** dosya içinde 11 kısa kaçış kalıbı. **Y-3** analizcide 6 kural var ama hiçbir test onları kilitlemiyor. Üçü de takip işi; admin'e dönük olan Y-1 dahil hiçbiri merge'i geri almayı gerektirmiyor.
**İncelenen:** TASK-MUOACB79XEL25 (cs-fb), dev merge `30ec167d`. İnceleme dev HEAD `d83d14a5` üzerinde yapıldı: ayrı worktree, izole DB `befb100-pg` (:55100). Paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı. **Kod değiştirilmedi.**
**Ekler:** `docs/agent-results/TASK-MUOAW0UAXVG1M-be-fb-ekler/`

## 1. Ne yapıldı
1. `tests/api/action-leak-scan.ts`'yi (413 satır) satır satır okudum. Gerçek `actionReturnLeaks`'i doğrudan çağıran 40 girdilik bir saldırı sondası yazdım: görevdeki 10 kalıp ve kendi 30 kalıbım (`probe.mts.txt`).
2. Aynı analizciyi `src`'deki 531 dosyanın hepsinde koştum. Amaç, eylem olmayan modüllerden eyleme akan sızıntıyı aramaktı (`cross.mts.txt`). Bulunan aday elle doğrulandı.
3. Bekçinin kendi test dosyasına karşı analizcide 6 mutant koştum. Her mutant için onu ayırt eden bir tanık girdi de koştum; böylece hiçbirinin eşdeğer mutant olmadığı kanıtlandı.
4. Admin plan eylemlerine 12 mutant uyguladım (Ö-1, Ö-2, G-1). Her mutantta `actions.test.ts` ve bekçi koşuldu. Dosyalar her seferinde kaydedilmiş orijinalden geri yazıldı; `git checkout` kullanılmadı. Son `git status`: temiz.
5. G-1'i canlı denedim: prod `next build` + `next start` (:47100), izole DB, gerçek server-action POST (`Next-Action` + JSON reply), `next-auth/jwt encode()` ile üretilen çerez. 30 çağrı ve ayrıca 4 boyut çağrısı yapıldı.
6. Kapılar: tsc, eslint, i18n, build ve tam `npx vitest run` (CI=true, izole DB) ile `check-live-skips`.

## 2. Bulgular

### Y-1 (ORTA: bekçinin sözü için; açığa çıkış DÜŞÜK, yalnız platform admin): modüller arası akış görünmüyor, gerçek ağaçta canlı örnek var
Analizci dosya başına bir `ts.createProgram` kuruyor (`noResolve`). İçe aktarılan ve sanitiser olmayan bir fonksiyonun çağrısı, **argümanları kirliyse** sızıntı sayılıyor. Argümansız ya da temiz argümanlı çağrının sonucu ise temiz sayılıyor. Yani yakalama ve metne çevirme `'use server'` olmayan bir yardımcı modülde yapılırsa, eylemin `return` ettiği değer bekçiye temiz görünüyor.

Gerçek ağaçtaki örnek (bekçi yeşil):
- `src/lib/k2-cordis/importer.ts:669` → `const errorMsg = errorMessage(error, String(error));` → `:701` `return { success: false, …, error: errorMsg }`
- `src/app/[locale]/admin/cordis/actions.ts:20-22` → `const importRes = await runCordisImport(...)`; `if (!importRes.success) return { success: false, error: importRes.error };`

Sonuç: CORDIS içe aktarımı başarısız olduğunda Prisma, fs ya da unzip hatasının metni tarayıcıya gidiyor. Bu metin tablo ve kolon adlarını ya da sunucudaki dosya yollarını içerebilir. Eylem `requirePlatformAdmin()` arkasında olduğu için yalnız platform admin görüyor. Kanıt: `cross-out.txt` (eylem olmayan 40 dosyada catch→return akışı; importer satırları 322…696). Tarama `leaksInActions=0` diyor, yani bekçi bu eylemi temiz sayıyor. Bunu canlı tetiklemedim: tetiklemek için CORDIS zip indirmesi gerekiyor. Kanıt kod yolu üzerinden verildi.

Öneri: `runCordisImport` hata alanını bir koda çevirsin (`IMPORT_FAILED`; metin zaten `recordAlert` ve `cordisImportRun.error` üzerinden günlükte kalıyor). Bekçi için ucuz bir ek kural da mümkün: eylem dosyasının içe aktardığı src modüllerinde de `actionReturnLeaks` koşulsun ve sızıntısı olan export'u doğrudan döndüren eylem kırmızı olsun. Bu ağaçta 40 dosyanın çoğu job ya da route, eyleme akan tek örnek CORDIS.

(Bilgi: `handleGetCordisLiveStreamLogs` alert mesajlarını döndürüyor, bunlarda da `errorMessage(e)` metni var (`cordis-sync.ts:400`, `cordis-delta.ts:329`). Bu bir admin günlük görüntüleyicisi, yani tasarım gereği. Sızıntı olarak saymadım.)

### Y-2 (ORTA): dosya içi kaçış kalıpları. Bugün src'de örnekleri yok (0), ama hepsi tek satırlık
Sonda sonucu (`probe-out.txt`). **KAÇTI** = bekçi `[]` döndü ama değer yakalanan hatayı taşıyor:

| # | Kalıp | Sonuç |
|---|---|---|
| K1 | try/finally'de dönüş (`err = e` → finally `return String(err)`) | YAKALADI |
| K2 | `Promise.allSettled(...)` → `String(r.reason)` | **KAÇTI** (başlıkta belgelenmiş sınır) |
| K3–K7 | spread `{...e}`, `${e}`, `JSON.stringify(e)`, `e.cause`, `e.stack` | YAKALADI |
| K8 | içe aktarılan yardımcıya `e` geçir, dönüşü döndür | YAKALADI |
| K9/K10 | `errorMessage as errorCode` import; `const errorCode = errorMessage` | YAKALADI |
| N1/N2/N3 | kapanış `() => String(e)`, IIFE, dış `let`'i okuyan argümansız fonksiyon | YAKALADI (iç fonksiyonun `return`'ü de hedef sayıldığı için; aşağıda Y-3 S-c) |
| **N4/N5/N16** | **`.code` aklama:** `const box = { code: e.message }; return { error: box.code }` | **KAÇTI** |
| **N6/N7** | **takma ad:** `const alias = out; alias.detail = String(e); return out` (ve `const meta = out.meta`) | **KAÇTI** |
| **N8/N9/N10** | `Reflect.set(out,…)`, `Object.defineProperty(out,…)`, `Array.prototype.push.call(errors, …)` | **KAÇTI** |
| **N11** | yerel yardımcı çıktıyı değiştiriyor: `fill(out, e)` → `o.detail = String(x)` | **KAÇTI** |
| **N12** | `class R { detail = String(e) }; return { ...new R() }` | **KAÇTI** |
| **N17** | generator `yield String(e)` → `g.next().value` | **KAÇTI** |
| N13, N14, N15, N18–N20, N24, N25, N27–N30 | Map.set, new Promise, `?? e.message`, `.catch`/`.then(null,h)` dönüşü, `e.meta`, yeniden adlandırılmış yapıbozum, getter, `Object.entries`, for-in, `Promise.all([p.catch(e=>e)])` | YAKALADI |
| N23 | göreli yolla doğru `errorCode` importu | temiz (doğru; kontrol girdisi) |
| N26 | `e?.code` | temiz (kabul edilmiş `.code` muafiyeti) |
| N21/N22 | `redirect('/x?err='+String(e))`, `cookies().set('flash', String(e))` | kapsam dışı (hedef yalnız `return`). src'de bu biçimde kullanım yok; grep 0 |

En önemlisi **`.code` aklaması**, çünkü muafiyet adla veriliyor: `x.code` her tanımlayıcı için temiz sayılıyor (`action-leak-scan.ts:252`), yalnız catch bağlaması için değil. Kirli bir nesneyi `code` alanına koyup o alanı okumak metni geçiriyor. Öneri: muafiyeti yalnız sembolü catch bağlaması (ya da reddetme işleyicisi parametresi) olan ve yeniden atanmayan tanımlayıcıya daralt. Takma ad ve yansıma kalıpları (N6–N11) için güvenli yöndeki kural şu olur: kirli argüman alan her çağrı, tanımlayıcı olan tüm argümanlarının kökünü kirletsin. Bugün yalnız `Object.assign` ve alıcı özel durum olarak ele alınıyor.

### Y-3 (ORTA): analizcinin 6 kuralını hiçbir test kilitlemiyor
cs-fb analizcide 9 mutant koşmuş ve 9'u da ölmüş. Ben 6 mutant daha koştum; bekçi test dosyası (22 test) **altısında da yeşil kaldı** (`scan-mutants-out.txt`). Her mutant için tanık bir girdi, HEAD'de `[3]` ve mutantta `[]` veriyor. Yani hiçbiri eşdeğer mutant değil, hepsi davranışı gerçekten değiştiriyor (`witness.mts.txt`):

| Mutant | Kural | Tanık (HEAD `[3]` → mutant `[]`) |
|---|---|---|
| S-c | iç içe fonksiyon dönüşleri de hedef | `const why = () => String(e); return { error: why() }` |
| S-f | `.code` muafiyeti yalnız çıplak tanımlayıcıda | `return { error: e.cause.code }` |
| S-g | `for…of` akışı | `for (const x of [e]) return { error: String(x) }` |
| S-j | eleman erişiminde nesne tarafı | `return { error: e['message'] }` |
| S-k | `new X(arg)` argümanları | `return { error: new Error(e.message).message }` |
| S-l | ternary'nin `whenFalse` dalı | `return { error: ok ? 'x' : e.message }` |

Öneri: bu 6 tanığı `test.each` fixture'larına ekle. Özellikle S-c önemli: kapanış (N1/N2) bugün yalnız bu yan etki sayesinde yakalanıyor. Birisi FP'yi azaltmak için "yalnız export'ların dönüşü" diye daraltırsa hiçbir test kırılmaz.

### D-1 (DÜŞÜK): G-1 testinde prototip anahtarları ve ret günlüğü içeriği kilitli değil
- **G2 mutantı yaşadı.** `z.enum` yerine `typeof v === 'string' && v in VISIBILITIES` yazılınca 64 testin hepsi yeşil kaldı. Oysa bu hal `'constructor'`, `'toString'` ve `'hasOwnProperty'` değerlerini kabul eder. Bugünkü kod bunları reddediyor; canlıda kanıtlandı (aşağıda). Test listesine bu üç değeri ve `'__proto__'`'yu ekle.
- **G3 mutantı yaşadı.** `logger.warn`'a kullanıcının gönderdiği değer eklenince testler yeşil kaldı. cs-fb "değer günlüğe geçmiyor" diyor ve canlıda bu doğru (`server-log.txt`: 27 ret satırı, `be-fb-100` ya da homoglif 0 kez geçiyor). Yine de bunu hiçbir test tutmuyor. Öneri: `expect(logger.warn).toHaveBeenCalledWith('[admin/plans] setVisibility refused', { code: 'INVALID_VISIBILITY' })`.

### D-2 (DÜŞÜK): Ö-2 düzenli ifadesi Node/undici kodlarını kaçırıyor ve meşru bir kodu reddediyor
- **O2a / O2b yaşadı.** `ERR_INVALID_ARG_TYPE` (Node) ve `UND_ERR_SOCKET` (undici) listeye ve iki kataloğa eklenince testler yeşil kaldı. İkisi de `^[A-Z]+(?:_[A-Z]+)*$` desenine uyuyor. `^E[A-Z]+$` alt çizgili kodu yakalamıyor.
- **O2c öldü, ama yanlış nedenle.** Beş harfli meşru bir ürün kodu (`ABORT`) `^[0-9A-Z]{5}$` kuralına takılıyor. İlk desen rakamı zaten yasakladığı ve SQLSTATE kodlarının hepsinde rakam bulunduğu için bu kural SQLSTATE'i hiç yakalayamaz; yakaladığı her şey FP'dir.
- Öneri: `^ERR_` ve `^UND_ERR_` desenlerini açıkça ekle, 5 karakter kuralını kaldır.

### Bilgi: 1 MB gövde
`'x'.repeat(1_000_000)` ile yapılan çağrı HTTP 500 `E{"digest":"881547229"}` döndü. Eylem hiç çağrılmıyor; Next'in server-action gövde sınırı devreye giriyor. Günlükte `Maximum array nesting exceeded` var; yanıtta metin yok ve DB değişmedi. 900 000 karakterde eylemin kendi reddi dönüyor (`live-big-out.txt`). G-1 ile ilgili bir kusur değil.

### İyi olanlar (doğrulandı)
- X2–X7 ve cs-fb'nin 15 yakın fixture'ı bekçide kırmızı. Sondada K1, K3–K10, N13–N15 ve N18–N30 da yakalandı.
- **Import gölgeleme kapalı:** yeniden adlandırılmış import (K9), yerel takma ad (K10) ve başka modülden aynı ad (X6b) güvenilmiyor. Göreli yolla yapılan doğru import (N23) güveniliyor.
- **Ö-1 sağlam:** B1 (liste atlandı) 12 kırmızı, B2 (KNOWN kaldırıldı) 12, B3 (yetki kontrolü try dışında) 2, B4 (deletePlan'dan yetki kontrolü silindi) 1, O1a (admin retinde `e.message`) 13.
- **G-1 sağlam:** G1 (harf ve boşluk normalleştirme) 3 kırmızı, G4 (retten sonra public yazma) 9.

## 3. Kanıt

### 3.1 Gerçek ağaç: FP ve süre (`time-out.txt`, yük ortalaması ~17–19)
```
koşu 1: eylem dosyası=37 sızıntı=0 duvar=807 ms cpu=851 ms
koşu 2: eylem dosyası=37 sızıntı=0 duvar=252 ms cpu=399 ms
koşu 3: eylem dosyası=37 sızıntı=0 duvar=230 ms cpu=293 ms
```

### 3.2 Admin plan mutantları (`plan-mutants-out.txt`)
```
ÖLDÜ   | B1  | planFailure listeyi atlar: errorCode(e) ?? UNKNOWN | 12 failed | 52 passed (64)
ÖLDÜ   | B2  | failure-codes KNOWN kontrolü kaldırıldı | 12 failed | 52 passed (64)
ÖLDÜ   | B3  | setVisibility: requirePlatformAdmin try dışına | 2 failed | 62 passed (64)
ÖLDÜ   | B4  | deletePlanAction yetki çağrısı kaldırıldı | 1 failed | 63 passed (64)
ÖLDÜ   | G1  | G-1 büyük/küçük harf + trim normalleştirme | 3 failed | 61 passed (64)
YAŞADI | G2  | G-1 z.enum yerine `in` kontrolü (prototip anahtarları geçer) | 64 passed (64)
YAŞADI | G3  | G-1 ret günlüğüne kullanıcı değeri eklendi | 64 passed (64)
ÖLDÜ   | G4  | G-1 ret yerine varsayılan public ile yaz | 9 failed | 55 passed (64)
YAŞADI | O2a | Ö-2: Node ERR_* kodu listeye + iki katalog | 64 passed (64)
YAŞADI | O2b | Ö-2: undici UND_ERR_SOCKET listeye + iki katalog | 64 passed (64)
ÖLDÜ   | O2c | Ö-2: ürün kodu ABORT (5 harf, meşru olabilecek) — FP ölçümü | 1 failed | 63 passed (64)
ÖLDÜ   | O1a | Ö-1: planFailure PLATFORM_ADMIN_REQUIRED için e.message döndürür | 13 failed | 51 passed (64)
```

### 3.3 G-1 canlı (`live-g1-out.txt`; prod `next start` :47100, izole DB, action id `60de0980…` prod manifest'ten)
```
BEKLENEN    | admin, dize "be-fb-100" | HTTP 200 {"ok":false,"code":"INVALID_VISIBILITY"} | visibility public→public | audit 0→0
BEKLENEN    | admin, dize "" / "PUBLIC" / "Public" / "PRIVATE" / " public" / "public\n"      → aynı ret, DB ve audit değişmedi
BEKLENEN    | admin, dize "publіc" (Kiril і) / "p​ublic" (ZWSP)                          → aynı ret
BEKLENEN    | admin, dize "constructor" / "__proto__" / "toString" / "hasOwnProperty" / "valueOf" → aynı ret
BEKLENMEYEN | admin, dize 1 000 000 kr | HTTP 500 E{"digest":"881547229"} | public→public | audit 0→0   ← Next gövde sınırı; eylem çağrılmadı (Bilgi)
BEKLENEN    | admin, dize değil ["public"] / [["public"]] / [] / null / true / 0 / {"v":"public"} / {"toString":"public"} → aynı ret
BEKLENEN    | admin, argüman eksik / fazladan 3. argüman ['ultra','nope','public']              → aynı ret
BEKLENEN    | üye (admin değil) geçerli "private" / geçersiz → {"ok":false,"code":"PLATFORM_ADMIN_REQUIRED"}
BEKLENEN    | oturumsuz, geçerli "private" → {"ok":false,"code":"PLATFORM_ADMIN_REQUIRED"}
BEKLENEN    | admin, geçerli "private" | {"ok":true} | public→private | audit 0→1
BEKLENEN    | admin, geri "public"     | {"ok":true} | private→public | audit 1→2
SONUÇ: 29/30 beklenen; son Plan.visibility=public
```
Ek boyut denemesi: 100 000, 500 000 ve 900 000 karakterde sonuç `INVALID_VISIBILITY`, 1 000 000 karakterde 500 digest. Sunucu günlüğünde 27 `setVisibility refused {"code":…}` satırı var; kullanıcı değeri hiç geçmiyor.

### 3.4 Kapılar (`gates.txt`, `vitest-summary.txt`; HEAD d83d14a5, izole DB, CI=true, CI AUTH_SECRET fikstürü)
```
tsc exit=0
eslint exit=0
i18n exit=0   (✅ i18n check passed: both catalogs agree, every key used in src/ resolves, …)
build exit=0  (next build 35 sn)
npx vitest run exit=0 — Test Files 296 passed | 2 skipped (298) · Tests 3793 passed | 41 skipped (3834)
check-live-skips exit=0
```
İzole DB CI sırasıyla kuruldu: `db push` → `db:rls-role` → `apply-migrations.sh` ×2 (41 dosya, ikinci koşu da temiz) → `db:rls` (28 → 112 politika) → `db:seed`.

## 4. Değişen dosyalar
- `docs/agent-results/TASK-MUOAW0UAXVG1M-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUOAW0UAXVG1M-be-fb-ekler/`: sonda, mutant ve canlı betikleri (`.txt` olarak) ve çıktıları.
Kod dosyasına dokunulmadı.

## 5. Riskler
- Y-1 bugün admin'e dönük, ama sınıf genel. Kiracıya dönük bir eylem servis katmanına taşınırsa bekçi sessiz kalır. Bu repoda eylemlerin `@/lib/...` servislerini çağırması yaygın bir desen.
- Y-2 ve Y-3 bekçinin "değerleri izler" iddiasını sınırlıyor. Bugün 0 sızıntı olması, bu kalıpların yazılmamış olmasından kaynaklanıyor; bekçinin onları yakalayacağı anlamına gelmiyor.

## 6. Açık sorular
- Y-1 için kural nerede konsun: importer'da hata alanını koda çevirmek mi, yoksa bekçiye modüller arası bir adım eklemek mi? Önerim ikisi birden: önce importer'ı düzelt (küçük iş), sonra bekçiyi genişlet.

## 7. Sonraki adım (takip kartı önerileri)
1. **Y-1:** `runCordisImport` → `error: 'IMPORT_FAILED'` (kod); bekçiye içe aktarılan src modüllerinde sızan export kuralı.
2. **Y-2 ve Y-3:** `.code` muafiyetini catch sembolüne daralt; kirli argüman alan çağrı tanımlayıcı argümanlarını kirletsin; S-c/f/g/j/k/l tanıklarını ve N4–N12 kalıplarını fixture'a ekle.
3. **D-1 ve D-2:** G-1 testine prototip anahtarları ve `logger.warn` argümanının tam eşleşmesi; Ö-2 regex'ine `^ERR_` ve `^UND_ERR_` ekle, 5 karakter kuralını kaldır.

**Platform beyanı:** macOS'ta doğrulandı (Darwin 27, arm64; Node 26.5; Docker `pgvector/pgvector:pg16`; prod `next build`/`next start`). Linux ve Windows **koşulamadı**, çünkü bu makinede yalnız macOS var. Koda göre:
- İncelenen analizci saf AST işi yapıyor. Platforma bağlı tek yeri import yolu karşılaştırması (`action-leak-scan.ts:168-173`): `node:path` `join`/`normalize` kullanıyor, sonra `\` karakterini `/`'ya çeviriyor. Windows'ta da `src/lib/errors` biçimine iniyor.
- Bekçi testi yolları `rel()` ile `sep`→`/` normalleştiriyor.
- G-1 bir sunucu eylemi girdisini doğruluyor; süreç, kabuk ya da dosya yolu kullanmıyor.
- Eklerdeki betikler (`python3`, `docker exec`, `node`) yalnız inceleme aracı.
