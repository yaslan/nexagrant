# TASK-MTRKVWOGQFSO3 — Şema sözleşmesi ALAN-seviyesi kontrolünü repo geneline aç

**Ajan:** ex-en (Explorer) · **Dalga:** S12 "Şema Sözleşmesi" · **Commit:** `f2bbf62`
**Dokunulan tek dosya:** `src/modules/m8/server/schema-contract.test.ts`

## 1. Ne yapıldı

Model-seviyesi taraması zaten repo geneliydi; **alan**-seviyesi kontrolü hâlâ elle
yazılmış M8 yüzeylerine bakıyordu. M2'nin hayalet `include`'ları o boşluktan geçti.

1. **Bileşik anahtar desteği** (`parseSchema`, satır ~150-166). Ayrıştırıcı artık
   `@@unique([...])` ve `@@id([...])` bloklarını okuyor, ürettikleri anahtar adını
   (şema sırasıyla `_` ile birleştirilmiş; `name:` verilmişse o) modelin alanı
   olarak kaydediyor ve `compound: true` işaretliyor. `checkFieldObject` bileşik
   anahtarın **içindeki** alanları da aynı modele karşı doğruluyor — yani
   `where: { tenantId_moduleId: { tenantId, moduleId } }` içindeki bir yazım hatası
   da yakalanıyor. Sentetik anahtar gerçek bir kolonu **gölgelemiyor**
   (`if (fields.has(keyName)) continue`).
2. **`SCANNED = ['src']`** — alan kontrolü artık repo geneli.
3. **`KNOWN_UNKNOWN_FIELD_REFS`** — model defterinin ikizi: yalnız küçülebilir,
   bayatlık testi düzeltilmiş girdide patlar. **BOŞ olarak indi** (aşağıya bak).
4. **Bonus — hoisted const takibi.** `alerts-daily.ts` düzeltilirken sorgusunu
   `SAVED_SEARCH_ALERT_QUERY` sabitine taşıdı. Tarayıcı yalnız inline literal
   okuduğu için sorguyu çağrıdan çıkarmak kapıdan kaçmaya YETİYORDU. Artık çağrı
   argümanı çıplak bir tanımlayıcıysa aynı dosyadaki `const <ad> = { ... }`
   çözülüyor. `scanSource()` ayrıştırıldı ki bu yol fikstürle doğrudan test edilsin.

## 2. Kanıt

### (a) Bileşik anahtar desteğinden ÖNCE / SONRA bulgu sayıları

`SCANNED = ['src']`, bileşik anahtar desteği **YOK** → **20 bulgu**, 19'u yanlış pozitif:

```
  src/app/[locale]/(app)/[workspace]/opportunities/[id]/m2/page.tsx: moduleState.findUnique.where.tenantId_moduleId — `tenantId_moduleId` is not a field of model `ModuleState`
  src/app/[locale]/(app)/[workspace]/settings/modules/actions.ts: moduleState.upsert.where.tenantId_moduleId — …          (x2)
  src/app/[locale]/admin/modules/actions.ts: moduleState.upsert.where.tenantId_moduleId — …                               (x2)
  src/app/api/invitations/route.ts: invitation.upsert.where.email_tenantId — …
  src/lib/billing/plan-repository.ts: planAssignment.upsert.where.planId_tenantId — …
  src/lib/billing/subscription-sync.ts: moduleState.upsert.where.tenantId_moduleId — …                                    (x2)
  src/lib/cordis-sync.ts: cordisProjectTopic.upsert.where.projectId_topicCode — …
  src/lib/cordis-sync.ts: cordisParticipation.upsert.where.projectId_organisationId — …
  src/lib/inngest/jobs/alerts-daily.ts: savedSearch.findMany.include.tenant — `tenant` is not a field of model `SavedSearch`   ← TEK GERÇEK BULGU
  src/lib/iyzico.ts: moduleState.upsert.where.tenantId_moduleId — …
  src/lib/k2-cordis/importer.ts: cordisParticipation.upsert.where.projectId_organisationId — …
  src/lib/k2-cordis/importer.ts: cordisProjectTopic.upsert.where.projectId_topicCode — …
  src/lib/k2-cordis/importer.ts: cordisProjectSciVoc.upsert.where.projectId_scivocCode — …
  src/lib/k2-cordis/partnerProfileJob.ts: cordisCoParticipation.upsert.where.orgA_orgB — …
  src/lib/modules/access.ts: moduleState.findUnique.where.tenantId_moduleId — …
  src/modules/m6/server/actions.ts: score.upsert.where.reviewerId_criterionId — …
  src/modules/m9/server/calendar-actions.ts: calendarConnection.findUnique.where.tenantId_userId_provider — …

 Test Files  1 failed (1)
      Tests  1 failed | 5 passed (6)
```

Bileşik anahtar desteği **VAR** → **1 bulgu** (19 yanlış pozitifin tamamı gitti):

```
AssertionError: …
  src/lib/inngest/jobs/alerts-daily.ts: savedSearch.findMany.include.tenant — `tenant` is not a field of model `SavedSearch` in prisma/schema.prisma
```

**20 → 1. Gürültü %95 azaldı, tek gerçek bulgu ayakta kaldı.**

### (b) M2'nin hayalet `include`'unu bu kapı GERÇEKTEN yakalıyor mu — RED/GREEN

`src/modules/m2/server/actions.ts`'e düzeltilen satır **geçici olarak geri kondu**,
test koşuldu, sonra `git checkout --` ile geri alındı (tek komut, ~1 sn pencere):

```
########## RED — M2 phantom include restored ##########
 FAIL  src/modules/m8/server/schema-contract.test.ts > every Prisma query in src/ matches prisma/schema.prisma > names only models, relations and columns that exist
  src/modules/m2/server/actions.ts: opportunity.findFirst.include.topic — `topic` is not a field of model `Opportunity` in prisma/schema.prisma
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
########## reverted: 0 modified paths ##########
########## GREEN ##########
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

`reverted: 0 modified paths` = `git status --porcelain src/modules/m2/server/actions.ts`
boş; M2 dosyası kalıcı olarak **değiştirilmedi**.

### (c) Hoisted const yolu (fikstürle doğrudan test)

`follows a query hoisted into a const` testi: sağlam sorgu 0 bulgu, `include: { tenant: true }`
taşıyan sabit tam olarak `savedSearch.findMany.include.tenant` döndürüyor. Yeşil.

### (d) DoD komutları

```
$ npx vitest run src/modules/m8/server/schema-contract.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)

$ npx eslint src/modules/m8/server/schema-contract.test.ts
LINT OK   (exit 0)

$ pnpm test          # 22:03:57, bu değişiklikler ağaçtayken
 Test Files  82 passed | 2 skipped (84)
      Tests  908 passed | 8 skipped (916)
```

`pnpm test` **22:06'da 1 kırmızı** verdi — `tests/document-exporter.test.ts`.
**Benim değil**: `src/lib/document-exporter.ts:241` çalışma ağacında BAŞKA bir ajan
tarafından commit'lenmemiş halde düzenleniyor (`git status` doğruluyor). Aynı şey
`pnpm typecheck` için de geçerli; pre-commit kapısı bunu kendisi ayırt etti:

```
⚠ Ağaçta senin OLMAYAN typecheck hataları var (başka bir ajan yazıyor olabilir):
src/lib/calendar/__tests__/sync.test.ts(146,24): error TS2352: …
  Bunlar commit'ini engellemiyor.
✓ Kapı temiz (staged kapsamı).
[dev f2bbf62] test(schema-contract): widen the field-level check to all of src/
 1 file changed, 222 insertions(+), 52 deletions(-)
```

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/modules/m8/server/schema-contract.test.ts` | +222 / −52 — bileşik anahtar ayrıştırma, `SCANNED = ['src']`, `KNOWN_UNKNOWN_FIELD_REFS` (boş) + bayatlık testi, hoisted-const çözümü, `scanSource()` ayrıştırma, 5 yeni test |

Başka HİÇBİR dosya değişmedi (M2 dosyası RED kanıtı için geçici açıldı, aynı komutta geri alındı).

## 4. Riskler

- **Ayrıştırıcı regex tabanlı, TS AST değil.** `topLevelEntries` okuyamadığını
  *atlıyor* (tahmin etmiyor), yani yanlış pozitif değil **yanlış negatif** üretir.
  Dinamik olarak kurulmuş bir `where` (spread, koşullu nesne) hâlâ görünmez.
- **Hoisted const çözümü tek dosyalık.** Sorgu nesnesi başka modülden import
  edilirse bulunmaz. Bugün src/ genelinde çıplak-tanımlayıcı argümanlı tek çağrı
  var (`alerts-daily.ts:60`), o da kapsanıyor.
- **`KNOWN_UNKNOWN_FIELD_REFS` boş indi.** Defter mekanizması ve bayatlık testi
  duruyor; ilk gerçek girdide çalışacağı fikstürle değil, ledger dolu haldeyken
  koşulan gerçek testle doğrulandı (bkz. §5, ledger dolu → dolu geçti, fix inince
  bayatlık testi kırmızı verdi — mekanizma canlı kanıtlandı).
- Dosya adı hâlâ `src/modules/m8/server/schema-contract.test.ts`. Artık M8'e özel
  değil; `tests/`'e taşımak daha doğru olurdu ama paralel dalga sırasında
  TASK-MTRKWBLXUYSHS ajanının doğrulama komutunu kırmamak için **taşınmadı**.

## 5. Başka kartların dosyalarında gördüğüm kusurlar (BİLDİRİM — düzeltmedim)

- **`tests/document-exporter.test.ts` + `src/lib/document-exporter.ts:241`** —
  `generatePdfHtml` `messages.DocumentExport` okuyor, i18n sözlüğünde o anahtar YOK;
  test kırmızı, typecheck TS2339 veriyor. Çalışma ağacında commit'lenmemiş.
- **`src/lib/calendar/__tests__/sync.test.ts:146,164,199,212`** — `noUncheckedIndexedAccess`
  altında boş tuple'dan `[0]` okuma; TS2352/TS2493. Commit'lenmemiş.
- **`src/lib/inngest/jobs/alerts-daily.ts:60`** (TASK-MTRKWBLXUYSHS, düzeltmesi doğru) —
  sorguyu `SAVED_SEARCH_ALERT_QUERY` sabitine taşımak, benim kapımın eski halinden
  görünmez olurdu. **Kapıyı ben genişlettim**, dosyaya dokunmadım; ama desen olarak
  "sorguyu sabite çıkarmak" statik kontrolleri zayıflatabilir, bilinsin.

## 6. Açık sorular

1. `schema-contract.test.ts` dalga bitince `tests/`'e taşınsın mı? (Artık repo geneli;
   `REPO = resolve(__dirname, '..')` olur, vitest include'u zaten kapsıyor.)
2. Alan kontrolü şu an `create`/`update`'in `data:` bloğunu **okumuyor** —
   `FIELD_BEARING` yalnız `where/select/include/orderBy`. `data: { phantomColumn: … }`
   da runtime'da patlar. Ayrı bir kart açılsın mı?

## 7. Sonraki adım

- `data:` bloğunu `FIELD_BEARING`'e eklemek (yukarıdaki soru 2) — muhtemelen yeni
  bulgular çıkarır, ayrı kart hak ediyor.
- Ağaçtaki iki kırmızı (document-exporter, calendar sync) ilgili ajanlara ait; kapı
  onlar inince yeşile döner.
