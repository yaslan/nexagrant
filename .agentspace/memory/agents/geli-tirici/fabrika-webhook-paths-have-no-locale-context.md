---
name: fabrika-webhook-paths-have-no-locale-context
description: Fabrika'da webhook/arka-plan yollarinda kullaniciya giden metnin dili YALNIZ Tenant.locale'den gelir (istek yok, next-intl yok) — ve o DB okumasi handler'in try blogunun ICINE konur
metadata:
  type: project
  updatedAt: 2026-09-10
---

TASK-MTV8W14FY9BKD'de ölçüldü (Stripe `logInvoicePayment` → fatura satırı metni).

## 1. Locale kaynağı: `Tenant.locale`, başka yok

Bir ödeme sağlayıcısı webhook'unda **kullanıcı yok, istek yok**: `Accept-Language` yok,
`next-intl` bağlamı yok, `getTranslations()` yok. Kullanıcıya giden bir metnin dilini
seçmen gerekiyorsa tek kayıtlı kaynak `prisma/schema.prisma` → `model Tenant`:

```prisma
locale   String   @default("tr")     // serbest metin, enum DEĞİL
```

(`User.locale`, `Feedback.locale`, `Evidence.language` de var — ama webhook'ta kullanıcı
yok, kiracı var.) Serbest `String` olduğu için daraltmayı ELLE yap:
`locale === 'en' ? 'en' : 'tr'` — tanınmayan değer sütunun kendi varsayılanına düşsün,
ödeme alınmış bir belgede fırlatma.

## 2. Metni okuma deseni: yeni desen İCAT ETME

Senkron / React-dışı çağıranlar katalogu doğrudan okur — `src/lib/efatura.ts`
(`INVOICE_CATALOGS`) ve `src/lib/document-exporter.ts` (`CATALOGS`) bunu zaten yapıyor.
Marka adı katalogda **literal olamaz**: `{brand}` yer tutucusu + `withBrand()`
(`src/lib/brand.ts`). Üçüncü bir katalog-erişimci kopyası çıkarma — ad alanının
sahibi modülden fonksiyonu **dışa aktar** (ör. `invoiceLinePeriodFallback`).

## 3. GOTCHA — okumayı `try` bloğunun DIŞINA koyma

`logInvoicePayment` şu garantiyi veriyor: *"a genuine database failure is caught here so
a webhook Stripe will retry does not replay the whole subscription sync."*

Locale için eklediğim `prisma.tenant.findUnique` ilk hâlde `try`'ın DIŞINDAYDI → DB
düşükse handler fırlar, Stripe tüm webhook'u yeniden oynatır; yani catch'in var olma
sebebinin tam tersi. **Ödeme yolunda handler'a eklediğin HER yeni DB okuması, o yolun
catch'inin içine girer.** Regresyon testi yaz ve okumayı dışarı taşıyarak testin
KIRMIZIYA döndüğünü gör — yoksa test hiçbir şey korumuyordur.

Aynı kusurun düzeltilmemiş ikinci örneği: `src/lib/iyzico.ts:746`, fatura açıklamasını
hâlâ gömülü Türkçe (`'1 yıl'` / `'1 ay'`) ile üretiyor ve her dilde Türkçe basıyor.

İlgili: [[a-todo-can-name-the-wrong-blocker]] · [[fabrika-i18n-dead-catalog-trap]]
