# TASK-MTVPNUTNI54ZW — `noUncheckedIndexedAccess` Dilim 3: çekirdek iş mantığı

**Platform beyanı: macOS (Darwin 25.6.0, zsh, Node/pnpm yerel).** Windows/Linux koşulmadı — gerekçe §6'da.

Dilim 3'ün 7 dosyasındaki 23 `noUncheckedIndexedAccess` hatası kapatıldı. Bayrak `tsconfig.json`'da
**açılmadı**; `git diff -- tsconfig.json` boş (§2-D).

---

## 1) Ne yapıldı

### Ölçüm yöntemi — bayrağı `tsconfig.json`'da açmadan

Kart "bayrağı geçici aç, ölç, hemen geri al" diyordu. Bunun yerine **kardeş bir config** kullandım:

```jsonc
// tsconfig.nuia-probe.json (geçici, ölçüm sonrası silindi)
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noUncheckedIndexedAccess": true, "incremental": false } }
```
```bash
npx tsc -p tsconfig.nuia-probe.json --noEmit
```

**Neden:** aynı ağaçta blok-zincir-dev çalışıyor (`git status`'ta `invoice-writer.ts`,
`system-alert.ts`, `inngest/jobs/` değişik). Bayrağı `tsconfig.json`'a yazıp geri almak, ölçüm
süresince (~40 sn) o dosyayı **kırık** bırakır; o aralıkta komşu `pnpm typecheck` çalıştırırsa
171 hata görür ve bunu kendi işi sanır. Kardeş config aynı ölçümü verir ve paylaşılan dosyaya
hiç dokunmaz. `incremental: false`, ölçümün ortak `tsconfig.tsbuildinfo`'yu kirletmemesi için.

Kartın istediği kanıt (`git diff -- tsconfig.json` boş) bu yolla da sağlanıyor — daha güçlü
biçimde: dosya hiç açılmadı.

### Ölçüm taze — ağaç raporun yazıldığı günden beri kaymamış

Bayraklı toplam: **171 hata**, TASK-MTSWAKD31LS49'daki ölçümle birebir aynı. Ama **satır
numaraları kaymış** ve iki yerde raporun teşhisi yanlıştı:

| Dosya | Rapordaki tahmin | Gerçek |
|---|---|---|
| `src/modules/m5/server/queries.ts` | `~255` — `current.toISOString()`, `Date` döngü değişkeninde TS control-flow yanlış pozitifi | `258,263` — `current` değil; hata `.split('T')[0]`'ın `string \| undefined` olması |
| `src/lib/blog.ts` | `~187-189` — `BLOG_POSTS[index]` | doğru satır ama hata `current` üzerinden; `189`'daki TS2322 türev |
| `src/lib/auth.ts` | 3 hata (`memberships[0]`) | **4** — ayrıca `208`: `email.split("@")[0]` |

Yani rapordaki "23" toplamı doğru, dosya listesi doğru, ama iki teşhis düzeltildi.

### Dosya bazında (bayraklı ölçüm, öncesi → sonrası)

| Dosya | Önce | Sonra | Ne yapıldı |
|---|---:|---:|---|
| `src/lib/auth.ts` | 4 | 0 | `memberships[0]` → **elemandan daraltma** (erken çıkış, `!` yok); `split("@")[0]` → `?? email` |
| `src/lib/blog.ts` | 3 | 0 | `if (!current) return undefined` — "yok" sözleşmesini korur |
| `src/lib/gates/evaluate.ts` | 6 | 0 | G3: `if (latestEval)` — `.length` yerine **elemandan** daraltma |
| `src/lib/k2-cordis/partnerProfileJob.ts` | 4 | 0 | `orgs[i]/[j]` hoist + gerekçeli guard |
| `src/lib/rag.ts` | 2 | 0 | `for (const [i, chunk] of chunks.entries())` — guard'a hiç gerek yok |
| `src/modules/m5/server/queries.ts` | 2 | 0 | `.split('T')[0]` → `.slice(0, 10)` (repoda zaten baskın idiom) |
| `src/modules/m6/server/scoring.ts` | 2 | 0 | `reviewerAverages[i]/[j]` hoist + gerekçeli guard |
| **Toplam** | **23** | **0** | |

**Varsayılan `!` kullanılmadı — hiçbir dosyada.** Kart `auth.ts` ve `gates/evaluate.ts` için
erken-dönüş/anlamlı hata istemişti; diğer beş dosyada da `!` gerekmedi.

### Guard'ın gerçekten yakaladığı kenar durum: G3 ve NaN

`gates/evaluate.ts` G3'te tek satırlık cazip düzeltme `evaluations[len - 1]!` idi. Bu, boş bir
değerlendirme listesini `Math.min(undefined, undefined, undefined)` = **NaN**'a sokar. NaN her
eşikle karşılaştırmada `false` döner, yani `passed` **true** kalır ama `inputs.minCriterionScore`
kayıtlara `NaN` olarak geçer — ve eşik NaN'ın diğer yönüne düşseydi karar kaydı
*"Criterion score NaN is below minimum required 4"* diye dosyalanırdı. Kimsenin değerlendirmediği
bir teklif, **değerlendirilip kaldığı** yazılmış olurdu. Bu yüzden daraltma `.length` üzerinden
değil elemandan yapıldı; boş liste eskisi gibi `mockEvaluation` dalına gidiyor.

### Eklenen testler

CLAUDE.md "her kapı kuralı için birim test zorunlu" diyor; **G3'ün hiç testi yoktu**.

- `tests/gates.test.ts` → yeni `describe('… — G3 evaluation scores')`, 4 test: eşik geçme
  (4.5/4.5/4.0 → min 4.0, toplam 13.0), iki eşikten de kalma (2.0/3.0/2.5), **boş liste
  ölçülmemiş sayılır** (`mockEvaluation: true`, `minCriterionScore` undefined — 0 değil), ve
  hiçbir gate gerekçesinin `NaN` içermemesi.
- `src/modules/m6/server/__tests__/scoring.test.ts` → yeni `describe('… — consensus counts every
  reviewer pair')`, 3 test. Boş/tek-değerlendirici hâli bu dosyada **zaten kapsanmış** (bkz.
  "the not-measured contract"), o yüzden orayı tekrarlamadım; kapsanmayan ve benim guard'ımın
  bozabileceği şey **payda**ydı: 3 değerlendirici = 3 çift, 4 = 6 çift. Guard bir satır erkene
  konsaydı payda sessizce küçülür ve divergent bir panel solid görünürdü.

### RED-first hakkında dürüst not

Kart "önce KIRMIZI olduğunu gör" diyordu. **Bu testler değişiklikten önce de yeşildi** — çünkü
her iki dalda da davranış zaten doğruydu; ben tipi daralttım, davranışı değiştirmedim. Uydurma
bir RED üretmedim. Bunun yerine kendi kayıtlı yöntemimi uyguladım: **yeşil test kanıt değildir,
kusuru geri koy** (§2-C mutasyon kanıtı). Üç mutasyonun üçü de testleri kırdı.

---

## 2) Kanıt

### A) Bayraksız `pnpm typecheck` — exit 0 (komşuların koştuğu kapı hiç kırılmadı)

```
$ pnpm typecheck
$ tsc --noEmit
exit=0
```

### B) Bayraklı geçici ölçüm — bu 7 dosya için `grep -c "error TS"` = 0

```
$ npx tsc -p tsconfig.nuia-probe.json --noEmit   # ÖNCE
total errors: 171
src/lib/auth.ts                               4
src/lib/blog.ts                               3
src/lib/gates/evaluate.ts                     6
src/lib/k2-cordis/partnerProfileJob.ts        4
src/lib/rag.ts                                2
src/modules/m5/server/queries.ts              2
src/modules/m6/server/scoring.ts              2
--- TOTAL slice --- 23

$ npx tsc -p tsconfig.nuia-probe.json --noEmit   # SONRA
total: 148  slice7: 0
src/lib/auth.ts                               0
src/lib/blog.ts                               0
src/lib/gates/evaluate.ts                     0
src/lib/k2-cordis/partnerProfileJob.ts        0
src/lib/rag.ts                                0
src/modules/m5/server/queries.ts              0
src/modules/m6/server/scoring.ts              0
```

171 − 148 = **23**, dilimin tamamı ve yalnız o. Kalan 148 Dilim 1/2/4'e ait.

### C) Mutasyon kanıtı — testler ne iddia ediyorsa onu ölçüyor

**Mutasyon 1** — G3 guard'ı kartın uyardığı naif düzeltmeyle değiştirildi
(`evaluations[len - 1]!` + `if (true)`):
```
× an unevaluated opportunity is not scored at all, not scored as NaN
× no gate reason ever reports a NaN score
 Tests  2 failed | 14 passed (16)
```

**Mutasyon 2a** — m6'da sayaç guard'ın arkasına alındı: **35/35 geçti**. Bu bir no-op; guard'ın
gerçekten hiçbir çifti atlamadığını (yani yorumdaki iddianın doğru olduğunu) gösteriyor. Testin
paydayı ölçtüğünü kanıtlamak için gerçek bir payda mutasyonu gerekti:

**Mutasyon 2b** — bir çift paydadan düşürüldü:
```
× still measures consensus from two reviewers upward
× counts all three pairs of a three-reviewer panel
× counts all six pairs of a four-reviewer panel
 Tests  3 failed | 32 passed (35)
```

**Mutasyon 2c** — `!` ile undefined ortalama `Math.abs`'a ulaştırıldı (NaN):
```
 Tests  6 failed | 29 passed (35)
```
(3'ü benim yeni testlerim, 3'ü mevcut consensus testleri — yani guard mevcut kapsamı da koruyor.)

Her mutasyondan sonra dosya geri alındı; `sed` ile guard'ın yerinde olduğu doğrulandı.

### D) `git diff -- tsconfig.json` — boş

```
$ git diff -- tsconfig.json
[end — exit 0]
$ ls tsconfig*
tsconfig.exen-probe.json   tsconfig.json   tsconfig.tsbuildinfo
```
(`tsconfig.nuia-probe.json` silindi. `tsconfig.exen-probe.json` **bana ait değil** — başka bir
ajanın dosyası, dokunmadım. `tsconfig.tsbuildinfo` `.gitignore:40` ile zaten hariç.)

### E) Testler

```
$ npx vitest run tests/gates.test.ts src/modules/m6/server/__tests__/scoring.test.ts \
    tests/fabricated-identity-strings.test.ts
 Test Files  3 passed (3)
      Tests  78 passed (78)

$ pnpm test      # tüm suite
exit=0
 Test Files  150 passed | 2 skipped (152)
      Tests  1816 passed | 8 skipped (1824)
```

### F) Yol boyunca kırılan (ve düzeltilen) bir test

İlk tam koşuda **1 test kırıldı**: `tests/fabricated-identity-strings.test.ts` →
*"the display name is derived from the address the user signed in with"*. Kaynak metnini
`toContain('const computedName = email')` ile grep'liyordu; benim `(email.split("@")[0] ?? email)`
sarmalayıcım tam eşleşmeyi bozdu. Testi **gevşetmedim** — iddiasını koruyup desene çevirdim:

```ts
expect(source).toMatch(/const computedName\s*=\s*\(?\s*email\b/);
```

İddia aynı ("ad yalnız `email`'den türer"); kırılganlık gitti. Yanındaki
`expect(source).not.toMatch(/demoProfile\?\.name/)` satırına dokunulmadı.

---

## 3) Değişen dosyalar

```
 src/lib/auth.ts                                 | 13 +++--
 src/lib/blog.ts                                 |  3 +
 src/lib/gates/evaluate.ts                       |  8 ++-
 src/lib/k2-cordis/partnerProfileJob.ts          |  7 ++-
 src/lib/rag.ts                                  | 10 ++--
 src/modules/m5/server/queries.ts                |  4 +-
 src/modules/m6/server/__tests__/scoring.test.ts | 55 +++++++++++++++++++
 src/modules/m6/server/scoring.ts                |  7 ++-
 tests/fabricated-identity-strings.test.ts       |  7 ++-
 tests/gates.test.ts                             | 73 +++++++++++++++++++++++++
 10 files changed, 171 insertions(+), 16 deletions(-)
```

Kartın DOKUNMA listesi (`src/lib/observability/**`, `src/lib/inngest/**`, `src/lib/billing/**`,
`tests/invoice-fx-tcmb.test.ts`, `package.json`) ve Dilim 1/2/4 dosyaları (`scripts/`,
`prisma/seed*`, `src/app/**`, `src/components/**`) — **hiçbirine dokunulmadı**. O yollardaki
`M` işaretleri ben başlamadan önce oradaydı (blok-zincir-dev'in aktif işi).

İki test dosyası kartın "Dilim 4" listesinde **değil** (ikisinin de bayraklı ölçümde 0 hatası var,
yani Dilim 4'ün dosya listesinde yer almıyorlar) — çakışma yok.

---

## 4) Riskler

- **Davranış değişmedi iddiası, iki yerde gözden geçirilmeye değer:**
  - `auth.ts` — eski kod `memberships.length > 0`, yeni kod `memberships[0]` truthy. Prisma bir
    diziyi delikli döndürmediği için ikisi aynı; fark yalnız tip düzeyinde.
  - `m5/queries.ts` — `.split('T')[0]` yerine `.slice(0, 10)`. `toISOString()` her zaman
    `YYYY-MM-DDTHH:mm:ss.sssZ` verdiği için çıktı birebir aynı. Bu KPI trend grafiğinin tarih
    anahtarı; farklı olsaydı grafik boşalırdı, tam suite yeşil.
- **`rag.ts`'te `entries()`'e geçiş** en büyük yapısal değişiklik (guard değil, döngü biçimi).
  `i` hâlâ `ordinal` olarak SQL'e gidiyor, semantik aynı. `rag.test.ts` yeşil — ama o dosyanın
  kendisi Dilim 4'te 2 hatalı, yani orayı kapatan kişi bu döngüleri tekrar görecek.
- **Bayrak hâlâ kapalı.** Bu dilim tek başına hiçbir şeyi zorlamıyor; koruma ancak Dilim 4
  (TASK-MTVPPDW8NXKLD) bayrağı açtığında yürürlüğe girer. O ana kadar bu 7 dosyaya eklenen
  guard'lar bir sonraki geliştirici tarafından farkında olmadan geri alınabilir.
- **Ortak ağaç.** Ölçüm ve tam suite koşarken blok-zincir-dev aynı ağaçta yazıyordu; 148 rakamı
  o anın fotoğrafı, birkaç hata oynayabilir. Benim 7 dosyam için 0 rakamı etkilenmiyor.

## 5) Açık sorular

- **Kart iki farklı rapor yolu veriyor:** gövde `TASK-MTVPNUTNI54ZW-blok-zincir-dse.md`,
  "KANIT ZORUNLU" bloğu ise `TASK-MTSWAKD31LS49-blok-zincir-dse-2.md` ("TAM ve TEK"). Hangisinin
  kastedildiğini bilemediğim için **aynı içerik iki yola da yazıldı**. Board'un hangisini
  aradığı netleşirse diğeri silinebilir.
- `gates/evaluate.ts` G3, boş değerlendirme listesinde **`passed: true`** döndürüyor
  (`inputs.mockEvaluation = true`). Bu benim değişikliğimden önce de böyleydi ve dokunmadım, ama
  "hiç değerlendirilmemiş teklif G3'ü geçer" ürün kararı olarak doğru mu? Testlerim bu davranışı
  şu an *sabitliyor* — kasıtlı değilse ayrı bir kart gerekir.
- `m6/scoring.ts:218` — bir değerlendiricinin `scores` nesnesi boşsa `0/0 = NaN` ortalama üretir
  ve o değerlendirici hiçbir çiftte anlaşmıyor sayılır. Gerçek bir kusur ama **indeks erişimi
  değil** ve düzeltmek davranış değiştirir; bu kartın kapsamı dışında bıraktım.

## 6) Sonraki adım

- Dilim 1 (`scripts/` + `prisma/seed*`), Dilim 2 (`src/app/**` + `src/components/**`), Dilim 4
  (test dosyaları + bayrağın kalıcı açılması). Kalan yüzey **148 hata / 26 dosya**.
- Dilim 4 kartına eklenmesi gereken: bayrak açıldığında kardeş-config yöntemi artık gerekmez, ama
  **açma commit'i tek başına ve komşular boş ağaçtayken** atılmalı.

## Platform beyanı

**macOS 26 (Darwin 25.6.0), zsh, yerel Node + pnpm.** Doğrulama komutları: `pnpm typecheck`,
`npx tsc -p <probe>`, `npx vitest run`, `pnpm test`.

Windows/Linux **koşulmadı**. Dokunulan kod yollarının hiçbiri platforma bağlı değil: süreç
öldürme, dosya yolu ayracı, kabuk/ikili adı, kısayol metni, ekran/DPI, mikrofon-kamera izni yok.
Değişiklikler saf TypeScript tip daraltması (guard, `??`, `Array.prototype.entries`,
`String.prototype.slice`) — hepsi ECMAScript standardı, `tsc` platformdan bağımsız aynı çıktıyı
verir. Tek platforma değen ayrıntı `toISOString()`; o da tanım gereği UTC ve yerel saat dilimine
duyarsız, yani `slice(0, 10)` değişimi Windows/Linux'ta da aynı dize verir.
