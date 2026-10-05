# TASK-MTUGJTD5HZDW0 — kiracı filtresi düşen üç sayfa

**Ajan:** blok-zincir-dse (Tasarımcı) · **Tip:** bug (güvenlik / kiracı izolasyonu) · **Platform:** macOS (darwin 25.6.0), Node/vitest 4.1.11

## 1. Ne yapıldı

Üç sayfa `where` cümlesini `string | null | undefined` bir değer üzerinden ternary ile kuruyordu. Yanlış dal daha dar bir sorgu değil, **filtresiz** bir sorgudur:

| Dosya | Eski cümle | Kiracı yokken ne oluyordu |
|---|---|---|
| `evidence/page.tsx:22` | `where: tenantId ? { tenantId } : {}` | Evidence tablosunun tamamı — her kiracının sertifikaları, mali raporları, yüklü belgeleri |
| `concept-notes/page.tsx:25` | `where: tenantId ? { tenantId } : {}` | Her kiracının concept note taslakları + fırsat id'leri |
| `concept-notes/[id]/page.tsx:27` | `where: tenantId ? { id, tenantId } : { id }` | **Hedefli IDOR** — bilinen tek bir id, sahibi hangi kiracı olursa olsun okunuyor ve editörde tam içerik açılıyor |

Çözüm icat edilmedi; TASK-MTRKV9JGY7OQY'de M4 ilişki ekranında uygulanan desen aynen tekrarlandı (`src/app/[locale]/(app)/[workspace]/relationships/[id]/data.ts`):

1. **Sayfa** kiracıyı artık `session?.tenantId` ile değil `requireTenantPage(locale)` ile çözüyor (`src/lib/tenant.ts:99`) — oturumsuz ziyaretçi login'e, üyeliksiz kullanıcı `/no-workspace`'e gider; boş/null kiracı dönmesi mümkün değil.
2. **Okuma** sayfadan çıkıp yanındaki `data.ts` modülüne taşındı; orada `tenantId` zorunlu `string`, çalışma anında yeniden doğrulanıyor ve sorgu `withTenantOn` içinde koşuyor (Postgres `app.tenant_id` görüyor — CLAUDE.md §1). Bu modüllerden Prisma'ya kiracısız giden bir yol yok.
3. **Ortak kapı** `src/lib/db.ts` içine kondu: `assertTenantScope()` + `MissingTenantScopeError`, ve `withTenantOn` artık ilk iş olarak bunu çağırıyor. Böylece hata sınıfı üç sayfaya değil, kiracı-kapsamlı her işleme karşı kapanıyor. `''` ve boşluk da reddediliyor: boş string ternary'de zaten falsy, ayrıca `set_config('app.tenant_id','')` hiçbir RLS politikasıyla eşleşmez ve yerel superuser rolü RLS'i zaten baypas eder.

**Dokunulmayan satır (kasıtlı):** `concept-notes/page.tsx:31`'deki `{ OR: [{ tenantId: null }, { tenantId }] }` — `ConceptTemplate.tenantId` nullable ve NULL "platform şablonu, her kiracıya açık" demektir (`prisma/schema.prisma:994`); `prisma/rls.sql:39-46` bu tabloya bilerek `tenant_isolation` değil `tenant_or_shared` politikası veriyor. Yani paylaşımlı satırların okunması özelliğin kendisidir, sızıntı değil — içlerinde hiçbir kiracının verisi yok. Değişen tek şey, OR'ın **kiracı yarısının** artık kaybolamaması; `tenantId` zorunlu ve boş olamaz. Testte de bu şekilde sabitlendi.

## 2. Kanıt

Her "geçti" satırının altında onu üreten komutun gerçek çıktısı var.

### 2.1 Birim testi geçti — `npx vitest run tests/page-loader-tenant-scope.test.ts`

```
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 Test Files  1 passed (1)
      Tests  20 passed (20)
   Start at  22:02:23
   Duration  181ms (transform 38ms, setup 0ms, import 101ms, tests 5ms, environment 0ms)
```

Test adları (`--reporter=verbose`):

```
✓ page loaders refuse to query without a tenant > loadEvidenceItems (M3 Evidence Pack): a undefined tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadEvidenceItems (M3 Evidence Pack): a null tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadEvidenceItems (M3 Evidence Pack): a empty string tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadEvidenceItems (M3 Evidence Pack): a whitespace tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNotesIndex (M2 list): a undefined tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNotesIndex (M2 list): a null tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNotesIndex (M2 list): a empty string tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNotesIndex (M2 list): a whitespace tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNoteDetail (M2 detail): a undefined tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNoteDetail (M2 detail): a null tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNoteDetail (M2 detail): a empty string tenant never reaches the database
✓ page loaders refuse to query without a tenant > loadConceptNoteDetail (M2 detail): a whitespace tenant never reaches the database
✓ every query a page loader issues carries the tenant > loadEvidenceItems filters Evidence by tenantId
✓ every query a page loader issues carries the tenant > loadConceptNotesIndex filters ConceptNote by tenantId
✓ every query a page loader issues carries the tenant > loadConceptNotesIndex still offers platform templates, and only this tenant's own
✓ every query a page loader issues carries the tenant > loadConceptNoteDetail looks a note up by id *and* tenantId
✓ every query a page loader issues carries the tenant > loadConceptNoteDetail answers null for a note this tenant does not own
✓ the leaking ternary is gone from the three pages > src/app/[locale]/(app)/[workspace]/evidence/page.tsx builds no where clause from a maybe-tenant
✓ the leaking ternary is gone from the three pages > src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx builds no where clause from a maybe-tenant
✓ the leaking ternary is gone from the three pages > src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx builds no where clause from a maybe-tenant
```

Test veritabanı istemiyor, çünkü iddia "sorgu doğru satırları döndürüyor" değil, **"kiracısız hiçbir sorgu çıkmıyor, çıkan her sorgu kiracıyı taşıyor"**. İkisi de loader'a verilen istemciden gözlenebilir: `forbiddenClient` dokunulduğu anda patlar ve `touched` sayacı 0 kalmalıdır; `recordingClient` her `where` cümlesini kaydeder. Argümanın DB'li yarısı — Postgres'in `tenantId: undefined` ile gerçekten başka kiracının satırını döndürdüğü — zaten `tests/relationship-tenant-scope.test.ts:61-82`'de kayıtlı.

### 2.2 Mutasyon doğrulaması — yeşil test kanıt değildir, kusuru geri koydum

Dört ayrı mutasyon uygulandı, her seferinde test **kırmızıya döndü**, sonra geri alındı.

**Mutasyon 1** — evidence loader'ında ternary geri + kendi guard'ı silindi + `withTenantOn` guard'ı da silindi (başka hiçbir şey yakalamasın diye):
```
     × loadEvidenceItems (M3 Evidence Pack): a undefined tenant never reaches the database 3ms
     × loadEvidenceItems (M3 Evidence Pack): a null tenant never reaches the database 0ms
     × loadEvidenceItems (M3 Evidence Pack): a empty string tenant never reaches the database 0ms
     × loadEvidenceItems (M3 Evidence Pack): a whitespace tenant never reaches the database 0ms
AssertionError: expected Error: the database must not be touched w… to be an instance of MissingTenantScopeError
 Test Files  1 failed (1)
      Tests  4 failed | 16 passed (20)
```

**Mutasyon 2+3** — aynısı iki concept-note loader'ında (liste `{}`, detay `{ id }` IDOR şekli):
```
     × loadConceptNotesIndex (M2 list): a undefined tenant never reaches the database 2ms
     × loadConceptNotesIndex (M2 list): a null tenant never reaches the database 0ms
     × loadConceptNotesIndex (M2 list): a empty string tenant never reaches the database 0ms
     × loadConceptNotesIndex (M2 list): a whitespace tenant never reaches the database 0ms
     × loadConceptNoteDetail (M2 detail): a undefined tenant never reaches the database 0ms
     × loadConceptNoteDetail (M2 detail): a null tenant never reaches the database 0ms
     × loadConceptNoteDetail (M2 detail): a empty string tenant never reaches the database 0ms
     × loadConceptNoteDetail (M2 detail): a whitespace tenant never reaches the database 0ms
 Test Files  1 failed (1)
      Tests  8 failed | 12 passed (20)
```

**Mutasyon 4** — kaynak muhafızı: sayfaya `session?.tenantId` + doğrudan `prisma.evidence.findMany({ where: tenantId2 ? … : {} })` geri kondu:
```
     × src/app/[locale]/(app)/[workspace]/evidence/page.tsx builds no where clause from a maybe-tenant 2ms
AssertionError: expected 'import EvidenceClient, { type Evidenc…' not to match /session\??\.\s*tenantId/
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

Geri alındıktan sonra:
```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

### 2.3 `pnpm typecheck` geçti

```
$ tsc --noEmit
```
(çıktı yok = hata yok; komut 0 ile döndü)

### 2.4 `pnpm lint` geçti (0 error)

```
$ eslint

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars

/Users/macbook/AgentSpace/fabrika/tests/e2e/ztmp-diag.spec.ts
  49:13  warning  'tmpl' is assigned a value but never used  @typescript-eslint/no-unused-vars

✖ 3 problems (0 errors, 3 warnings)
```
Üç uyarı da bu görevden önce vardı ve dokunmadığım dosyalarda (`docs/agent-results/…`, `tests/e2e/ztmp-diag.spec.ts`).

### 2.5 Tüm vitest paketi — regresyon yok (`pnpm test`)

```
 Test Files  136 passed | 2 skipped (138)
      Tests  1633 passed | 8 skipped (1641)
   Start at  22:01:51
   Duration  6.60s
```
Atlanan (skipped) dosyalar veritabanı isteyen testlerdir; bu turda DB'ye dokunmam yasak olduğu için ayağa kaldırılmadı.

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/db.ts` | + `MissingTenantScopeError`, + `assertTenantScope()`; `withTenantOn` artık ilk satırda çağırıyor |
| `src/app/[locale]/(app)/[workspace]/evidence/data.ts` | **yeni** — `loadEvidenceItems(tenantId, client?)` |
| `src/app/[locale]/(app)/[workspace]/evidence/page.tsx` | `requireTenantPage` + loader; doğrudan Prisma çağrısı kalktı |
| `src/app/[locale]/(app)/[workspace]/concept-notes/data.ts` | **yeni** — `loadConceptNotesIndex(tenantId, client?)` |
| `src/app/[locale]/(app)/[workspace]/concept-notes/page.tsx` | `requireTenantPage` + loader |
| `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts` | **yeni** — `loadConceptNoteDetail(tenantId, id, client?)` |
| `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/page.tsx` | `requireTenantPage` + loader; sahip olunmayan not artık 404 |
| `tests/page-loader-tenant-scope.test.ts` | **yeni** — 20 test |

## 4. Riskler

1. **Davranış değişikliği: bu üç sayfa artık oturumsuz açılmıyor.** Önceden (kiracısız) sayfa render oluyordu — sızıntının ta kendisi buydu. Artık login'e / `/no-workspace`'e yönleniyor. Aynı değişiklik `/relationships` için TASK-MTRKV9JGY7OQY'de zaten yapılmıştı, dolayısıyla ürün davranışı tutarlı hale geldi. `tests/e2e/notfound-status.spec.ts:76` "oturumsuz aynı URL'ler yönlenir" beklentisiyle bu yönde.
2. **e2e KOŞULAMADI (yasak, bu turda dev'e ayrıldı):** `tests/e2e/module-gate.spec.ts:25` `/en/default/evidence`'a oturumsuz gidiyor. Assertion yalnızca `expect(bodyText).toBeTruthy()` olduğu için login sayfası gövdesiyle de geçmesi beklenir; ama bunu ölçmedim, koddan okudum. `tests/e2e/notfound-status.spec.ts` OK_ROUTES listesindeki `/tr/<ws>/evidence` oturum açılmış halde çağrıldığı için 200 kalmalı. Bu iki spec'i `pnpm test:e2e` koşan ajan doğrulamalı.
3. **`withTenantOn` guard'ının yarıçapı geniş:** 291 çağrı noktası var. Boş/undefined kiracı geçiren mevcut çağrı bulamadım (`grep -rn "withTenant(''\|withTenant(undefined\|withTenant(null" src tests scripts` → eşleşme yok) ve TS zaten `string` dayatıyor; yine de `as any` ile kiracı geçiren bir yol varsa artık çalışma anında patlar — sessiz sızıntı yerine gürültülü hata, istenen yön bu.
4. **Sayfalardaki `try/catch` korundu** (DB kapalıyken çökme yerine boş durum). Bu, `MissingTenantScopeError`'ı da yutar; ama `requireTenantPage`'ten sonra kiracı garantili olduğu için tetiklenemez ve tetiklense bile sonuç "veri yok", "başka kiracının verisi" değil.

## 5. Açık sorular

1. `relationships/[id]/data.ts` hâlâ kendi yerel `MissingTenantScopeError` sınıfını taşıyor (satır 28). Artık `src/lib/db.ts`'te ortak bir tane var; birleştirmek ayrı ve küçük bir temizlik — kapsamı genişletmemek için bu kartta yapmadım.
2. Aynı ternary sınıfının başka nerelerde durduğuna dair depo geneli tarama bu kartın kapsamı dışındaydı. Kalıcı çözüm bir lint kuralı olabilir ("`where` içinde kiracı ternary'si yasak"); `.claude/commands/review-rls` bunu bugün görmüyor.

## 6. Sonraki adım

- `pnpm test:e2e` koşan ajan (blok-zincir-dev) `module-gate.spec.ts` ve `notfound-status.spec.ts`'i doğrulasın (Risk 2).
- İstenirse depo genelinde `tenantId ?` deseni taranıp kalan örnekler için ayrı kart açılsın.

## Platform beyanı

**macOS (darwin 25.6.0), Node + vitest 4.1.11 üzerinde doğrulandı.** Değişen kodun hiçbir yerinde platforma bağlı bir davranış yok: dosya yolu, kabuk çağrısı, süreç yönetimi, ekran/DPI veya izin API'si kullanılmıyor — yalnız TypeScript, Prisma `where` cümleleri ve Next.js server component'leri. Testteki tek dosya sistemi kullanımı `resolve(__dirname, '..')` + `readFileSync` ile POSIX ayraçlı göreli yollardır; Node bunları Windows'ta da çözer, dolayısıyla Windows/Linux'ta aynı sonucu vermesi beklenir. **Windows ve Linux'ta koşulmadı** — bu turda yalnız macOS ortamı mevcuttu ve `pnpm dev` / `pnpm test:e2e` / DB komutları bu tur bana yasaktı.
