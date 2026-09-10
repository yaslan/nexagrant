# TASK-MTV5GFB75N43S — `compareM6ToESR` cannot be called without a tenant

**Ajan:** blok-zincir-dse (Designer / Opus 5) · **Tip:** bug (tenant isolation) · **Sprint:** S12
**Kapsam:** `src/modules/m6/server/comparison.ts` + yeni test · `scoring.ts`'e DOKUNULMADI
**Platform:** macOS (Darwin 25.6.0) — aşağıda "Platform beyanı" başlığına bakın

## 1. Ne yapıldı

Bulgu, kendi spike'ımda (TASK-MTV4ZJEECXNDE) bildirdiğim ve liderin kodda doğruladığı
bulgu 1: `compareM6ToESR` kiracı kontrolünü **tümden düşürüyordu**. İki ayrı kusur aynı
yolda birleşiyordu:

1. `comparison.ts:56` — tenantId yokken `compareM6ToESRInternal`'a global `prisma`
   veriliyordu (`prisma as unknown as TenantScopedDb`), yani RLS'in kısıtlamadığı rolle
   açılmış bağlantı;
2. `comparison.ts:89` — sahiplik guard'ı `(tenantId && evaluation.tenantId !== tenantId)`
   biçimindeydi; tenantId yokken **kısa devre** yapıyordu.

Geriye kalan `findUnique({ where: { id } })` bir *kiracılar arası* tekil satır aramasıdır:
elinde bir evaluation id'si olan çağıran, o değerlendirmenin panel puanlarını, ESR
karşılaştırmasını ve hakem listesini alırdı. `1d49048`'in `scoring.ts`'te kapattığı hata
sınıfının birebir ikizi.

Uygulanan çözüm — **aynı şablon, yeni desen icat edilmedi** (`1d49048` ile satır satır
aynı yapı):

- (a) `compareM6ToESRInternal`'da `tenantId` **zorunlu**; guard koşulsuz eşitliğe çevrildi:
  `if (!evaluation || evaluation.tenantId !== tenantId)`.
- (b) Kiracısız yol **derlenemez**: her iki aşırı yüklemede `tenantId: string`, `prisma`
  kaçış yolu ve dalı silindi; tip sistemini atlatan çağrılar için giriş noktalarında
  `assertTenantScope(tenantId, 'compareM6ToESR')` — deponun mevcut sorgu-sınırı guard'ı,
  yeni bir hata tipi ÜRETİLMEDİ (`MissingTenantScopeError` yeniden kullanıldı).
- (c) Diğer dört fonksiyon tarandı (§4).

Üretim çağıranı yok: `compareM6ToESR`'ı yalnız iki test dosyası çağırıyor ve ikisi de
zaten db-formunda kiracı geçiyor → davranış değişikliği sıfır, hiçbir çağıran kırılmadı.

## 2. Kanıt

### 2.1 Kiracısız çağrı DERLENMİYOR

Depo içine geçici bir sonda dosyası koyup projenin kendi `tsc`'siyle ölçüldü:

```ts
// tests/modules/m6/__tenantless-probe.ts (ölçümden sonra silindi)
export const probe = () => compareM6ToESR('eval-1');
```

```
$ pnpm typecheck
tests/modules/m6/__tenantless-probe.ts(2,28): error TS2554: Expected 2-4 arguments, but got 1.
[ELIFECYCLE] Command failed with exit code 2.
```

Bu, kartın istediği `compareM6ToESR('eval-1')` örneğinin birebir çıktısıdır. Aynı iddia
teste de `@ts-expect-error` ile çakılmıştır (`comparison-tenant-scope.test.ts:66-71`):
opsiyonel parametre geri geldiği gün bu satırlar TS2578 ile kapıyı kırar.

### 2.2 Mutasyon — guard'ı bilerek bozdum (yeşil test kanıt değildir)

**Mutasyon 1**, sahiplik karşılaştırmasını guard'dan çıkar (`if (!evaluation) {`):

```
 ❯ tests/modules/m6/comparison-tenant-scope.test.ts:121:59
    121|     await expect(compareM6ToESR(db, 'eval-a', 'tenant-b')).rejects.toT…
+   "esrScore": 4.6,
+   "esrScoreHigher": true,
+   "m6Score": 4,
+   "panelScore": 4,
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

KIRMIZI — ve çıktının kendisi sızıntının ta kendisi: `tenant-b` bağlamındaki çağrı,
`tenant-a`'nın panel puanını (`m6Score: 4`) ve ESR karşılaştırmasını (`esrScore: 4.6`)
eline geçirdi.

**Mutasyon 2**, iki `assertTenantScope` çağrısını sil:

```
     × refuses undefined without querying
     × refuses null without querying
     × refuses an empty string without querying
     × refuses whitespace without querying
     × the refusal names the caller and carries the repo-wide code
 Test Files  1 failed (1)
      Tests  5 failed | 2 passed (7)
```

KIRMIZI. İki mutasyon da geri alındı; her ikisi de yük taşıyor (testler boş değil).

**Geri alındıktan sonra YEŞİL:**

```
$ npx vitest run tests/modules/m6
 Test Files  4 passed (4)
      Tests  44 passed (44)
```

Kaçınmalar (`undefined`, `null`, `''`, boşluk) **sorgu açılmadan** reddediliyor —
test her vakada `expect(db.evaluation.findUnique).not.toHaveBeenCalled()` diyor.

### 2.3 `pnpm gate` — hangi commit üzerinde

Kapı tam hâliyle **`8c46616`** üzerinde koşturuldu (paylaşılan çalışma ağacı;
`comparison.ts` değiştirilmiş + yeni test dosyası eklenmiş halde).

| Aşama | Sonuç |
|---|---|
| `db:generate` | ✅ |
| `lint` | ✅ 0 error (2 warning — ikisi de başka ajanın `docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts` dosyasında, benim değil) |
| `typecheck` | ✅ 0 hata |
| `test` (unit) | ✅ 143 dosya, **1696 passed** \| 8 skipped |
| `i18n:check` | ✅ iki katalog uyuşuyor |
| `rls:check` | ✅ 44 kiracıya özel modelin hepsinde politika kayıtlı |
| `rls:verify` | ✅ izolasyon `fabrika_app` rolüyle GERÇEKTEN ölçüldü (okuma+yazma, çapraz kiracı reddedildi) |
| `test:e2e` | ❌ **17 failed / 135 passed** — benim değil, §2.4 ve §5 |

**Paylaşılan ağaç, hareketli zemin.** Kapı koşarken HEAD altımdan iki kez ilerledi
(`8c46616` → `07778e0` → `c7dab14`): başka ajanlar fatura i18n ve marka-adı işlerini
indirdi. Bu yüzden ölçümü **yeni HEAD `c7dab14` üzerinde tekrarladım**:

```
$ pnpm typecheck          → 0 hata
$ npx vitest run tests/modules/m6
 Test Files  4 passed (4)
      Tests  44 passed (44)
$ pnpm test               → Tests 4 failed | 1692 passed | 8 skipped (1704)
```

`c7dab14`'teki 4 birim hatası benim değil — hepsi marka-adı yeniden adlandırma işinin
uçuşan hâli (`4a33249`, "retired FonBridge name"):

```
FAIL tests/brand-surfaces-render.test.tsx > public footer renders the product name (tr)
FAIL tests/brand-surfaces-render.test.tsx > public footer renders the product name (en)
FAIL tests/document-exporter.test.ts   > states that no funding body issued the document
FAIL tests/retired-brand-name.test.ts  > an exported document carries the product name
```

M6 tarafı her iki commit'te de 44/44 yeşil, `typecheck` her ikisinde de 0 hata.

### 2.4 e2e kırmızısı BENİM DEĞİL — karşı-olgusal ölçüm

İddia etmedim, ölçtüm. Aynı iki spec, önce değişikliklerim **geri alınmış** halde
(`git checkout -- comparison.ts`, test dosyam dizinden çıkarılmış), sonra **geri konmuş**
halde koşuldu:

```
# değişikliklerim YOKKEN
$ npx playwright test tests/e2e/notfound-status.spec.ts tests/e2e/plan-storefront.spec.ts
  13 passed (14.8s)

# değişikliklerim VARKEN
$ npx playwright test tests/e2e/notfound-status.spec.ts tests/e2e/plan-storefront.spec.ts
  13 passed (14.6s)
```

Aynı sonuç → değişken benim değişikliğim değil. Ayrıca `comparison.ts`'i uygulama
kodundan **hiçbir şey import etmiyor** (tam tarama: yalnız üç test dosyası), yani hiçbir
Playwright spec'i bu dosyayı çalıştırmıyor:

```
$ grep -rn "server/comparison|from './comparison'|from '../comparison'" src tests scripts workers
src/modules/m6/server/__tests__/comparison.test.ts:12
tests/modules/m6/comparison-tenant-scope.test.ts:2
tests/modules/m6/scoring.test.ts:14
```

## 3. Değişen dosyalar

| Dosya | Durum | Δ |
|---|---|---|
| `src/modules/m6/server/comparison.ts` | değiştirildi | +29 / −14 |
| `tests/modules/m6/comparison-tenant-scope.test.ts` | **yeni** | 7 test |
| `docs/agent-results/TASK-MTV5GFB75N43S-blok-zincir-dse.md` | **yeni** | bu rapor |

`scoring.ts`'e dokunulmadı (kart kuralı). `scripts/rescore-g0.ts`'ye dokunulmadı.

## 4. (c) — dosyadaki diğer dört fonksiyon: tarandı

Aranan hata sınıfı: **opsiyonel `tenantId`** ya da **koşullu guard**
(`tenantId ? … : {}` / `tenantId && …`). Dosya genelinde otomatik tarama:

```
$ grep -n "tenantId?:" src/modules/m6/server/comparison.ts            → none
$ grep -nE "tenantId \? |tenantId && |\.\.\.\(tenantId" comparison.ts → yalnız satır 33 (kendi
                                                    doc yorumumun ESKİ kodu alıntıladığı yer)
```

Fonksiyon fonksiyon:

| Fonksiyon | tenantId | Guard | Hüküm |
|---|---|---|---|
| `checkNoDuplicateScore` (:180) | parametre **yok** | — | **Tarandı, bu sınıftan temiz.** Opsiyonel parametresi de koşullu guard'ı da yok; `prisma` kaçış yolu da yok — çağıranın verdiği kiracı-kapsamlı tx'e dayanıyor. Aşağıdaki nota bakın. |
| `validateReviewerAccess` (:194) | `tenantId: string` zorunlu | `where` içinde **koşulsuz** | Tarandı, temiz |
| `validateEvaluationTenant` (:213) | `tenantId: string` zorunlu | `evaluation?.tenantId === tenantId` **koşulsuz** | Tarandı, temiz |
| `validateReviewersTenant` (:229) | `expectedTenantId: string` zorunlu | `evaluation.tenantId !== expectedTenantId` **koşulsuz** | Tarandı, temiz |

Üçünün de boş dizeyle **kapalı arızalandığını** (fail closed) not ediyorum: `''`
karşılaştırmayı `false` yapar / hiçbir satırla eşleşmez, yani sızıntı değil ret üretir.
Bu yüzden bunlara `assertTenantScope` **eklemedim** — eklemek `false` dönüşünü `throw`'a
çevirirdi; bu bir davranış değişikliğidir ve bu kartın kapsamı değildir.

`checkNoDuplicateScore` hakkında bir gözlem (kusur değil, kapsam dışı): sorgusunda hiç
kiracı koşulu yok, izolasyonun tamamı çağıranın verdiği tx'e emanet. `compareM6ToESR`'dan
farkı, kendi başına kapsamsız bir bağlantı üretememesi — `db` parametresi zorunlu. Yine de
`reviewerId`/`criterionId` doğrudan geldiği için, ileride RLS'siz bir istemciyle çağrılırsa
sessizce kiracılar arası çalışır. **Düzeltmedim, adıyla bildiriyorum.**

`validateReviewersTenant`'ın 0 çağıranı olduğunu da doğruladım — o TASK-MTV5H4HCGGGQ5'in
konusu, bu kartta dokunmadım.

## 5. Riskler ve yolda görülen bitişik hatalar (DÜZELTİLMEDİ, adıyla bildiriliyor)

1. **13 fatura e2e'si kırmızı — ama sebebi kod değil, EKSİK ORTAM DEĞİŞKENİ.** Kaynağa
   kadar takip ettim:
   ```
   $ npx playwright test tests/e2e/invoice-write-path.spec.ts:131
   Error: expect(received).toBe(expected)
   Expected: 200
   Received: 503
     at tests/e2e/invoice-write-path.spec.ts:172:24
   ```
   503, `src/app/api/billing/invoices/[id]/export/route.ts:136`'daki
   `supplier_identity_not_configured` dalıdır ve rota **tasarlandığı gibi** davranıyor —
   satıcı kimliği kurulu değilse akla yatkın bir VKN uydurmak yerine 503 döndürüyor.
   Ölçüm: `.env.example` sekiz `INVOICE_SUPPLIER_*` anahtarı tanımlıyor, bu makinedeki
   `.env`'de **hiçbiri yok**:
   ```
   $ grep -c INVOICE_SUPPLIER .env.example  → 8
   $ grep -c INVOICE_SUPPLIER .env          → 0
   ```
   Yani bu bir **yerel ortam kurulumu boşluğu**, kod hatası değil; bu spec'ler bu
   makinede hiç geçemez. `07778e0` indikten sonra da kırmızı kaldı, dolayısıyla
   "uçuşan değişiklik" de değil. Etkilenen: `invoice-export-locale` (6),
   `invoice-write-path` (2), `invoice-export-real-record` (1),
   `invoice-foreign-currency-export` (4). **Öneri:** ya `.env`'e sekiz anahtar eklensin
   ya da bu spec'ler anahtarlar yoksa `test.skip` etsin — aksi hâlde kapı bu makinede
   kalıcı kırmızı kalır ve gerçek hataları gizler. Kapsamım dışı, dokunmadım.
2. **`m9-calendar-connect` ve `m9-ics-download`** e2e'leri de kırmızı (2). Sebebini
   ARAŞTIRMADIM — çalışma ağacında `src/lib/storage.ts` / `src/lib/auth.ts` başka bir
   ajan tarafından değiştirilmiş durumda. Kök nedeni bilmiyorum, tahmin de etmiyorum;
   yalnız bildiriyorum.
3. **`notfound-status` ve `plan-storefront`** (2) tam suite'te kırmızı ama **tek başına
   yeşil** (§2.4) → spec'ler arası paylaşılan DB durumu/tohum çekişmesi; altı ajanın aynı
   çalışma ağacında koştuğu bir ortamın gürültüsü, kod hatası değil.
4. **Marka-adı birim testleri** (4) `c7dab14`'te kırmızı — `4a33249`'un devam eden
   yeniden adlandırma işi (§2.3). Benim değil, dokunmadım.
5. **Kalan risk (bu kart):** `compareM6ToESRInternal` hâlâ `findUnique({ where: { id } })`
   ile arıyor, kiracıyı `where`'e koymuyor — sahiplik satırı çektikten *sonra*
   karşılaştırılıyor. Kiracı-kapsamlı tx altında RLS bunu zaten satır düzeyinde keser ve
   guard artık koşulsuz; yine de "önce çek sonra bak" deseni, `where`'e `tenantId`
   koymaktan bir kademe zayıftır. Kapsamı genişletmemek için bu kartta değiştirmedim.

## 6. Açık sorular

- `checkNoDuplicateScore`'a kiracı koşulu eklensin mi (yukarıdaki §4 notu)? Ayrı kart
  konusu; karar liderin.
- §5.4'teki "önce çek sonra karşılaştır" deseni `where`'e taşınsın mı? Aynı desen
  `validateEvaluationTenant` ve `validateReviewersTenant`'ta da var; toplu bir kart olur.

## 7. Sonraki adım

TASK-MTV5H4HCGGGQ5 (Seçenek B — `TenantScopedDb` → `TenantTx` birleştirme, string-öncelikli
aşırı yüklemelerin sökülmesi). Bu kartın `comparison.ts`'te bıraktığı iki aşırı yükleme o
kartta zaten sökülecek; §2.1'deki `@ts-expect-error` satırları o sökümden sonra da bir tip
hatasına oturmalı — o kartın en büyük riski budur, oraya taşıyorum.

## Platform beyanı

**macOS (Darwin 25.6.0, arm64) üzerinde doğrulandı.** Dokunulan kod yolu
(`comparison.ts` + vitest testi) saf TypeScript'tir: süreç öldürme, dosya yolu, kabuk/ikili
adı, kısayol metni, ekran/DPI ya da cihaz izni içermez; `assertTenantScope` bir tip ve dize
kontrolüdür. Bu nedenle Windows ve Linux'ta **koddan** aynı davranış beklenir — platforma
bağlı hiçbir dal yoktur. Windows ve Linux'ta **koşulamadı**: bu ofiste yalnız macOS
makinesi var; e2e ayağı Playwright/Chromium ve yerel Postgres gerektiriyor, ikisi de bu
makinede kurulu. Sessiz atlama yok — beyan budur.
