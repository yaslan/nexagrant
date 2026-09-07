# TASK-MTRD9QBJ2G32E — Uygulama canlı bir rotadan uydurma resmî Türk e-Faturası üretiyordu

**Ajan:** blok-zincir-denet-i · **Tarih:** 2026-09-07 · **Deneme:** 3 (bitiren)
**Patron kararı:** ŞIK (a) — belge GERÇEK kayıttan üretilir; kayıt yok / başka kiracı → 404;
tedarikçi kimliği `src/lib/env.ts`'ten; gerçek VKN uydurulmaz; rota kapatılmaz, DEMO damgası
çözüm olarak seçilmedi.

---

## 1. Kusur — ölçüldü, tahmin edilmedi

`GET /api/billing/invoices/[id]/export` **oturum aramıyordu ve id'ye bakmıyordu**. Herhangi
bir id ile, çerezsiz, `200` ve indirilebilir bir Türk e-Faturası dönüyordu. Belgedeki her şey
rota dosyasına gömülü sabitti.

Düzeltme öncesi ölçüm (`docs/agent-results/TASK-MTRD9QBJ2G32E-screenshots/before-curl.txt`):

```
$ curl -si "http://localhost:3300/api/billing/invoices/TOTALLY-MADE-UP-ID/export?format=xml"
HTTP/1.1 200 OK
content-disposition: attachment; filename="TOTALLY-MADE-UP-ID_UBL_TR.xml"
content-type: application/xml; charset=utf-8

  <cbc:ID>TOTALLY-MADE-UP-ID</cbc:ID>
  <cbc:UUID>c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f</cbc:UUID>
  <cbc:ID schemeID="VKN">3810459281</cbc:ID>
```

Ve belgenin altında, her çıktıda, koşulsuz:

```
İşbu fatura 213 sayılı Vergi Usul Kanunu ve Gelir İdaresi Başkanlığı e-Fatura mevzuatına
uygun olarak elektronik ortamda üretilmiş ve mali mühür ile onaylanmıştır.
```

Kare: `01-before-fabricated-efatura-anonymous.png` — oturumsuz bir tarayıcının gördüğü belge.

**En ağır kısım bu cümleydi.** Uydurma VKN'ler kimseye ait değil (üçü de GİB sağlama
toplamından geçmiyor — `validateVKN('3810459281') === false`), ama uygulama kimsenin
göndermediği bir belgenin **mali mühürle onaylandığını** yazıyordu.

### (a) Uydurma mali veri noktalarının tam listesi (grep, dosya + satır)

`grep -rn -E "efatura|Efatura|vknTckn|GİB|TICARIFATURA" src/` — bulunanlar ve akıbetleri:

| Dosya:satır (düzeltme öncesi) | Ne | Akıbet |
|---|---|---|
| `route.ts:19` | `uuid: 'c8f3b4a1-7d2e-4b9c-8a1f-3e5d7c9b0a2f'` sabit ETTN | **kaldırıldı** → `Invoice.ettn` |
| `route.ts:27` | `vknTckn: '3810459281'` tedarikçi VKN | **kaldırıldı** → `INVOICE_SUPPLIER_VKN` |
| `route.ts:28` | `taxOffice: 'Maslak Vergi Dairesi'` | **kaldırıldı** → `INVOICE_SUPPLIER_TAX_OFFICE` |
| `route.ts:26,29,30,31` | tedarikçi unvan/adres/şehir/ülke | **kaldırıldı** → env |
| `route.ts:33` | `isEfaturaUser: true` (mükellefiyet iddiası) | **kaldırıldı**, hiç yazılmıyor |
| `route.ts:37` | `vknTckn: '3880194821'` alıcı VKN | **kaldırıldı** → `Invoice.buyerVknTckn` |
| `route.ts:36,38-42` | alıcı unvan/vergi dairesi/adres | **kaldırıldı** → `Invoice.buyer*` |
| `route.ts:45-60` | ₺21.500 + ₺5.350 uydurma kalemler | **kaldırıldı** → `Invoice.lines` |
| `route.ts:20-22` | `issueDate/issueTime/profileId` sabitleri | **kaldırıldı** → kayıttan |
| `efatura.ts:~400` | koşulsuz "mali mühür ile onaylanmıştır" | **koşullu**: yalnız `gibEnvelopeId` varsa |
| `efatura.ts:260` | `Resmî GİB Onaylı ... Şablonu` yorumu | **düzeltildi** — şablon onay taşımaz |
| `BillingClient.tsx:78,85` | `GIB202600000001/14` demo satırları | **dokunulmadı** — kapsam dışı, §6'da bildirildi |

`src/lib/adapters/*` içindeki `OPEN_ELIGIBILITY` / `TUBITAK_ELIGIBILITY` eşleşmeleri grep
gürültüsüdür (mali veri değil).

### (b) Bu indirmeye hangi ekrandan gidiliyordu

Gerçek tarayıcıda ölçüldü (`04-billing-screen-invoice-section.png`): Ayarlar →
Faturalandırma ekranı. Sayfada **`a[href*="/api/billing/invoices/"]` sayısı = 0** — indirme
bağlantıları bu görevin 1. denemesinde (commit `065c419`) kaldırılmıştı. Yani ekran bugün
yalan söylemiyor; **rota ise açık kalmış ve yalan söylemeye devam ediyordu**. Kusuru ayakta
tutan da buydu: UI düzeltildi, üreteç düzeltilmedi.

---

## 2. Düzeltme — ŞIK (a)

**Yeni `Invoice` tablosu** (`prisma/schema.prisma`, `prisma/migrations/add-invoice.sql`).
Fatura hiçbir yerde tutulmuyordu; "gerçek kayıttan üret" kararının önce bir kayda ihtiyacı
vardı. Alıcının mali kimliği kesim anında satıra fotoğraflanır (kiracı adını değiştirdikten
sonra da fatura kime kesildiğini söylemek zorundadır). Tutarlar minor unit (kural 9),
`issuedAt` UTC (kural 10). Ayrıntı: `docs/DATA_MODEL.md` §11.

**Rota** (`route.ts`) artık tek satır okur:
`oturum yok → 401` · `kiracısız oturum → 403` · `bu kiracıda yok → 404` · `tedarikçi ayarı
eksik → 503 (eksik değişkenler adıyla)` · `desteklenmeyen format → 400`.
Sorgu `withTenant()` içinde koşar, yani `where.tenantId`'nin arkasında ikinci kilit olarak
`Invoice` üzerindeki RLS politikası durur.

**Saf eşleyici** (`export/invoice-document.ts`): satır + yapılandırma → belge. Hiçbir tarafın
hiçbir alanı uydurulmaz; eksik ayar hata verir ve **adını söyler**; minor→majör çevrim tek
yerde yapılır.

**Üreteç** (`src/lib/efatura.ts`): `EfaturaDocument.gibEnvelopeId` eklendi. GİB'in gerçekten
döndürdüğü zarf kimliği yoksa hem XML'e `<cbc:Note>` hem yazdırılabilir sayfaya (yazdırmada
da kalan, `.no-print` dışında) kırmızı bant basılır: *"ÖRNEK BELGE — GİB'e gönderilmemiştir,
mali mühür taşımaz ve mali değeri yoktur."* Mühür cümlesi yalnız zarf kimliği varsa yazılır
ve kimliği kendisi anar. Bu, ŞIK (a)'nın yerine geçen bir "DEMO damgası" değildir; belgenin
**doğru olmayan bir hukuki iddiada bulunmasını** engelleyen ayrı bir kuraldır: gerçek bir
kayıttan üretilen bir belge de gönderilmemişse mühür iddia edemez.

---

## 3. Kanıt

### (a) Migration gerçekten uygulandı

```
TABLE: [{"table_name":"Invoice"}]
COLUMNS: id, tenantId, number, issuedAt, currency, buyerName, buyerVknTckn,
         buyerTaxOffice, buyerAddress, buyerCity, buyerCountry, lines(jsonb),
         profileId, invoiceType, ettn, gibEnvelopeId, createdAt
RLS_POLICY: [{"polname":"tenant_isolation","relrowsecurity":true,"relforcerowsecurity":true}]
```

### (b) RLS — beyan + canlı ölçüm (`rls-output.txt`)

```
$ pnpm db:rls
✅ prisma/rls.sql applied. Policies in public: 43 → 43

$ pnpm rls:check
Found 40 tenant-scoped models requiring RLS policies:
... Invitation, Invoice, LifetimeLicence, ...
✅ SUCCESS: All 40 tenant-scoped models have RLS policies registered.

$ pnpm rls:verify
Kiracıya özel model: 40 · RLS açık tablo: 43 · tenant_isolation politikası: 40
✅ Veritabanı 40 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

### (c) Üç senaryo — `curl -i` (tam çıktı: `after-curl.txt`)

Tedarikçi kimliği **yapılandırılmış** sunucuya karşı, 2026-09-07T17:43:21Z:

```
### 1) var olan fatura + DOĞRU kiracı → 200
HTTP/1.1 200 OK
cache-control: private, no-store
content-disposition: attachment; filename="FB-MTRD9QBJ2G32E-A-0001_UBL_TR.xml"
content-type: application/xml; charset=utf-8

### 2) OLMAYAN id → 404
HTTP/1.1 404 Not Found
{"error":"invoice_not_found"}

### 3) BAŞKA KİRACININ id'si (kiracı sızıntısı testi) → 404
HTTP/1.1 404 Not Found
{"error":"invoice_not_found"}

### 4) OTURUMSUZ, uydurma id (ÖNCE: 200 + uydurma e-Fatura) → 401
HTTP/1.1 401 Unauthorized
{"error":"unauthorized"}

### 5) desteklenmeyen format → 400
{"error":"unsupported_format","supported":["xml","pdf","html"]}
```

Kiracı sızıntısı testi anlamlıdır: A kiracısı **geçerli bir oturum** ve **gerçekten var olan
bir fatura numarası** ile sorar; numara yalnızca onun değildir. 404'ten başka her cevap
satırın varlığını doğrulardı.

200 gövdesi gerçekten kayıttan geliyor:

```
  <cbc:ID>FB-MTRD9QBJ2G32E-A-0001</cbc:ID>
  <cbc:UUID>dd97ae62-dda9-4cc5-8aef-3001ba0a3791</cbc:UUID>   ← DB satırındaki ETTN ile aynı
  <cbc:Note>ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.</cbc:Note>
  <cbc:ID schemeID="VKN">1000000000</cbc:ID>                  ← env'den, koddan değil
  <cbc:PriceAmount currencyID="TRY">2500.00</cbc:PriceAmount>  ← satırdaki 250000 minor unit
```

Emekli edilen sabitlerin hiçbiri gövdede yok: `3810459281` yok · `3880194821` yok ·
`Maslak Vergi Dairesi` yok · `c8f3b4a1-…` yok · `FonBridge Teknoloji` yok ·
`mali mühür ile onaylanmıştır` yok.

Aynı sunucu, tedarikçi kimliği **yapılandırılmamışken** (deponun gerçek hâli), 17:46:20Z —
belge üretilmez, eksik ayarlar adıyla sayılır:

```
HTTP/1.1 503 Service Unavailable
{"error":"supplier_identity_not_configured","missing":["INVOICE_SUPPLIER_NAME",
 "INVOICE_SUPPLIER_VKN","INVOICE_SUPPLIER_TAX_OFFICE","INVOICE_SUPPLIER_ADDRESS",
 "INVOICE_SUPPLIER_CITY"]}
```

### (d) e2e — `tests/e2e/invoice-export-real-record.spec.ts`

```
Running 5 tests using 1 worker
  ✓ an anonymous caller gets no document at all
  ✓ an id that exists nowhere is 404, not an invented invoice
  ✓ another tenant’s invoice is 404 — the same answer as one that does not exist
  ✓ an unsupported format is refused before anything is read
  ✓ the tenant’s own invoice renders that row, and nothing invented
  5 passed
```

**Her iki yapılandırmada da koşuldu ve geçti** (tedarikçi ayarlı → 200 dalı; ayarsız → 503
dalı). Test gevşetilmedi: "uydurma sabit yok" iddiası her iki dalda da çalışır, çünkü uydurma
bir belge iki dalı da düşürürdü.

Birim testler (`tests/invoice-document.test.ts`, 11 test): eksik/boşluklu ayar adıyla hata
verir · belge satırı birebir yansıtır · okunamayan `lines` boş fatura değil hatadır · zarf
kimliği yokken iki çıktı da "mali değeri yoktur" der · damga `.no-print` dışındadır (yazdırma
onu kaybedemez) · zarf kimliği varken uyum cümlesi serbesttir ve kimliği anar.

### (e) Gerçek tarayıcı kareleri — `docs/agent-results/TASK-MTRD9QBJ2G32E-screenshots/`

| Kare | Ne gösteriyor |
|---|---|
| `01-before-fabricated-efatura-anonymous.png` | ÖNCE: oturumsuz çağrının aldığı uydurma e-Fatura — VKN 3810459281, Maslak V.D., ₺32.220, "mali mühür ile onaylanmıştır" |
| `02-after-anonymous-401.png` | SONRA: **aynı URL**, `HTTP 401 {"error":"unauthorized"}` (2026-09-07T17:45:47Z) |
| `03-after-real-record-html.png` | SONRA: gerçek `Invoice` satırından üretilen belge — kırmızı "mali değeri yoktur" bandı, satırdaki alıcı, env'den tedarikçi |
| `04-billing-screen-invoice-section.png` | Faturalandırma ekranı: iki "Demo örnek" satırı, indirme sütununda bağlantı yok (ölçüm: 0 bağlantı) |
| `05-download-flow-result.png` | İndirme akışının kendisi: oturum açmış kullanıcı, kendi kiracısının gerçek faturası → 200, damgalı belge |

### (g) `pnpm gate` (tam çıktı: `gate-output.txt`)

```
$ eslint      → ✖ 84 problems (0 errors, 84 warnings)      # 84'ü de önceden var
$ tsc --noEmit → temiz
$ vitest run   → Test Files 74 passed | 2 skipped (76)
                 Tests      788 passed | 8 skipped (796)
$ check-rls     → ✅ All 40 tenant-scoped models have RLS policies registered.
$ check-rls-live→ ✅ Veritabanı 40 kiracıya özel tablonun tamamında izolasyonu uyguluyor.
```

---

## 4. GO-LIVE'da doldurulacak ayarlar

Hiçbirinin varsayılanı yok; eksikken rota `503` döner ve belge **üretmez**. Değerler
gerçek şirket kaydından gelmeli — uydurulmadı, boş bırakıldı.

| Değişken | Ne | Zorunlu |
|---|---|---|
| `INVOICE_SUPPLIER_NAME` | Fabrika'nın ticaret sicilindeki tam unvanı | evet |
| `INVOICE_SUPPLIER_VKN` | Gerçek 10 haneli VKN | evet |
| `INVOICE_SUPPLIER_TAX_OFFICE` | Bağlı olunan vergi dairesi | evet |
| `INVOICE_SUPPLIER_ADDRESS` | Sicildeki adres | evet |
| `INVOICE_SUPPLIER_CITY` | Şehir | evet |
| `INVOICE_SUPPLIER_COUNTRY` | Varsayılan `Türkiye` | hayır |
| `INVOICE_SUPPLIER_EMAIL` | Muhasebe e-postası (UBL-TR zorunlu kılmaz) | hayır |

Ayrıca: **hiçbir şey henüz `Invoice` satırı yazmıyor** ve **hiçbir şey GİB'e göndermiyor**.
`gibEnvelopeId` bugün her satırda `NULL`, yani her belge "mali değeri yoktur" damgası taşır.
Bu doğrudur ve go-live'da entegratör bağlanana kadar öyle kalmalıdır.

---

## 5. Dokunulan dosyalar

```
prisma/schema.prisma                                     (+30)  Invoice modeli + Tenant ilişkisi
prisma/rls.sql                                           (+1/-1) Invoice → tenant_isolation
prisma/migrations/add-invoice.sql                        (yeni)
prisma/migrations/add-invoice.down.sql                   (yeni)
src/lib/env.ts                                           (+20)  INVOICE_SUPPLIER_*
src/lib/efatura.ts                                       (+56/-8) gibEnvelopeId, UNFILED_NOTICE, koşullu mühür
src/app/api/billing/invoices/[id]/export/route.ts        (yeniden yazıldı)
src/app/api/billing/invoices/[id]/export/invoice-document.ts (yeni) saf eşleyici
tests/invoice-document.test.ts                           (yeni) 11 birim testi
tests/e2e/invoice-export-real-record.spec.ts             (yeni) 5 e2e
docs/DATA_MODEL.md                                       (+§11)
```

DOKUNULMADI: `src/lib/modules/**`, `src/lib/billing/catalog.ts`, `messages/*.json`,
`src/modules/**`, `src/lib/billing/price-lock.ts`, checkout/yenileme akışı.
Geçici dosyalar (`.tmp-dbcheck.ts`, `.tmp-fixture.ts`, `.tmp-migrate.ts` ve iki geçici spec)
silindi; test için açılan iki kiracı ve iki fatura satırı da temizlendi
(`REMAINING_INVOICE_ROWS=0`).

---

## 6. Açık sorular — yolun üstünde görülüp DÜZELTİLMEYENLER

1. **Faturalandırma ekranı gerçek `Invoice` satırlarına bağlı değil.**
   `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx:76-92` —
   `DEMO_INVOICES` sabit dizisi (`GIB202600000001`, `GIB202600000014`) hâlâ ekranda.
   Satırlar "Demo örnek" rozetli ve indirme bağlantısı yok, yani ekran yalan söylemiyor;
   ama artık **gerçek fatura kesilebilen bir rota var** ve ekran ondan haberdar değil.
   Bağlamak boş-durum metni için yeni i18n anahtarı gerektiriyor, `messages/*.json` bu
   görevin kapsamı dışındaydı. **Ayrı kart gerekiyor.**

2. **`Invoice` satırını yazan hiçbir kod yok.** Ne Stripe webhook'u ne checkout bir fatura
   kaydı oluşturuyor. Rota bugün her gerçek kiracıya 404 döner — bu **doğru** cevaptır
   (kesilmemiş fatura indirilmez), ama faturalama özelliği ancak satırı yazan kod gelince
   çalışır. `LifetimeLicence`'ın webhook'a bağlandığı yer örnek alınabilir.

3. **`/tr` (ana sayfa) 500 veriyor.** `src/app/[locale]/admin/blog/actions.ts:30,32` ve
   `client.tsx:51,52,78` `https://images.unsplash.com/...` adreslerini `next/image`'a
   veriyor; `next.config.ts` içinde `images.remotePatterns` **hiç yok**, bu yüzden
   `Invalid src prop ... hostname "images.unsplash.com" is not configured`. Playwright'in
   hazırlık yoklaması da bu yüzden düşüyor. Kapsamım dışı — düzeltmedim.

4. **`pnpm dev`'in i18n ön kontrolü sessizce düşüyor:** `⚠️ Could not run i18n check:
   Command failed: tsx scripts/i18n-check.ts`. Her açılışta uyarı basıyor ama kimse
   bakmıyor; `pnpm i18n:check` ayrı olarak koşulmadıkça i18n boşlukları görülmüyor.

5. **`Invoice.buyerVknTckn` doğrulanmıyor.** Şema serbest metin kabul ediyor; `validateVKN` /
   `validateTCKN` `src/lib/efatura.ts`'te hazır duruyor ama satır yazılırken çağrılmıyor.
   Satırı yazan kod (madde 2) geldiğinde bu doğrulama oraya konmalı — DB'ye geçersiz bir
   VKN girerse belge onu olduğu gibi basar.

---

## 7. Teslim notu — commit nerede

Bu kartın 11 kaynak dosyası ve kanıtları, ben `git add` etmeden önce **başka ajanların geniş
`git add`'ine kapıldı** ve şu commit'lere girdi:

- `7a40d72 fix(m5): harmonize G0 gate rules …` — `prisma/schema.prisma`, `prisma/rls.sql`,
  `add-invoice.sql(.down)`, `src/lib/env.ts`, `src/lib/efatura.ts`, `route.ts`,
  `invoice-document.ts`, iki test dosyası, `docs/DATA_MODEL.md`
- `c8abb64 docs(memory): stale board status …` — bu rapor ve tüm kareler

Doğrulandı: **11 dosyanın 11'i de HEAD'de, test ettiğim hâliyle bayt bayt aynı**
(`git diff HEAD -- <dosya>` her biri için 0 satır). Yani iş eksiksiz indi, yalnız commit
mesajı yanlış kartın adını taşıyor. Paylaşılan geçmişi yeniden yazmadım — başka ajanlar aynı
ağaçta çalışıyor ve rebase onların işini bozardı.

Bu, `.agentspace/memory/shared/fabrika-parallel-agent-file-race.md`'de yazılı riskin
gerçekleşmiş hâlidir: `git add -A` / `git commit -a` bu depoda başkasının işini yutuyor.
