# e-Fatura yapılandırması — doldurulacak ortam değişkenleri

**Durum: e-Fatura entegrasyonu CANLI DEĞİL.** Fabrika'nın bir özel entegratör
sözleşmesi yok; bugüne kadar hiçbir belge GİB'e gönderilmedi. Aşağıdaki
değişkenler doldurulana kadar uygulama çalışmaya devam eder — sadece fatura
üretimi ve gönderimi kapalı kalır ve bunu açıkça söyler.

İki ayrı şey var, karıştırmayın:

| | Ne yapar | Olmadan ne olur |
|---|---|---|
| **Satıcı kimliği** (`INVOICE_SUPPLIER_*`) | Faturanın üzerindeki "kimden" bilgisi | Fatura **belgesi üretilmez**: `/api/billing/invoices/<no>/export` → `503 supplier_identity_not_configured` (eksik değişkenlerin adıyla) |
| **Entegratör** (`EFATURA_INTEGRATOR_*`) | Belgeyi GİB'e ileten lisanslı aracı | Belge üretilir ama **GİB'e gönderilmez**; üzerinde "ÖRNEK BELGE — mali değeri yoktur" damgası kalır |

Kural (patron kararı): belge yalnızca gerçek `Invoice` kaydından üretilir, kayıt
yoksa `404`. Sahte belge üretilmez, uydurma VKN yazılmaz.

## Doldurulacak tablo

| Değişken | Nereden alınır | Örnek biçim | Zorunlu |
|---|---|---|---|
| `INVOICE_SUPPLIER_NAME` | Ticaret sicilindeki tam unvan | `Fabrika Yazılım A.Ş.` | evet |
| `INVOICE_SUPPLIER_VKN` | Vergi levhası — 10 haneli VKN | `1234567890` | evet |
| `INVOICE_SUPPLIER_TAX_OFFICE` | Vergi levhası — bağlı olunan vergi dairesi | `Doğanbey V.D.` | evet |
| `INVOICE_SUPPLIER_ADDRESS` | Sicildeki merkez adresi (sokak/no) | `Kızılırmak Mah. 1450. Cad. No:3` | evet |
| `INVOICE_SUPPLIER_CITY` | Merkez adresin ili | `Ankara` | evet |
| `INVOICE_SUPPLIER_COUNTRY` | Ülke | `Türkiye` (boşsa varsayılan) | hayır |
| `INVOICE_SUPPLIER_EMAIL` | Muhasebe e-postası (UBL-TR zorunlu kılmaz) | `muhasebe@ornek.com` | hayır |
| `EFATURA_INTEGRATOR_PROVIDER` | Sözleşme yapılan özel entegratörün adı | `uyumsoft` | evet* |
| `EFATURA_INTEGRATOR_BASE_URL` | Entegratörün verdiği API adresi (test/canlı ayrı) | `https://efatura-test.ornek.com` | evet* |
| `EFATURA_INTEGRATOR_USERNAME` | Entegratörün açtığı API kullanıcısı | `fabrika_api` | evet* |
| `EFATURA_INTEGRATOR_PASSWORD` | Aynı hesabın parolası/anahtarı — **repoya yazılmaz**, sır yöneticisine | `••••••••` | evet* |
| `EFATURA_INTEGRATOR_TEST_MODE` | Canlıya geçerken `false` yapılır | `false` | hayır (varsayılan: test) |

\* Yalnızca GİB'e gönderim için zorunlu. Dördü birden dolmadan gönderim
denenmez; eksik olan(lar) adıyla raporlanır (`not_configured`).

## Doldurduktan sonra ne olur

- Satıcı kimliği tamamlanınca `/api/billing/invoices/<fatura-no>/export?format=xml|pdf`
  gerçek `Invoice` satırından UBL-TR 1.2.1 belgesi üretir.
- Entegratör bilgileri tamamlansa **bile** gönderim henüz gerçekleşmez: o
  entegratörün API'sine karşı bir adaptör yazılması gerekir
  (`ADAPTERS` — `src/lib/efatura-integrator.ts`). Adaptör yokken sonuç
  `provider_unsupported` döner; asla "gönderildi" denmez.
- Bir belge ancak GİB'in döndürdüğü zarf numarası (`Invoice.gibEnvelopeId`)
  kaydedildiğinde "GİB'e gönderildi" sayılır. Ayarlar → Faturalandırma panelinde
  ve basılan belgede tek ölçüt budur.

## İlgili dosyalar

- `src/lib/env.ts` — değişken şeması (hepsi opsiyonel; eksik değişken uygulamayı düşürmez)
- `src/app/api/billing/invoices/[id]/export/invoice-document.ts` — satıcı kimliği çözümü, eksikse `SupplierNotConfiguredError`
- `src/lib/efatura-integrator.ts` — entegratör arayüzü ve hata yolları
- `src/lib/efatura.ts` — UBL-TR XML ve yazdırılabilir belge; zarf numarası yoksa "mali değeri yoktur" damgası
- `tests/efatura-integrator.test.ts`, `tests/invoice-document.test.ts` — yukarıdaki kuralların testleri
