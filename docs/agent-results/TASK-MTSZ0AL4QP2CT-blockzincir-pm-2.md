# TASK-MTVR9T834EPUC — Tenant-bypass Dilim 2: workspace / pipeline / dashboard yüzeyi

**Ajan:** blockzincir-pm (PM-EN) · **Tip:** refactor (erişim katmanı) · **Sprint:** tenant-bypass
**Bağımlılık:** TASK-MTVR7W9ZXO7M (blok-zincir-dse, Dilim 1) — raporu inmişti, OKUNDU, imzası aynen kullanıldı
**Platform:** mac (Darwin 25.6.0) · **Bkz:** `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm.md` §3.6, §3.8, §5

> Bu rapor, görev metnindeki zorunlu kanıt yolu `docs/agent-results/TASK-MTSZ0AL4QP2CT-blockzincir-pm-2.md`
> dosyasına da birebir aynı içerikle yazılmıştır. İki yol da kart metninde geçtiği için ikisi de yazıldı;
> içerik ayrışmasın diye kopya değil, aynı metin.

---

## 1. Ne yapıldı

Envanterdeki **14 sarmalayıcısız çağrı**, yedi dosyada `withTenant`/`TenantTx` içine taşındı.
`tenantId`'nin **nereden geldiği hiçbir yerde değişmedi** (oturum, `authenticateApiKey`, ya da
fonksiyon parametresi) — bu bir erişim katmanı taşımasıdır, yetki değişikliği değil.

### 1.1 Önce envanteri kendi ölçümümle tazeledim

Kart, raporumdan bu yana beş ajanın commit attığını söylüyordu. Satır numaralarının **on dördü de
yerindeydi**:

```
$ grep -n "prisma\." <yedi dosya>
pipeline/actions.ts:211,218,222,295,362      (+ 98,106 → aşağıda, KAPSAM DIŞI)
approvals/page.tsx:23
lib/dashboard/fetch-metrics.ts:57,84
lib/modules/access.ts:88
lib/feedback/submit.ts:117,190
api/v1/opportunities/route.ts:44
api/concept-notes/[id]/export/route.ts:18,29  (+ 34 → Kova F, DOKUNULMADI)
```

### 1.2 Taşınan çağrılar

| Dosya | Sarılan | Nasıl |
|---|---|---|
| `pipeline/actions.ts` | 5 | `createOpportunity`: iki `workspace.findFirst` + `opportunity.create` **tek** scope'ta; `assignOpportunityOwner` ve `moveOpportunityStage`: `updateMany` ayrı ayrı |
| `approvals/page.tsx` | 1 | `approvalRequest.findMany` |
| `dashboard/fetch-metrics.ts` | 2 | `opportunity.findMany` + `moduleState.count` |
| `modules/access.ts` | 1 | `moduleState.findUnique` — `Promise.all` paralelliği korundu |
| `feedback/submit.ts` | 2 | `feedback.create` ve `feedback.update` — **iki ayrı** scope (§1.4) |
| `api/v1/opportunities/route.ts` | 1 | `opportunity.findMany` |
| `api/concept-notes/[id]/export/route.ts` | 2 | `conceptNote.findFirst` + `opportunity.findFirst` tek scope'ta |

Dilim 1'in imzası aynen kullanıldı — ikinci bir stil çıkarılmadı:
`withTenant(tenantId, (tx) => tx.model.op({...}))`, `tenantId` `where`/`data` içinde **bırakıldı**.
Bu desen zaten `pipeline/actions.ts`'in kendi içinde de vardı (satır 407, 472, 576), ona da uyuldu.

### 1.3 `rescoreOpportunityG0` scope'un DIŞINDA bırakıldı — ve orada kalmalı

`createOpportunity` içindeki en kolay hata, `rescoreOpportunityG0(tenantId, created.id)` çağrısını
sarmaladığım bloğun içine almak olurdu. Alamaz:

```ts
// src/lib/scoring/g0-compute.ts:458
export async function rescoreOpportunityG0(tenantId, opportunityId) {
  return withTenant(tenantId, async (tx) => { ... });   // ← KENDİ transaction'ını açıyor
}
```

İçeriden çağrılsa, **henüz commit edilmemiş** `Opportunity` satırını başka bir bağlantıdan
okumaya çalışırdı: `computeG0ForOpportunity` hiçbir şey bulamaz, `null` döner ve her yeni fırsat
sessizce **puansız** kalırdı. Kodda gerekçesiyle birlikte yorum olarak işaretlendi.

### 1.4 `submit.ts`'te tek değil İKİ scope

Dosyanın kendi başlığı sıranın kasıtlı olduğunu yazıyor: kaydet → ekran görüntüsü (R2) → alarm →
sonucu geri damgala. Tek bir `withTenant` bu sıranın etrafını sarsaydı, bir DB transaction'ı iki ağ
çağrısı (R2 + alarm yazıcı) boyunca açık kalırdı — bir muhasebe riskini bağlantı havuzu riskiyle
takas etmek olurdu. İki ayrı scope, belgelenen sırayı **aynen** korur.

---

## 2. Kanıt

### 2.1 Asıl kanıt — çürütme sondası ÖNCE KIRMIZI, sonra yeşil

`tests/pipeline-surface-tenant-scope.live.test.ts`.

**Sondanın neden alışılmış biçimde yazılmadığı.** İki kiracı tohumlayıp "A, B'nin satırını
görmemeli" diyen bir test bu dilimde **hem önce hem sonra geçer** — `where: { tenantId }` zaten
oradaydı. Hiçbir şey ölçmeyen bir yeşil olurdu; bu çağrıların bir denetimden sarmalanmadan geçmesinin
sebebi tam olarak budur.

Sarmalayıcının satın aldığı şey `where` cümlesi değil, garantinin öbür yarısı:
`set_config('app.tenant_id', …)` — yani Postgres'in kendi `tenant_isolation` politikalarının
uygulanması. Yerelde `prisma` singleton'ı `fabrika` rolüdür (SUPERUSER, BYPASSRLS), RLS o bağlantıda
**atıldır**. Bu yüzden testteki her iddia `DATABASE_URL_RLS_TEST` (rol `fabrika_app`, NOBYPASSRLS)
üzerinden koşuyor — `pnpm rls:verify`'ın ölçtüğü rolün aynısı.

O rol üzerinde test **gerçekten kırmızı-önce**, üstelik *pozitif* yönde: sarmalanmamış kod hiçbir
scope açmadığı için `app.tenant_id` boş kalır, politika hiçbir satırla eşleşmez ve yükleyici
**kendi kiracısının sıfır satırını** döndürür.

**Değişiklikten ÖNCE (aynı test dosyası, sarmalanmamış kaynak):**
```
 ❯ tests/pipeline-surface-tenant-scope.live.test.ts (5 tests | 4 failed)
   × returns the calling tenant its own rows
     AssertionError: expected +0 to be 1
   × never shows one tenant another tenant's opportunity
     AssertionError: expected +0 to be 80
   × persists a report under the reporting tenant and stamps it back
     Database error. Code: `42501`.
     Message: `new row violates row-level security policy for table "Feedback"`
        → src/lib/feedback/submit.ts:117  ← envanterdeki satırın ta kendisi
   × does not let a report land in another tenant's ledger
      Tests  4 failed | 1 passed (5)
```

**Değişiklikten SONRA:**
```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Yani kanıt "cross-tenant sızıntı yok" değil — o zaten yoktu. Kanıt şu: **bu yedi dosya, uygulamanın
gerçekte koşması gereken rol altında daha önce hiç çalışmıyordu; şimdi çalışıyor.** Dashboard boş
okuyordu, geri bildirim yazısı reddediliyordu.

Karşı-olgusal kol testin içinde (`never shows … another tenant's`, `avgIsabet === 80`): o olmadan,
hiçbir şey döndürmeyen bozuk bir yükleyici de "B'nin satırı yok" iddiasını sağlardı.

Sonda ayrıca kendi ölçüm rolünü doğruluyor (`rolbypassrls === false`); politikaları sessizce baypas
eden bir rol, dosyadaki her yeşili sahte yeşile çevirirdi.

### 2.2 Mutasyon — sondanın dişleri dosya bazında

Bir yeşil test kanıt değildir. **Yalnız** `fetch-metrics.ts`'in sarmalayıcısını geri aldım:

```
× returns the calling tenant its own rows            AssertionError: expected +0 to be 1
× never shows one tenant another tenant's opportunity AssertionError: expected +0 to be 80
      Tests  2 failed | 3 passed (5)          ← feedback testleri YEŞİL kaldı
```

Yalnız o dosyanın iki testi kızardı, diğerleri etkilenmedi: sonda global bir etkiye değil,
**dosya bazında** bağlanıyor. Dosya yedekten geri alındı, `diff` ile birebir aynı olduğu doğrulandı.

### 2.3 Gerçek tarayıcı — Playwright, gerçek tıklama

`tests/e2e/pipeline-dashboard-happy-path.spec.ts` (yeni):

```
✓ 1 the board loads a wrapped query and a wrapped action still writes (1.5s)
✓ 2 the KPI export reports the rows the wrapped loader returned (1.2s)
  2 passed
```

- **Okuma:** pano kartı ekranda (`pipeline-card-<id>`), sarılan sorgu boş dönmüyor.
- **Yazma:** kartın "Sorumlu kullanıcıyı değiştir" açılır listesinden **gerçek seçim** →
  `assignOpportunityOwner` (sarılan beş çağrıdan biri). Sonuç ekrandan değil **Postgres'ten** geri
  okunuyor; aksi hâlde iyimser bellek-içi tampon kartı doğru gösterirken yazı hiç inmemiş olabilirdi.
- **KPI:** `fetchDashboardMetrics` ürün içinde **tek bir yerden** çağrılıyor — `/api/dashboard/export-csv`.
  Dashboard *sayfası* onu kullanmıyor (`getKpiMetrics`, `src/modules/m5/server/queries.ts`), bu yüzden
  sayfayı sürmek o dosya hakkında hiçbir şey kanıtlamazdı. Test CSV'yi oturumla indirip bilinen
  sayıları doğruluyor: `Toplam Teklif,1,adet`, `Açık Modüller,1,modül`, `G0,1`.

Kareler ve çıktı: `test-artifacts/TASK-MTVR9T834EPUC-screenshots/`
`01-pipeline-board-loaded.png` (98 KB) · `02-owner-assigned.png` (118 KB) · `03-kpi-export.csv` (221 B)

**E2E'nin dişleri (ölçüldü):** sarılan okumayı hiçbir satır döndürmeyecek şekilde bozdum →
`✘ Expected pattern: /^Toplam Teklif,1,adet/m`. Yani "transaction sessizce boş döndü" regresyonunu
yakalıyor.

**E2E'nin göremediği şey (dürüstlük payı):** sarmalayıcıya *yanlış* kiracının scope'unu verecek
şekilde bozdum (`withTenant('some-other-tenant', …)`) → **2 passed**, test kızarmadı. Sebebi
§2.1'deki gerçek: yereldeki bağlantı SUPERUSER, RLS atıl, `where: { tenantId }` işi tek başına
görüyor. **E2E bu sınıftaki bir kiracı-scope kusurunu yerelde göremez; onu yalnız RLS rolü üzerinden
koşan §2.1 sondası görebilir.** İkisi farklı iş yapıyor: sonda garantiyi, e2e regresyonu ölçüyor.

### 2.4 Etkilenen mevcut e2e paketleri

```
✓ dashboard-outcome-case · g0-computed-score (2) · opportunity-archive · pipeline-note-author
✓ module-gate (3) · module-plan-gate (2) · feedback · pipeline-dashboard-happy-path (2)
  13 passed (25.6s)
```

### 2.5 `pnpm vitest run` — tam paket

```
 Test Files  157 passed | 2 skipped (159)
      Tests  1858 passed | 8 skipped (1866)
```

Buraya gelmeden önce **28 test kırmızıydı** ve hepsi aynı yapısal sebepten:

```
Error: [vitest] No "withTenant" export is defined on the "@/lib/db" mock.
```

Bu, Dilim 1'in de kaydettiği kırmızının aynısı ve aslında istenen şey: birim testleri artık
`withTenant`'tan geçmeyen bir çağrıyı **yapısal olarak göremiyor**. Beş test dosyasının `@/lib/db`
mock'u, `withTenant`'ın callback'ine testin zaten izlediği **aynı** sahte istemciyi verecek şekilde
güncellendi (deseni `tests/modules/ai-module-gate.test.ts` zaten kurmuştu).

### 2.6 `pnpm typecheck` · `pnpm lint` · `pnpm rls:verify`

```
$ pnpm typecheck
$ tsc --noEmit
          ← temiz (çıktı yok)

$ pnpm lint
$ eslint
          ← temiz (0 error, 0 warning)

$ pnpm rls:verify
Kiracıya özel model: 45 · RLS açık tablo: 52 · tenant_isolation politikası: 45
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
   ✓ okuma (negatif): app.tenant_id yokken 20 dolu tablonun hepsi 0 satır döndü
   ✓ okuma (pozitif): AiUsageLog kendi kiracısı bağlamında 9 satır döndü
   ✓ yazma (negatif): app.tenant_id yokken INSERT reddedildi
   ✓ yazma (pozitif): kendi kiracısına INSERT kabul edildi (geri alındı)
   ✓ yazma (çapraz): başka kiracıya INSERT reddedildi
✅ 45 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü.
```

### 2.7 DOKUNULMAYAN satırlar — `git diff` ile

Kartın açık şartı: export dosyasının **34. satırı** (`conceptTemplate`, Kova F) değişmeyecek.

```
$ git diff -- 'src/app/api/concept-notes/[id]/export/route.ts' | grep -E "^[-+].*conceptTemplate"
+  // Both tenant-scoped reads share one scope. The `conceptTemplate` lookup
```

Tek eşleşme **benim yorumum**; `prisma.conceptTemplate.findUnique({ where: { id: note.templateId } })`
satırı diff'te bağlam (context) olarak duruyor, `+`/`-` almamış — yani baytı baytına aynı. Dosyada
`prisma.` ile kalan tek çağrı odur.

Aynısı `pipeline/actions.ts:98,106` için:

```
$ git diff -- '…/pipeline/actions.ts' | grep -E "^[-+].*prisma\.topic"
   (çıktı yok = dokunulmadı)
```

---

## 3. Değişen dosyalar

**Kaynak (7 — kartın verdiği liste, hepsi):**
```
src/app/[locale]/(app)/[workspace]/pipeline/actions.ts      | 54 ++++++------
src/app/[locale]/(app)/[workspace]/approvals/page.tsx       | 26 ++++---
src/lib/dashboard/fetch-metrics.ts                          | 20 ++---
src/lib/modules/access.ts                                   | 12 ++--
src/lib/feedback/submit.ts                                  | 73 +++++++++------
src/app/api/v1/opportunities/route.ts                       | 28 ++++---
src/app/api/concept-notes/[id]/export/route.ts              | 35 +++++---
```

**Test (yeni 2):**
- `tests/pipeline-surface-tenant-scope.live.test.ts` — RLS rolü üzerinden çürütme sondası
- `tests/e2e/pipeline-dashboard-happy-path.spec.ts` — gerçek tarayıcı mutlu yol

**Test (mock güncellemesi 5 — §2.5'teki yapısal kırmızının gereği):**
- `src/app/api/concept-notes/[id]/export/route.test.ts`
- `tests/api/v1-opportunities.test.ts` · `tests/api/v1-partners.test.ts`
- `tests/modules/ai-module-gate.test.ts` · `tests/modules/module-plan-gate.test.ts`

Kartın "DOKUNMA" listesindeki hiçbir yola dokunulmadı: `pipeline/board.tsx`, `src/components/**`,
`settings/calendar/**`, `src/modules/m9/**`, `src/lib/inngest/**`, `src/modules/m6/**`,
`src/lib/billing/subscription-sync.ts`.

---

## 4. Riskler

1. **Envanterimde bir hata buldum: `submit.ts:190` Kova H'ye ait DEĞİL.**
   Kova H'nin tanımı "`tenantId` zaten `where`/`data` içinde"ydi. Bu satırda değil:
   ```ts
   await prisma.feedback.update({ where: { id: created.id }, ... })   // tenantId YOK
   ```
   Etkisi sınırlı: `created.id` bu fonksiyonun az önce **bu kiracı için** ürettiği id, çağıranın
   verdiği bir değer değil. Yine de kartın "mekanik taşıma, yetki değişikliği değil" şartına sadık
   kalıp `where`'i **değiştirmedim**; satırı `withTenant` içine aldım, böylece kapsamı artık açılan
   scope (ve RLS) veriyor. Kodda yorumla işaretli. Kova F'ye benzer bir savunma-derinliği düzeltmesi
   (`updateMany({ where: { id, tenantId } })`) istenirse ayrı bir karttır — `update` → `updateMany`
   dönüşü hata davranışını da değiştirir (P2025 fırlatma → sessiz `count: 0`) ve buradaki
   `catch` bloğu alarm üretmeye o fırlatmaya güveniyor.

2. **Transaction sınırları değişti.** Yedi dosyada bu çağrılar artık `$transaction` içinde.
   `createOpportunity`'de iki okuma + bir yazma tek transaction'a girdi (istenen davranış).
   `submit.ts`'te ağ çağrılarının transaction dışında kalmasına özellikle dikkat edildi (§1.4);
   `rescoreOpportunityG0` da dışarıda bırakıldı (§1.3). Yeni bir sarma eklenirken bu iki tuzak
   tekrar değerlendirilmeli.

3. **`access.ts` her modül kontrolünde bir transaction açıyor.** `checkModuleAccess` sıcak yolda
   (her korumalı sayfa/aksiyon). `Promise.all` paralelliği korundu ama bağlantı havuzu üzerindeki
   yük ölçülmedi — bu dilimde kapsam dışıydı; yük profili değişirse ilk bakılacak yer burası.

4. **Bu dosyalar üretim rolü altında ilk kez çalışıyor.** §2.1'in gösterdiği gibi, `fabrika_app`
   altında daha önce hiçbiri satır döndürmüyordu. Uygulama o role geçtiğinde bu yedi yol artık
   çalışacak — ama **sarmalanmamış geri kalan çağrılar çalışmayacak.** Dilim 3/4/5 bitene kadar
   role geçiş yapılmamalı.

---

## 5. Açık sorular

1. **`submit.ts:190` için savunma-derinliği isteniyor mu?** (Risk 1). Dilim 1'de kardeş ajan
   `delete` → `deleteMany({id,tenantId,userId})` dönüşünü yapmıştı; buradaki eşdeğeri hata
   davranışını değiştirdiği için karar bekliyor.
2. **Kova F/paylaşılan katalog satırları statik korumada nasıl işaretlenecek?** `conceptTemplate`
   (34) ve `Topic` (98, 106) kasıtlı olarak sarmasız. Dilim 5'in allowlist'i bunları **ada göre**
   içermeli, yoksa `pnpm rls:bypass-check` onları ihlal sayacak.
3. **`Topic` envanterde hiçbir kovada yok.** `pipeline/actions.ts:98,106` beş kovanın hiçbirinde
   geçmiyor; denetimim yalnız kiracıya özel modelleri taradığı ve `Topic`'in `tenantId` sütunu
   olmadığı için doğru dışlanmış (paylaşılan CORDIS kataloğu, `conceptTemplate` ile aynı aile).
   Dilim 5 yazılırken bu **açıkça** belgelenmeli, yoksa "envanterde eksik satır var" gibi görünür.

---

## 6. Sonraki adım

- Dilim 3 (`subscription-sync.ts`, 13 çağrı, customer-support) ve Dilim 4 (Inngest, blok-zincir-dev)
  bu desenle sürebilir; ikisi de bu dilimle dosya çakışmıyor.
- Dilim 5 (allowlist + `pnpm gate` kapısı) artık Dilim 1 ve 2'nin hangi satırları sarmaladığını
  bilerek yazılabilir. §5'teki üç maddenin allowlist'e girmesi gerekiyor.
- §2.3'teki bulgu Dilim 5'i doğrudan etkiliyor: **kiracı-scope kusurları yerel e2e ile
  görülemez.** Kapıya konacak ölçüm, RLS rolü üzerinden koşan bir test olmalı (`.live` deseni);
  yalnız e2e'ye güvenen bir kapı sahte yeşil verir.

---

## 7. Bilinen, bana ait OLMAYAN kırmızı

`tests/e2e/document-export-tenant-isolation.spec.ts` → "tenant A … gets its OWN organisation, not
FonBridge" **kırmızı**. Bana ait değil; kendi yedi dosyamı `git stash` edip **temel çizgide** aynı
testi koşarak kanıtladım:

```
$ git stash push -- <yalnız benim 7 dosyam>
$ pnpm test:e2e tests/e2e/document-export-tenant-isolation.spec.ts
  ✘ tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge
  1 failed
```

Sebep de benim değişikliğimle ilgisiz: test, `FonBridge`'i "yanlış kiracının kuruluşu" nöbetçisi
olarak kullanıyor, ama üretilen DOCX'te o kelime **ürün adı feragatnamesinde** geçiyor
("… tarafından FonBridge'da hazırlanmıştır"). Kuruluş alanı doğru: `Doc Export E2E Kiracı A`.
Ayrıca bu test **benim dosyam olan** concept-notes export rotasını değil, application-part export
rotasını sürüyor. Feragatname metnini değiştiren ajanın kartına ait.

`tests/e2e/st6-empty-tenant-no-fabrication.spec.ts` → "header bell" testi bir paralel koşuda
kızardı, tek başına arka arkaya **2/2 yeşil**; flake olarak kaydediyorum, benim yollarımla teması yok.

---

## 8. Platform beyanı

**Doğrulama platformu: mac (Darwin 25.6.0, arm64), Node + pnpm, Postgres docker-compose, Chromium.**

Dokunduğum kod yollarının **hiçbiri platforma bağlı değil**: değişiklik yalnız Prisma çağrılarının
`withTenant` transaction'ı içine taşınmasından ibaret — süreç öldürme, dosya yolu, kabuk/ikili adı,
kısayol metni, ekran/DPI ya da mikrofon-kamera izni içermiyor. Sunucu tarafı TypeScript; davranış
Node ve Postgres tarafından belirleniyor, işletim sistemi tarafından değil.

**Windows / Linux'ta koşulamadı** — bu makinede yalnız mac mevcut. Koddan beklenen: aynı davranış.
Tek platforma bağlı bağımlılık `DATABASE_URL_RLS_TEST` üzerinden Postgres'e TCP bağlantısı ve
Playwright'ın Chromium indirmesi; ikisi de üç platformda da aynı şekilde çalışır. Yeni testler
platforma özel hiçbir çağrı içermiyor (`node:fs` `writeFileSync` ve şablon-dizgi yolları hariç, ki
onlar da Playwright'ın kendi `shotsDir()` yardımcısı üzerinden üretiliyor).
