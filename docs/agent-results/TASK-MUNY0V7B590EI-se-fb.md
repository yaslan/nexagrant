# TASK-MUNY0V7B590EI — FB TAKİP (İNCELEME-74 Y-1/Y-2/D-1..D-3) · RBAC bekçisi fail-closed

**Durum:** TAMAM
**Dal:** `se-fb/muny0v-guard-failclosed` (dev `5ec0d733`'ten), kendi scratchpad worktree'mde. İzole DB: `sefbny-pg` konteyneri, `127.0.0.1:55490`. Paylaşılan `:5433`'e hiç bağlanmadım.
**Değişen kod:** yalnız `tests/server-action-rbac-guard.test.ts`. Uygulama kodu değişmedi.
**Ekler:** `docs/agent-results/TASK-MUNY0V7B590EI-se-fb-ekler/`

**Platform beyanı:** Her şeyi mac'te doğruladım (Darwin 27, Node, vitest 4.1.11, Postgres 16 + pgvector Docker'da). Bekçi saf bir TS AST taraması. Dosya yolu yalnız `scanSrc`'de `path.sep` → `/` ile, modül çözümü `path.posix` ile yapılıyor. Yeni kod dosya sistemine yalnız mevcut `resolveSpec`/`loadModule` üzerinden dokunuyor. Koddan okuyunca Windows ve Linux'ta aynı sonucu vermesi gerekir. Windows ve Linux'ta koşmadım, çünkü bu makinede yalnız mac var. CI (ubuntu-latest) aynı dosyayı koşuyor.

## 1) Ne yapıldı

### Y-1: re-export/sarmalama çözümlemesi + fail-closed
- **Modül modeli genişletildi.** Artık fonksiyon dışı üst düzey değerler de tutuluyor: `const x = wrap(async …)`, nesne, `const w = imported`, `class`, `enum`, `export default <ifade>`. Ayrıca yeniden ihraç edilen import'lar (`import {x}; export {x}`, `export default x`) ve `export * as ns` çözülüyor.
- **`resolveExport`, eski `exportedFn`'in yerini aldı.** Dört sonuçtan birini dönüyor:
  - bir fonksiyon ya da değer (yerinde bütünüyle geziliyor),
  - bir namespace,
  - `external` (src/ dışı ya da string sabit, gezilecek bir şey yok),
  - `null`.
- **Fail-closed:** `null`, yani src/ altında çözülemeyen bir ad, **hedef modülün tamamı** gezilmiş gibi değerlendiriliyor. Modülde readOnly altında ya da kontrolden önce bir yazma varsa kırmızı. `import()` ile gelen namespace'in üyesi bilinmiyorsa da aynı kural geçerli.
- **Namespace takibi:** `ns.x`, `ns['x']`, `const { x } = ns`, `const m = await import('<literal>')`, `(await import('…')).x`. D1 ve D2 de böylece kapandı.
- **MAX_DEPTH artık sessiz değil.** Sınırın ötesine geçen çağrı kendisi bulgu (L7+). readOnly action'da her durumda, yazma action'ında yalnız kontrolden önce.
- **"Açık istisna listesi" gerekmedi.** Gerçek ağaçta çözülemeyen import sayısı 0 (§2.3). Bu yüzden `ALLOWED` dışında yeni bir liste açmadım. Bugün çözülemeyen bir ad yazma içermeyen bir modüle çıkıyorsa yeşil kalıyor. Bunu U2 testi sabitliyor.

### Y-2: `can`'in rol argümanı yalnız oturumdan gelebilir
`isFixedRole` (bir kara liste) kaldırıldı. Yerine veri akışına dayalı bir beyaz liste (`Walker.sessionRole` / `sessionValue`) geldi.

**Kabul edilen biçimler:**
- `role`, `scope.role`, `s?.role` ya da bunların `asRole(…)` ile sarılmış hali.
- Bu değer bir `const` bağlamadan gelmeli ve bağlamaya hiç yazılmamış olmalı. Bağlamanın kaynağı şunlardan biri olmalı:
  - `requireTenantAction()` / `requireTenantApi()` / `auth()` / `tenantScopeOf(<oturum>)`,
  - yalnız bunları döndüren aynı dosyadaki bir yardımcı (pipeline'daki `sessionScope()`),
  - ya da çağıranın oturum değeriyle doldurduğu bir yardımcı parametresi.
- `assertTenantActionRole(scope, …)` ve `isPlatformAdminSession(s)` da ilk argümanları için aynı kurala tabi.

**Artık kontrol sayılmayanlar:**
- action argümanı (S3),
- fonksiyon içi sabit (S4),
- `R.X` / `$Enums` / şablon / `'X' || role` (S5–S8),
- `let` + yeniden atama (S9),
- varsayılan değerli destrüktür (S10),
- yardımcı parametresine yeniden atama: `=`, `[role] =`, `({role} =)`, `for (role of …)` (S11, S11b–d),
- sahte scope nesnesi (S12),
- `const` scope'un `.role`'ünün üzerine yazılması (S13).

S11–S13'ü inceleme listesinde yoktu, kendi kodumu okurken buldum ve kapattım.

### D-1..D-3
- **D-1 gölgeleme:** `localBinding()` fonksiyon, blok, parametre, catch ve for kapsamlarında adı arıyor. Bir kontrol adı (`can`, `requireTenantAction` …) ya da aynı dosyadaki bir yardımcının adı (S2b) yerel bir bildirimle gölgeleniyorsa artık kontrol sayılmıyor.
- **D-2 dolaylı yazma:** Hepsi fail-closed.
  - W1/W3/W9: yazma metodu değer olarak alınıyor.
  - W2: `const { deleteMany } = tx.x`.
  - W4: sabit olarak okunabilen metot adı. Okunamıyorsa (W4b) yazma sayılıyor.
  - W5: `$queryRaw(q)`'da `q` const'u izleniyor. SQL okunamıyorsa (W5b) yazma sayılıyor.
  - W6/W7: aynı dosyadaki nesne ya da sınıf yerinde geziliyor.
  - W8: `f(tx.evidence)`, yani model erişimcisini fonksiyona vermek yazma sayılıyor.
- **D-3 hoisting:** İç `function` bildirimi çağrıldığı yerde, o noktadaki kontrol durumuyla geziliyor (E4).
- **Belgeye taşınan kalanlar** ("What stays out of reach"):
  - nesnede ya da dizide saklanan model erişimcisi, ya da çalışma anında seçilen model (`tx[model]`),
  - `require`, hesaplanmış `import()`, `eval`, getter, Proxy,
  - çağrı üzerinden mutasyon (`Object.assign(scope, …)`) ya da başka bir takma ad üzerinden mutasyon,
  - TRUSTED modüllerin kendisi.

### Kendi-mutant testleri
`describe('İNCELEME-74 R/S/W/E/D/L')` altında 11 yeni test var. Her mutant kendi `red()` satırında. Yeşil kontroller de eklendi:
- yalnız okuyan barrel, namespace ve değer,
- `sessionScope()` + `assertTenantActionRole`,
- `auth()` → `s?.role`,
- `asRole(scope.role)`,
- `gate(scope)` → `({ role })`.

**İki mevcut test beklentisi değişti.** İkisi de daha katı yönde:
- **G5 "6+1 modül":** Önce `[]` bekliyordu, yani sessizce duruyordu. Artık "calls go deeper than 6 modules" bulgusunu bekliyor.
- **N5b:** Hâlâ kırmızı, ama mesaj "writes before any role check" yerine "without a role check". Referansla gezilen `gate(role)`'ün `role`'ü artık yalnız bir parametre olarak görülüyor, bu yüzden oradaki `can` hiç kontrol sayılmıyor.

## 2) Kanıt

### 2.1 İnceleme düzeneği (crw-fb'nin 39 mutantı + 7 kontrol), aynı dosya, yeni bekçi
`ekler/mutants-i74-after.txt`:
```
KIRMIZI 45 satır = C1–C6 (6 pozitif kontrol) + 39/39 mutant;  C7 (iyi biçim) YEŞİL
```
Önce: 39'un 8'i kırmızıydı. Şimdi 39'un 39'u kırmızı. Seçme satırlar:
```
R1 … KIRMIZI  readOnly: true but writes: prisma.evidence.delete (lib/i74/r1impl.ts:2, via wipeR1 (lib/i74/r1impl))
R7 … KIRMIZI  readOnly: true but writes: prisma.evidence.delete (lib/i74/r7impl.ts:3, via wipeR7 (lib/i74/r7impl))
S3 … KIRMIZI  write action without a role check (…)
W5 … KIRMIZI  readOnly: true but writes: tx.$queryRaw (writing SQL) (line 9)
W8 … KIRMIZI  readOnly: true but writes: tx.evidence (model handed to wipeVia) (line 9)
L12 … KIRMIZI readOnly: true but calls go deeper than 6 modules, where the guard stops seeing writes: c7 (lib/i74/c7, from lib/i74/c6)
```

### 2.2 Ters kanıt: her yeni kural yük taşıyor mu? (`ekler/sabotage.txt`)
Bekçinin bir kopyasında kuralları tek tek kapattım ve bekçi dosyasını koştum. Her koşudan sonra dosya geri yüklendi (`cmp` ile doğrulandı).

**Sonuç:** 25 sabotajın 24'ü en az bir testi kırmızıya çeviriyor. Örnekler:
```
[resolve-import-reexport (R1/R2/R3)] 1 failed :: R1–R3 …
[unresolved -> whole module (Y-1)]   1 failed :: Y-1 fail-closed …
[depth fail-closed (L7+)]            2 failed :: G5 …, L7+ …
[session role origin (S3-S8)]        3 failed :: N4, N5, S3–S8
[written-to session binding]         1 failed :: S3–S8
[model handed to fn (W8)]            1 failed :: W1–W9
[hoisted nested fn (E4)]             1 failed :: E4
[dynamic import (D1/D2)]             1 failed :: D1/D2
[const-only binding (S9)]            44 passed   ← tek istisna
```

**İki not:**
- **"const-only" tek başına yük taşımıyor.** `let` + yeniden atama hem bu kuralla hem `writtenTo` ile yakalanıyor. Derinlemesine savunma olarak bıraktım, gevşetmedim.
- **"top-level values" kapatılınca R7/R8 testleri yine kırmızı.** Bu kez fail-closed tam-modül yürüyüşü yakalıyor. Kırmızıya dönen test W6/W7.

### 2.3 Gerçek ağaç: FP ve fail-closed ölçümü (`ekler/guard-instr.txt`)
Ölçüm için bekçiye geçici bir sayaç ekledim, ölçümden sonra kaldırdım:
```
maxDepth=5 enters=10459 findings=0 files=37 keys=128
deep=            (MAX_DEPTH sınırına varan çağrı yok)
(çözülemeyen import listesi boş)
```
- **FP = 0.** Tüm 128 action ve 37 dosya için bulgu yok.
- **Çözülemeyen import sayısı 0 → 60 → 0 oldu.** İlk ölçümde 60 vardı (bkz. İNCELEME-74 §1.3). Bunlar dışa aktarılan string sabitlerle `export default prompt` biçimindeki prompt dosyalarıydı. String sabitleri "gezilecek şey yok" olarak çözünce sayı 0'a indi.
- **Gerçek ağaçta ulaşılan en derin nokta 5 modül.** Sınır 6 olduğu için L7+ kuralı bugün hiçbir gerçek action'da tetiklenmiyor.
- **Süre:** bekçi dosyası yük altında 1.35 sn → tüm dosya ~4 sn (import dahil).

### 2.4 Kapılar (`ekler/gates.txt`)
```
TSC_EXIT=0   LINT_EXIT=0   BUILD_EXIT=0      (load 30–48)
```

### 2.5 Tam `vitest run`, yük altında, izole DB (`ekler/fullrun.out`)
DB, CI'daki sırayla hazırlandı (`ekler/db-prep.txt`): `db push` → `db:rls-role` → 39 migrasyon ×2 → `db:rls` (28 → 112) → seed.
Env: `CI=true`, `AUTH_SECRET` ci.yml'deki değer, `DATABASE_URL*` → `:55490`.

Aynı anda başka ajanların yükü de vardı:
```
== run 1 start 14:16:02  load 68.74 → end 14:18:50 load 92.36
 Test Files  1 failed | 273 passed | 2 skipped (276)
      Tests  1 failed | 3336 passed | 22 skipped (3359)      EXIT=1
== run 2 start 14:18:50  load 92.36 → end 14:20:09 load 91.79
 Test Files  274 passed | 2 skipped (276)
      Tests  3337 passed | 22 skipped (3359)      EXIT=0
```
Her iki koşuda live-skip kapısı (`scripts/check-live-skips.ts`) yalnız izin listesindeki atlamaları gördü.

**Koşu 1'deki tek kırmızı bu değişiklikle ilgisiz.** Kırmızı olan `src/lib/agency/report.test.ts` › "300 random tables" (vitest JSON'undan):
- Süre 130 328 ms, bütçesi 120 sn. Test bir STACK_TRACE_ERROR zaman aşımıyla düştü.
- Bu, İNCELEME-74'teki **Ö-1**. crw-fb bu testi load 107'de 100.5 sn ile "sıradaki flake adayı" diye işaretlemişti. Bugün load 92'de bütçeyi aştı.
- Bu dosyaya dokunmadım. Koşu 2'de aynı test yeşil.
- Ö-1'in önerisi hâlâ geçerli: tabloları 300'den ~100'e indirmek ya da süreyi CPU ile ölçmek. Ayrı bir kart gerekir.

### 2.6 Merge sonrası dev (`235e3162`)
Ben çalışırken dev `5ec0d733`'ten `c06f0bc4`'e ilerledi. Bu aralıkta başka ajanların merge'leriyle `src/` altında 52 dosya değişti. Merge'ten sonra dev'de iki kontrol koştum:
- `tests/server-action-rbac-guard.test.ts` + `tests/server-action-rbac.test.ts` → `Tests 109 passed (109)`. Yeni ağaçta da FP 0.
- `tsc --noEmit` → EXIT 0.

## 3) Değişen dosyalar
- `tests/server-action-rbac-guard.test.ts`: bekçi ve kendi-mutant testleri.
- `docs/agent-results/TASK-MUNY0V7B590EI-se-fb.md` ve `…-se-fb-ekler/`: rapor ve kanıt dosyaları.

## 4) Riskler
- **W8 geniş bir kural.** Model erişimcisini (`tx.evidence`) bir fonksiyona argüman olarak vermek, readOnly action'da ve kontrolden önce yazma sayılıyor. Bu fonksiyon yalnız okuyor olsa bile. Bugün gerçek ağaçta 0 FP. İleride salt-okuyan bir yardımcı bu biçimde yazılırsa kırmızı olur. Çözüm: istemciyi (`tx`) vermek, ya da okumayı action'ın içinde yapmak.
- **Tam-modül yürüyüşü aşırı yaklaşım.** Çözülemeyen bir ad, hedef modüldeki her yazmayı getirir. Bu fail-closed tarafında bir hata ve bugün tetiklenmiyor.
- **Güven sınırı değişmedi.** `lib/tenant`, `lib/auth`, `lib/rbac`, `lib/db` ve `lib/system-scope` (TRUSTED) oturumun ve kontrolün doğru olduğu varsayılan modüller.

## 5) Açık sorular
- Ö-1 (`agency/report.test.ts` 300 tablo, 120 sn bütçe) bu koşuda gerçekten bütçeyi aştı (130 sn, load 92). Takip kartı açılsın mı?
- Belgede kalanlar (nesnede saklanan erişimci, `tx[model]`, `Object.assign`) için ayrı bir kart açılsın mı? Bugün gerçek ağaçta bu biçimler yok.

## 6) Sonraki adım
- dev'e merge (push yok). İnceleme kartı açılırsa inceleyici `ekler/`deki düzenekle yeniden koşabilir.
