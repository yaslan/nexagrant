# TASK-MTUIPYSSNLVWG — M6 puanlama yükleyicilerinde kiracısız çağrıyı TİP DÜZEYİNDE imkânsız kılma

**Ajan:** blok-zincir-dse · **Tip:** güvenlik sertleştirmesi (imza düzeltmesi)
**Platform beyanı:** macOS (darwin 25.6.0, Node + pnpm, zsh) üzerinde doğrulandı — `pnpm lint`,
`pnpm typecheck`, `pnpm test` burada koştu. Dokunulan kod yolunda platforma bağlı **hiçbir şey yok**
(süreç/dosya yolu/kabuk/ekran/izin yok): TypeScript aşırı yükleme imzaları, bir Prisma `where` nesnesi ve
saf birim testleri. Windows/Linux'ta aynı derleyici ve aynı test koşucusu aynı sonucu verir — davranış
`tsc`'nin aşırı yükleme çözümlemesine bağlı, işletim sistemine değil. **Koşulmadı:** `pnpm test:e2e`,
`pnpm gate`, veritabanına dokunan hiçbir komut — bu turda blok-zincir-dev'e ayrılmıştı (çakışma kuralı).

## 1. Ne yapıldı

Üç fonksiyonun (`src/modules/m6/server/scoring.ts`) iki-argümanlı aşırı yüklemesinde `tenantId` **opsiyoneldi**
ve verilmediğinde sorgu daralmıyor, kiracı koşulu tamamen **düşüyordu** — üstelik `withTenant` yerine global
`prisma` üzerinde:

```ts
// ÖNCE
export async function calculateCriterionAverage(criterionId: string, tenantId?: string): Promise<number>;
…
if (tenantId) { return withTenant(...); }
return calculateCriterionAverageInternal(prisma as unknown as TenantScopedDb, criterionId); // ← kiracısız, RLS'siz
…
where: { criterionId, ...(tenantId ? { reviewer: { tenantId } } : {}), submittedAt: { not: null } }
```

Yapılan değişiklik üç fonksiyonda da aynı (`calculateCriterionAverage` :365, `calculateEvaluationScore` :416,
`getScoreDistribution` :508 — düzeltme sonrası satır numaraları):

1. **İki-argümanlı aşırı yüklemede `tenantId?: string` → `tenantId: string`.** Kiracısız çağrı artık
   **derlenmiyor**. Kartın istediği asıl şey buydu: sorun tek satır değil, imzanın kiracısız çağrıyı meşru
   göstermesiydi.
2. **Kiracısız dal silindi.** `prisma as unknown as TenantScopedDb` kaçışı üç yerden de kalktı; `prisma`
   importu bu dosyada artık gereksiz olduğu için kaldırıldı (yerine `assertTenantScope` geldi).
3. **İç fonksiyonlarda `tenantId?: string` → `tenantId: string`** ve `...(tenantId ? … : {})` üçlü ifadeleri
   koşulsuz `reviewer: { tenantId }` ile değiştirildi. Artık kiracı koşulunu düşürebilecek bir kod yolu yok.
4. **Çalışma zamanı savunması: deponun kendi deseni.** Yeni desen icat edilmedi — `src/lib/db.ts`'teki
   `assertTenantScope(tenantId, '<çağıran>')` her iki dala da kondu (`MissingTenantScopeError`,
   `code: 'TENANT_SCOPE_REQUIRED'`). Bu, tipten kaçan çağrıyı (untyped kod, `any`, cast) **sorgu
   yapılmadan önce** reddediyor ve `''` / `'   '` gibi boş kiracıyı da eliyor — `assertTenantScope`
   zaten tam bu sınıf için kurulmuştu.
5. **Kiracılı davranış değişmedi:** string formu yine `withTenant(tenantId, …)` içinde koşuyor, db formu
   yine verilen tx üzerinde; `where` nesneleri kiracılı çağrıda birebir eskisi gibi.

**Çağıran güncellemesi:** depoda üretim çağıranı yok (ölçüm aşağıda), kalan üç çağıran zaten üç-argümanlı
kiracılı formu kullanıyordu (`tests/modules/m6/scoring.test.ts:28,68,83`) — değiştirilmesi gerekmedi,
değiştirilmedi.

## 2. Kanıt (kopyalanmış çıktı)

### Çağıran ölçümü — tehlikeli dalın kullanılmadığı doğrulandı
```
$ grep -rn "calculateCriterionAverage\|calculateEvaluationScore\|getScoreDistribution" src tests scripts \
    --include="*.ts" --include="*.tsx" | grep -v "^src/modules/m6/server/scoring.ts"
tests/modules/m6/scoring.test.ts:3:  calculateCriterionAverage,
tests/modules/m6/scoring.test.ts:4:  calculateEvaluationScore,
tests/modules/m6/scoring.test.ts:5:  getScoreDistribution,
tests/modules/m6/scoring.test.ts:28:    const avg = await calculateCriterionAverage(mockDb, 'crit-1', 'tenant-a');
tests/modules/m6/scoring.test.ts:68:    const score = await calculateEvaluationScore(mockDb, 'eval-1', 'tenant-a');
tests/modules/m6/scoring.test.ts:83:    const dist = await getScoreDistribution(mockDb, 'crit-1', 'tenant-a');
```
`src/` içinde tek çağıran yok → "dolu ama tetiği çekilmemiş silah" tespiti doğrulandı; bu düzeltme bir
sızıntıyı kapatmıyor, bir sonraki geliştiricinin sızıntıyı **yazamamasını** sağlıyor.

### Yeni test — geçiyor (15 test)
```
$ npx vitest run tests/modules/m6/scoring-tenant-scope.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```
Test iki katmanlı: (a) derleme zamanı — hiç çağrılmayan bir fonksiyon gövdesinde altı `@ts-expect-error`
işaretli kiracısız çağrı; opsiyonel parametre geri gelirse bu işaretler "kullanılmamış" olur ve
`pnpm typecheck` kırmızıya döner. (b) çalışma zamanı — `undefined`, `null`, `''`, `'   '` için
`MissingTenantScopeError` ve **hiçbir sorgu yapılmadığı** (`findMany` çağrılmadı) iddiası.

### Yeşil test kanıt değildir → MUTASYON: kusur geri konduğunda ne oluyor
`git checkout -- src/modules/m6/server/scoring.ts` ile ESKİ imza geri kondu, yeni test aynı kaldı:

**Derleme zamanı katmanı kırmızı** (üç işaret de tam olarak iki-argümanlı/kiracısız çağrıları işaretleyen
satırlar — 50, 55, 60):
```
$ pnpm typecheck
tests/modules/m6/scoring-tenant-scope.test.ts(50,5): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/m6/scoring-tenant-scope.test.ts(55,5): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/m6/scoring-tenant-scope.test.ts(60,5): error TS2578: Unused '@ts-expect-error' directive.
```
Yani eski kodda `calculateCriterionAverage('crit-1')` **derleniyordu** — kartın anlattığı tehlike birebir
ölçüldü.

**Çalışma zamanı katmanı kırmızı** (15 testin 13'ü):
```
 ❯ tests/modules/m6/scoring-tenant-scope.test.ts (15 tests | 13 failed) 12ms
     × calculateCriterionAverage refuses undefined without querying 4ms
     × calculateEvaluationScore refuses undefined without querying 1ms
     × getScoreDistribution refuses undefined without querying 1ms
     … (null / '' / '   ' varyantları) …
     × the refusal names the caller and carries the repo-wide code 0ms
AssertionError: promise resolved "4.5" instead of rejecting
```
Kalan 2 test (kiracılı davranış) mutasyon altında da **yeşil** kaldı — yani suite "her şeyi reddet" diyerek
geçmiyor, kiracılı yolun korunduğunu ayrıca ölçüyor. Dosya sonra düzeltilmiş haline geri alındı.

### Kapı komutları (bu tura izin verilenler)
```
$ pnpm typecheck
$ tsc --noEmit                      # çıktı yok = temiz
$ pnpm lint
✖ 2 problems (0 errors, 2 warnings) # ikisi de docs/agent-results/…-evidence/*.mts, önceden vardı, benim değil
$ pnpm test
 Test Files  140 passed | 2 skipped (142)
      Tests  1670 passed | 8 skipped (1678)
```
(Bu oturumun bir önceki kartında ölçüm 139 dosya / 1653 test'ti. Şimdi 140 / 1670: +1 dosya ve +15 test
benim; kalan +2 test benim değil — ağaçta aynı anda çalışan başka ajanların testleri de eklendi
(`git status`: `src/lib/billing/plan-admin.test.ts` vb. değişmiş). Kırmızı yok.)

### Kiracı koşulunu düşürebilecek dal kalmadı
```
$ grep -n "tenantId ?" src/modules/m6/server/scoring.ts
(eşleşme yok)
```

## 3. Değişen dosyalar
| Dosya | Ne |
|---|---|
| `src/modules/m6/server/scoring.ts` | üç fonksiyonun iki-argümanlı aşırı yüklemesinde `tenantId` zorunlu; kiracısız dal + `prisma` kaçışı silindi; iç fonksiyonlarda `tenantId: string` ve koşulsuz `reviewer: { tenantId }`; `assertTenantScope` guard'ı; gerekçe yorumu (+41/−22) |
| `tests/modules/m6/scoring-tenant-scope.test.ts` | **yeni** — 15 test: 6 derleme-zamanı `@ts-expect-error` iddiası + 12 çalışma-zamanı reddi (4 boş-kiracı varyantı × 3 fonksiyon) + hata kodu + kiracılı davranışın korunduğu 2 test |

## 4. Riskler
1. **`assertTenantScope` bir kiracı ADI olduğunu doğrular, verilen `db`'nin gerçekten kiracıya kapsanmış bir
   tx olduğunu DOĞRULAMAZ.** Üç-argümanlı db formunda çağıran hâlâ `prisma`'yı elle geçirip doğru bir
   `tenantId` verebilir; o zaman `where` kiracıyı taşır (sızıntı yok) ama sorgu RLS bağlamı olmayan bir
   bağlantıda koşar. Bunu kapatmak `TenantScopedDb` tipini nominal hale getirmeyi gerektirir — kapsam dışı,
   ayrı bir kart konusu.
2. e2e koşulamadı (dev'e ayrılmıştı). Değişiklik saf tip/veri-erişim katmanında ve M6'nın e2e'si bu
   fonksiyonları kiracılı formda çağırıyor; yine de kapı koşusunda M6 senaryoları izlenmeli.
3. Davranış değişikliği yok denecek kadar küçük ama **sıfır değil**: eskiden `calculateCriterionAverage(db, 'c', '')`
   sessizce tüm kiracıları ortalarken şimdi `MissingTenantScopeError` fırlatıyor. Böyle bir çağıran depoda yok
   (yukarıdaki grep), ama davranış farkı budur.

## 5. Yolda görülen, DÜZELTİLMEYEN (bildirim — kapsam bu üç fonksiyondu)
- **`src/actions/user/export-data.ts:217`** — `...(tenantId ? { tenantId } : {})`. **Aynı sözdizimi, farklı
  anlam:** bu bir `where` değil, `prisma.auditEvent.create({ data: … })` — okuma genişletmiyor, kiracısı
  bilinmeyen bir denetim satırını `tenantId` kolonu olmadan yazıyor. Bu haliyle sızıntı değil; ileride
  aynı desen taranırken yanlış alarma girmemek için buraya yazıldı. Dokunulmadı.
- Bu kartın kapsamı dışındaki bitişik iş (`scoring.ts`'in diğer yükleyicileri: `getPanelScoresForProposal`,
  `updateEvaluationScore`, `getCalibrationMatrix`) zaten `db: TenantScopedDb` + zorunlu `tenantId` alıyor —
  kiracı-opsiyonel bir dalları yok, değişiklik gerekmedi.

## 6. Açık sorular
1. `TenantScopedDb`'yi nominal (markalı) tip yapıp yalnız `withTenant`/`withTenantOn`'un ürettiği tx'in
   kabul edilmesi isteniyor mu? Risk 1'i kapatan tek gerçek çözüm bu; bugün üç fonksiyon dışında çok sayıda
   çağıranı etkiler, o yüzden kendiliğinden açmadım.
2. İki-argümanlı string formu (kendi `withTenant`'ını açan) hâlâ gerekiyor mu? Bugün hiçbir çağıranı yok;
   silinmesi API yüzeyini yarıya indirirdi ama bu bir kapsam kararı, sormadan yapmadım.

## 7. Sonraki adım
- blok-zincir-dev'in kapı koşusunda `pnpm typecheck` ve M6 testleri (yeni dosya dahil) yeşil mi.
- Yukarıdaki iki açık soru için karar/kart.
