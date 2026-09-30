# TASK-MUOBO31H8EPR5 — cs-fb — FB TAKİP: eylem hata-sızıntı bekçisi Y-1/Y-2/Y-3 + RBAC bekçisi B-1/B-2

**Durum:** TAMAM
**Dal:** `cs-fb/muobo3-guard-crossmodule`. dev `5e674e7f`'den açıldı, sonra fe-fb'nin CORDIS düzeltmesiyle (dev `6754ef1b`) birleştirildi. Kendi worktree'm ve kendi izole DB'm (`csfbo3-pg`, :55983) kullanıldı. Paylaşılan `fabrika` :5433'e hiçbir şey yazılmadı.
**Kaynaklar:** İNCELEME-100 (TASK-MUOAW0UAXVG1M, be-fb) §Y-1/§Y-2/§Y-3 ve İNCELEME-101 (TASK-MUOAYJ8HM8F4R, cs-fb) B-1/B-2.
**Ekler:** `docs/agent-results/TASK-MUOBO31H8EPR5-cs-fb-ekler/`

## 1. Ne yapıldı

### Y-1: modüller arası akış (`tests/api/action-leak-scan.ts`)
Seçenek A'yı uyguladım: servis çağrısının dönüşünü izlemek. Derinlik 1–2 ile sınırlı değil, sınırsız. Her modül okuyucu başına bir kez analiz edilip önbelleğe alınıyor. Bilinmeyen durumlar kaçak sayılıyor (fail-closed).

- Bir `@/` ya da göreli import `src/` altında okunuyor ve aynı analizden geçiyor. Bir export'un fonksiyonu yakaladığı değeri döndürüyor ya da `yield` ediyorsa, bu export'un çağrısı kaynak sayılıyor. İzlenen biçimler:
  - adlı ve varsayılan import,
  - namespace üzerinden `ns.f()` ve `ns[x]()`,
  - dışa aktarılmış bir nesnenin ya da sınıfın metodu,
  - `export { a as b }`, `export { x } from`, `export *`,
  - `export const run = make()` (yerel ya da src fabrikası): fabrikanın ürettiği herhangi bir fonksiyon kaynaksa,
  - `export const { auth } = NextAuth(cfg)`: paket fabrikası olduğu için yalnız argümanlarına göre yargılanıyor.
- Aynı mantık dosya içinde de geçerli. Yakaladığını döndüren yerel fonksiyonun çağrısı, callback'i kaynak olan çağrı (`ids.map(() => … catch (e) { return String(e) })`) ve nesne literalindeki kaynak getter ya da metot da kaynak sayılıyor.
- **Fail-closed durumlar:** hiçbir dosyaya çözülmeyen src import'u, modülün dışa aktarmadığı ad, `#`/`~` alias'ı, import döngüsü ve bütünüyle kullanılan namespace (`ns[x]()`) sızıntı sayılıyor.
- Tek alias'ın `@/` olduğunu bir test kilitliyor: tsconfig `paths` yalnız `['@/*']`, `baseUrl` yok, package.json'da `imports` yok. Yeni bir alias eklenirse test kırmızı olur.
- Bekçi testi gerçek ağacı `fsModuleReader(ROOT)` ile okuyor (`tests/api/api-error-body-guard.test.ts`).

### Y-2: 11 dosya içi kalıp + K2
- **`.code` muafiyeti daraltıldı.** Artık yalnız catch bağlamasının kendisine ya da reddetme işleyicisi parametresine uygulanıyor, bir de bunların yeniden atanmamış `const` takma adına (`const err = e as X`). Kapanan kalıplar: N4, N5, N16, N16b (`e = {code: …}`).
- **`const` alias:** `const a = out` ya da `const { meta } = out` ile `a` kirlenirse `out` da kirleniyor (N6, N7, N7b).
- **Mutatörler:** alıcıya yazan metotlar kirletiyor: `push`, `unshift`, `splice`, `set`, `add`, `append`, `fill`. `Object.assign`, `defineProperty` ve `Reflect.set` ilk argümanı kirletiyor. `X.prototype.push.call(errors, …)` this argümanını kirletiyor (N8, N9, N10).
- **Yardımcılar:**
  - Yerel yardımcı: kirli argüman parametresine geçiyor. Gövde bir parametreyi kirletiyorsa çağrıdaki karşılık gelen argümanın kökü de kirleniyor (N11 ve dış `let`'e yazan `note(e)`).
  - src yardımcısı: modül analizinden parametreden parametreye akış hesaplanıyor.
  - Paket fonksiyonu: tüm argümanlar kirlenmiş sayılıyor (`set(out, k, e)` gibi lodash kalıbı).
- **Diğerleri:** yerel sınıfın alanı ya da metodu kirliyse `new R()` kirli (N12). `yield` bir sink sayılıyor (N17). `Promise.allSettled(...)` kaynak sayılıyor (K2; bu src'de hiç kullanılmıyor). Kirli alıcı ya da argüman alan callback'in parametreleri kirleniyor.
- **FP'yi önlemek için:** kirli argüman, mutatör olmayan metodun alıcısını kirletmiyor. Örneğin `NOT_CONNECTED.test(msg)` ya da `logger.warn(…)` artık kirletmiyor. İlk sürümde bu kural 30 dosyada FP üretmişti, bkz. §2.2. Metot tanımı içeren bir nesne literali de artık içindeki catch yüzünden kirli sayılmıyor.

### Y-3 ve kendi kurallarım: kural başına tanık
Yeni test dosyası `tests/api/action-leak-scan.test.ts` (68 test). İçeriği:
- İNCELEME-100'ün 6 tanığı.
- S-c için gerçek bir yapı: sayfa içindeki satır içi `'use server'` eylemi. be-fb'nin kapanış tanığı artık "kaynak fonksiyon" kuralıyla da yakalandığı için S-c'yi ayırt etmiyordu.
- Y-1 ve Y-2 fixture'ları.
- Temiz kontroller: paket, kod döndüren servis, `errorCode` sanitiser'ı, logger, aynı modülün başka bir export'u, paket fabrikası, temiz `export *`, `e.code`/`e?.code`/`const err = e`, regex `.test`, metodunda catch olan nesne.

### B-1 ve B-2 (`tests/server-action-rbac-guard.test.ts`)
- **B-1:** iki kalıcı test eklendi.
  - (a) Gerçek `lib/rag.ts` → `@/lib/ai/prompts` → `prompts/index.ts`. Overlay önüne `lib/ai/prompts.ts` koyuyor, yazma görülüyor.
  - (b) Aynı sınıfın göreli yolu: gerçek `lib/jobs/worker.ts` → `./tasks` → `tasks/index.ts`. Overlay önüne `lib/jobs/tasks.ts` koyuyor.
- **B-2:** "as in tsc" ve "falls through" yorumları düzeltildi. Doğrusu: tsc 5.9 eşleşen bir `paths` anahtarından sonra doğrudan node_modules'a gider. Bekçinin `baseUrl` ve `imports`'a devam etmesi daha katı taraftır. Değişenler: başlık belgesi, `resolveBare` belgesi, `u3` ve `k10` yorumları. Davranış değişmedi.

## 2. Kanıt

### 2.1 Gerçek ağaç: FP ve süre (`tree.mts` → `tree-after-fefb.txt`, `cordis-before-after.txt`)
```
5e674e7f (fe-fb öncesi): eylem dosyası=37 sızıntılı={"src/app/[locale]/admin/cordis/actions.ts":[22,30]}
6754ef1b (fe-fb sonrası): eylem dosyası=37 sızıntılı={}
```
Çalışma ağacında (fe-fb sonrası), her koşu soğuk önbellekle:
```
koşu 1: eylem dosyası=37 sızıntılı=0 duvar=1656 ms cpu=2644 ms
koşu 2: eylem dosyası=37 sızıntılı=0 duvar=1206 ms cpu=1402 ms
koşu 3: eylem dosyası=37 sızıntılı=0 duvar=1101 ms cpu=1261 ms
```
- Eski bekçi 5e674e7f'de bu eylemi temiz sayıyordu (İNCELEME-100 `leaksInActions=0`). Yeni bekçi aynı ağacı git'ten okuyunca (`at-commit.mts`) CORDIS'i **yakalıyor**: satır 22 `error: importRes.error`, satır 30 kirli `importRes`'in diğer alanları.
- fe-fb'nin TASK-MUOBNYACFPLPF düzeltmesinden sonra 0. Yani fe-fb merge edince yeşile döndü; dev'e merge edildiğinde bu zaten dev'deydi. `KNOWN_ACTION_LEAKS` boş kaldı, muafiyet eklenmedi.
- **FP 0.** Süre ~0,25–0,8 sn'den ~1,1–1,6 sn'ye çıktı, çünkü artık eylemlerin eriştiği ~100 src modülü de analiz ediliyor. İlk sürüm 10 sn sürüyordu; `leaks` önbelleği ve temizlik yargısının tembel hesaplanmasıyla 1,2 sn'ye indi.
- `export-leaks-dev.txt`: fe-fb öncesi ağaçta bekçinin kaynak saydığı export'lar yalnız `runCordisImport` ve `probeInviteCode`. Sonuncusu `ProbeRollback.accepted` boolean'ını döndürüyor ve auth'un içinde `!` ile tüketiliyor, eyleme ulaşmıyor.
- Import döngüsü sayısı 0.

### 2.2 İlk sürümdeki FP, düzeltildi
Alıcıyı her zaman kirleten kural gerçek ağaçta 30 eylem dosyasını kırmızı yaptı. Zincir şöyleydi: `auth.ts`'de `NOT_CONNECTED.test(errorMessage(e))` → `NOT_CONNECTED` kirlendi. Metot gövdeleri nesne literalinin sızıntısı sayıldığı için `safeAdapter` ve `authConfig` da kirlendi. Sonuçta `auth` ve `requireTenantAction` kaynak göründü. Çözüm: yalnız mutatör alıcıları kirleniyor ve fonksiyon benzeri düğümler `leaks` içinde atlanıyor. Sonuç 0 FP; 11 kalıbın hepsi hâlâ kırmızı.

### 2.3 İNCELEME-100 sondası (`probe100.mts` → `probe100-out.txt`)
be-fb'nin 40 girdilik sondası aynen koşuldu:
- 36 girdi YAKALADI. Buna önceki KAÇTI'ların tamamı dahil: K2, N4–N12, N16, N17.
- 4 girdi boş kaldı ve hepsi beklenen sonuç: N21 ve N22 dönüş değil (kapsam dışı, bkz. §4), N23 ve N26 temiz kontrol girdileri.

### 2.4 Mutantlar: eylem bekçisi (`mutants.py`, `mutants-out.txt`, `mutants-out-2.txt`)
Bu betik orijinal dosyayı bellekte tutup her mutanttan sonra ona geri yazıyor; `git checkout` kullanılmadı. 35 mutantın 35'i de öldü:
```
ÖLDÜ | S-c S-f S-g S-j S-k S-l                (İNCELEME-100'de 6'sı da YAŞADI idi)
ÖLDÜ | Y1a import izlenmiyor 17 failed · Y1b 14 · Y1c döngü · Y1d bulunamayan modül · Y1e #/~ alias
     | Y1f dışa aktarılmayan ad · Y1h export{}from · Y1i yerel fabrika · Y1k yapıbozumlu export
     | Y1l callback kaynağı · Y1m getter/metod · Y1n modül yardımcısı argümana yazar · Y1o ns[x]()
ÖLDÜ | Y2a–Y2l (.code yeniden atama, alias, Object/Reflect, .call, mutatör alıcısı, yerel param→arg,
     | yerel param, sınıf, yield, allSettled, callback param, paket argümanı) · P1 memo temizliği
İlk turda YAŞADI → tanık eklendi → ÖLDÜ: Y1g export * (temiz export * kontrolü), Y1j fabrikada deep
     (başka modüldeki fabrika), Y1p yerel kaynak çağrısı (servisin iç yardımcısı)
```

### 2.5 Mutantlar: RBAC bekçisi, B-1 (`mutants-rbac.py`, `mutants-rbac-out.txt`)
```
ÖLDÜ   | n18  | bare: at() probed eklemiyor          | 1 failed | 63 passed (64) | ['B-1 (İNCELEME-101): a file an overlay puts in front of a directory index is walked']
ÖLDÜ   | n18r | göreli: resolveSpec probed eklemiyor | 1 failed | 63 passed (64) | ['B-1 (İNCELEME-101): the same through a relative import of a directory index']
YAŞADI | x7   | imports: probed eklenmiyor           | 64 passed (64)
```
x7'yi öldürmek için `#…` import eden gerçek bir modül gerekiyor. Bugün ağaçta böyle bir modül yok (İNCELEME-101'de de böyle not edilmişti). Overlay'deki bir dosya bu yolu tetiklemiyor, çünkü gölgeleme yalnız gerçek modüllerde yeniden çözülüyor. Etkisi test altyapısıyla sınırlı; gerçek tarama `NO_OVERLAY` ile koşuyor.

### 2.6 Kapılar (`gates.txt`, `db-prep.txt`)
```
tsc exit=0
eslint exit=0
i18n exit=0   (✅ i18n check passed: both catalogs agree, …)
build exit=0  (next build)
npx vitest run: §2.7
```
İzole DB şu sırayla kuruldu: `migrate diff --from-empty` + psql → `db:rls-role` → `apply-migrations.sh` ×2 (41 dosya, ikinci koşu da temiz) → `db:rls` (28 → 112 politika) → `db:seed` (SEED_EXIT=0). Koşudan önce `DATABASE_URL → 127.0.0.1:55983/fabrika` doğrulandı.

### 2.7 Tam vitest
(`vitest-summary.txt`)
```
DATABASE_URL → 127.0.0.1:55983/fabrika
 Test Files  294 passed | 6 skipped (300)
      Tests  3817 passed | 113 skipped (3930)
   Duration  39.82s
vitest exit=0
```
Başarısız test yok. Atlanan sayısı İNCELEME-100'dekinden (41) yüksek. Nedeni: bu koşu `CI=true` olmadan, yerel `.env` ile yapıldı; ortam anahtarı isteyen canlı testler (live) bu yüzden atlandı. Bu değişikliğin dokunduğu dört test dosyası atlanmadı, hepsi koştu: `action-leak-scan`, `api-error-body-guard`, `server-action-rbac-guard` ve plans `actions`. Hedefli ayrı koşu: `Test Files  4 passed (4) · Tests  174 passed (174)`.

## 3. Değişen dosyalar
- `tests/api/action-leak-scan.ts`: bekçi analizcisi (Y-1 ve Y-2).
- `tests/api/action-leak-scan.test.ts` (yeni): kural tanıkları (Y-1, Y-2, Y-3).
- `tests/api/api-error-body-guard.test.ts`: gerçek ağaç okuyucusu.
- `tests/server-action-rbac-guard.test.ts`: B-1'in iki testi ve B-2 yorumları.
- `docs/agent-results/TASK-MUOBO31H8EPR5-cs-fb.md` ve `-ekler/`.

`src/` altında hiçbir dosyaya dokunulmadı. fe-fb'nin importer ve eylem dosyaları dahil.

## 4. Riskler ve bilinçli sınırlar
- **Bekçinin hâlâ görmediği yollar** (başlık belgesinde listeli; hiçbiri bugün src'de yok):
  - `new Promise` reject callback'i,
  - `EventEmitter` hata dinleyicisi,
  - dönüş dışındaki çıkışlar: redirect URL'si ve çerez (N21, N22).
- **Paket fonksiyonunun dönüşü izlenmiyor.** Paketin kendi catch'i bizim kodumuz değil, bu yüzden paket çağrısı yalnız argümanlarına göre yargılanıyor.
- **Mutatör olmayan metodun alıcısı kirlenmiyor.** Örnek: kullanıcı tanımlı bir `out.record(e)` metodu. Bu, FP ile kapsam arasında bilinçli bir seçim. Yerel yardımcı fonksiyon ve modül yardımcısı ise param→arg akışıyla izleniyor.
- **Alan-duyarsız taint.** Kirli nesnenin bütün alanları kirli sayılıyor. Örneğin CORDIS'teki satır 30 bu yüzden işaretlendi. Bu, güvenli yönde bir sapma.
- **Süre ~1,2 sn.** Suite içinde `api-error-body-guard` gerçek ağaç taraması bu kadar sürüyor. Artış kabul edilebilir, ama modül sayısıyla doğrusal büyüyecek.

## 5. Açık sorular
- **Sonuç yolu çelişkisi:** görev ekindeki "KANIT ZORUNLU" satırı `/Users/macbook/alan/docs/agent-results/TASK-MUOAYJ8HM8F4R-cs-fb.md` diyor. Bu, İNCELEME-101 raporumun adı ve üstelik repo dışında bir yol. Gerçek rapor görev metnindeki mutlak yolda: bu dosya. Kanıt yoluna yalnız buraya işaret eden bir yönlendirme notu koydum; repodaki TASK-MUOAYJ8HM8F4R raporuma dokunmadım.

## 6. Sonraki adım
- İNCELEME kartı: yeni bekçiye saldırgan sonda. Özellikle mutatör listesinin dışında kalan kullanıcı metotları ve paket argüman kuralı denenmeli.
- İsteğe bağlı: x7 için gerçek bir `#` importer eklenirse aynı kalıpla test yazılabilir.

**Platform beyanı:** Yalnız macOS'ta doğrulandı (Darwin 27, arm64; Docker `pgvector/pgvector:pg16`; `next build`). Linux ve Windows koşulamadı, çünkü bu makinede yalnız macOS var. Koda göre:
- Analizci saf AST işi yapıyor.
- Yol işleme `node:path` `join`/`normalize` ile yapılıp `\` karakteri `/`'ya çevriliyor (`resolveSpec`, `trustedImport`). `fsModuleReader` `join(root, p)` ile okuyor; Windows'ta da çalışır.
- Test yolları `rel()` ile `/`'ya normalleştiriliyor.
- Harfe duyarlılık: `read(c)` mac'te harfe duyarsız dosya sistemine düşer. Bu yüzden `./SRC/...` gibi bir specifier mac'te çözülür, Linux'ta UNRESOLVED olur. Linux'ta sonuç fail-closed, yani kırmızı: güvenli yön.
- Ek betikler (`python3`, `docker exec`, `tsx`) yalnız doğrulama aracı.
