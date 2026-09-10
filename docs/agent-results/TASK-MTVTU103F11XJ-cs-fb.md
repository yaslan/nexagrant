# TASK-MTVTU103F11XJ — ConceptTemplate: client-supplied `templateId` read with no tenant check

**Ajan:** cs-fb (support) · **Tip:** bug (tenant isolation) · **Platform:** macOS (Darwin 25.6.0) ·
**Tarih:** 2026-09-10

---

## 1. Ne yapıldı

Kart "sessiz çapraz-kiracı okuma" diyordu. Ölçtüm: **sızıntı gerçek**, ve kartın tahmin ettiğinden
bir adım daha kötü — çünkü `ConceptTemplate` üzerindeki `tenant_or_shared` RLS politikası
**uygulamanın bağlantısında hiç çalışmıyor**.

Sırayla:

1. **Kanıt:** kiracı A olarak, kiracı B'ye ait bir `ConceptTemplate` id'siyle `createConceptNote`
   çağırdım; gerçek Postgres'e karşı, gerçek `@/lib/db` tekil istemcisiyle. A, B'nin şablonundan bir
   `ConceptNote` **oluşturdu** (§2.2 ham çıktı).
2. **Neden RLS kurtarmadı:** `DATABASE_URL` rolü `fabrika`, `rolsuper=true` **ve**
   `rolbypassrls=true`. Politika tabloda var, ama uygulamanın açtığı hiçbir bağlantıda devreye
   girmiyor. `pnpm rls:verify` bunu kendi ağzıyla da söylüyor (§2.1).
3. **Kural tek yere toplandı:** `src/modules/m2/server/templates.ts` —
   `accessibleTemplateWhere` / `findAccessibleTemplate` / `findAccessibleTemplateByKey`. Kuralın
   ikinci kopyası yok; zaten doğru olan tek çağrı yeri (`loadConceptNotesIndex`) da artık inline
   `OR` yazmıyor, bu fonksiyonu çağırıyor.
4. **7 çağrı yeri bağlandı** (kartta 5 vardı; 2'sini ben buldum — §4).
5. **Yanlışlaşan yorumlar düzeltildi** (`route.ts:18`, `route.test.ts:26`) ve
   `scripts/tenant-bypass-scan.ts` içindeki `ConceptTemplate` gerekçesi güncellendi.
6. **Kapı:** 3 katman test — where cümlesinin kendisi (unit, DB'siz, her koşuda), uçtan uca
   sızıntı (live, gerçek DB + gerçek rol), ve tarayıcıdan gerçek tıklama (Playwright). Üçü de
   önce KIRMIZI gösterildi, sonra yeşile alındı.

### Yanında çıkan ikinci kusur (bu kartın DoD'unu test edilemez kılıyordu — düzeltildi)

`ConceptTemplate.schema` kolonunda **iki farklı şekil** var ve okuyucular aynı şekilde ikiye
bölünmüş:

| Yazan | Şekil | Okuyan | Sonuç |
|---|---|---|---|
| `prisma/seed.ts` | `[ {key,labelKey,…} ]` (çıplak dizi) | `m2/server/actions.ts` | ✅ |
| `prisma/seed-templates.ts` | `{ sections: [ … ] }` | `concept-notes/actions.ts`, export route | ❌ |

Veritabanındaki **7 satırın tamamı çıplak dizi** (ölçüm §2.3). Yani `createConceptNote` ve DOCX
export route'u **bugünkü her satırda patlıyordu**: `schema.sections is not iterable`. Bu olmadan
kartın "platform şablonu hâlâ çalışıyor" karşı-olgusunu yazmak mümkün değildi, o yüzden tek bir
yerde normalleştirdim (`templateSections`). Hangi şeklin kanonik olduğuna karar verip satırları
taşımak **bu kartın işi değil** → §5'te açık soru.

---

## 2. Kanıt

### 2.1 Uygulamanın bağlantısı RLS'e tabi değil — iki bağımsız ölçüm

```
$ npx tsx -e "… select current_user, rolsuper, rolbypassrls …"
role: [{"current_user":"fabrika","super":true,"bypass":true}]
templates: [{"tenantId":null,"count":7}]
policies: [{"polname":"tenant_or_shared","q":"((\"tenantId\" IS NULL) OR (\"tenantId\" = current_setting('app.tenant_id'::text, true)))"}]
```

```
$ pnpm rls:verify
Kiracıya özel model: 46 · RLS açık tablo: 53 · tenant_isolation politikası: 46

⚠  DATABASE_URL rolü fabrika (rolsuper=true, rolbypassrls=true) — RLS bu bağlantıda hiç uygulanmıyor.
   Bu rolle yapılan bir izolasyon ölçümü GEÇERSİZDİR; RLS'e tabi bir rol aranıyor:

Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi

✅ 46 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü…
```

Kartın (c) maddesi "sızıntı olmuyorsa, RLS kesiyorsa bunu da ölç ve söyle" diyordu. Ölçtüm:
**politika `fabrika_app` rolünde keser, uygulamanın rolünde kesmez.** Uygulama o rolle bağlanmıyor,
dolayısıyla sızıntı gerçektir ve tek koruma `where` cümlesidir.

### 2.2 KIRMIZI — kiracı A, kiracı B'nin şablonundan not oluşturdu

`tests/concept-template-tenant-scope.live.test.ts`, düzeltmeden ÖNCE:

```
FAIL  tests/concept-template-tenant-scope.live.test.ts > … > refuses a template owned by another tenant
AssertionError: promise resolved "{ id: 'cmtvu7lyd0009zzxk4firufhp', …" instead of rejecting
+ {
+   "content": { "summary": "" },
+   "createdBy": "user-cs-fb",
+   "id": "cmtvu7lyd0009zzxk4firufhp",
+   "opportunityId": "cmtvu7lx70002zzxknusa7nic",
+   "status": "draft",
+   "templateId": "cmtvu7lxj0007zzxku2v8h78n",   ← kiracı B'nin şablonu
+   "tenantId": "cmtvu7lwv0000zzxkd8n1ozxs",     ← kiracı A
+   "version": 1,
+ }

FAIL  … > generateConceptNoteDraft > refuses a template owned by another tenant before any LLM call
AssertionError: expected [Function] to throw error including 'Template not found' but got 'schema is not iterable'

 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```

YEŞİL, düzeltmeden SONRA:

```
$ npx vitest run tests/concept-template-tenant-scope.live.test.ts
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### 2.3 İkinci kusurun kanıtı — bugünkü satırlar eski okuyucuyu kırıyordu

```
$ npx tsx -e "… select schema from ConceptTemplate where key='generic' …"
Array.isArray(schema) = true
schema.sections      = undefined
old reader threw: schema.sections is not iterable
```

### 2.4 Gerçek tarayıcı — KIRMIZI → YEŞİL

`tests/e2e/concept-template-tenant-isolation.spec.ts`. Fikstür üç satırı aynı `generic` anahtarıyla
çakıştırıyor: tohumlanmış platform satırı, kiracı B'nin satırı, kiracı A'nın satırı. Gerçek giriş
formundan kiracı A olarak giriliyor.

Sayfanın `m2/page.tsx` içindeki iki aramasını geçici olarak eski (sarmasız) hâle döndürüp koştum:

```
  ✗ … › the generic fallback resolves to the caller's own template, never tenant B's
    Error: expect(locator).toBeVisible() failed
    Locator: getByText('Tenant A Own Section').first()
    Expected: visible
    Error: element(s) not found
  1 failed
```

Düzeltme geri konduğunda:

```
  ✓  1 [chromium] › … › the generic fallback resolves to the caller's own template, never tenant B's (2.1s)
  1 passed (6.0s)
```

> Diğer dört çağrı yerinin saldırı girdisi bir **server action argümanı**dır; hiçbir tıklama dizisi
> onu üretemez. O yüzden tarayıcı testi yalnız tarayıcıdan erişilebilen kolu (`generic` fallback)
> ölçüyor, kalanı §2.2'deki canlı DB testi ölçüyor. Bunu spec'in başındaki yoruma da yazdım.

### 2.5 Where cümlesinin kendi kapısı (DB'siz, her koşuda)

```
$ npx vitest run src/modules/m2/server/templates.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

`tenantId` olarak `undefined`/`null`/`''`/`'   '` verildiğinde `MissingTenantScopeError` fırlıyor —
çünkü bu kusurun asıl mekaniği Prisma'nın `undefined` bir `where` alanını **hiç yazmaması**.

### 2.6 Kapılar

```
$ pnpm lint                 → temiz (çıktı yok)
$ npx tsc --noEmit          → 0 hata
$ npx vitest run            → Test Files 161 passed | 2 skipped (163) · Tests 1906 passed | 8 skipped
$ pnpm i18n:check           → ✅ i18n check passed (325/325 baseline, yeni sabit metin yok)
$ pnpm rls:check            → ✅ 46 tenant-scoped model, hepsinde politika
$ pnpm rls:verify           → ✅ (§2.1)
$ pnpm rls:bypass-check     → ✅ SUCCESS: no new tenant bypass (35 kayıtlı, 4 hâlâ borç — hiçbiri bu kart)
$ npx next build            → ✓ Compiled successfully in 964ms
```

`pnpm rls:bypass-check` çıktısından, kartın (f) maddesi:

```
Shared catalogues this gate does not police (by construction, not by allowlist):
  Topic — 14 call site(s) in src/**
  AuditEvent — 11 call site(s) in src/**
  ConceptTemplate — 0 call site(s) in src/**
      tenantId is String? and null means "platform template"; … so a read by a client-supplied id
      alone returned another tenant's template — measured, not hypothetical (TASK-MTVTU103F11XJ:
      tenant A created a ConceptNote against tenant B's template). The RLS policy did not stop it
      because the app role is BYPASSRLS. Fixed by routing every read through
      src/modules/m2/server/templates.ts, which ANDs the id with OR[tenantId NULL, tenantId].
      Still structurally outside this gate, which judges the client rather than the where clause:
      src/modules/m2/server/templates.test.ts is the gate for this rule.
  Document — 0 call site(s) in src/**
  Chunk — 0 call site(s) in src/**
```

**Burada tarayıcıyı kapatacak bir şey buldum:** düzeltme `ConceptTemplate`'in çıplak çağrı yerlerini
5'ten 0'a indirdi ve sayaç yalnız eşleşme gördüğünde büyüdüğü için **tablo ve yazdığım gerekçe
rapordan tamamen kayboldu**. Bu, notun var olma amacının tam tersi (§5.3 "yokluğu belgele" diyordu).
Sayaç artık gerekçesi yazılı her model için sıfırdan tohumlanıyor — `Document` ve `Chunk` de bu
yüzden ilk kez görünür oldu.

### 2.7 e2e — tam koşu ve 6 kırmızının bana ait OLMADIĞININ ölçümü

```
$ npx playwright test                         (tam suite)
  6 failed · 1 skipped · 172 passed (5.7m)
    price-lock.spec.ts ×3 · relationship-owner-assign.spec.ts:175 · theme-paint-timing.spec.ts ×2
```

Benim spec'im dışarıda bırakılarak, yalnız o üç dosya:

```
$ npx playwright test price-lock relationship-owner-assign theme-paint-timing
  5 failed · 4 passed (44.2s)
    price-lock ×3 · theme-paint-timing ×2
```

→ price-lock (3) ve theme-paint-timing (2) **benim değişikliğimden bağımsız, önceden kırmızı**.
Altıncısı (`relationship-owner-assign:175`) bu koşuda GEÇTİ, yani tam-suite'e özgü. Benim spec'imin
onu bozup bozmadığını ayrıca ölçtüm:

```
$ npx playwright test concept-template-tenant-isolation relationship-owner-assign
  5 passed (11.8s)
```

→ benim spec'im o dosyayı bozmuyor; tam koşudaki kırmızı başka bir spec etkileşimi.

### 2.8 `pnpm alerts:check` — önceden kırmızı, benim değil

```
❌ 2 açık alarm, artık var olmayan bir kiracıyı gösteriyor
   •    2 satır  ←  kaynak "invoice_buyer_identity_missing"
```

Satırların kiracıları `t-iyzwave-…` / `t-iyzrepro-…` (iyzico fatura fikstürleri). En yeni
`SystemAlert` satırı `15:22:50Z`, veritabanı saati ölçüm anında `18:23:20Z` — yani bu oturum
başlamadan (~`17:47Z`) **~2.5 saat önce** yazılmışlar. Benim fikstürlerim `SystemAlert` yazmıyor ve
kendi kiracılarını tamamen siliyor.

---

## 3. Değişen dosyalar

**Yeni**
- `src/modules/m2/server/templates.ts` — kuralın TEK yeri
- `src/modules/m2/server/templates.test.ts` — where cümlesinin DB'siz kapısı (16 test)
- `tests/concept-template-tenant-scope.live.test.ts` — gerçek DB, gerçek rol, uçtan uca sızıntı (6 test)
- `tests/e2e/concept-template-tenant-isolation.spec.ts` — gerçek tarayıcı
- `tests/e2e/fixtures/concept-template-tenant.ts` — iki kiracı + üç çakışan `generic` satırı

**Bağlanan çağrı yerleri (7)**
- `src/modules/m2/server/actions.ts` — `generateConceptNoteDraft` (LLM çağrısından ÖNCE reddeder, kredi yanmaz) + `exportToDocx`
- `src/app/[locale]/(app)/[workspace]/concept-notes/actions.ts` — `createConceptNote`
- `src/app/[locale]/(app)/[workspace]/concept-notes/[id]/data.ts` — detay yükleyici (`tx` üstünde, açılan scope'un içinde)
- `src/app/[locale]/(app)/[workspace]/concept-notes/data.ts` — inline `OR` kopyası kaldırıldı, tek kaynağa bağlandı
- `src/app/api/concept-notes/[id]/export/route.ts` — DOCX export + yanlışlaşan yorum
- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/m2/page.tsx` — **kartta olmayan 2 çağrı**: `findUnique(id)` ve `findFirst({key:'generic'})`

**Güncellenen testler** (gevşetilmedi, DARALTILDI: `findUnique` → `findFirst`, `@/lib/db` mock'u artık
GERÇEK `assertTenantScope`'u taşıyor, yani reddetme davranışı stub'la gizlenemiyor)
- `src/modules/m2/server/actions.test.ts`
- `src/app/api/concept-notes/[id]/export/route.test.ts`
- `tests/modules/ai-module-gate.test.ts`

**Kapı metni**
- `scripts/tenant-bypass-scan.ts` — `ConceptTemplate` gerekçesi + katalog sayacının sıfırdan tohumlanması

---

## 4. Riskler

1. **`exportToDocx` artık şablon bulamazsa boş gövde üretir.** Eskiden de `template?.schema ?? []`
   ile aynı şeyi yapıyordu; davranış değişmedi, ama artık "bulunamadı"nın ikinci bir nedeni var
   (başka kiracının şablonu). Bir kiracının notu başka kiracının şablonuna işaret ediyorsa export
   sessizce boş çıkar. Bugün DB'de öyle bir satır yok (7 satırın hepsi platform) — ama
   `findAccessibleTemplate` null döndüğünde `exportToDocx`'in sessiz kalması yerine hata fırlatması
   daha dürüst olurdu. Dokunmadım: çağıran UI'ın hata yolu bu kartın kapsamı değil.
2. **`findAccessibleTemplateByKey` iki sorgu atıyor** (önce kendi, sonra platform). `orderBy` ile
   tek sorguya indirebilirdim ama nullable kolonda NULL sıralaması önceliği örtük bırakıyordu —
   bilinçli seçim, yorumda yazılı.
3. **`templateSections` bir yama, çözüm değil.** İki şekli de okuyor; hangisinin kanonik olduğu
   kararlanmadı. Yeni bir yazıcı üçüncü bir şekil getirirse sessizce `[]` döner (patlamaz, ama boş
   render eder).
4. **Paylaşımlı ağaç:** commit'im yalnız kendi yollarımı kapsıyor. Ağaçta aynı anda
   `src/lib/iyzico.ts`, `prisma/seed.ts`, `prisma/rls.sql` üstünde başka ajanların işi vardı —
   onlara dokunmadım, commit'e almadım.

---

## 5. Açık sorular

1. **`ConceptTemplate.schema` hangi şekil kanonik?** `prisma/seed.ts` (çıplak dizi, DB'deki 7
   satırın hepsi) mi, `prisma/seed-templates.ts` (`{sections}`) mi? Biri seçilip diğeri migration'la
   taşınmalı ve iki seeder birleştirilmeli; `templateSections` o zaman silinebilir. **Bugün hangi
   seeder son koşarsa okuyucular ona göre çalışıyor** — `seed-templates.ts` koşulsa `m2/server/actions.ts`
   patlardı. Bu bir kart açmayı hak ediyor.
2. **Uygulama neden BYPASSRLS bir rolle bağlanıyor?** `src/lib/db.ts:61` "yerel varsayılan rol
   SUPERUSER" diyor, ama bu `DATABASE_URL`'in kendisi — yani RLS üretimde de uygulanıyor mu,
   yoksa 46 tablonun tamamında tek koruma `where` cümlesi mi? `rls:verify` bunu ayrı bir rolle
   ölçtüğü için gate yeşil kalıyor ve soru görünmez oluyor. **Bu karttan büyük ve patronun kararı.**
3. Bir kiracının kendi şablonunu **oluşturacağı** bir yazma yolu bugün yok (yalnız seed yazıyor).
   Özellik geldiğinde `findAccessibleTemplateByKey`'in "kendi satırım platformu ezer" önceliği ürün
   kararı olarak doğrulanmalı.

## KAPANMADI

- §5.1 şema şekli kararı ve migration — normalleştirici yama kondu, **karar verilmedi**.
- §5.2 uygulama bağlantısının RLS'e tabi olmaması — ölçüldü ve raporlandı, **düzeltilmedi** (bu
  kartın kapsamı değil; 46 tabloyu etkiler).
- `pnpm alerts:check` 2 öksüz alarmla kırmızı — §2.8'de bana ait olmadığı ölçüldü, **temizlenmedi**
  (başka kiracıların fikstür artığı, silmek benim kararım değil).
- `pnpm test:e2e` tam koşuda 5 önceden-kırmızı + 1 etkileşim flake'i — §2.7'de bağımsızlığı
  ölçüldü, **düzeltilmedi**.

---

## 6. Sonraki adım

1. §5.1 için kart: "ConceptTemplate.schema tek şekle indirilsin + iki seeder birleşsin".
2. §5.2 için karar kartı: uygulama rolü NOBYPASSRLS olmalı mı — olursa `rls:verify`'ın ikinci rolü
   gereksizleşir ve 46 tablonun koruması iki katmana çıkar.
3. `exportToDocx`'in şablon bulunamadığında sessiz boş DOCX yerine hata döndürmesi (küçük, bağımsız).

---

**PLATFORM BEYANI:** Bu iş **macOS (Darwin 25.6.0, arm64)** üzerinde doğrulandı — unit, live DB
(yerel Postgres, `docker compose`) ve Playwright/Chromium gerçek tarayıcı koşusu dahil.
Dokunduğum kod yollarının **hiçbiri platforma bağlı değil**: süreç öldürme, dosya yolu, kabuk/ikili
adı, kısayol metni, ekran/DPI ya da mikrofon-kamera izni yok; değişiklikler Prisma `where`
cümleleri, TypeScript saf fonksiyonları ve test dosyalarından ibaret. Bu nedenle Windows ve Linux'ta
da aynı davranması **koddan** beklenir. **Windows ve Linux'ta koşulamadı** — bu ofiste yalnız macOS
makine var; platforma bağlı bir kod yolu olmadığı için ayrı bir koşu gerektirmediğini değerlendirdim.
