# TASK-MTRJSOWFH6B45 — e-Fatura env'leri + GİB entegratörü (canlı DEĞİL)

**Ajan:** blog-yazar · **Tarih:** 2026-09-07 · **Branch:** dev

> **"Entegrasyon canlı" demiyorum.** Fabrika'nın özel entegratör sözleşmesi yok,
> gerçek anahtar üretmedim, hiçbir belge GİB'e gönderilmiyor.

## 1. Ne yapıldı

### Önce ölçtüm — kartın (a) ve (c) maddeleri ZATEN bitmiş

| Kart maddesi | Ölçüm | Sonuç |
|---|---|---|
| (a) 5 tedarikçi env'ini `src/lib/env.ts`'e adıyla ekle | `INVOICE_SUPPLIER_NAME/_VKN/_TAX_OFFICE/_ADDRESS/_CITY` (+ opsiyonel `_COUNTRY`, `_EMAIL`) zaten şemada, hepsi opsiyonel | **Zaten yapılmış** (TASK-MTRD9QBJ2G32E) |
| (c) Eksik env'de çökmediğini kanıtla | `.env`'de beş değişkenin **hiçbiri set değil**; dev sunucu `/tr` → `200`, panel açılıyor; export rotası `503 supplier_identity_not_configured` + eksik değişken adları | **Zaten doğru**, ölçümle teyit ettim |
| (b) Entegratör arayüzü + hata yolları | Repoda **hiç yoktu** | **Yapıldı** |
| (d) Patronun dolduracağı tek tablo | Yalnız bir ajan raporunun içinde vardı (`docs/agent-results/…`), operasyon dokümanı yoktu | **Yapıldı** |

### (b) Entegratör arayüzü — `src/lib/efatura-integrator.ts` (yeni)

Türkiye'de GİB'e doğrudan gönderim yok; lisanslı bir **özel entegratör**
üzerinden yapılır, kimlik bilgilerini o verir, zarf numarasını (`gibEnvelopeId`)
o döndürür. Modül bu boşluğu **görünür** kılıyor:

- `readIntegratorConfig()` — **asla fırlatmaz**; eksik olanları adıyla sayar.
  Boş string set-değil sayılır (yarım `.env` yarım yapılandırma olamaz).
- `fileInvoice()` — sonucu **değer olarak** döndürür, istisna değil:
  `not_configured` (eksik değişkenler adıyla) · `provider_unsupported` (kimlik
  var, o satıcının adaptörü yok) · `rejected` (entegratör reddetti) ·
  `unreachable` (ulaşılamadı/anlaşılmadı) · `filed` (**tek** başarı, zarf
  numarasıyla).
- `ADAPTERS` sözlüğü **bilerek boş**. Bir stub'ın `filed` dönmesi, `efatura.ts`
  içindeki `isFiledWithGib()`'in belgeden "mali değeri yoktur" damgasını
  kaldırmasına yol açardı — yani hiç gönderilmemiş bir kâğıt kendini mühürlü
  sanardı. Kalan iş tam olarak budur.
- `isFiled()` boş/boşluklu zarf numarasını gönderim saymaz.

Env şemasına eklenen 5 değişken (hepsi **opsiyonel** — eksikse uygulama düşmez):
`EFATURA_INTEGRATOR_PROVIDER`, `_BASE_URL`, `_USERNAME`, `_PASSWORD`,
`_TEST_MODE` (varsayılan: satıcının test ortamı; canlıya yalnız açıkça `false`
yazılınca geçilir).

### (d) `docs/EFATURA_SETUP.md` (yeni)

Patronun dolduracağı **tek tablo**: 12 değişken × (nereden alınır · örnek biçim ·
zorunlu mu). Ayrıca "satıcı kimliği" ile "entegratör" ayrımı ve her birinin
eksikken ne olduğu. `docs/DATA_MODEL.md` ve `docs/BILLING.md` bu dosyaya işaret
ediyor.

## 2. Kanıt

```
$ npx vitest run tests/efatura-integrator.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Testlerin çivilediği davranışlar: eksik değişkenler **adıyla** raporlanır ·
boş string set-değildir · `testMode` varsayılanı test ortamıdır · yapılandırma
yokken sonuç `not_configured` ve `isFiled` **false** · adaptörü olmayan satıcı
`provider_unsupported` (uydurma başarı yok) · adaptörün fırlattığı hata
`unreachable`'a dönüşür, çökme olmaz · boş zarf numarası gönderim sayılmaz ·
**tüm e-Fatura değişkenleri silinmişken `@/lib/env` sorunsuz parse eder**.

Ortamın gerçek hâli (çökmediğinin ölçümü):

```
$ node -e "…" ; # .env okundu
INVOICE_SUPPLIER_NAME unset
INVOICE_SUPPLIER_VKN unset
INVOICE_SUPPLIER_TAX_OFFICE unset
INVOICE_SUPPLIER_ADDRESS unset
INVOICE_SUPPLIER_CITY unset
EFATURA_INTEGRATOR_PROVIDER unset

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/tr
200
```

Mevcut export rotası regresyona uğramadı:

```
$ npx playwright test tests/e2e/invoice-export-real-record.spec.ts --reporter=line
  5 passed (1.4s)
```

Kapı: `npx tsc --noEmit` benim dosyalarımda temiz; `npx eslint src/lib/env.ts
src/lib/efatura-integrator.ts tests/efatura-integrator.test.ts` çıktı vermedi.

## 3. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `src/lib/efatura-integrator.ts` | **yeni** — entegratör arayüzü, yapılandırma okuma, 5 sonuç tipi, boş `ADAPTERS` |
| `src/lib/env.ts` | 5 `EFATURA_INTEGRATOR_*` değişkeni (opsiyonel) |
| `tests/efatura-integrator.test.ts` | **yeni** — 9 test |
| `docs/EFATURA_SETUP.md` | **yeni** — patronun dolduracağı tek tablo |
| `docs/DATA_MODEL.md` | `Invoice` bölümüne entegratör paragrafı + doküman işareti |
| `docs/BILLING.md` | "e-fatura faz 2" satırına "canlı değil" + doküman işareti |

## 4. Riskler

- **Bu kart gerçek anahtar olmadan kapanamaz.** Beş tedarikçi + dört entegratör
  değişkeni dolmadan tek bir belge bile GİB'e gitmez. Anahtar üretmedim, üretilmez.
- Kimlik bilgileri dolsa **bile** gönderim olmaz: o satıcının API'sine adaptör
  yazılması gerekiyor (`ADAPTERS` boş → `provider_unsupported`). Bu bilinçli.
- `EFATURA_INTEGRATOR_PASSWORD` bir sırdır; dokümanda repoya yazılmaması açıkça
  belirtildi, `.env.example`'a örnek değer koymadım.
- **Benim değil, bildiriyorum:** `tests/m11-partb-editor-buffer.test.tsx` kırmızı
  (`src/modules/m11/ui/PartBCollaborativeEditor.tsx:114`, blockzincir-pm'de uçuşta);
  `tests/gdpr-data-subject.live.test.ts:41,182,249,317` typecheck hatası veriyor.

## 5. Açık sorular

- Hangi özel entegratörle sözleşme yapılacak? Adaptörün şekli (SOAP/REST, zarf
  yaşam döngüsü, durum sorgulama) tamamen buna bağlı.
- Gönderim ne zaman tetiklenecek: fatura kesilir kesilmez mi, gecelik toplu iş mi?
- e-Arşiv (mükellef olmayan alıcı) ile e-Fatura ayrımını kim belirleyecek —
  alıcının GİB mükellef sorgusu da entegratörden gelir.

## 6. Sonraki adım

1. Patron `docs/EFATURA_SETUP.md` tablosunu doldursun (önce satıcı kimliği:
   belge üretimi hemen açılır).
2. Entegratör seçildikten sonra `ADAPTERS` içine tek satıcı adaptörü + zarf
   numarasını `Invoice.gibEnvelopeId`'ye yazan yol.
