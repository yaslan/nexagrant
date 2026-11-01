# TASK-MTUH6YKP6OQAX — Fatura indirme hatalarının Türkçeye çevrilmesi

## 1) Ne yapıldı

`BillingClient.tsx`'teki XML/PDF indirme linkleri (`invoiceXml`/`invoicePdf`, eski satır ~711/717)
düz `<a href="/api/.../export?format=...">` idi — `fetch` yok, hata yakalama yok. Export
route'unun (`route.ts`) döndürdüğü 7 hata gövdesinin hiçbiri kullanıcıya Türkçe ulaşmıyordu;
tarayıcı ham JSON'u ya da İngilizce bir anahtarı doğrudan gösteriyordu. En riskli satır,
`supplier_identity_not_configured` (503) yanıtının `missing` dizisiyle ortam değişkeni adlarını
(`INVOICE_SUPPLIER_VKN` vb.) doğrudan müşteri ekranına sızdırmasıydı.

Yapılan değişiklikler (TASK-MTU64Y932HF96'daki envanter ve öncelik sırasına göre):

1. **`route.ts`** — `supplier_identity_not_configured` yanıtından `missing` alanı kaldırıldı.
   Ayrıntı artık yalnız `logger.error`'da kalıyor; yanıt gövdesi sadece `{ error: "supplier_identity_not_configured" }`.
2. **`BillingClient.tsx`** — indirme linkleri `fetch` tabanlı bir `handleInvoiceDownload`
   fonksiyonuna çevrildi:
   - Başarılı yanıt: XML için blob indirme (`<a download>` + `URL.createObjectURL`), PDF/HTML
     için yeni sekmede açma (popup engelleyiciyi atlatmak için pencere `fetch`'ten *önce*
     `window.open('', ...)` ile senkron açılıyor, sonra `location.href` ile dolduruluyor).
   - Başarısız yanıt (`res.ok === false`): gövdedeki `error` kodu `invoiceExportMessage()` ile
     yedi Türkçe/İngilizce anahtardan birine eşlenip toast olarak gösteriliyor; ham JSON/kod hiç
     render edilmiyor.
   - Ağ hatası / `fetch` reddi: jenerik "indirilemedi" mesajı.
   - Her buton kendi indirme sırasında devre dışı kalıp "Fatura hazırlanıyor..." yazıyor (çift
     tıklamayı engellemek için).
3. **`messages/tr.json` + `messages/en.json`** — `billingPanels.settings` altına 7 yeni anahtar
   eklendi: `invoiceDownloading`, `invoiceExportUnavailable`, `invoiceExportNotFound`,
   `invoiceExportUnsupportedFormat`, `invoiceExportUnauthorized`, `invoiceExportNoTenant`,
   `invoiceExportSystemError`, `invoiceExportGenericError`. Metinler PM'in TASK-MTU64Y932HF96
   raporundaki (§4) önerileriyle aynı.
4. **`tests/billing-settings-invoices.test.tsx`** — link testi buton testine çevrildi; iki yeni
   test eklendi: (a) tıklamanın doğru URL'e `fetch` çağrısı yaptığını doğrulayan, (b)
   `supplier_identity_not_configured` + `missing` dizisi döndüğünde ekranda ne ham hata kodunun
   ne de `INVOICE_SUPPLIER_VKN` gibi bir ortam değişkeni adının **hiç** görünmediğini, yalnız
   çevrilmiş Türkçe metnin göründüğünü doğrulayan test.

Kapsam dışı bırakılan (göreve göre dokunulmadı): `efatura-integrator.ts`'in
blocked/rejected/not_configured/provider_unsupported metinleri — bugün hiçbir route tarafından
çağrılmıyor (filing akışı bağlanmamış).

## 2) Kanıt

### i18n:check — iki katalog senkron, kullanılan her anahtar çözümleniyor
```
$ pnpm i18n:check
Summary:
  Static keys used in code: 1083
  Dynamic key patterns:     31
  Keys in messages/tr.json: 1436
  Keys in messages/en.json: 1436
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
```

### Hedefli lint — temiz
```
$ npx eslint "src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx" \
    "src/app/api/billing/invoices/[id]/export/route.ts" tests/billing-settings-invoices.test.tsx
(çıktı yok — hata/uyarı yok)
```

### Birim testleri (vitest, jsdom) — dokunduğum dosyaları da içeren tam koşu
```
$ pnpm test
 Test Files  5 failed | 132 passed | 2 skipped (139)
      Tests  6 failed | 1623 passed | 8 skipped (1637)
```
9/9 kendi test dosyam (`tests/billing-settings-invoices.test.tsx`) dahil olmak üzere **132 dosya
geçti**. Başarısız 5 dosya (`src/lib/rag.test.ts`, `tests/cordis-delta.test.ts`,
`tests/admin-upload-authz.test.ts`, `tests/rag-pdf-ingest-partial.test.ts`,
`src/modules/m2/server/actions.test.ts`) benim değişikliğimle ilgisiz — hepsi eksik
`@/lib/ai/rag` modülünden kaynaklanıyor (`pnpm typecheck` da aynı 4 dosyada `Cannot find module
'@/lib/ai/rag'` hatası veriyor); bu paylaşımlı çalışma ağacında başka bir ajanın işiyle ilgili
önceden var olan bir durum, faturalama koduna dokunmuyor. Kendi 3 dosyamda (`route.ts`,
`BillingClient.tsx`, `messages/*.json`) typecheck hatası yok.

Yeni testlerin ayrıntılı çıktısı:
```
$ pnpm vitest run tests/billing-settings-invoices.test.tsx
 Test Files  1 passed (1)
      Tests  9 passed (9)
```
İçlerinden ikisi doğrudan bu görevi doğruluyor:
- "fetches the export route rather than navigating to it directly" — tıklamanın
  `/api/billing/invoices/FB-2026-000001/export?format=xml`'e `fetch` çağrısı yaptığını,
  navigasyon değil gerçek bir istek olduğunu doğruluyor.
- "shows a translated toast instead of the raw error code on a failed export" —
  `supplier_identity_not_configured` + `missing: ["INVOICE_SUPPLIER_VKN"]` döndüğünde ekranda
  `invoiceExportUnavailable` Türkçe metninin göründüğünü, `INVOICE_SUPPLIER_VKN` ve
  `supplier_identity_not_configured` dizgilerinin **hiçbir yerde** geçmediğini doğruluyor.

Gerçek tarayıcı e2e (`pnpm test:e2e`) ve `pnpm dev` görev talimatıyla açıkça yasaklandığı için
koşulmadı; en yakın gerçek-etkileşim kanıtı jsdom üzerinden gerçek tıklama → gerçek `fetch` mock →
gerçek DOM render zinciridir (yukarıdaki testler).

## 3) Değişen dosyalar
- `src/app/api/billing/invoices/[id]/export/route.ts` — `missing` alanı yanıt gövdesinden kaldırıldı.
- `src/app/[locale]/(app)/[workspace]/settings/billing/BillingClient.tsx` — indirme linkleri `fetch`+hata-eşleme akışına çevrildi.
- `messages/tr.json`, `messages/en.json` — 8 yeni `billingPanels.settings.invoiceExport*` / `invoiceDownloading` anahtarı.
- `tests/billing-settings-invoices.test.tsx` — link testi buton testine çevrildi + 2 yeni test.

Commit atılmadı (görev talimatı: "Commit ATMA — çalışma ağacında senin önceki iki kartının
commit edilmemiş değişiklikleri duruyor"). `messages/tr.json`/`en.json`'da benim eklerimin
üstünde/altında başka bir ajanın (muhtemelen admin-settings görevi) commit edilmemiş `adminSettings`
bloğu duruyor — dokunmadım, `git diff` ile kendi eklerimin onunla çakışmadığını doğruladım.

## 4) Riskler
- **PDF/HTML için popup engelleme:** `window.open('', '_blank', ...)` çağrısı `fetch`'ten önce
  senkron yapılıyor (tıklamaya bağlı kalması için), sonra `location.href` ile dolduruluyor. Bu
  yaygın bir tarayıcı-uyumlu kalıp ama tarayıcı popup ayarlarına göre gerçek davranışı yalnız
  gerçek bir tarayıcıda doğrulanabilir — jsdom `window.open`'ı "Not implemented" olarak loglayıp
  `undefined` döndürüyor, testler bunu güvenle idare ediyor (`previewWindow?.close()` /
  `if (previewWindow)` kontrolleri) ama gerçek popup-engelleme senaryosunu simüle etmiyor.
- `unsupported_format` (400) yanıtındaki `supported: ["xml","pdf","html"]` alanına dokunulmadı —
  PM envanterinde "orta risk" olarak işaretlenmişti ama en yüksek öncelikli madde (`missing`
  dizisi) değildi ve dahili format listesi VKN/env adı gibi hassas değil; kapsam dışı bırakıldı.
- `route.ts`'teki diğer 500/404/401/403 gövdeleri hâlâ İngilizce hata kodu taşıyor (istemli —
  operatör/log tarafı için okunabilir kalmalı) ama artık müşteri tarafında hiç görünmüyor, çünkü
  hepsi `invoiceExportMessage()` üzerinden çevriliyor.

## 5) Açık sorular
- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`'deki karar netleşince
  `foreignCurrencyFilingBlock` metninin kullanıcıya mı yoksa yalnız operatöre mi gösterileceği
  hâlâ açık (bu görevin kapsamı dışında, PM envanterinden taşındı).
- Gerçek tarayıcıda popup-engelleme davranışı manuel/e2e ile ayrıca doğrulanmalı (bkz. Riskler).

## 6) Sonraki adım
Yok — bu kartın kapsamı tamamlandı. Filing (GİB'e gönderme) akışı bağlandığında
`efatura-integrator.ts`'teki outcome mesajları için ayrı bir envanter/görev gerekecek (PM'in
notu, TASK-MTU64Y932HF96 §3).

## Platform beyanı
Mac (darwin) üzerinde doğrulandı: `pnpm i18n:check`, hedefli `eslint`, ve `pnpm test`
(vitest + jsdom) bu ortamda koşuldu ve yukarıdaki sonuçları verdi. Görev talimatı `pnpm dev` ve
`pnpm test:e2e` çalıştırmayı yasakladığı için gerçek bir tarayıcıda (Windows/Linux dahil hiçbir
platformda) tıklama testi yapılmadı — jsdom, dosya yolu/kabuk/izin gibi platforma bağlı hiçbir şey
içermiyor (saf tarayıcı DOM API taklidi: `fetch`, `Blob`, `URL.createObjectURL`, `window.open`),
dolayısıyla bu değişikliğin Windows/Linux'ta farklı davranmasını gerektiren bir kod yolu yok —
tek platforma bağlı risk, yukarıda not edilen gerçek tarayıcı popup-engelleme davranışıdır ve o
tüm masaüstü tarayıcılarda (işletim sisteminden bağımsız, tarayıcının kendi ayarına bağlı) aynı
şekilde çalışır.
